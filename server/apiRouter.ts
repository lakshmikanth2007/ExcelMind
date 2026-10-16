import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import crypto from 'crypto';
import { dataStore } from './dataStore';
import { profileSheet, generateInsights, generateWorkbookInsights } from './profiler';
import { processNaturalLanguageQuery } from './aiService';
import { UploadResponse, PreviewResponse } from '../src/api/types';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

export const apiRouter = Router();

// 1. Upload Spreadsheet File
apiRouter.post('/files', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ownerToken = (req.headers['x-owner-token'] as string) || `user_${crypto.randomBytes(6).toString('hex')}`;
    const filename = req.file.originalname || 'Spreadsheet.xlsx';
    const buffer = req.file.buffer;

    const stored = dataStore.saveFile(filename, buffer, ownerToken);
    const activeSheetName = stored.active_sheet;
    const activeSheetData = stored.sheetData[activeSheetName] || { columns: [], rows: [] };

    const profile = profileSheet(activeSheetName, activeSheetData.rows, activeSheetData.columns);

    const sheetShapes: Record<string, { name: string; row_count: number; column_count: number }> = {};
    for (const s of stored.sheets) {
      const sd = stored.sheetData[s] || { columns: [], rows: [] };
      sheetShapes[s] = {
        name: s,
        row_count: sd.rows.length,
        column_count: sd.columns.length,
      };
    }

    const response: UploadResponse = {
      file_id: stored.file_id,
      owner_token: stored.owner_token,
      filename: stored.filename,
      file_type: stored.file_type,
      sheets: stored.sheets,
      sheet_shapes: sheetShapes,
      active_sheet: activeSheetName,
      profile_summary: profile,
      is_temp_modified: false,
      modifications_count: 0,
      warnings: profile.warnings,
    };

    return res.json(response);
  } catch (err: any) {
    console.error('File upload error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process spreadsheet' });
  }
});

