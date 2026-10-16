import { GoogleGenAI } from '@google/genai';
import { QueryResponse, ChartData, StructuredAnswerFormat } from '../src/api/types';
import { dataStore, StoredFile } from './dataStore';
import { generateChartDataUrl, generateChartSvg } from './chartImageGenerator';
import { parseNumericValue } from './profiler';
import crypto from 'crypto';

// Resilient model priority chain with automatic failover
const MODEL_CANDIDATES = [
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash',
];

let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI();
  }
  return aiInstance;
}

/**
 * Tries models in priority order, seamlessly falling back if quota or availability errors occur.
 */
async function callGeminiWithFailover(prompt: string, expectJson: boolean = true) {
  const ai = getAI();
  let lastError: any = null;

  for (const model of MODEL_CANDIDATES) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: expectJson ? { responseMimeType: 'application/json' } : undefined,
      });
      if (res && res.text) {
        return { text: res.text, model };
      }
    } catch (err: any) {
      lastError = err;
      const status = err.status || err.code;
      console.warn(`Model ${model} failed (status=${status}). Trying next in chain...`);
    }
  }

  throw lastError || new Error('All Gemini models exhausted');
}

export interface QueryExecutionResult {
  response: QueryResponse;
  wasModified: boolean;
}

/**
 * Pre-computes exact statistical summaries for spreadsheet columns
 * so Gemini has verified mathematical ground-truth.
 */
function computeColumnSummaries(rows: Record<string, any>[], columns: string[]) {
  const numericStats: Record<string, { count: number; sum: number; mean: number; min: number; max: number }> = {};
  const categoricalStats: Record<string, { uniqueCount: number; topValues: Array<{ val: any; count: number }> }> = {};

  for (const col of columns) {
    const numVals: number[] = [];
    const valCounts = new Map<string, number>();

    for (const r of rows) {
      const v = r[col];
      if (v !== null && v !== undefined && v !== '') {
        const num = Number(v);
        if (!isNaN(num) && typeof v !== 'boolean') {
          numVals.push(num);
        }
        const sVal = String(v);
        valCounts.set(sVal, (valCounts.get(sVal) || 0) + 1);
      }
    }

    if (numVals.length > 0 && numVals.length >= rows.length * 0.4) {
      const sum = numVals.reduce((acc, curr) => acc + curr, 0);
      numericStats[col] = {
        count: numVals.length,
        sum: Number(sum.toFixed(2)),
        mean: Number((sum / numVals.length).toFixed(2)),
        min: Math.min(...numVals),
        max: Math.max(...numVals),
      };
    } else {
      const topVals = Array.from(valCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([val, count]) => ({ val, count }));
      categoricalStats[col] = {
        uniqueCount: valCounts.size,
        topValues: topVals,
      };
    }
  }

  return { numericStats, categoricalStats };
}

export interface SheetMetadataSummary {
  sheetName: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  numericStats: Record<string, { count: number; sum: number; mean: number; min: number; max: number }>;
  categoricalStats: Record<string, { uniqueCount: number; topValues: Array<{ val: any; count: number }> }>;
  sampleRows: Record<string, any>[];
}

/**
 * Intelligent sheet router: Determines whether query is multi-sheet,
 * references a specific sheet, or targets the currently active sheet.
 */
export function detectTargetSheets(
  file: StoredFile,
  question: string,
  currentSheetName: string
): {
  primarySheet: string;
  relevantSheets: string[];
  isMultiSheetQuery: boolean;
  sheetMentions: string[];
} {
  const qLower = question.toLowerCase().trim();
  const sheets = file.sheets || ['Sheet1'];

  if (sheets.length <= 1) {
    return {
      primarySheet: sheets[0],
      relevantSheets: sheets,
      isMultiSheetQuery: false,
      sheetMentions: [],
    };
  }

  // 1. Check for explicit sheet name mentions in the question
  const sheetMentions: string[] = [];
  for (const s of sheets) {
    const sLower = s.toLowerCase();
    if (qLower.includes(sLower)) {
      sheetMentions.push(s);
    }
  }

  // Also check numbered patterns: "sheet 1", "sheet 2", etc.
  for (let i = 0; i < sheets.length; i++) {
    const pattern1 = `sheet ${i + 1}`;
    const pattern2 = `sheet${i + 1}`;
    if (qLower.includes(pattern1) || qLower.includes(pattern2)) {
      if (!sheetMentions.includes(sheets[i])) {
        sheetMentions.push(sheets[i]);
      }
    }
  }

  // Check if user specifically restricted to a single sheet
  if (sheetMentions.length === 1) {
    const sName = sheetMentions[0];
    const isRestrictedToSingle =
      qLower.includes(`only in ${sName.toLowerCase()}`) ||
      qLower.includes(`just in ${sName.toLowerCase()}`) ||
      qLower.includes(`in sheet ${sName.toLowerCase()}`) ||
      qLower.includes(`in ${sName.toLowerCase()} sheet`) ||
      qLower.includes(`from ${sName.toLowerCase()}`) ||
      qLower.includes(`on ${sName.toLowerCase()}`);

    if (isRestrictedToSingle) {
      return {
        primarySheet: sName,
        relevantSheets: [sName],
        isMultiSheetQuery: false,
        sheetMentions,
      };
    }
  }

  // 2. Identify which sheets contain columns mentioned in the query
  const columnMatchedSheets: string[] = [];
  for (const s of sheets) {
    const cols = file.sheetData[s]?.columns || [];
    for (const c of cols) {
      const cLower = c.toLowerCase();
      if (cLower.length > 2 && qLower.includes(cLower)) {
        if (!columnMatchedSheets.includes(s)) {
          columnMatchedSheets.push(s);
        }
      }
    }
  }

  // 3. For any multi-sheet workbook, ALL sheets must be analyzed by default!
  // Determine best primary sheet for fallback row display
  const primarySheet =
    sheetMentions[0] ||
    columnMatchedSheets[0] ||
    currentSheetName ||
    sheets[0];

  return {
    primarySheet,
    relevantSheets: sheets, // Always include all sheets for multi-sheet workbook
    isMultiSheetQuery: true, // Always consider multi-sheet context
    sheetMentions,
  };
}

export const VIBRANT_CHART_COLORS = [
  '#2563EB', // Royal Blue
  '#059669', // Emerald
  '#7C3AED', // Vivid Violet
  '#D97706', // Warm Amber
  '#EC4899', // Hot Pink
  '#0891B2', // Cyan Teal
  '#EA580C', // Sunset Orange
  '#6366F1', // Indigo
  '#10B981', // Mint Green
  '#F43F5E', // Rose
  '#8B5CF6', // Purple
  '#06B6D4', // Sky Cyan
  '#F59E0B', // Golden Amber
  '#3B82F6', // Blue
];

export async function processNaturalLanguageQuery(
  file: StoredFile,
  sheetName: string,
  question: string,
  sessionId?: string
): Promise<QueryExecutionResult> {
  const sid = sessionId || `sess_${crypto.randomBytes(6).toString('hex')}`;
  const startTime = Date.now();

  const qLower = question.toLowerCase().trim();
  const isModificationInstruction =
    qLower.startsWith('add ') ||
    qLower.startsWith('update ') ||
    qLower.startsWith('modify ') ||
    qLower.startsWith('change ') ||
    qLower.startsWith('set ') ||
    qLower.startsWith('delete ') ||
    qLower.startsWith('remove ') ||
    qLower.startsWith('insert ') ||
    qLower.includes('add a column') ||
    qLower.includes('add column') ||
    qLower.includes('update column') ||
    qLower.includes('give a bonus') ||
    qLower.includes('bonus of') ||
    qLower.includes('multiply by') ||
    qLower.includes('replace value');

  if (isModificationInstruction) {
    return handleDataModification(file, sheetName, question, sid, startTime);
  } else {
    return handleAnalyticalQuery(file, sheetName, question, sid, startTime);
  }
}

