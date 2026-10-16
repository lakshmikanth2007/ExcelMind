"""File ingestion, validation of magic bytes, extensions, size limits, and storage."""

import os
from typing import Tuple
from app.core.config import settings
from app.core.errors import (
    BadRequestError,
    PayloadTooLargeError,
    UnsupportedMediaTypeError,
)
from app.storage.file_store import file_store, StoredFileMetadata

# Magic bytes definitions
XLSX_MAGIC = b"PK\x03\x04"
XLS_MAGIC = b"\xD0\xCF\x11\xE0"

def validate_and_save_upload(filename: str, content: bytes, owner_token: str) -> StoredFileMetadata:
    """Validate file extension, size, and magic bytes before saving to disk."""
    if not filename:
        raise BadRequestError("Filename cannot be empty.")
    
    # Check size
    max_bytes = settings.MAX_FILE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise PayloadTooLargeError(f"File size exceeds maximum allowed of {settings.MAX_FILE_MB}MB.")
    
    ext = os.path.splitext(filename)[1].lower()
    if ext not in [".xlsx", ".xls", ".csv"]:
        raise UnsupportedMediaTypeError(
            f"File extension '{ext}' is not supported. Allowed formats are .xlsx, .xls, and .csv."
        )

    # Magic byte validation
    if ext == ".xlsx":
        if not content.startswith(XLSX_MAGIC):
            raise UnsupportedMediaTypeError(
                "Invalid XLSX file content. File header does not match XLSX (Zip container) specification."
            )
    elif ext == ".xls":
        if not content.startswith(XLS_MAGIC):
            raise UnsupportedMediaTypeError(
                "Invalid XLS file content. File header does not match Microsoft Compound Document (OLE2) specification."
            )
    elif ext == ".csv":
        # Must decode as text via utf-8, utf-8-sig, or latin-1
        decoded = False
        for encoding in ["utf-8-sig", "utf-8", "latin-1"]:
            try:
                content[:4096].decode(encoding)
                decoded = True
                break
            except UnicodeDecodeError:
                continue
        if not decoded:
            raise UnsupportedMediaTypeError(
                "Invalid CSV file content. Could not decode text using standard encodings (utf-8, latin-1)."
            )

    return file_store.save_file(
        owner_token=owner_token,
        original_filename=filename,
        content=content,
        extension=ext
    )