// 2. Load Pre-generated Sample
apiRouter.post('/files/sample/:sampleName', (req: Request, res: Response) => {
  try {
    const sampleName = req.params.sampleName || 'sales';
    const ownerToken = (req.headers['x-owner-token'] as string) || `user_${crypto.randomBytes(6).toString('hex')}`;

    // Generate sample dataset
    const sampleRows: Record<string, any>[] = [
      { OrderID: 101, Region: 'North', Product: 'Enterprise Suite', Units: 14, UnitPrice: 1200, Revenue: 16800, Status: 'Delivered', Customer: 'Acme Corp' },
      { OrderID: 102, Region: 'South', Product: 'Cloud Storage Pro', Units: 25, UnitPrice: 450, Revenue: 11250, Status: 'Shipped', Customer: 'Global Media' },
      { OrderID: 103, Region: 'East', Product: 'AI Analytics Addon', Units: 8, UnitPrice: 2400, Revenue: 19200, Status: 'Delivered', Customer: 'FinTech Hub' },
      { OrderID: 104, Region: 'West', Product: 'Security Shield', Units: 32, UnitPrice: 350, Revenue: 11200, Status: 'Processing', Customer: 'HealthNet' },
      { OrderID: 105, Region: 'North', Product: 'Enterprise Suite', Units: 19, UnitPrice: 1200, Revenue: 22800, Status: 'Delivered', Customer: 'LogiTech Co' },
      { OrderID: 106, Region: 'Central', Product: 'Cloud Storage Pro', Units: 12, UnitPrice: 450, Revenue: 5400, Status: 'Delivered', Customer: 'Retail Giant' },
      { OrderID: 107, Region: 'South', Product: 'AI Analytics Addon', Units: 15, UnitPrice: 2400, Revenue: 36000, Status: 'Delivered', Customer: 'Skyward Labs' },
      { OrderID: 108, Region: 'East', Product: 'Security Shield', Units: 18, UnitPrice: 350, Revenue: 6300, Status: 'Pending', Customer: 'Urban Transit' },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sales_Summary');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const stored = dataStore.saveFile(`${sampleName}_dataset.xlsx`, Buffer.from(buf), ownerToken);
    const activeSheetData = stored.sheetData[stored.active_sheet];
    const profile = profileSheet(stored.active_sheet, activeSheetData.rows, activeSheetData.columns);

    return res.json({
      file_id: stored.file_id,
      owner_token: stored.owner_token,
      filename: stored.filename,
      file_type: 'xlsx',
      sheets: stored.sheets,
      sheet_shapes: {
        Sales_Summary: { name: 'Sales_Summary', row_count: sampleRows.length, column_count: 8 },
      },
      active_sheet: stored.active_sheet,
      profile_summary: profile,
      is_temp_modified: false,
      modifications_count: 0,
      warnings: [],
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to generate sample' });
  }
});

// 3. Create New Workbook
apiRouter.post('/files/new', (req: Request, res: Response) => {
  try {
    const filename = (req.query.name as string) || 'New_Workbook.xlsx';
    const ownerToken = (req.headers['x-owner-token'] as string) || `user_${crypto.randomBytes(6).toString('hex')}`;

    const defaultRows = [
      { ID: 1, Name: 'Sample Item A', Category: 'Category 1', Value: 100, Status: 'Active' },
      { ID: 2, Name: 'Sample Item B', Category: 'Category 2', Value: 250, Status: 'Pending' },
      { ID: 3, Name: 'Sample Item C', Category: 'Category 1', Value: 175, Status: 'Active' },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(defaultRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const stored = dataStore.saveFile(filename, Buffer.from(buf), ownerToken);
    const activeSheetData = stored.sheetData['Sheet1'];
    const profile = profileSheet('Sheet1', activeSheetData.rows, activeSheetData.columns);

    return res.json({
      file_id: stored.file_id,
      owner_token: stored.owner_token,
      filename: stored.filename,
      file_type: 'xlsx',
      sheets: ['Sheet1'],
      sheet_shapes: {
        Sheet1: { name: 'Sheet1', row_count: defaultRows.length, column_count: 5 },
      },
      active_sheet: 'Sheet1',
      profile_summary: profile,
      is_temp_modified: false,
      modifications_count: 0,
      warnings: [],
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create new spreadsheet' });
  }
});

// 4. List User Files (History)
apiRouter.get('/files', (req: Request, res: Response) => {
  try {
    const ownerToken = req.headers['x-owner-token'] as string;
    const files = dataStore.listFiles(ownerToken);
    return res.json({ files });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. Get Sheets of a File
apiRouter.get('/files/:fileId/sheets', (req: Request, res: Response) => {
  const file = dataStore.getFile(req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  const sheets = file.sheets.map((s) => {
    const sd = file.sheetData[s] || { columns: [], rows: [] };
    return {
      name: s,
      row_count: sd.rows.length,
      column_count: sd.columns.length,
    };
  });

  return res.json({
    file_id: file.file_id,
    filename: file.filename,
    sheets,
    is_temp_modified: file.is_temp_modified,
  });
});

// 6. Get Schema / Profile
apiRouter.get('/files/:fileId/schema', (req: Request, res: Response) => {
  const file = dataStore.getFile(req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  const targetSheet = (req.query.sheet as string) || file.active_sheet;
  const sd = file.sheetData[targetSheet] || file.sheetData[file.sheets[0]] || { columns: [], rows: [] };
  const profile = profileSheet(targetSheet, sd.rows, sd.columns);

  return res.json({
    file_id: file.file_id,
    filename: file.filename,
    sheet: targetSheet,
    profile,
    is_temp_modified: file.is_temp_modified,
    modifications_count: file.modifications_count,
  });
});

// 7. Preview Data Rows
apiRouter.get('/files/:fileId/preview', (req: Request, res: Response) => {
  const file = dataStore.getFile(req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  const targetSheet = (req.query.sheet as string) || file.active_sheet;
  const sd = file.sheetData[targetSheet] || { columns: [], rows: [] };

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(req.query.page_size as string) || 50));

  const totalRows = sd.rows.length;
  const totalPages = Math.ceil(totalRows / pageSize) || 1;
  const startIdx = (page - 1) * pageSize;
  const rows = sd.rows.slice(startIdx, startIdx + pageSize);

  const preview: PreviewResponse = {
    file_id: file.file_id,
    sheet: targetSheet,
    page,
    page_size: pageSize,
    total_rows: totalRows,
    total_pages: totalPages,
    columns: sd.columns,
    rows,
  };

  return res.json(preview);
});

// 8. Search Data
apiRouter.get('/files/:fileId/search', (req: Request, res: Response) => {
  const file = dataStore.getFile(req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  const targetSheet = (req.query.sheet as string) || file.active_sheet;
  const sd = file.sheetData[targetSheet] || { columns: [], rows: [] };
  const query = ((req.query.q as string) || '').toLowerCase();
  const column = req.query.column as string | undefined;

  const matched = sd.rows.filter((row) => {
    if (column) {
      return String(row[column] ?? '').toLowerCase().includes(query);
    }
    return Object.values(row).some((val) =>
      String(val ?? '').toLowerCase().includes(query)
    );
  });

  return res.json({
    file_id: file.file_id,
    sheet: targetSheet,
    total_matches: matched.length,
    rows: matched.slice(0, 50),
    columns: sd.columns,
  });
});

// 9. Auto-Insights and Visualizations Suite
apiRouter.get('/files/:fileId/insights', (req: Request, res: Response) => {
  const file = dataStore.getFile(req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  const targetSheet = (req.query.sheet as string) || file.active_sheet;
  if (targetSheet === '__ALL__' || targetSheet === 'ALL' || targetSheet === 'workbook') {
    const workbookReport = generateWorkbookInsights(file);
    return res.json(workbookReport);
  }

  const sd = file.sheetData[targetSheet] || { columns: [], rows: [] };
  const profile = profileSheet(targetSheet, sd.rows, sd.columns);
  const insightsReport = generateInsights(targetSheet, sd.rows, profile, file.sheets);

  return res.json(insightsReport);
});

// 10. Revert Temp Working Excel to Pristine Original Main File
apiRouter.post('/files/:fileId/revert', (req: Request, res: Response) => {
  const reverted = dataStore.revertToMain(req.params.fileId);
  if (!reverted) {
    return res.status(404).json({ error: 'File not found' });
  }

  const targetSheet = (req.query.sheet as string) || reverted.active_sheet;
  const sd = reverted.sheetData[targetSheet] || { columns: [], rows: [] };
  const profile = profileSheet(targetSheet, sd.rows, sd.columns);

  return res.json({
    file_id: reverted.file_id,
    filename: reverted.filename,
    is_temp_modified: false,
    sheet: targetSheet,
    profile,
    message: 'Reverted temp working Excel back to original pristine main Excel file.',
  });
});

// 11. Delete Spreadsheet
apiRouter.delete('/files/:fileId', (req: Request, res: Response) => {
  const success = dataStore.deleteFile(req.params.fileId);
  return res.json({ status: success ? 'success' : 'not_found' });
});

// 12. Export Spreadsheet (temp or main)
apiRouter.get('/files/:fileId/export', (req: Request, res: Response) => {
  const file = dataStore.getFile(req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  const source = (req.query.source as string) === 'main' ? 'main' : 'temp';
  const format = (req.query.format as string) === 'csv' ? 'csv' : 'xlsx';
  const targetSheet = (req.query.sheet as string) || file.active_sheet;

  const prefix = source === 'main' ? 'original_' : (file.is_temp_modified ? 'temp_modified_' : '');
  const outFilename = `${prefix}${file.filename.replace(/\.[^.]+$/, '')}.${format}`;

  if (format === 'csv') {
    const sd = file.sheetData[targetSheet] || { columns: [], rows: [] };
    const ws = XLSX.utils.json_to_sheet(sd.rows, { header: sd.columns });
    const csvContent = XLSX.utils.sheet_to_csv(ws);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
    return res.send(csvContent);
  } else {
    const bufferToSend = source === 'main' ? file.main_buffer : file.temp_buffer;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
    return res.send(bufferToSend);
  }
});

// 13. Natural Language Query / Modification Endpoint
apiRouter.post('/files/:fileId/query', async (req: Request, res: Response) => {
  const file = dataStore.getFile(req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  const { question, sheet, session_id } = req.body || {};
  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  const targetSheet = sheet || file.active_sheet;

  try {
    const result = await processNaturalLanguageQuery(file, targetSheet, question, session_id);
    return res.json(result.response);
  } catch (err: any) {
    console.error('Error in /query:', err);
    return res.status(500).json({ error: err.message || 'Failed to process query' });
  }
});

// 14. Update Chart Type
apiRouter.post('/files/:fileId/results/:resultId/chart', (req: Request, res: Response) => {
  const { chart_type, x, y, data, labels, values, title } = req.body || {};
  const newType = chart_type || 'bar';
  
  let traceData = data;
  if (!traceData) {
    if (newType === 'pie') {
      traceData = [{
        type: 'pie',
        labels: labels || x || [],
        values: values || y || [],
      }];
    } else {
      traceData = [{
        type: newType,
        x: labels || x || [],
        y: values || y || [],
      }];
    }
  }

  return res.json({
    status: 'ok',
    chart: {
      type: newType,
      x: typeof x === 'string' ? x : undefined,
      y: typeof y === 'string' ? y : undefined,
      title: title || 'Chart',
      plotly: {
        data: traceData,
        layout: { autosize: true },
      },
    },
  });
});

// 15. Sessions history (dummy endpoints to satisfy client queries)
apiRouter.get('/sessions/:sessionId/history', (req: Request, res: Response) => {
  return res.json({ messages: [] });
});

apiRouter.delete('/sessions/:sessionId', (req: Request, res: Response) => {
  return res.json({ status: 'cleared' });
});