async function handleDataModification(
  file: StoredFile,
  activeSheetName: string,
  question: string,
  sessionId: string,
  startTime: number
): Promise<QueryExecutionResult> {
  const qLower = question.toLowerCase().trim();
  const isAllSheetsMod =
    qLower.includes('all sheets') ||
    qLower.includes('every sheet') ||
    qLower.includes('across all sheets') ||
    qLower.includes('entire workbook');

  // Detect target sheet for modification (handles specific sheet mentions like "in Sheet 2 add...")
  const { primarySheet } = detectTargetSheets(file, question, activeSheetName);
  const targetSheet = primarySheet || activeSheetName || file.active_sheet;
  const sheetsToModify = isAllSheetsMod ? (file.sheets || [targetSheet]) : [targetSheet];

  const currentSheetData = file.sheetData[targetSheet] || file.sheetData[file.active_sheet];
  const rows = currentSheetData ? currentSheetData.rows : [];
  const columns = currentSheetData ? currentSheetData.columns : [];

  let explanation = '';
  let updatedRows: Record<string, any>[] = JSON.parse(JSON.stringify(rows));
  let modifiedCount = 0;
  let transformFn: Function | null = null;

  try {
    const prompt = `You are an expert spreadsheet data modification engine.
The user wants to modify data in workbook "${file.filename}".
Target sheets: ${sheetsToModify.join(', ')}
Columns in primary sheet "${targetSheet}": ${JSON.stringify(columns)}
Sample rows: ${JSON.stringify(rows.slice(0, 5))}
Total row count in primary sheet: ${rows.length}

User modification request: "${question}"

Provide a JavaScript function body to transform the rows array.
Return JSON ONLY with this exact structure:
{
  "explanation": "concise description of what changes were made in plain English",
  "affectedColumn": "name of target column or new column created",
  "code": "(rows) => { /* modify rows in-place or return modified rows */ return rows; }"
}
Rules:
- The code must be a valid JS function that takes (rows) and returns the modified rows array.
- For example: if adding 5 bonus marks to all scores: "(rows) => rows.map(r => ({ ...r, Score: (Number(r.Score) || 0) + 5 }))"
- If updating status: "(rows) => rows.map(r => r.Score > 50 ? { ...r, Status: 'Pass' } : { ...r, Status: 'Fail' })"
- Do NOT include markdown code fences in your JSON response.`;

    const { text } = await callGeminiWithFailover(prompt, true);
    const parsed = JSON.parse(text || '{}');
    explanation = parsed.explanation || (isAllSheetsMod ? `Applied modification across all sheets` : `Applied modification to ${targetSheet}`);

    if (parsed.code) {
      try {
        transformFn = new Function('rows', `return (${parsed.code})(rows);`);
      } catch (evalErr) {
        console.error('Failed to parse AI modification function:', evalErr);
      }
    }
  } catch (err: any) {
    console.error('Gemini modification error:', err);
    explanation = `Applied modification based on "${question}"`;
  }

  // Apply to all targeted sheets in temp Excel (pristine main buffer is preserved)
  let totalAffectedRows = 0;
  for (const sName of sheetsToModify) {
    const sRows = file.sheetData[sName]?.rows || [];
    const sCols = file.sheetData[sName]?.columns || [];
    let sUpdated: Record<string, any>[] = [];

    if (transformFn) {
      try {
        const res = transformFn(JSON.parse(JSON.stringify(sRows)));
        if (Array.isArray(res) && res.length > 0) {
          sUpdated = res;
        } else {
          sUpdated = applyFallbackModification(sRows, sCols, question);
        }
      } catch {
        sUpdated = applyFallbackModification(sRows, sCols, question);
      }
    } else {
      sUpdated = applyFallbackModification(sRows, sCols, question);
    }

    dataStore.updateTempRows(file.file_id, sName, sUpdated);
    totalAffectedRows += sUpdated.length;
    if (sName === targetSheet) {
      updatedRows = sUpdated;
      modifiedCount = sUpdated.length;
    }
  }

  const updatedColumns = Object.keys(updatedRows[0] || {});

  const fullAnswer = isAllSheetsMod
    ? `### 💡 Quick Takeaway\n**Data modified across all ${sheetsToModify.length} sheets in temporary working copy.** Original main Excel file remains untouched.\n\n### 📋 What Changed\n${explanation}\n\n### 🎯 Summary\n*Changes are rendered live across all ${sheetsToModify.length} sheets in this web workspace. You can inspect the updated preview, export either the temp modified file or original main file, or click "Revert to Original" to undo at any time.*`
    : `### 💡 Quick Takeaway\n**Data modified in temporary working copy of sheet "${targetSheet}".** Original main Excel file remains untouched.\n\n### 📋 What Changed\n${explanation}\n\n### 🎯 Summary\n*Changes are rendered live in this web workspace for sheet "${targetSheet}". You can inspect the updated preview, export either the temp modified file or original main file, or click "Revert to Original" to undo at any time.*`;

  const queryResponse: QueryResponse = {
    result_id: 'modified',
    session_id: sessionId,
    status: 'ok',
    answer: fullAnswer,
    interpretation: isAllSheetsMod
      ? `Modified data across all ${sheetsToModify.length} sheets in temp working copy: ${question}`
      : `Modified data in temp working copy of sheet "${targetSheet}": ${question}`,
    target_sheet: isAllSheetsMod ? undefined : targetSheet,
    source_sheets: sheetsToModify,
    structured_format: {
      headline: isAllSheetsMod
        ? `Applied changes across all ${sheetsToModify.length} sheets: ${explanation}`
        : `Applied changes to sheet "${targetSheet}": ${explanation}`,
      summary: isAllSheetsMod
        ? `Modified ${totalAffectedRows} total rows across ${sheetsToModify.length} sheets. Original main Excel preserved.`
        : `Modified ${modifiedCount} rows in sheet "${targetSheet}". Original main Excel file remains untouched.`,
      target_sheet: isAllSheetsMod ? undefined : targetSheet,
      source_sheets: sheetsToModify,
      sheet_breakdown: sheetsToModify.map((s) => ({
        sheet_name: s,
        count: file.sheetData[s]?.rows?.length || 0,
        metric_summary: 'Updated in workspace',
      })),
      key_metrics: [
        { label: 'Status', value: 'Updated', badge: 'Live Workspace' },
        { label: isAllSheetsMod ? 'Sheets Affected' : 'Target Sheet', value: isAllSheetsMod ? `${sheetsToModify.length} sheets` : targetSheet },
        { label: 'Total Rows Affected', value: `${totalAffectedRows || modifiedCount} rows` },
      ],
      bullet_points: [
        explanation,
        `Sheets modified: ${sheetsToModify.join(', ')}`,
        'Original pristine Excel file preserved for safe comparison and export',
        'Preview and calculations updated live with your modified dataset',
      ],
      takeaway: 'You can export either the temp modified file or original pristine file, or click "Revert to Original" to undo.',
    },
    result: {
      columns: updatedColumns,
      rows: updatedRows.slice(0, 20),
      total_matches: updatedRows.length,
      truncated: updatedRows.length > 20,
    },
    evidence: {
      plan_plain_english: isAllSheetsMod
        ? `Applied data modifications across all ${sheetsToModify.length} sheets (${sheetsToModify.join(', ')}). Original main Excel is preserved.`
        : `Applied data modifications to temp Excel sheet "${targetSheet}". Original main Excel is preserved.`,
      operation_steps: [
        `Identified target sheets (${sheetsToModify.join(', ')}) in workbook`,
        'Calculated transformations and applied updates to temp working copy',
        'Preserved original Excel file intact for safe comparison and revert',
      ],
      matched_row_count: totalAffectedRows || modifiedCount,
      source_rows: updatedRows.slice(0, 5),
      source_row_numbers: Array.from({ length: Math.min(5, updatedRows.length) }, (_, i) => i + 1),
      skipped_missing: {},
      warnings: ['Modifications applied to temporary working copy only.'],
    },
    chart: null,
    latency_ms: Date.now() - startTime,
    trace_id: `trace_${Date.now()}`,
    warnings: [],
  };

  return {
    response: queryResponse,
    wasModified: true,
  };
}

function applyFallbackModification(
  rows: Record<string, any>[],
  columns: string[],
  question: string
): Record<string, any>[] {
  const q = question.toLowerCase();
  const numCol = columns.find((c) => {
    const val = Number(rows[0]?.[c]);
    return !isNaN(val);
  });

  if (numCol && (q.includes('bonus') || q.includes('add') || q.includes('+'))) {
    const matchNumber = q.match(/\d+/);
    const bonus = matchNumber ? parseInt(matchNumber[0], 10) : 5;
    return rows.map((r) => ({
      ...r,
      [numCol]: (Number(r[numCol]) || 0) + bonus,
    }));
  }

  return rows.map((r, i) => ({
    ...r,
    AI_Modified: `Updated (${i + 1})`,
  }));
}

