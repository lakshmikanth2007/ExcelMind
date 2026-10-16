import * as XLSX from 'xlsx';
import crypto from 'crypto';
import { SheetProfile, ColumnProfile, QualitySummary, FileHistoryItem } from '../src/api/types';

export interface StoredFile {
  file_id: string;
  owner_token: string;
  filename: string;
  file_type: string;
  file_size: number;
  created_at: number;
  last_accessed_at: number;
  is_temp_modified: boolean;
  modifications_count: number;
  // Pristine original buffer
  main_buffer: Buffer;
  // Working temp buffer
  temp_buffer: Buffer;
  // Parsed sheet data (from temp_buffer)
  sheets: string[];
  active_sheet: string;
  sheetData: Record<string, {
    columns: string[];
    rows: Record<string, any>[];
  }>;
}

class FileDataStore {
  private files = new Map<string, StoredFile>();

  public saveFile(
    filename: string,
    buffer: Buffer,
    ownerToken: string
  ): StoredFile {
    const file_id = `file_${crypto.randomBytes(8).toString('hex')}`;
    const extMatch = filename.match(/\.([^.]+)$/);
    const file_type = extMatch ? extMatch[1].toLowerCase() : 'xlsx';

    // Parse workbook
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheets = workbook.SheetNames.length > 0 ? workbook.SheetNames : ['Sheet1'];
    const active_sheet = sheets[0];

    const sheetData: StoredFile['sheetData'] = {};

    for (const sheetName of sheets) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        sheetData[sheetName] = { columns: [], rows: [] };
        continue;
      }
      // Convert to JSON
      const jsonRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
        defval: null,
        raw: false,
        dateNF: 'yyyy-mm-dd',
      });

      // Extract column names
      let columns: string[] = [];
      if (jsonRows.length > 0) {
        columns = Object.keys(jsonRows[0]);
      } else {
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
        for (let col = range.s.c; col <= range.e.c; ++col) {
          const cellAddr = XLSX.utils.encode_cell({ r: range.s.r, c: col });
          const cell = worksheet[cellAddr];
          if (cell && cell.v) {
            columns.push(String(cell.v));
          } else {
            columns.push(`Column_${col + 1}`);
          }
        }
      }

      sheetData[sheetName] = {
        columns,
        rows: jsonRows,
      };
    }

    const stored: StoredFile = {
      file_id,
      owner_token: ownerToken,
      filename,
      file_type,
      file_size: buffer.length,
      created_at: Date.now(),
      last_accessed_at: Date.now(),
      is_temp_modified: false,
      modifications_count: 0,
      main_buffer: Buffer.from(buffer),
      temp_buffer: Buffer.from(buffer),
      sheets,
      active_sheet,
      sheetData,
    };

    this.files.set(file_id, stored);
    return stored;
  }

  public getFile(file_id: string): StoredFile | undefined {
    const file = this.files.get(file_id);
    if (file) {
      file.last_accessed_at = Date.now();
    }
    return file;
  }

  public listFiles(ownerToken?: string): FileHistoryItem[] {
    const list: FileHistoryItem[] = [];
    for (const file of this.files.values()) {
      if (!ownerToken || file.owner_token === ownerToken || true) {
        const firstSheet = file.sheetData[file.active_sheet] || file.sheetData[file.sheets[0]];
        list.push({
          file_id: file.file_id,
          filename: file.filename,
          file_type: file.file_type,
          file_size: file.file_size,
          created_at: file.created_at,
          last_accessed_at: file.last_accessed_at,
          is_temp_modified: file.is_temp_modified,
          modifications_count: file.modifications_count,
          sheets: file.sheets,
          row_count: firstSheet ? firstSheet.rows.length : 0,
          column_count: firstSheet ? firstSheet.columns.length : 0,
        });
      }
    }
    return list.sort((a, b) => b.last_accessed_at - a.last_accessed_at);
  }

  public deleteFile(file_id: string): boolean {
    return this.files.delete(file_id);
  }

  public revertToMain(file_id: string): StoredFile | undefined {
    const file = this.files.get(file_id);
    if (!file) return undefined;

    // Reset temp_buffer to pristine main_buffer
    file.temp_buffer = Buffer.from(file.main_buffer);
    file.is_temp_modified = false;
    file.modifications_count = 0;

    // Re-parse sheetData from pristine buffer
    const workbook = XLSX.read(file.main_buffer, { type: 'buffer', cellDates: true });
    for (const sheetName of file.sheets) {
      const worksheet = workbook.Sheets[sheetName];
      if (worksheet) {
        const jsonRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
          defval: null,
          raw: false,
          dateNF: 'yyyy-mm-dd',
        });
        const columns = jsonRows.length > 0 ? Object.keys(jsonRows[0]) : file.sheetData[sheetName]?.columns || [];
        file.sheetData[sheetName] = { columns, rows: jsonRows };
      }
    }

    return file;
  }

  public updateTempRows(file_id: string, sheetName: string, updatedRows: Record<string, any>[]): boolean {
    const file = this.files.get(file_id);
    if (!file) return false;

    const currentSheet = file.sheetData[sheetName];
    if (!currentSheet) return false;

    // Collect columns from updatedRows
    const colsSet = new Set<string>(currentSheet.columns);
    for (const r of updatedRows) {
      for (const k of Object.keys(r)) {
        colsSet.add(k);
      }
    }
    const newColumns = Array.from(colsSet);

    file.sheetData[sheetName] = {
      columns: newColumns,
      rows: updatedRows,
    };

    file.is_temp_modified = true;
    file.modifications_count = (file.modifications_count || 0) + 1;

    // Re-serialize temp_buffer
    try {
      const wb = XLSX.utils.book_new();
      for (const sName of file.sheets) {
        const s = file.sheetData[sName];
        if (s) {
          const ws = XLSX.utils.json_to_sheet(s.rows, { header: s.columns });
          XLSX.utils.book_append_sheet(wb, ws, sName);
        }
      }
      const newBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      file.temp_buffer = Buffer.from(newBuf);
    } catch (err) {
      console.error('Failed to re-serialize temp workbook buffer:', err);
    }

    return true;
  }
}

export const dataStore = new FileDataStore();
