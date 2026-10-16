"""On-disk file storage with per-file directory isolation and TTL tracking."""

import os
import shutil
import time
from typing import Dict, Optional, Tuple
from threading import Lock
from app.core.config import settings
from app.core.security import generate_opaque_id

class StoredFileMetadata:
    def __init__(
        self,
        file_id: str,
        owner_token: str,
        original_filename: str,
        file_path: str,
        main_file_path: str,
        temp_file_path: str,
        file_type: str,
        file_size_bytes: int = 0
    ):
        self.file_id = file_id
        self.owner_token = owner_token
        self.original_filename = original_filename
        self.file_path = file_path  # points to temp_file_path
        self.main_file_path = main_file_path  # Pristine main Excel file (untouched by AI modifications)
        self.temp_file_path = temp_file_path  # Working temp Excel file (shown in web app and modified by AI)
        self.file_type = file_type  # xlsx, xls, csv
        self.file_size_bytes = file_size_bytes
        self.is_temp_modified = False
        self.modifications_count = 0
        self.modifications_history = []
        self.created_at = time.time()
        self.last_accessed_at = time.time()

    def touch(self):
        self.last_accessed_at = time.time()

    def record_temp_modification(self, instruction: str, summary: str):
        """Mark temp Excel as modified while preserving main Excel untouched."""
        self.is_temp_modified = True
        self.modifications_count += 1
        self.modifications_history.append({
            "instruction": instruction,
            "summary": summary,
            "timestamp": time.time()
        })
        self.touch()

    def revert_to_main(self) -> bool:
        """Revert working temp Excel back to pristine main Excel."""
        if os.path.exists(self.main_file_path):
            shutil.copy2(self.main_file_path, self.temp_file_path)
            self.is_temp_modified = False
            self.modifications_history.append({
                "instruction": "revert_to_main",
                "summary": "Reverted temp Excel back to pristine main Excel file.",
                "timestamp": time.time()
            })
            self.touch()
            return True
        return False

    def is_expired(self, ttl_minutes: int) -> bool:
        return (time.time() - self.last_accessed_at) > (ttl_minutes * 60)

class FileStore:
    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = base_dir or settings.DATA_DIR
        os.makedirs(self.base_dir, exist_ok=True)
        self._meta: Dict[str, StoredFileMetadata] = {}
        self._lock = Lock()

    def save_file(self, owner_token: str, original_filename: str, content: bytes, extension: str) -> StoredFileMetadata:
        file_id = generate_opaque_id(16)
        file_dir = os.path.join(self.base_dir, file_id)
        os.makedirs(file_dir, exist_ok=True)
        
        ext_clean = extension.lstrip('.').lower()
        # Save pristine main Excel file that never gets modified by AI
        main_filename = f"main_original.{ext_clean}"
        main_full_path = os.path.join(file_dir, main_filename)
        with open(main_full_path, "wb") as f:
            f.write(content)

        # Save working temp Excel file shown and modified in the web application
        temp_filename = f"temp_working.{ext_clean}"
        temp_full_path = os.path.join(file_dir, temp_filename)
        with open(temp_full_path, "wb") as f:
            f.write(content)
            
        meta = StoredFileMetadata(
            file_id=file_id,
            owner_token=owner_token,
            original_filename=original_filename,
            file_path=temp_full_path,
            main_file_path=main_full_path,
            temp_file_path=temp_full_path,
            file_type=ext_clean,
            file_size_bytes=len(content)
        )
        with self._lock:
            self._meta[file_id] = meta
        return meta

    def get_file(self, file_id: str, owner_token: str, allow_adopt: bool = False) -> Optional[StoredFileMetadata]:
        with self._lock:
            meta = self._meta.get(file_id)
            if not meta:
                return None
            if meta.owner_token != owner_token:
                if allow_adopt:
                    # Request carried no owner token (e.g. cookie dropped in iframe); bind to caller
                    meta.owner_token = owner_token
                else:
                    # Explicit mismatched token returns None -> 404 per security isolation spec
                    return None
            if meta.is_expired(settings.FILE_TTL_MINUTES):
                self._delete_file_locked(file_id)
                return None
            meta.touch()
            return meta

    def delete_file(self, file_id: str, owner_token: str, allow_adopt: bool = False) -> bool:
        with self._lock:
            meta = self._meta.get(file_id)
            if not meta:
                return False
            if meta.owner_token != owner_token:
                if allow_adopt:
                    meta.owner_token = owner_token
                else:
                    return False
            self._delete_file_locked(file_id)
            return True

    def _delete_file_locked(self, file_id: str):
        meta = self._meta.pop(file_id, None)
        file_dir = os.path.join(self.base_dir, file_id)
        if os.path.exists(file_dir):
            try:
                shutil.rmtree(file_dir, ignore_errors=True)
            except Exception:
                pass

    def list_files_for_owner(self, owner_token: str):
        """List active non-expired files belonging to owner."""
        with self._lock:
            return [
                meta for meta in self._meta.values()
                if (meta.owner_token == owner_token and not meta.is_expired(settings.FILE_TTL_MINUTES))
            ]

    def cleanup_expired(self):
        """Cleanup files older than TTL."""
        expired_ids = []
        with self._lock:
            for file_id, meta in list(self._meta.items()):
                if meta.is_expired(settings.FILE_TTL_MINUTES):
                    expired_ids.append(file_id)
            for fid in expired_ids:
                self._delete_file_locked(fid)

file_store = FileStore()