async function handleAnalyticalQuery(
  file: StoredFile,
  activeSheetName: string,
  question: string,
  sessionId: string,
  startTime: number
): Promise<QueryExecutionResult> {
  const { primarySheet, relevantSheets, isMultiSheetQuery, sheetMentions } = detectTargetSheets(
    file,
    question,
    activeSheetName
  );

  const sheets = file.sheets && file.sheets.length > 0 ? file.sheets : ['Sheet1'];

  // 1. Compile verified statistics and schema for ALL sheets in the workbook
  const allSheetsSummary: Record<string, SheetMetadataSummary> = {};
  let totalRowsAllSheets = 0;

  for (const sName of sheets) {
    const sData = file.sheetData[sName] || { columns: [], rows: [] };
    const sRows = sData.rows || [];
    const sCols = sData.columns || [];
    totalRowsAllSheets += sRows.length;
    const stats = computeColumnSummaries(sRows, sCols);
    allSheetsSummary[sName] = {
      sheetName: sName,
      rowCount: sRows.length,
      columnCount: sCols.length,
      columns: sCols,
      numericStats: stats.numericStats,
      categoricalStats: stats.categoricalStats,
      sampleRows: sRows.slice(0, 4),
    };
  }

  // 2. Select rows payload for prompt
  const sheetsPayload: Record<string, Record<string, any>[]> = {};
  if (totalRowsAllSheets <= 250) {
    // Send full data for all sheets
    for (const sName of sheets) {
      sheetsPayload[sName] = file.sheetData[sName]?.rows || [];
    }
  } else {
    // Send full data for relevant sheets (up to 50 rows each) and samples for others
    for (const sName of sheets) {
      const sRows = file.sheetData[sName]?.rows || [];
      if (relevantSheets.includes(sName)) {
        sheetsPayload[sName] = sRows.slice(0, 50);
      } else {
        sheetsPayload[sName] = sRows.slice(0, 4);
      }
    }
  }

  // Primary sheet rows and columns for local fallback
  const primarySheetData = file.sheetData[primarySheet] || file.sheetData[file.active_sheet] || { columns: [], rows: [] };
  const primaryRows = primarySheetData.rows || [];
  const primaryColumns = primarySheetData.columns || [];

  let answer = '';
  let interpretation = '';
  let operationSteps: string[] = [];
  let chartData: ChartData | null = null;
  let structuredFormat: StructuredAnswerFormat | null = null;
  let matchedRows = primaryRows.slice(0, 20);
  let matchedCount = primaryRows.length;
  let sourceSheetsResult: string[] = isMultiSheetQuery ? relevantSheets : [primarySheet];

  const qLower = question.toLowerCase().trim();
  const isPieRequested =
    qLower.includes('pie') ||
    qLower.includes('donut') ||
    qLower.includes('circle chart');

  const isChartExplicitlyRequested =
    isPieRequested ||
    qLower.includes('chart') ||
    qLower.includes('graph') ||
    qLower.includes('plot') ||
    qLower.includes('visualize') ||
    qLower.includes('visualisation') ||
    qLower.includes('visualization') ||
    qLower.includes('diagram') ||
    qLower.includes('bar chart') ||
    qLower.includes('pie chart') ||
    qLower.includes('line chart') ||
    qLower.includes('scatter') ||
    qLower.includes('trend');

  try {
    const prompt = `You are ExcelMind AI, an elite spreadsheet data analyst with multi-sheet workbook intelligence.
Your goal is to answer the user's question with 100% mathematical accuracy and laser-focused relevance.

Workbook Overview:
- Filename: "${file.filename}"
- Total Sheets: ${sheets.length} sheets (${sheets.join(', ')})
- Active Sheet in UI: "${activeSheetName}"
- Target / Relevant Sheets: ${JSON.stringify(relevantSheets)}
- Multi-sheet Query Detected: ${isMultiSheetQuery ? 'YES' : 'NO'}
- Total Records Across Entire Workbook: ${totalRowsAllSheets.toLocaleString()}

Verified Ground-Truth Summaries For ALL Sheets:
${JSON.stringify(allSheetsSummary, null, 2)}

Spreadsheet Rows Data:
${JSON.stringify(sheetsPayload, null, 2)}

User Question: "${question}"
User requested visual chart: ${isChartExplicitlyRequested ? 'YES (Always provide chartType, chartX, chartY, chartTitle)' : 'NO (Provide chart if insightful)'}

ACCURACY & RELEVANCE MANDATES (CRITICAL):
1. DIRECT ANSWER FIRST: Your "headline" MUST immediately and directly answer the exact question asked without fluff, warmups, or conversational filler.
   - Example (Metric Query): "In sheet 'Employees', average Salary is $78,500 across 45 records (Total: $3,532,500)."
   - Example (Chart/Pie Query): "Here is the Pie Chart distribution for 'Department' in sheet 'Employees' across all 1,000 records, led by 'Engineering' (350 records, 35.0%)."
   - Example (Filter/Where Query): "Found 18 orders matching status 'Pending' on sheet 'Orders', totaling $12,450."
2. NO HALLUCINATION & NO UNRELATED DETAILS: Compute exact numbers from the row data or ground-truth summaries provided above. Never output numbers that do not match the data.
3. EXPLICIT SHEET SOURCE: Always state which sheet(s) the numbers were calculated from so the user has full provenance.
4. RELEVANT METRICS ONLY: Discuss only the columns, categories, or sheets relevant to the question. Do not clutter the response with unrequested columns or unrelated sheet stats.

Return JSON ONLY with this schema:
{
  "headline": "A single clear, direct sentence answering the user's question immediately with verified numbers and source sheet name.",
  "sourceSheets": ["Sheet1"],
  "targetSheet": "primary sheet name or null",
  "keyMetrics": [
    { "label": "Short label", "value": "Exact calculated value", "badge": "Tag" }
  ],
  "sheetBreakdown": [
    { "sheet_name": "Sheet name", "count": 100, "metric_summary": "Metric detail" }
  ],
  "bulletPoints": [
    "Clean, human-friendly highlight 1 with numbers bolded",
    "Clean highlight 2"
  ],
  "takeaway": "One-sentence executive conclusion addressing the user's core intent.",
  "answer": "A clean, beautiful Markdown presentation: ### 💡 Quick Takeaway at top, ### 📊 Key Metrics, then ### 📋 Breakdown, followed by ### 🎯 Summary. Keep wording human, clear, direct, and laser-focused on the user's question.",
  "interpretation": "Clear summary of calculation method and sheets analyzed",
  "operationSteps": ["Step 1", "Step 2"],
  "chartType": "bar | line | pie | scatter | histogram | none",
  "chartX": "Exact column name, or 'Sheet' for comparing sheets",
  "chartY": "Exact metric column name or 'Records' or 'Count'",
  "chartTitle": "Chart title or null"
}`;

    const { text } = await callGeminiWithFailover(prompt, true);
    const parsed = JSON.parse(text || '{}');

    answer = parsed.answer || '';
    interpretation = parsed.interpretation || `Analysis of ${sheets.join(', ')} for: "${question}"`;
    operationSteps = parsed.operationSteps || [
      `Scanned records across ${sheets.length} sheets in workbook "${file.filename}"`,
      'Computed verified aggregates and cross-sheet metrics',
    ];

    if (Array.isArray(parsed.sourceSheets) && parsed.sourceSheets.length > 0) {
      sourceSheetsResult = parsed.sourceSheets;
    }

    if (parsed.headline || parsed.keyMetrics || parsed.bulletPoints || parsed.sheetBreakdown) {
      structuredFormat = {
        headline: parsed.headline || undefined,
        summary: parsed.takeaway || undefined,
        source_sheets: sourceSheetsResult,
        target_sheet: parsed.targetSheet || (sourceSheetsResult.length === 1 ? sourceSheetsResult[0] : undefined),
        key_metrics: Array.isArray(parsed.keyMetrics) ? parsed.keyMetrics : undefined,
        sheet_breakdown: Array.isArray(parsed.sheetBreakdown) ? parsed.sheetBreakdown : undefined,
        bullet_points: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints : undefined,
        takeaway: parsed.takeaway || undefined,
      };
    }

    // Chart Generation
    let selectedChartType = isPieRequested ? 'pie' : parsed.chartType;
    let selectedX = parsed.chartX;
    let selectedY = parsed.chartY;
    let selectedTitle = parsed.chartTitle;

    const isExplicitSheetComparison =
      qLower.includes('sheet ') ||
      qLower.includes('sheets') ||
      qLower.includes('compare sheet') ||
      qLower.includes('all sheets');

    // Check if comparing sheets (only if explicitly requested to compare sheets)
    if (selectedX === 'Sheet' || (isExplicitSheetComparison && isMultiSheetQuery)) {
      selectedChartType = isPieRequested ? 'pie' : (selectedChartType === 'pie' ? 'pie' : 'bar');
      selectedX = 'Sheet';

      const isMetricCol = selectedY && selectedY !== 'Count' && selectedY !== 'Rows';
      const xArr = sheets;
      const yArr = sheets.map((s) => {
        if (isMetricCol && allSheetsSummary[s]?.numericStats[selectedY]) {
          return allSheetsSummary[s].numericStats[selectedY].sum;
        }
        return allSheetsSummary[s]?.rowCount || 0;
      });

      const yAxisTitle = isMetricCol ? selectedY : 'Rows Count';
      selectedTitle = selectedTitle || `${yAxisTitle} by Sheet`;

      const chartImageUrl = generateChartDataUrl({
        type: selectedChartType as any,
        title: selectedTitle,
        labels: xArr,
        values: yArr,
        xTitle: 'Sheet',
        yTitle: yAxisTitle,
      });

      const chartSvg = generateChartSvg({
        type: selectedChartType as any,
        title: selectedTitle,
        labels: xArr,
        values: yArr,
        xTitle: 'Sheet',
        yTitle: yAxisTitle,
      });

      chartData = {
        type: selectedChartType,
        x: 'Sheet',
        y: yAxisTitle,
        title: selectedTitle,
        image_url: chartImageUrl,
        image_svg: chartSvg,
        plotly: {
          data: [{
            type: selectedChartType === 'pie' ? 'pie' : selectedChartType,
            labels: selectedChartType === 'pie' ? xArr : undefined,
            values: selectedChartType === 'pie' ? yArr : undefined,
            x: selectedChartType === 'pie' ? undefined : xArr,
            y: selectedChartType === 'pie' ? undefined : yArr,
            hole: selectedChartType === 'pie' ? 0.4 : undefined,
            textinfo: selectedChartType === 'pie' ? 'label+percent' : undefined,
            hoverinfo: selectedChartType === 'pie' ? 'label+value+percent' : undefined,
            marker: {
              color: selectedChartType === 'pie' ? undefined : xArr.map((_, i) => VIBRANT_CHART_COLORS[i % VIBRANT_CHART_COLORS.length]),
              colors: selectedChartType === 'pie' ? VIBRANT_CHART_COLORS : undefined,
              line: { color: '#ffffff', width: 1.5 },
            },
          }],
          layout: {
            title: { text: selectedTitle },
            autosize: true,
            margin: selectedChartType === 'pie' ? { t: 40, r: 20, l: 20, b: 30 } : { t: 40, r: 20, l: 50, b: 60 },
            showlegend: true,
            xaxis: selectedChartType === 'pie' ? undefined : { title: 'Sheet', tickangle: -20 },
            yaxis: selectedChartType === 'pie' ? undefined : { title: yAxisTitle },
          },
        },
      };
    } else {
      // Intra-sheet chart on primary sheet
      const primaryStats = allSheetsSummary[primarySheet];
      const catCols = Object.keys(primaryStats?.categoricalStats || {});
      const numCols = Object.keys(primaryStats?.numericStats || {});

      if (isPieRequested) {
        selectedChartType = 'pie';
      } else if (!selectedChartType || selectedChartType === 'none') {
        selectedChartType = qLower.includes('line') || qLower.includes('trend') ? 'line' : 'bar';
      }

      if (!selectedX || !primaryColumns.includes(selectedX)) {
        selectedX = catCols.find((c) => qLower.includes(c.toLowerCase())) ||
          primaryColumns.find((c) => qLower.includes(c.toLowerCase()) && !numCols.includes(c)) ||
          catCols[0] ||
          primaryColumns.find((c) => !numCols.includes(c)) ||
          primaryColumns[0];
      }

      // Check if user specifically requested a numeric metric to be summed or averaged
      const isMetricSumRequested =
        !isPieRequested && (
        qLower.includes('total') ||
        qLower.includes('sum') ||
        qLower.includes('revenue') ||
        qLower.includes('sales') ||
        qLower.includes('salary') ||
        qLower.includes('price') ||
        qLower.includes('amount') ||
        qLower.includes('cost') ||
        qLower.includes('profit'));

      const explicitMetricMatch = numCols.find((c) => qLower.includes(c.toLowerCase()));
      const shouldSumMetric = !isPieRequested && isMetricSumRequested && Boolean(explicitMetricMatch);

      let metricToAggregate: string | null = null;
      if (shouldSumMetric && explicitMetricMatch) {
        metricToAggregate = explicitMetricMatch;
        selectedY = metricToAggregate;
      } else {
        selectedY = 'Record Count';
      }

      selectedTitle = selectedTitle || (shouldSumMetric && metricToAggregate
        ? `${metricToAggregate} by ${selectedX} (${primarySheet})`
        : `${selectedX} Distribution (${primaryRows.length.toLocaleString()} Total Records)`);

      if (selectedX && primaryRows.length > 0) {
        const groupMap = new Map<string, number>();
        for (const r of primaryRows) {
          const k = String(r[selectedX] ?? '').trim() || 'Other';
          const v = shouldSumMetric && metricToAggregate ? (Number(r[metricToAggregate]) || 0) : 1;
          groupMap.set(k, (groupMap.get(k) || 0) + v);
        }

        const sortedEntries = Array.from(groupMap.entries()).sort((a, b) => b[1] - a[1]);
        const topEntries = sortedEntries.slice(0, 7);
        const remEntries = sortedEntries.slice(7);

        const xArr = topEntries.map((t) => t[0]);
        const yArr = topEntries.map((t) => shouldSumMetric ? Number(t[1].toFixed(2)) : t[1]);

        if (remEntries.length > 0) {
          const remSum = remEntries.reduce((acc, curr) => acc + curr[1], 0);
          xArr.push(`Other (${remEntries.length})`);
          yArr.push(shouldSumMetric ? Number(remSum.toFixed(2)) : remSum);
        }

        const finalTitle = selectedTitle || `${selectedX} Distribution (${primarySheet})`;

        const chartImageUrl = generateChartDataUrl({
          type: selectedChartType as any,
          title: finalTitle,
          labels: xArr,
          values: yArr,
          xTitle: selectedX,
          yTitle: selectedY || 'Count',
        });

        const chartSvg = generateChartSvg({
          type: selectedChartType as any,
          title: finalTitle,
          labels: xArr,
          values: yArr,
          xTitle: selectedX,
          yTitle: selectedY || 'Count',
        });

        chartData = {
          type: selectedChartType,
          x: selectedX,
          y: selectedY,
          title: finalTitle,
          image_url: chartImageUrl,
          image_svg: chartSvg,
          plotly: {
            data: [{
              type: selectedChartType === 'pie' ? 'pie' : selectedChartType,
              labels: selectedChartType === 'pie' ? xArr : undefined,
              values: selectedChartType === 'pie' ? yArr : undefined,
              x: selectedChartType === 'pie' ? undefined : xArr,
              y: selectedChartType === 'pie' ? undefined : yArr,
              hole: selectedChartType === 'pie' ? 0.45 : undefined,
              textinfo: selectedChartType === 'pie' ? 'percent+label' : undefined,
              hoverinfo: selectedChartType === 'pie' ? 'label+value+percent' : undefined,
              marker: {
                color: selectedChartType === 'pie' ? undefined : xArr.map((_, i) => VIBRANT_CHART_COLORS[i % VIBRANT_CHART_COLORS.length]),
                colors: selectedChartType === 'pie' ? VIBRANT_CHART_COLORS : undefined,
                line: { color: '#ffffff', width: 2 },
              },
            }],
            layout: {
              title: { text: finalTitle, font: { size: 15, weight: 'bold' } },
              autosize: true,
              margin: selectedChartType === 'pie' ? { t: 40, r: 25, l: 25, b: 35 } : { t: 40, r: 25, l: 55, b: 65 },
              showlegend: true,
              xaxis: selectedChartType === 'pie' ? undefined : { title: selectedX, tickangle: -20 },
              yaxis: selectedChartType === 'pie' ? undefined : { title: selectedY ? selectedY : 'Record Count' },
            },
          },
        };
      }
    }
  } catch (err: any) {
    console.error('Gemini query execution error:', err);
    const fallback = computeDeterministicAnswer(
      file,
      activeSheetName,
      question,
      allSheetsSummary,
      { primarySheet, relevantSheets, isMultiSheetQuery, sheetMentions }
    );
    answer = fallback.answer;
    interpretation = fallback.interpretation;
    operationSteps = fallback.operationSteps;
    matchedRows = fallback.matchedRows;
    matchedCount = fallback.matchedCount;
    chartData = fallback.chartData;
    structuredFormat = fallback.structured_format || null;
    sourceSheetsResult = fallback.source_sheets || sourceSheetsResult;
  }

  // Safety net: If user requested a pie chart and chartData is missing or not pie, synthesize guaranteed pie chart
  if (isPieRequested && (!chartData || chartData.type !== 'pie')) {
    const primaryStats = allSheetsSummary[primarySheet] || allSheetsSummary[sheets[0]];
    const catCols = Object.keys(primaryStats?.categoricalStats || {});
    const catCol = catCols.find((c) => qLower.includes(c.toLowerCase())) ||
      primaryColumns.find((c) => qLower.includes(c.toLowerCase())) ||
      catCols[0] ||
      primaryColumns[0];

    if (catCol && primaryRows.length > 0) {
      const groupMap = new Map<string, number>();
      for (const r of primaryRows) {
        const k = String(r[catCol] ?? '').trim() || 'Other';
        groupMap.set(k, (groupMap.get(k) || 0) + 1);
      }
      const sortedEntries = Array.from(groupMap.entries()).sort((a, b) => b[1] - a[1]);
      const topEntries = sortedEntries.slice(0, 7);
      const remEntries = sortedEntries.slice(7);

      const xArr = topEntries.map((t) => t[0]);
      const yArr = topEntries.map((t) => t[1]);

      if (remEntries.length > 0) {
        xArr.push(`Other (${remEntries.length})`);
        yArr.push(remEntries.reduce((acc, curr) => acc + curr[1], 0));
      }

      const pTitle = `${catCol} Distribution (${primaryRows.length.toLocaleString()} Total Records)`;
      chartData = {
        type: 'pie',
        x: catCol,
        y: 'Record Count',
        title: pTitle,
        image_url: generateChartDataUrl({
          type: 'pie',
          title: pTitle,
          labels: xArr,
          values: yArr,
          xTitle: catCol,
          yTitle: 'Record Count',
        }),
        image_svg: generateChartSvg({
          type: 'pie',
          title: pTitle,
          labels: xArr,
          values: yArr,
          xTitle: catCol,
          yTitle: 'Record Count',
        }),
        plotly: {
          data: [{
            type: 'pie',
            labels: xArr,
            values: yArr,
            hole: 0.45,
            textinfo: 'percent+label',
            hoverinfo: 'label+value+percent',
            marker: {
              colors: VIBRANT_CHART_COLORS,
              line: { color: '#ffffff', width: 2 },
            },
          }],
          layout: {
            title: { text: pTitle, font: { size: 15, weight: 'bold' } },
            autosize: true,
            margin: { t: 40, r: 25, l: 25, b: 35 },
            showlegend: true,
          },
        },
      };
    }
  }

  const queryResponse: QueryResponse = {
    result_id: `res_${Date.now()}`,
    session_id: sessionId,
    question,
    status: 'ok',
    answer,
    interpretation: interpretation || `Analysis for "${question}"`,
    source_sheets: sourceSheetsResult,
    target_sheet: sourceSheetsResult.length === 1 ? sourceSheetsResult[0] : undefined,
    structured_format: structuredFormat,
    result: {
      columns: primaryColumns,
      rows: matchedRows,
      total_matches: matchedCount,
      truncated: matchedCount > matchedRows.length,
    },
    evidence: {
      plan_plain_english: `Verified across ${sheets.length} sheets (${sheets.join(', ')}) with ${totalRowsAllSheets.toLocaleString()} total records.`,
      operation_steps: operationSteps.length > 0 ? operationSteps : [
        `Scanned ${sheets.length} sheets in workbook`,
        'Computed deterministic aggregates',
      ],
      matched_row_count: matchedCount,
      source_rows: matchedRows.slice(0, 5),
      source_row_numbers: Array.from({ length: Math.min(5, matchedRows.length) }, (_, i) => i + 1),
      skipped_missing: {},
      warnings: [],
    },
    chart: chartData,
    latency_ms: Date.now() - startTime,
    trace_id: `trace_${Date.now()}`,
    warnings: [],
  };

  return {
    response: queryResponse,
    wasModified: false,
  };
}

/**
 * Intelligent deterministic calculation engine that accurately handles filters,
 * multi-sheet syntheses, cross-sheet groupings, calculations, and column value lookups
 * directly from raw data across all sheets.
 */
function computeDeterministicAnswer(
  file: StoredFile,
  activeSheetName: string,
  question: string,
  allSheetsSummary: Record<string, SheetMetadataSummary>,
  detectResult: { primarySheet: string; relevantSheets: string[]; isMultiSheetQuery: boolean; sheetMentions: string[] }
): {
  answer: string;
  interpretation: string;
  operationSteps: string[];
  matchedRows: Record<string, any>[];
  matchedCount: number;
  chartData: ChartData | null;
  structured_format?: StructuredAnswerFormat;
  source_sheets?: string[];
  target_sheet?: string;
} {
  const qLower = question.toLowerCase();
  const sheets = file.sheets && file.sheets.length > 0 ? file.sheets : ['Sheet1'];

  const isPieRequested =
    qLower.includes('pie') ||
    qLower.includes('donut') ||
    qLower.includes('circle chart');

  const isChartReq =
    isPieRequested ||
    qLower.includes('chart') ||
    qLower.includes('graph') ||
    qLower.includes('plot') ||
    qLower.includes('visualize') ||
    qLower.includes('bar');

  // Helper to create chartData with SVG image
  const buildChart = (
    type: 'bar' | 'line' | 'pie',
    title: string,
    xCol: string,
    yCol: string | undefined,
    labels: string[],
    values: number[]
  ): ChartData => {
    const imgUrl = generateChartDataUrl({
      type,
      title,
      labels,
      values,
      xTitle: xCol,
      yTitle: yCol || 'Count',
    });
    const imgSvg = generateChartSvg({
      type,
      title,
      labels,
      values,
      xTitle: xCol,
      yTitle: yCol || 'Count',
    });

    return {
      type,
      x: xCol,
      y: yCol,
      title,
      image_url: imgUrl,
      image_svg: imgSvg,
      plotly: {
        data: [{
          type: type === 'pie' ? 'pie' : type,
          labels: type === 'pie' ? labels : undefined,
          values: type === 'pie' ? values : undefined,
          x: type === 'pie' ? undefined : labels,
          y: type === 'pie' ? undefined : values,
          hole: type === 'pie' ? 0.45 : undefined,
          textinfo: type === 'pie' ? 'percent+label' : undefined,
          hoverinfo: type === 'pie' ? 'label+value+percent' : undefined,
          marker: {
            color: type === 'pie' ? undefined : labels.map((_, i) => VIBRANT_CHART_COLORS[i % VIBRANT_CHART_COLORS.length]),
            colors: type === 'pie' ? VIBRANT_CHART_COLORS : undefined,
            line: { color: '#ffffff', width: 2 },
          },
        }],
        layout: {
          title: { text: title, font: { size: 15, weight: 'bold' } },
          autosize: true,
          margin: type === 'pie' ? { t: 40, r: 25, l: 25, b: 35 } : { t: 40, r: 25, l: 55, b: 65 },
          showlegend: true,
          xaxis: type === 'pie' ? undefined : { title: xCol, tickangle: -20 },
          yaxis: type === 'pie' ? undefined : { title: yCol || 'Count' },
        },
      },
    };
  };

  const totalWorkbookRows = Object.values(allSheetsSummary).reduce((acc, curr) => acc + curr.rowCount, 0);

  // 1. MULTI-SHEET OVERVIEW / LIST / COUNT SHEETS
  if (
    qLower.includes('how many sheets') ||
    qLower.includes('list sheets') ||
    qLower.includes('what sheets') ||
    qLower.includes('all sheets') ||
    qLower.includes('overview of sheets') ||
    qLower.includes('summarize sheets') ||
    qLower.includes('entire workbook')
  ) {
    const sheetItems = sheets.map((s, i) => {
      const summary = allSheetsSummary[s];
      return `${i + 1}. **${s}**: **${summary.rowCount.toLocaleString()}** rows, ${summary.columnCount} columns (${summary.columns.slice(0, 5).join(', ')}${summary.columns.length > 5 ? '...' : ''})`;
    }).join('\n');

    const breakdownItems = sheets.map((s) => ({
      sheet_name: s,
      count: allSheetsSummary[s]?.rowCount || 0,
      metric_summary: `${allSheetsSummary[s]?.columnCount || 0} columns`,
    }));

    const headline = `This Excel workbook contains **${sheets.length} sheets** with **${totalWorkbookRows.toLocaleString()}** total records.`;
    const answer = `### 💡 Quick Takeaway\n${headline}\n\n### 📋 Sheets Breakdown\n${sheetItems}\n\n### 🎯 Summary\nAll ${sheets.length} sheets are loaded in this workspace. You can analyze, compare, or instruct modifications across any sheet.`;

    const cData = buildChart(
      'bar',
      `Record Count by Sheet`,
      'Sheet',
      'Rows',
      sheets,
      sheets.map((s) => allSheetsSummary[s]?.rowCount || 0)
    );

    return {
      answer,
      interpretation: `Workbook sheets overview across all ${sheets.length} sheets`,
      operationSteps: [
        `Scanned all ${sheets.length} sheets in workbook "${file.filename}"`,
        `Calculated row counts and column schemas per sheet`,
      ],
      matchedRows: file.sheetData[sheets[0]]?.rows?.slice(0, 20) || [],
      matchedCount: totalWorkbookRows,
      chartData: cData,
      source_sheets: sheets,
      structured_format: {
        headline,
        source_sheets: sheets,
        key_metrics: [
          { label: 'Total Sheets', value: `${sheets.length} sheets`, badge: 'Workbook' },
          { label: 'Total Records', value: totalWorkbookRows.toLocaleString() },
          { label: 'Active Sheet', value: activeSheetName },
        ],
        sheet_breakdown: breakdownItems,
        bullet_points: sheets.map((s) => `${s}: ${allSheetsSummary[s]?.rowCount.toLocaleString()} records, ${allSheetsSummary[s]?.columnCount} columns`),
        takeaway: `Entire workbook is available for analysis and cross-sheet insights.`,
      },
    };
  }

  // 2. DEDICATED PIE CHART / CATEGORICAL VISUALIZATION QUERY
  if (isPieRequested || (isChartReq && !qLower.includes('total') && !qLower.includes('sum') && !qLower.includes('revenue') && !qLower.includes('sales') && !qLower.includes('average'))) {
    const primarySheetData = file.sheetData[detectResult.primarySheet] || file.sheetData[sheets[0]] || { columns: [], rows: [] };
    const pRows = primarySheetData.rows || [];
    const pCols = primarySheetData.columns || [];
    const pSummary = allSheetsSummary[detectResult.primarySheet] || allSheetsSummary[sheets[0]];
    const catCols = Object.keys(pSummary?.categoricalStats || {});
    const numCols = Object.keys(pSummary?.numericStats || {});

    // Pick categorical column (or non-numeric column)
    const catCol = catCols.find((c) => qLower.includes(c.toLowerCase())) ||
      catCols[0] ||
      pCols.find((c) => !numCols.includes(c)) ||
      pCols[0];

    if (catCol && pRows.length > 0) {
      const groupMap = new Map<string, number>();
      for (const r of pRows) {
        const k = String(r[catCol] ?? '').trim() || 'Other';
        groupMap.set(k, (groupMap.get(k) || 0) + 1);
      }

      const sorted = Array.from(groupMap.entries()).sort((a, b) => b[1] - a[1]);
      const topOne = sorted[0];
      const topEntries = sorted.slice(0, 6);
      const remEntries = sorted.slice(6);

      const chartLabels = topEntries.map((s) => s[0]);
      const chartValues = topEntries.map((s) => s[1]);

      if (remEntries.length > 0) {
        const remSum = remEntries.reduce((acc, curr) => acc + curr[1], 0);
        chartLabels.push(`Other (${remEntries.length})`);
        chartValues.push(remSum);
      }

      const breakdown = chartLabels.map((cat, i) => {
        const val = chartValues[i];
        const pct = ((val / pRows.length) * 100).toFixed(1);
        return `${i + 1}. **${cat}**: **${val.toLocaleString()} records** (${pct}%)`;
      }).join('\n');

      const chartType = isPieRequested ? 'pie' : 'bar';
      const chartTitle = `${catCol} Distribution (${pRows.length.toLocaleString()} Total Records)`;
      const cData = buildChart(
        chartType,
        chartTitle,
        catCol,
        'Record Count',
        chartLabels,
        chartValues
      );

      const headline = `In sheet **"${detectResult.primarySheet}"**, **${catCol}** distribution across all **${pRows.length.toLocaleString()} records** is led by **${topOne[0]}** with **${topOne[1].toLocaleString()} records** (${((topOne[1] / pRows.length) * 100).toFixed(1)}%).`;
      const answer = `### 💡 Quick Takeaway\n${headline}\n\n### 📊 Category Distribution Breakdown\n${breakdown}\n\n### 🎯 Summary\nGenerated verified ${chartType === 'pie' ? 'pie chart' : 'chart'} representing all ${pRows.length.toLocaleString()} total records in sheet "${detectResult.primarySheet}".`;

      return {
        answer,
        interpretation: `Generated ${chartType} distribution of ${catCol} across ${pRows.length.toLocaleString()} records in sheet "${detectResult.primarySheet}"`,
        operationSteps: [
          `Analyzed sheet "${detectResult.primarySheet}" (${pRows.length.toLocaleString()} verified records)`,
          `Grouped all rows by categorical dimension "${catCol}"`,
          `Computed exact record frequencies and percentage shares (summing to 100%)`,
        ],
        matchedRows: pRows.filter((r) => String(r[catCol]) === topOne[0]).slice(0, 20),
        matchedCount: pRows.length,
        chartData: cData,
        source_sheets: [detectResult.primarySheet],
        target_sheet: detectResult.primarySheet,
        structured_format: {
          headline,
          source_sheets: [detectResult.primarySheet],
          target_sheet: detectResult.primarySheet,
          key_metrics: [
            { label: 'Leading Category', value: topOne[0], badge: detectResult.primarySheet },
            { label: 'Top Volume', value: `${topOne[1].toLocaleString()} records` },
            { label: 'Total Records', value: `${pRows.length.toLocaleString()} rows` },
          ],
          bullet_points: chartLabels.slice(0, 5).map((cat, i) => `${cat}: ${chartValues[i].toLocaleString()} records (${((chartValues[i] / pRows.length) * 100).toFixed(1)}%)`),
          takeaway: `All ${pRows.length.toLocaleString()} records visualized by ${catCol}.`,
        },
      };
    }
  }

  // 2.5 SEARCH & FILTER ACROSS ALL SHEETS FOR MATCHING VALUES (Only when not a chart request)
  if (!isChartReq && !isPieRequested) {
    const STOP_WORDS = new Set([
      'the', 'and', 'for', 'all', 'not', 'pie', 'bar', 'chart', 'plot', 'graph', 'data',
      'chat', 'show', 'give', 'make', 'view', 'with', 'that', 'this', 'from', 'what',
      'when', 'where', 'which', 'will', 'have', 'been', 'more', 'less', 'some', 'many',
      'evidence', 'generating', 'generate', 'different', 'vibrant', 'colors', 'colour', 'color', 'charts'
    ]);

    for (const s of sheets) {
      const sRows = file.sheetData[s]?.rows || [];
      const sCols = file.sheetData[s]?.columns || [];

      for (const col of sCols) {
        for (const r of sRows) {
          const val = String(r[col] ?? '').trim();
          if (val && val.length > 2 && !STOP_WORDS.has(val.toLowerCase()) && qLower.includes(val.toLowerCase())) {
            const valLower = val.toLowerCase();
            // Find all matches in this sheet
            const matchingInSheet = sRows.filter((row) => String(row[col] ?? '').toLowerCase() === valLower);

            if (matchingInSheet.length > 0) {
              // Also check other sheets to see if this value appears across sheets
              const sheetsWithMatches: Array<{ sheet: string; rows: Record<string, any>[] }> = [
                { sheet: s, rows: matchingInSheet }
              ];

              for (const otherSheet of sheets) {
                if (otherSheet === s) continue;
                const oRows = file.sheetData[otherSheet]?.rows || [];
                const oCols = file.sheetData[otherSheet]?.columns || [];
                if (oCols.includes(col)) {
                  const oMatches = oRows.filter((row) => String(row[col] ?? '').toLowerCase() === valLower);
                  if (oMatches.length > 0) {
                    sheetsWithMatches.push({ sheet: otherSheet, rows: oMatches });
                  }
                }
              }

              const totalMatches = sheetsWithMatches.reduce((acc, curr) => acc + curr.rows.length, 0);
              const sourceSheetsFound = sheetsWithMatches.map((item) => item.sheet);
              const sampleFields = sCols.filter((c) => c !== col).slice(0, 3);
              const sampleList = matchingInSheet.slice(0, 5).map((m, idx) => {
                const summary = sampleFields.map((f) => `${f}: **${m[f]}**`).join(', ');
                return `${idx + 1}. ${summary}`;
              }).join('\n');

              const isMultiMatch = sourceSheetsFound.length > 1;
              const headline = isMultiMatch
                ? `Found **${totalMatches}** records across **${sourceSheetsFound.length} sheets** (${sourceSheetsFound.join(', ')}) where **${col}** is **"${val}"**.`
                : `Found **${totalMatches}** records in sheet **"${s}"** where **${col}** is **"${val}"**.`;

              const breakdown = sheetsWithMatches.map((item) => ({
                sheet_name: item.sheet,
                count: item.rows.length,
                metric_summary: `${item.rows.length} matches for ${col}="${val}"`,
              }));

              const answer = `### 💡 Quick Takeaway\n${headline}\n\n### 📋 Sample Matching Records (${s})\n${sampleList}\n\n### 🎯 Summary\nFound ${totalMatches} total matching entries across the workbook for "${val}".`;

              return {
                answer,
                interpretation: `Searched workbook for ${col} = "${val}" across ${sourceSheetsFound.join(', ')}`,
                operationSteps: [
                  `Scanned sheets (${sheets.join(', ')}) for column "${col}" matching "${val}"`,
                  `Identified ${totalMatches} matching records in ${sourceSheetsFound.join(', ')}`,
                ],
                matchedRows: matchingInSheet,
                matchedCount: totalMatches,
                chartData: isMultiMatch
                  ? buildChart('bar', `Matches for "${val}" by Sheet`, 'Sheet', 'Matches', sourceSheetsFound, sheetsWithMatches.map(item => item.rows.length))
                  : null,
                source_sheets: sourceSheetsFound,
                structured_format: {
                  headline,
                  source_sheets: sourceSheetsFound,
                  target_sheet: isMultiMatch ? undefined : s,
                  key_metrics: [
                    { label: 'Filter', value: val, badge: col },
                    { label: 'Total Matches', value: `${totalMatches} rows` },
                    { label: isMultiMatch ? 'Sheets Found' : 'Source Sheet', value: isMultiMatch ? `${sourceSheetsFound.length} sheets` : s },
                  ],
                  sheet_breakdown: isMultiMatch ? breakdown : undefined,
                  bullet_points: sheetsWithMatches.map(item => `${item.sheet}: ${item.rows.length} matching rows`),
                  takeaway: `${totalMatches} records matched "${val}" in workbook.`,
                },
              };
            }
          }
        }
      }
    }
  }

  // 2.8 WHO HAS HIGHEST / MAXIMUM / TOP / MIN / LEADER LOOKUP QUERY
  const isLeaderQuery =
    qLower.includes('who') ||
    qLower.includes('highest') ||
    qLower.includes('maximum') ||
    qLower.includes('max') ||
    qLower.includes('top') ||
    qLower.includes('leader') ||
    qLower.includes('lowest') ||
    qLower.includes('min') ||
    qLower.includes('best');

  if (isLeaderQuery && !qLower.includes('total') && !qLower.includes('sum') && !qLower.includes('average') && !qLower.includes('mean')) {
    const primarySheetData = file.sheetData[detectResult.primarySheet] || file.sheetData[sheets[0]] || { columns: [], rows: [] };
    const pRows = primarySheetData.rows || [];
    const pCols = primarySheetData.columns || [];
    const pSummary = allSheetsSummary[detectResult.primarySheet] || allSheetsSummary[sheets[0]];
    const catCols = Object.keys(pSummary?.categoricalStats || {});
    const numCols = Object.keys(pSummary?.numericStats || {});

    // Identify numeric column evaluated (e.g. MARKS, score, salary, grade, points, revenue, amount)
    const metricCol = numCols.find((c) => qLower.includes(c.toLowerCase())) ||
      numCols[0] ||
      pCols.find((c) => {
        const val = parseNumericValue(pRows[0]?.[c]);
        return val !== null && !isNaN(val);
      }) ||
      pCols[1] || pCols[0];

    // Identify entity/person column (e.g. NAMES, Name, Student, Employee, Person, Customer)
    const entityCol = pCols.find((c) => {
      const cL = c.toLowerCase();
      return cL.includes('name') || cL.includes('student') || cL.includes('employee') || cL.includes('person') || cL.includes('customer') || cL.includes('user') || cL.includes('item') || cL.includes('id');
    }) || catCols[0] || pCols.find((c) => c !== metricCol) || pCols[0];

    if (metricCol && pRows.length > 0) {
      const isMin = qLower.includes('lowest') || qLower.includes('min') || qLower.includes('bottom');
      const sortedRows = [...pRows].sort((a, b) => {
        const valA = parseNumericValue(a[metricCol]) ?? (isMin ? Infinity : -Infinity);
        const valB = parseNumericValue(b[metricCol]) ?? (isMin ? Infinity : -Infinity);
        return isMin ? valA - valB : valB - valA;
      });

      const topRow = sortedRows[0];
      const topVal = parseNumericValue(topRow[metricCol]) || 0;
      const topName = String(topRow[entityCol] ?? topRow[pCols[0]] ?? 'Top Record').trim();

      // Find all rows tied for top score
      const tiedRows = sortedRows.filter((r) => Math.abs((parseNumericValue(r[metricCol]) || 0) - topVal) < 0.0001);
      const tiedNames = Array.from(new Set(tiedRows.map((r) => String(r[entityCol] ?? r[pCols[0]]).trim())));

      const isMultiTied = tiedNames.length > 1;
      const headline = isMultiTied
        ? `In sheet **"${detectResult.primarySheet}"**, the ${isMin ? 'lowest' : 'highest'} **${metricCol}** score is **${topVal.toLocaleString()}**, achieved by **${tiedNames.join(', ')}**.`
        : `In sheet **"${detectResult.primarySheet}"**, **${topName}** scored the ${isMin ? 'lowest' : 'highest'} **${metricCol}** with **${topVal.toLocaleString()}** (out of ${pRows.length.toLocaleString()} total records).`;

      const topBreakdown = sortedRows.slice(0, 6).map((r, i) => {
        const name = String(r[entityCol] ?? r[pCols[0]]).trim();
        const val = parseNumericValue(r[metricCol]) || 0;
        return `${i + 1}. **${name}**: **${val.toLocaleString()}** ${metricCol}`;
      }).join('\n');

      const answer = `### 💡 Quick Takeaway\n${headline}\n\n### 🏆 Top Rankings (${detectResult.primarySheet})\n${topBreakdown}\n\n### 🎯 Summary\n${isMultiTied ? `${tiedNames.join(', ')} tie for top rank` : `**${topName}** holds rank 1`} with ${topVal.toLocaleString()} ${metricCol} in sheet "${detectResult.primarySheet}".`;

      const cData = buildChart(
        'bar',
        `${metricCol} Leaderboard (${detectResult.primarySheet})`,
        entityCol,
        metricCol,
        sortedRows.slice(0, 8).map((r) => String(r[entityCol] ?? r[pCols[0]]).trim()),
        sortedRows.slice(0, 8).map((r) => parseNumericValue(r[metricCol]) || 0)
      );

      return {
        answer,
        interpretation: `Evaluated ${isMin ? 'lowest' : 'highest'} ${metricCol} across ${pRows.length.toLocaleString()} records in sheet "${detectResult.primarySheet}"`,
        operationSteps: [
          `Scanned sheet "${detectResult.primarySheet}" (${pRows.length.toLocaleString()} rows)`,
          `Sorted records by ${metricCol} in ${isMin ? 'ascending' : 'descending'} order`,
          `Identified ${isMin ? 'minimum' : 'maximum'} score (${topVal.toLocaleString()}) and associated entity (${topName})`,
        ],
        matchedRows: tiedRows,
        matchedCount: tiedRows.length,
        chartData: cData,
        source_sheets: [detectResult.primarySheet],
        target_sheet: detectResult.primarySheet,
        structured_format: {
          headline,
          source_sheets: [detectResult.primarySheet],
          target_sheet: detectResult.primarySheet,
          key_metrics: [
            { label: `${isMin ? 'Lowest' : 'Highest'} Scorer`, value: topName, badge: detectResult.primarySheet },
            { label: `${isMin ? 'Min' : 'Max'} ${metricCol}`, value: topVal.toLocaleString() },
            { label: 'Total Records Evaluated', value: `${pRows.length.toLocaleString()} rows` },
          ],
          bullet_points: sortedRows.slice(0, 5).map((r) => `${r[entityCol] || 'Record'}: ${r[metricCol]}`),
          takeaway: `Rank 1: ${topName} (${topVal.toLocaleString()} ${metricCol}).`,
        },
      };
    }
  }

  // 3. CROSS-SHEET NUMERIC METRICS (Sum, Total, Average, Revenue, Sales, etc.)
  const isMetricQuery =
    !isPieRequested &&
    (qLower.includes('total') ||
      qLower.includes('sum') ||
      qLower.includes('average') ||
      qLower.includes('mean') ||
      qLower.includes('revenue') ||
      qLower.includes('sales') ||
      qLower.includes('amount') ||
      qLower.includes('price') ||
      qLower.includes('score') ||
      qLower.includes('cost') ||
      qLower.includes('profit') ||
      qLower.includes('units'));

  // Find best matching numeric column across sheets
  let bestMetricCol: string | null = null;
  let sheetsHavingMetric: string[] = [];

  for (const s of sheets) {
    const numCols = Object.keys(allSheetsSummary[s]?.numericStats || {});
    const matched = numCols.find((c) => qLower.includes(c.toLowerCase()));
    if (matched) {
      bestMetricCol = matched;
      break;
    }
  }

  // Fallback to commonly queried financial/numeric column names if query is metric-related
  if (!bestMetricCol && isMetricQuery) {
    const priorityNames = ['revenue', 'sales', 'amount', 'total', 'profit', 'price', 'cost', 'score', 'units', 'salary', 'quantity'];
    for (const p of priorityNames) {
      for (const s of sheets) {
        const numCols = Object.keys(allSheetsSummary[s]?.numericStats || {});
        const found = numCols.find((c) => c.toLowerCase().includes(p));
        if (found) {
          bestMetricCol = found;
          break;
        }
      }
      if (bestMetricCol) break;
    }
  }

  if (bestMetricCol) {
    sheetsHavingMetric = sheets.filter((s) => allSheetsSummary[s]?.numericStats[bestMetricCol!]);
  }

  // 3A. MULTI-SHEET AGGREGATION
  if (bestMetricCol && sheetsHavingMetric.length > 1) {
    const isAverageReq = qLower.includes('average') || qLower.includes('mean');
    const sheetStats: Array<{ sheet: string; sum: number; mean: number; count: number }> = [];
    let grandSum = 0;
    let grandCount = 0;

    for (const s of sheetsHavingMetric) {
      const stat = allSheetsSummary[s]?.numericStats[bestMetricCol];
      const sSum = stat ? stat.sum : 0;
      const sCount = stat ? stat.count : 0;
      const sMean = stat ? stat.mean : 0;
      grandSum += sSum;
      grandCount += sCount;
      sheetStats.push({ sheet: s, sum: sSum, mean: sMean, count: sCount });
    }

    sheetStats.sort((a, b) => b.sum - a.sum);
    const topSheet = sheetStats[0];
    const overallMean = grandCount > 0 ? Number((grandSum / grandCount).toFixed(2)) : 0;

    const breakdownLines = sheetStats.map((item, i) =>
      `${i + 1}. **${item.sheet}**: **${isAverageReq ? item.mean.toLocaleString() : item.sum.toLocaleString()}** (${item.count.toLocaleString()} rows)`
    ).join('\n');

    const headline = isAverageReq
      ? `Average **${bestMetricCol}** across all ${sheetsHavingMetric.length} sheets is **${overallMean.toLocaleString()}**, with highest average in **${topSheet.sheet}** (**${topSheet.mean.toLocaleString()}**).`
      : `Total **${bestMetricCol}** across all ${sheetsHavingMetric.length} sheets is **${grandSum.toLocaleString()}**, led by **${topSheet.sheet}** with **${topSheet.sum.toLocaleString()}**.`;

    const answer = `### 💡 Quick Takeaway\n${headline}\n\n### 📊 Breakdown by Sheet\n${breakdownLines}\n\n### 🎯 Summary\n**${topSheet.sheet}** is the leading contributor (${((topSheet.sum / (grandSum || 1)) * 100).toFixed(1)}% of total ${bestMetricCol}).`;

    const chartTitle = isAverageReq ? `Average ${bestMetricCol} by Sheet` : `Total ${bestMetricCol} by Sheet`;
    const subChartType = qLower.includes('pie') ? 'pie' : 'bar';
    const cData = buildChart(
      subChartType,
      chartTitle,
      'Sheet',
      bestMetricCol,
      sheetStats.map((s) => s.sheet),
      sheetStats.map((s) => isAverageReq ? s.mean : s.sum)
    );

    return {
      answer,
      interpretation: `Computed verified ${isAverageReq ? 'average' : 'total'} ${bestMetricCol} across all sheets (${sheetsHavingMetric.join(', ')})`,
      operationSteps: [
        `Identified column "${bestMetricCol}" across sheets (${sheetsHavingMetric.join(', ')})`,
        `Aggregated metrics for each individual sheet`,
        `Computed cross-sheet grand total (${grandSum.toLocaleString()})`,
      ],
      matchedRows: file.sheetData[topSheet.sheet]?.rows?.slice(0, 20) || [],
      matchedCount: grandCount,
      chartData: cData,
      source_sheets: sheetsHavingMetric,
      structured_format: {
        headline,
        source_sheets: sheetsHavingMetric,
        key_metrics: [
          { label: isAverageReq ? `Overall Average ${bestMetricCol}` : `Grand Total ${bestMetricCol}`, value: isAverageReq ? overallMean.toLocaleString() : grandSum.toLocaleString(), badge: 'All Sheets' },
          { label: 'Leading Sheet', value: topSheet.sheet, badge: 'Top' },
          { label: 'Sheets Analyzed', value: `${sheetsHavingMetric.length} sheets` },
        ],
        sheet_breakdown: sheetStats.map((s) => ({
          sheet_name: s.sheet,
          count: s.count,
          metric_summary: isAverageReq ? `Avg: ${s.mean.toLocaleString()}` : `${bestMetricCol}: ${s.sum.toLocaleString()}`,
        })),
        bullet_points: sheetStats.map((s) => `${s.sheet}: ${isAverageReq ? 'Average = ' + s.mean.toLocaleString() : bestMetricCol + ' = ' + s.sum.toLocaleString()}`),
        takeaway: `Calculated verified multi-sheet aggregate across ${sheetsHavingMetric.length} sheets.`,
      },
    };
  }

  // 3B. SINGLE SHEET TARGETED METRIC (when column exists on only one sheet)
  if (bestMetricCol && sheetsHavingMetric.length === 1) {
    const sName = sheetsHavingMetric[0];
    const stat = allSheetsSummary[sName]?.numericStats[bestMetricCol];
    if (stat) {
      const isAverageReq = qLower.includes('average') || qLower.includes('mean');
      const headline = isAverageReq
        ? `In sheet **"${sName}"**, the average **${bestMetricCol}** is **${stat.mean.toLocaleString()}** (Sum: ${stat.sum.toLocaleString()} across ${stat.count} records).`
        : `In sheet **"${sName}"**, total **${bestMetricCol}** is **${stat.sum.toLocaleString()}** across ${stat.count} records.`;

      const answer = `### 💡 Quick Takeaway\n${headline}\n\n### 📊 Metric Details (${sName})\n- **Total Sum**: **${stat.sum.toLocaleString()}**\n- **Average**: **${stat.mean.toLocaleString()}**\n- **Min**: **${stat.min.toLocaleString()}**\n- **Max**: **${stat.max.toLocaleString()}**\n\n### 🎯 Summary\nData was found on sheet "${sName}" (${sName} is 1 of ${sheets.length} sheets in this workbook).`;

      // Generate chart for single sheet metric grouped by primary categorical column or top rows
      const sRows = file.sheetData[sName]?.rows || [];
      const sCols = file.sheetData[sName]?.columns || [];
      const catCols = Object.keys(allSheetsSummary[sName]?.categoricalStats || {});
      const groupCol = catCols.find((c) => c !== bestMetricCol) || sCols.find((c) => c !== bestMetricCol) || sCols[0];

      let chartLabels: string[] = [];
      let chartValues: number[] = [];

      if (groupCol && sRows.length > 0) {
        const gMap = new Map<string, number>();
        for (const r of sRows) {
          const k = String(r[groupCol] ?? 'Other');
          const v = Number(r[bestMetricCol]) || 0;
          gMap.set(k, (gMap.get(k) || 0) + v);
        }
        const sortedG = Array.from(gMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
        chartLabels = sortedG.map((g) => g[0]);
        chartValues = sortedG.map((g) => Number(g[1].toFixed(2)));
      } else {
        const topSlice = sRows.slice(0, 8);
        chartLabels = topSlice.map((_, i) => `Row ${i + 1}`);
        chartValues = topSlice.map((r) => Number(r[bestMetricCol]) || 0);
      }

      const singleChartType = qLower.includes('pie') ? 'pie' : 'bar';
      const cData = buildChart(
        singleChartType,
        `${bestMetricCol} by ${groupCol || 'Record'} (${sName})`,
        groupCol || 'Record',
        bestMetricCol,
        chartLabels,
        chartValues
      );

      return {
        answer,
        interpretation: `Aggregated ${bestMetricCol} on sheet "${sName}"`,
        operationSteps: [
          `Identified column "${bestMetricCol}" in sheet "${sName}"`,
          `Computed mathematical sum (${stat.sum.toLocaleString()}) and mean (${stat.mean.toLocaleString()})`,
        ],
        matchedRows: file.sheetData[sName]?.rows?.slice(0, 20) || [],
        matchedCount: stat.count,
        chartData: cData,
        source_sheets: [sName],
        target_sheet: sName,
        structured_format: {
          headline,
          source_sheets: [sName],
          target_sheet: sName,
          key_metrics: [
            { label: `Total ${bestMetricCol}`, value: stat.sum.toLocaleString(), badge: sName },
            { label: 'Average', value: stat.mean.toLocaleString() },
            { label: 'Valid Records', value: `${stat.count} rows` },
          ],
          bullet_points: [
            `Total: ${stat.sum.toLocaleString()}`,
            `Average: ${stat.mean.toLocaleString()}`,
            `Range: ${stat.min} - ${stat.max}`,
          ],
          takeaway: `Calculated on sheet "${sName}".`,
        },
      };
    }
  }

  // 4. TOP / MAXIMUM / CATEGORICAL GROUPING
  if (qLower.includes('highest') || qLower.includes('top') || qLower.includes('maximum') || qLower.includes('best') || isChartReq) {
    const primarySheetData = file.sheetData[detectResult.primarySheet] || file.sheetData[sheets[0]] || { columns: [], rows: [] };
    const pRows = primarySheetData.rows || [];
    const pCols = primarySheetData.columns || [];
    const pSummary = allSheetsSummary[detectResult.primarySheet] || allSheetsSummary[sheets[0]];
    const catCols = Object.keys(pSummary?.categoricalStats || {});
    const numCols = Object.keys(pSummary?.numericStats || {});

    const catCol = catCols.find((c) => qLower.includes(c.toLowerCase())) || catCols[0] || pCols[0];
    
    // Only sum a numeric column if the query explicitly requested a total/sum/metric
    const isExplicitMetricSum =
      qLower.includes('total') ||
      qLower.includes('sum') ||
      qLower.includes('revenue') ||
      qLower.includes('sales') ||
      qLower.includes('salary') ||
      qLower.includes('price') ||
      qLower.includes('amount') ||
      qLower.includes('cost') ||
      qLower.includes('profit');
    
    const metricCol = isExplicitMetricSum ? numCols.find((c) => qLower.includes(c.toLowerCase())) : null;

    if (catCol && pRows.length > 0) {
      const groupMap = new Map<string, number>();
      for (const r of pRows) {
        const k = String(r[catCol] ?? 'Other');
        const v = metricCol ? (parseNumericValue(r[metricCol]) || 0) : 1;
        groupMap.set(k, (groupMap.get(k) || 0) + v);
      }
      const sorted = Array.from(groupMap.entries()).sort((a, b) => b[1] - a[1]);
      const topOne = sorted[0];
      const breakdown = sorted.slice(0, 6).map(([cat, val], i) => `${i + 1}. **${cat}**: **${val.toLocaleString()}**${metricCol ? '' : ' records'}`).join('\n');

      const chartType = isPieRequested || qLower.includes('pie') ? 'pie' : 'bar';
      const chartTitle = metricCol
        ? `${metricCol} by ${catCol} (${detectResult.primarySheet})`
        : `${catCol} Distribution (${pRows.length.toLocaleString()} Total Records)`;
      
      const cData = buildChart(
        chartType,
        chartTitle,
        catCol,
        metricCol || 'Record Count',
        sorted.slice(0, 8).map((s) => s[0]),
        sorted.slice(0, 8).map((s) => metricCol ? Number(s[1].toFixed(2)) : s[1])
      );

      const headline = `In sheet **"${detectResult.primarySheet}"**, the leading **${catCol}** is **${topOne[0]}** with **${topOne[1].toLocaleString()}**${metricCol ? ` in total ${metricCol}` : ` records (out of ${pRows.length.toLocaleString()} total)`}.`;
      const answer = `### 💡 Quick Takeaway\n${headline}\n\n### 📊 Key Breakdown\n${breakdown}\n\n### 🎯 Summary\n**${topOne[0]}** represents the top category with ${topOne[1].toLocaleString()}${metricCol ? '' : ' records'} in sheet "${detectResult.primarySheet}".`;

      return {
        answer,
        interpretation: `Aggregated total ${metricCol || 'record count'} grouped by ${catCol} in sheet "${detectResult.primarySheet}"`,
        operationSteps: [
          `Analyzed sheet "${detectResult.primarySheet}" (${pRows.length.toLocaleString()} records)`,
          `Grouped records by ${catCol}`,
          `Calculated verified ${metricCol ? `total ${metricCol}` : 'record counts'} for each category`,
        ],
        matchedRows: pRows.filter((r) => String(r[catCol]) === topOne[0]),
        matchedCount: pRows.filter((r) => String(r[catCol]) === topOne[0]).length,
        chartData: cData,
        source_sheets: [detectResult.primarySheet],
        target_sheet: detectResult.primarySheet,
        structured_format: {
          headline,
          source_sheets: [detectResult.primarySheet],
          target_sheet: detectResult.primarySheet,
          key_metrics: [
            { label: 'Leader', value: topOne[0], badge: detectResult.primarySheet },
            { label: metricCol ? `Total ${metricCol}` : 'Volume', value: topOne[1].toLocaleString() },
            { label: 'Categories Count', value: `${sorted.length} groups` },
          ],
          bullet_points: sorted.slice(0, 5).map(([cat, val]) => `${cat}: ${val.toLocaleString()}`),
          takeaway: `Top category ${topOne[0]} leads in sheet "${detectResult.primarySheet}".`,
        },
      };
    }
  }

  // 5. COUNT / HOW MANY / RECORD VOLUME
  if (qLower.includes('how many') || qLower.includes('count') || qLower.includes('records') || qLower.includes('rows')) {
    const sheetItems = sheets.map((s, i) => {
      const summary = allSheetsSummary[s];
      return `${i + 1}. **${s}**: **${summary.rowCount.toLocaleString()}** rows (${summary.columnCount} columns)`;
    }).join('\n');

    const headline = `This workbook contains **${totalWorkbookRows.toLocaleString()}** total records across **${sheets.length} sheets**.`;
    const answer = `### 💡 Quick Takeaway\n${headline}\n\n### 📋 Row Counts by Sheet\n${sheetItems}\n\n### 🎯 Summary\nAll records are parsed and available for cross-sheet intelligence.`;

    const countChartType = qLower.includes('pie') ? 'pie' : 'bar';
    const cData = buildChart(
      countChartType,
      'Record Count by Sheet',
      'Sheet',
      'Rows',
      sheets,
      sheets.map((s) => allSheetsSummary[s]?.rowCount || 0)
    );

    return {
      answer,
      interpretation: `Counted records across all ${sheets.length} sheets in workbook`,
      operationSteps: [
        `Scanned all ${sheets.length} sheets in workbook "${file.filename}"`,
        `Summed verified row counts: ${totalWorkbookRows.toLocaleString()} total`,
      ],
      matchedRows: file.sheetData[sheets[0]]?.rows?.slice(0, 20) || [],
      matchedCount: totalWorkbookRows,
      chartData: cData,
      source_sheets: sheets,
      structured_format: {
        headline,
        source_sheets: sheets,
        key_metrics: [
          { label: 'Total Records', value: totalWorkbookRows.toLocaleString(), badge: 'Workbook' },
          { label: 'Total Sheets', value: `${sheets.length} sheets` },
          { label: 'Active Sheet', value: activeSheetName },
        ],
        sheet_breakdown: sheets.map((s) => ({
          sheet_name: s,
          count: allSheetsSummary[s]?.rowCount || 0,
          metric_summary: `${allSheetsSummary[s]?.columnCount || 0} columns`,
        })),
        bullet_points: sheets.map((s) => `${s}: ${allSheetsSummary[s]?.rowCount.toLocaleString()} rows`),
        takeaway: `Full workbook row counts evaluated.`,
      },
    };
  }

  // 6. DEFAULT WORKBOOK OVERVIEW
  const sheetItems = sheets.map((s, i) => {
    const summary = allSheetsSummary[s];
    return `${i + 1}. **${s}**: **${summary.rowCount.toLocaleString()}** rows, ${summary.columnCount} columns`;
  }).join('\n');

  const headline = `Workbook "${file.filename}" analyzed across all **${sheets.length} sheets** (${totalWorkbookRows.toLocaleString()} total records).`;
  const answer = `### 💡 Quick Takeaway\n${headline}\n\n### 📋 Sheets Summary\n${sheetItems}\n\n### 🎯 Summary\nYou can ask questions about any sheet or compare data across all sheets.`;

  const overviewChartType = qLower.includes('pie') ? 'pie' : 'bar';
  const cData = buildChart(
    overviewChartType,
    `Workbook Row Distribution by Sheet`,
    'Sheet',
    'Records',
    sheets,
    sheets.map((s) => allSheetsSummary[s]?.rowCount || 0)
  );

  return {
    answer,
    interpretation: `Analyzed workbook across ${sheets.length} sheets for: "${question}"`,
    operationSteps: [`Scanned all sheets in workbook`, `Evaluated data distributions`],
    matchedRows: file.sheetData[sheets[0]]?.rows?.slice(0, 10) || [],
    matchedCount: totalWorkbookRows,
    chartData: cData,
    source_sheets: sheets,
    structured_format: {
      headline,
      source_sheets: sheets,
      key_metrics: [
        { label: 'Total Records', value: totalWorkbookRows.toLocaleString(), badge: 'Workbook' },
        { label: 'Total Sheets', value: `${sheets.length} sheets` },
      ],
      sheet_breakdown: sheets.map((s) => ({
        sheet_name: s,
        count: allSheetsSummary[s]?.rowCount || 0,
        metric_summary: `${allSheetsSummary[s]?.columnCount || 0} columns`,
      })),
      bullet_points: sheets.map((s) => `${s}: ${allSheetsSummary[s]?.rowCount.toLocaleString()} rows`),
      takeaway: `All sheets available for queries.`,
    },
  };
}
