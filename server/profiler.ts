import { SheetProfile, ColumnProfile, QualitySummary, InsightReport, InsightItem, DashboardChartSpec } from '../src/api/types';
import { StoredFile } from './dataStore';

/**
 * Robust numeric parser for Excel data:
 * Handles strings with currency symbols ($ € £ ¥), commas (1,250.50),
 * percentages (15.5%), accounting negatives ((500.00)), and scientific notation.
 */
export function parseNumericValue(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }
  if (typeof val === 'boolean') return null;

  let str = String(val).trim();
  if (str === '' || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined') return null;

  // Accounting negative notation: (123.45) -> -123.45
  if (/^\((.*)\)$/.test(str)) {
    str = '-' + str.slice(1, -1).trim();
  }

  // Strip currency symbols, commas, percent, spaces
  const cleaned = str.replace(/[$€£¥,%\s]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;

  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Robust date parser for Excel data:
 * Supports ISO strings, Date objects, slash/dash date strings, and Excel serial numbers.
 */
export function parseDateValue(val: any): Date | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;

  // Excel serial numbers: e.g. 44927 is Jan 2023. Valid range approx 10000 to 70000
  if (typeof val === 'number' && val > 20000 && val < 70000) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }

  const str = String(val).trim();
  if (str.length < 4) return null;

  const parsed = Date.parse(str);
  if (isNaN(parsed)) return null;

  const d = new Date(parsed);
  const year = d.getFullYear();
  if (year < 1970 || year > 2100) return null;
  return d;
}

function formatCompactNumber(num: number): string {
  if (Math.abs(num) >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(num) >= 100_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return Number.isInteger(num) ? num.toLocaleString() : num.toFixed(2);
}

export function profileSheet(sheetName: string, rows: Record<string, any>[], columns: string[]): SheetProfile {
  const rowCount = rows.length;
  const colCount = columns.length;
  const colProfiles: ColumnProfile[] = [];

  let emptyCellsCount = 0;
  const duplicateRowIndices: number[] = [];
  const seenRowSignatures = new Map<string, number>();

  // Check duplicate rows (first 1000 rows sample for speed)
  const maxRowsForDupCheck = Math.min(rowCount, 1000);
  for (let i = 0; i < maxRowsForDupCheck; i++) {
    const sig = JSON.stringify(rows[i]);
    if (seenRowSignatures.has(sig)) {
      duplicateRowIndices.push(i);
    } else {
      seenRowSignatures.set(sig, i);
    }
  }

  // Profile each column
  for (const col of columns) {
    let nullCount = 0;
    const valueSet = new Set<any>();
    const numericValues: number[] = [];
    const sampleValues: any[] = [];
    let validDateCount = 0;
    let validBoolCount = 0;
    let hasCurrencySymbol = false;
    let hasPercentSymbol = false;

    for (let r = 0; r < rowCount; r++) {
      const val = rows[r][col];
      if (val === null || val === undefined || val === '') {
        nullCount++;
        emptyCellsCount++;
        continue;
      }

      if (sampleValues.length < 5) {
        sampleValues.push(val);
      }
      valueSet.add(val);

      // Check numeric
      const parsedNum = parseNumericValue(val);
      if (parsedNum !== null) {
        numericValues.push(parsedNum);
        const strVal = String(val);
        if (/[$€£¥]/.test(strVal)) hasCurrencySymbol = true;
        if (strVal.includes('%')) hasPercentSymbol = true;
      }

      // Check date
      if (parseDateValue(val) !== null) {
        validDateCount++;
      }

      // Check boolean
      const strVal = String(val).toLowerCase();
      if (strVal === 'true' || strVal === 'false' || strVal === 'yes' || strVal === 'no') {
        validBoolCount++;
      }
    }

    const nonNullCount = rowCount - nullCount;
    const nullPct = rowCount > 0 ? (nullCount / rowCount) * 100 : 0;
    const uniqueCount = valueSet.size;

    // Determine data type
    let dtype: ColumnProfile['dtype'] = 'text';
    const colLower = col.toLowerCase();

    // ID-like heuristic
    const isIdHeader =
      colLower === 'id' ||
      colLower.endsWith('_id') ||
      colLower.startsWith('id_') ||
      colLower.includes('code') ||
      colLower.includes('sku') ||
      colLower.includes('uuid') ||
      colLower.includes('ssn') ||
      colLower.includes('zip');

    if (nonNullCount > 0 && numericValues.length >= nonNullCount * 0.9) {
      const allInt = numericValues.every((n) => Number.isInteger(n));
      const isFinancialHeader =
        colLower.includes('price') ||
        colLower.includes('revenue') ||
        colLower.includes('cost') ||
        colLower.includes('salary') ||
        colLower.includes('amount') ||
        colLower.includes('budget') ||
        colLower.includes('profit') ||
        colLower.includes('fee') ||
        colLower.includes('total') ||
        colLower.includes('spend') ||
        colLower.includes('$');

      const isRateHeader =
        colLower.includes('percent') ||
        colLower.includes('rate') ||
        colLower.includes('pct') ||
        colLower.includes('ratio') ||
        colLower.includes('share') ||
        colLower.includes('%');

      if (isIdHeader) {
        dtype = 'id-like';
      } else if (hasCurrencySymbol || isFinancialHeader) {
        dtype = 'currency';
      } else if (hasPercentSymbol || isRateHeader) {
        dtype = 'percent';
      } else if (allInt) {
        dtype = 'integer';
      } else {
        dtype = 'float';
      }
    } else if (nonNullCount > 0 && validDateCount >= nonNullCount * 0.85) {
      dtype = 'date';
    } else if (nonNullCount > 0 && validBoolCount >= nonNullCount * 0.9) {
      dtype = 'boolean';
    } else if (uniqueCount < 25 && uniqueCount > 1 && !isIdHeader) {
      dtype = 'categorical';
    } else {
      dtype = isIdHeader ? 'id-like' : 'text';
    }

    let minVal: number | string | null = null;
    let maxVal: number | string | null = null;
    let meanVal: number | null = null;

    if (numericValues.length > 0) {
      minVal = Math.min(...numericValues);
      maxVal = Math.max(...numericValues);
      const sum = numericValues.reduce((acc, curr) => acc + curr, 0);
      meanVal = Number((sum / numericValues.length).toFixed(2));
    }

    // Top values frequency
    const freqMap = new Map<any, number>();
    for (let r = 0; r < Math.min(rowCount, 500); r++) {
      const v = rows[r][col];
      if (v !== null && v !== undefined && v !== '') {
        freqMap.set(v, (freqMap.get(v) || 0) + 1);
      }
    }
    const topValues = Array.from(freqMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count }));

    colProfiles.push({
      name: col,
      original_name: col,
      dtype,
      null_count: nullCount,
      null_pct: Number(nullPct.toFixed(1)),
      unique_count: uniqueCount,
      min: minVal,
      max: maxVal,
      mean: meanVal,
      top_values: topValues,
      sample_values: sampleValues,
    });
  }

  const warnings: string[] = [];
  for (const cp of colProfiles) {
    if (cp.null_pct > 25) {
      warnings.push(`Column "${cp.name}" has ${cp.null_pct}% missing values.`);
    }
  }

  const quality: QualitySummary = {
    has_empty_cells: emptyCellsCount > 0,
    empty_cells_count: emptyCellsCount,
    duplicate_rows_count: duplicateRowIndices.length,
    duplicate_rows: duplicateRowIndices.slice(0, 10),
    mixed_types: [],
    ambiguous_date_columns: [],
    outlier_columns: {},
  };

  return {
    sheet_name: sheetName,
    row_count: rowCount,
    column_count: colCount,
    header_row: 1,
    columns: colProfiles,
    warnings,
    quality,
  };
}

// Curated Distinct Executive Color Palettes - Distinct chromatic and tonal shade progressions
export const PRIMARY_BAR_COLORS = [
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
];

export const SECONDARY_BAR_COLORS = [
  '#EA580C', // Sunset Coral
  '#059669', // Emerald
  '#2563EB', // Royal Blue
  '#7C3AED', // Vivid Violet
  '#EC4899', // Hot Pink
  '#D97706', // Amber
  '#0891B2', // Cyan Teal
  '#6366F1', // Indigo
  '#F43F5E', // Rose
  '#10B981', // Mint
  '#8B5CF6', // Purple
  '#F59E0B', // Golden Amber
];

export const DONUT_COLORS = [
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
];

export function generateInsights(
  sheetName: string,
  rows: Record<string, any>[],
  profile: SheetProfile,
  allSheets: string[] = []
): InsightReport {
  const rowCount = profile.row_count || rows.length;
  const insights: InsightItem[] = [];
  const dashboardCharts: DashboardChartSpec[] = [];

  // 1. Data Quality Insight
  if (profile.quality.empty_cells_count === 0 && profile.quality.duplicate_rows_count === 0) {
    insights.push({
      id: 'quality_clean',
      category: 'data_quality',
      severity: 'info',
      title: 'Pristine Data Quality (100% Complete)',
      detail: `All ${profile.row_count.toLocaleString()} rows and ${profile.column_count} columns in "${sheetName}" are fully populated with 0 missing cells and no duplicate records detected.`,
      affected_rows: [],
    });
  } else {
    insights.push({
      id: 'quality_review',
      category: 'data_quality',
      severity: 'warning',
      title: `Data Quality Flag (${profile.quality.empty_cells_count} empty cells)`,
      detail: `Detected ${profile.quality.empty_cells_count} empty cells across columns and ${profile.quality.duplicate_rows_count} duplicate rows in sheet "${sheetName}".`,
      affected_rows: profile.quality.duplicate_rows,
      question_to_ask: 'How many missing cells are in each column?',
    });
  }

  // 2. Discover Best Columns for Visualizations
  // Filter numeric columns: exclude id-like columns!
  const numCols = profile.columns.filter(
    (c) =>
      (c.dtype === 'integer' || c.dtype === 'float' || c.dtype === 'currency' || c.dtype === 'percent') &&
      !c.name.toLowerCase().includes('id')
  );

  // Sort numeric columns by analytical priority
  const priorityKeywords = ['revenue', 'sales', 'profit', 'total', 'amount', 'price', 'cost', 'score', 'salary', 'units', 'quantity'];
  numCols.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aPri = priorityKeywords.findIndex((k) => aName.includes(k));
    const bPri = priorityKeywords.findIndex((k) => bName.includes(k));
    if (aPri !== -1 && bPri !== -1) return aPri - bPri;
    if (aPri !== -1) return -1;
    if (bPri !== -1) return 1;
    return 0;
  });

  const catCols = profile.columns.filter(
    (c) =>
      (c.dtype === 'categorical' || c.dtype === 'text') &&
      c.unique_count >= 2 &&
      c.unique_count <= 35 &&
      !c.name.toLowerCase().includes('id')
  );

  const dateCols = profile.columns.filter((c) => c.dtype === 'date' || c.dtype === 'datetime');

  const primaryMetric = numCols.length > 0 ? numCols[0] : null;
  const secondaryMetric = numCols.length > 1 ? numCols[1] : null;
  const isCurrency = Boolean(
    primaryMetric?.dtype === 'currency' ||
    (primaryMetric && ['revenue', 'sales', 'profit', 'amount', 'price', 'cost', 'salary', 'fee', 'expense', 'budget'].some((k) => primaryMetric.name.toLowerCase().includes(k)))
  );

  // ==========================================================
  // CHART 1: Categorical Bar Chart (Sum or Record Count by Group)
  // ==========================================================
  if (catCols.length > 0) {
    const catCol = catCols[0];
    const groupMap = new Map<string, { sum: number; count: number }>();
    let grandSum = 0;
    let grandCount = 0;

    for (const r of rows) {
      let rawKey = r[catCol.name];
      if (rawKey === null || rawKey === undefined || String(rawKey).trim() === '') {
        rawKey = '(Unspecified)';
      }
      const catKey = String(rawKey).trim();

      const existing = groupMap.get(catKey) || { sum: 0, count: 0 };
      if (primaryMetric) {
        const val = parseNumericValue(r[primaryMetric.name]);
        if (val !== null) {
          existing.sum += val;
          grandSum += val;
        }
      }
      existing.count += 1;
      grandCount += 1;
      groupMap.set(catKey, existing);
    }

    // Sort descending by record count by default for accurate record volume
    const sortedGroups = Array.from(groupMap.entries()).sort((a, b) => b[1].count - a[1].count);

    // Top 7 + aggregate remainder into Other
    const top7 = sortedGroups.slice(0, 7);
    const remainder = sortedGroups.slice(7);

    const xVals: string[] = top7.map((g) => g[0]);
    const yVals: number[] = top7.map((g) => g[1].count);
    const shares: number[] = top7.map((g) =>
      Number(((g[1].count / (grandCount || 1)) * 100).toFixed(1))
    );
    const metricSums: number[] = top7.map((g) => Number(g[1].sum.toFixed(2)));

    if (remainder.length > 0) {
      const remCount = remainder.reduce((acc, curr) => acc + curr[1].count, 0);
      const remSum = remainder.reduce((acc, curr) => acc + curr[1].sum, 0);
      const remShare = Number(((remCount / (grandCount || 1)) * 100).toFixed(1));
      xVals.push(`Other (${remainder.length})`);
      yVals.push(remCount);
      shares.push(remShare);
      metricSums.push(Number(remSum.toFixed(2)));
    }

    const topGroup = top7[0];
    const topVal = topGroup ? topGroup[1].count : 0;
    const topPct = Number(((topVal / (grandCount || 1)) * 100).toFixed(1));

    dashboardCharts.push({
      id: 'chart_categories',
      title: `Record Volume by ${catCol.name} (${rowCount.toLocaleString()} Total Records)`,
      chart_type: 'bar',
      x: catCol.name,
      y: 'Record Count',
      isCurrency: false,
      stats: {
        total: grandCount,
        mean: Number((grandCount / (sortedGroups.length || 1)).toFixed(1)),
        topSegment: topGroup ? topGroup[0] : 'N/A',
        topSegmentVal: topVal,
        topSegmentPct: topPct,
        count: sortedGroups.length,
      },
      metricsData: {
        categories: sortedGroups.slice(0, 10).map((g) => g[0]),
        counts: sortedGroups.slice(0, 10).map((g) => g[1].count),
        sums: sortedGroups.slice(0, 10).map((g) => Number(g[1].sum.toFixed(2))),
        means: sortedGroups.slice(0, 10).map((g) => Number((g[1].count > 0 ? g[1].sum / g[1].count : 0).toFixed(2))),
      },
      plotly: {
        data: [
          {
            x: xVals,
            y: yVals,
            type: 'bar',
            customdata: shares,
            text: yVals.map((v) => `${v.toLocaleString()} records`),
            textposition: 'outside',
            cliponaxis: false,
            marker: {
              color: xVals.map((_, i) => PRIMARY_BAR_COLORS[i % PRIMARY_BAR_COLORS.length]),
              opacity: 0.94,
              line: {
                color: '#ffffff',
                width: 1.5,
              },
              cornerradius: 8,
            },
            hovertemplate: `<b>%{x}</b><br>Volume: <b>%{y:,.0f} records</b><br>Share of Sheet: <b>%{customdata:.1f}%</b><extra></extra>`,
          },
        ],
        layout: {
          title: {
            text: `Record Volume by ${catCol.name} (${rowCount.toLocaleString()} Total Records)`,
            font: { size: 15, weight: 'bold' },
          },
          autosize: true,
          margin: { t: 40, r: 25, l: 60, b: 70 },
          xaxis: {
            title: { text: catCol.name, font: { size: 12, weight: 'bold' } },
            tickangle: -25,
            automargin: true,
          },
          yaxis: {
            title: { text: 'Record Count', font: { size: 12, weight: 'bold' } },
            zeroline: false,
          },
        },
      },
    });

    insights.push({
      id: 'insight_top_cat',
      category: 'trends',
      severity: 'info',
      title: `Top Segment in ${catCol.name}: ${topGroup ? topGroup[0] : 'N/A'}`,
      detail: `"${topGroup ? topGroup[0] : 'N/A'}" represents the highest volume with ${topVal.toLocaleString()} records (${topPct}% of sheet total across ${sortedGroups.length} categories).`,
      affected_rows: [],
      question_to_ask: `Compare all ${catCol.name} segments by record count`,
    });
  }

  // ==========================================================
  // CHART 2: Chronological Trend Line Chart (if Date column exists)
  // or Ranked Horizontal Bar Chart
  // ==========================================================
  if (dateCols.length > 0 && primaryMetric) {
    const dateCol = dateCols[0];
    const timeMap = new Map<string, { sum: number; count: number; dateObj: Date }>();

    for (const r of rows) {
      const d = parseDateValue(r[dateCol.name]);
      if (!d) continue;

      // Group key: YYYY-MM
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const timeKey = `${yr}-${mo}`;

      const existing = timeMap.get(timeKey) || { sum: 0, count: 0, dateObj: d };
      const val = parseNumericValue(r[primaryMetric.name]);
      if (val !== null) {
        existing.sum += val;
      }
      existing.count += 1;
      timeMap.set(timeKey, existing);
    }

    const sortedTime = Array.from(timeMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    if (sortedTime.length >= 2) {
      const timeX = sortedTime.map((t) => t[0]);
      const timeY = sortedTime.map((t) => Number(t[1].sum.toFixed(2)));

      dashboardCharts.push({
        id: 'chart_timeline',
        title: `${primaryMetric.name} Trend over Time (${dateCol.name})`,
        chart_type: 'line',
        x: dateCol.name,
        y: primaryMetric.name,
        isCurrency: Boolean(isCurrency),
        stats: {
          total: timeY.reduce((a, b) => a + b, 0),
          min: Math.min(...timeY),
          max: Math.max(...timeY),
          count: sortedTime.length,
        },
        plotly: {
          data: [
            {
              x: timeX,
              y: timeY,
              type: 'scatter',
              mode: 'lines+markers',
              fill: 'tozeroy',
              fillcolor: 'rgba(2, 132, 199, 0.15)',
              line: {
                color: '#0284C7',
                width: 3.5,
                shape: 'spline',
              },
              marker: {
                size: 8,
                color: '#0369A1',
                line: { color: '#FFFFFF', width: 2 },
              },
              hovertemplate: isCurrency
                ? `Period: <b>%{x}</b><br>${primaryMetric.name}: <b>$%{y:,.2f}</b><extra></extra>`
                : `Period: <b>%{x}</b><br>${primaryMetric.name}: <b>%{y:,.2f}</b><extra></extra>`,
            },
          ],
          layout: {
            title: { text: `${primaryMetric.name} Timeline`, font: { size: 15, weight: 'bold' } },
            autosize: true,
            margin: { t: 40, r: 25, l: 60, b: 55 },
            xaxis: {
              title: { text: dateCol.name, font: { size: 12, weight: 'bold' } },
              tickangle: -20,
            },
            yaxis: {
              title: { text: primaryMetric.name, font: { size: 12, weight: 'bold' } },
              zeroline: false,
            },
          },
        },
      });

      const peakPeriod = sortedTime.reduce((max, curr) => (curr[1].sum > max[1].sum ? curr : max), sortedTime[0]);
      insights.push({
        id: 'insight_timeline',
        category: 'trends',
        severity: 'info',
        title: `Peak Performance Period: ${peakPeriod[0]}`,
        detail: `Historical trend shows peak ${primaryMetric.name} of ${isCurrency ? '$' : ''}${peakPeriod[1].sum.toLocaleString()} in ${peakPeriod[0]} across ${sortedTime.length} recorded monthly timeframes.`,
        affected_rows: [],
        question_to_ask: `What happened in ${peakPeriod[0]} to drive peak ${primaryMetric.name}?`,
      });
    }
  }

  // If no date column or secondary metric available, provide Secondary Category or Ranked Top Performers
  if (dashboardCharts.length < 2 && catCols.length > 1) {
    const secCat = catCols[1];
    const secMap = new Map<string, number>();
    for (const r of rows) {
      const k = String(r[secCat.name] ?? '(Unspecified)').trim();
      secMap.set(k, (secMap.get(k) || 0) + 1);
    }

    const sortedSec = Array.from(secMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    dashboardCharts.push({
      id: 'chart_ranked_secondary',
      title: `Record Volume by ${secCat.name} (${rowCount.toLocaleString()} Total Records)`,
      chart_type: 'bar',
      x: secCat.name,
      y: 'Record Count',
      isCurrency: false,
      plotly: {
        data: [
          {
            x: sortedSec.map((s) => s[0]),
            y: sortedSec.map((s) => s[1]),
            type: 'bar',
            marker: {
              color: sortedSec.map((_, i) => SECONDARY_BAR_COLORS[i % SECONDARY_BAR_COLORS.length]),
              opacity: 0.94,
              line: { color: '#ffffff', width: 1.5 },
              cornerradius: 8,
            },
            text: sortedSec.map((s) => `${s[1].toLocaleString()} records`),
            textposition: 'outside',
            hovertemplate: `<b>%{x}</b><br>Volume: <b>%{y:,.0f} records</b><extra></extra>`,
          },
        ],
        layout: {
          title: { text: `Record Breakdown by ${secCat.name} (${rowCount.toLocaleString()} Total Records)`, font: { size: 15, weight: 'bold' } },
          autosize: true,
          margin: { t: 40, r: 25, l: 60, b: 65 },
          xaxis: { title: secCat.name, tickangle: -25 },
          yaxis: { title: 'Record Count' },
        },
      },
    });
  }

  // ==========================================================
  // CHART 3: Statistical Frequency Distribution / Variance Histogram
  // ==========================================================
  const metricForHist = secondaryMetric || primaryMetric;
  if (metricForHist) {
    const isHistCurrency = metricForHist.dtype === 'currency' || ['revenue', 'sales', 'profit', 'amount', 'price', 'cost', 'salary', 'fee', 'expense', 'budget'].some((k) => metricForHist.name.toLowerCase().includes(k));
    const cleanVals = rows
      .map((r) => parseNumericValue(r[metricForHist.name]))
      .filter((n): n is number => n !== null);

    if (cleanVals.length > 0) {
      const sum = cleanVals.reduce((acc, curr) => acc + curr, 0);
      const mean = Number((sum / cleanVals.length).toFixed(2));
      const sortedVals = [...cleanVals].sort((a, b) => a - b);
      const median = Number(sortedVals[Math.floor(sortedVals.length / 2)].toFixed(2));
      const minVal = sortedVals[0];
      const maxVal = sortedVals[sortedVals.length - 1];

      dashboardCharts.push({
        id: 'chart_distribution',
        title: `Value Distribution of ${metricForHist.name}`,
        chart_type: 'histogram',
        x: metricForHist.name,
        isCurrency: Boolean(isHistCurrency),
        stats: {
          total: sum,
          mean,
          median,
          min: minVal,
          max: maxVal,
          count: cleanVals.length,
        },
        rawValues: cleanVals.slice(0, 1000),
        plotly: {
          data: [
            {
              x: cleanVals.slice(0, 3000),
              type: 'histogram',
              marker: {
                color: '#10B981',
                opacity: 0.85,
                line: {
                  color: '#047857',
                  width: 1.5,
                },
                cornerradius: 6,
              },
              hovertemplate: `Range: <b>%{x}</b><br>Frequency: <b>%{y} entries</b><extra></extra>`,
            },
          ],
          layout: {
            title: {
              text: `Distribution of ${metricForHist.name} (Mean: ${isHistCurrency ? '$' : ''}${mean.toLocaleString()})`,
              font: { size: 15, weight: 'bold' },
            },
            autosize: true,
            margin: { t: 40, r: 25, l: 55, b: 50 },
            xaxis: {
              title: { text: metricForHist.name, font: { size: 12, weight: 'bold' } },
            },
            yaxis: {
              title: { text: 'Record Frequency', font: { size: 12, weight: 'bold' } },
            },
            shapes: [
              {
                type: 'line',
                x0: mean,
                x1: mean,
                y0: 0,
                y1: 1,
                yref: 'paper',
                line: {
                  color: '#6366F1',
                  width: 2.5,
                  dash: 'dash',
                },
              },
            ],
            annotations: [
              {
                x: mean,
                y: 0.95,
                yref: 'paper',
                text: `Mean: ${isHistCurrency ? '$' : ''}${mean.toLocaleString()}`,
                showarrow: false,
                font: { color: '#6366F1', size: 11, weight: 'bold' },
                bgcolor: 'rgba(255,255,255,0.92)',
                bordercolor: '#6366F1',
                borderwidth: 1,
                borderpad: 3,
              },
            ],
          },
        },
      });

      insights.push({
        id: 'insight_num_stats',
        category: 'trends',
        severity: 'info',
        title: `Average ${metricForHist.name}: ${isHistCurrency ? '$' : ''}${mean.toLocaleString()}`,
        detail: `Across ${cleanVals.length.toLocaleString()} valid rows, ${metricForHist.name} ranges from ${isHistCurrency ? '$' : ''}${minVal.toLocaleString()} to ${isHistCurrency ? '$' : ''}${maxVal.toLocaleString()} with a median value of ${isHistCurrency ? '$' : ''}${median.toLocaleString()}.`,
        affected_rows: [],
        question_to_ask: `What records have the highest and lowest ${metricForHist.name}?`,
      });
    }
  }

  // ==========================================================
  // CHART 4: Executive Composition Donut Chart
  // ==========================================================
  const pieCat = catCols.length > 1 ? catCols[1] : (catCols.length === 1 ? catCols[0] : null);
  if (pieCat) {
    const pMap = new Map<string, number>();
    for (const r of rows) {
      let k = r[pieCat.name];
      if (k === null || k === undefined || String(k).trim() === '') {
        k = 'Other';
      }
      const catKey = String(k).trim();
      pMap.set(catKey, (pMap.get(catKey) || 0) + 1);
    }

    const sortedPie = Array.from(pMap.entries()).sort((a, b) => b[1] - a[1]);
    const topPie = sortedPie.slice(0, 5);
    const remPie = sortedPie.slice(5);

    const pieLabels = topPie.map((p) => p[0]);
    const pieValues = topPie.map((p) => p[1]);

    if (remPie.length > 0) {
      const remSum = remPie.reduce((acc, curr) => acc + curr[1], 0);
      pieLabels.push(`Other (${remPie.length})`);
      pieValues.push(remSum);
    }

    dashboardCharts.push({
      id: 'chart_pie',
      title: `Composition by ${pieCat.name} (${rowCount.toLocaleString()} Total Records)`,
      chart_type: 'pie',
      x: pieCat.name,
      y: 'Record Count',
      isCurrency: false,
      plotly: {
        data: [
          {
            labels: pieLabels,
            values: pieValues,
            type: 'pie',
            hole: 0.45,
            pull: [0.04, 0, 0, 0, 0, 0],
            textinfo: 'percent+label',
            textposition: 'inside',
            marker: {
              colors: DONUT_COLORS,
              line: { color: '#FFFFFF', width: 2 },
            },
            hovertemplate: `<b>%{label}</b><br>Volume: <b>%{value:,.0f} records</b><br>Share: <b>%{percent}</b><extra></extra>`,
          },
        ],
        layout: {
          title: {
            text: `Composition by ${pieCat.name} (${rowCount.toLocaleString()} Total Records)`,
            font: { size: 14, weight: 'bold' },
          },
          autosize: true,
          margin: { t: 35, r: 20, l: 20, b: 35 },
          showlegend: true,
          legend: { orientation: 'h', y: -0.1 },
        },
      },
    });
  }

  // Curated Natural-Language Questions
  const suggestedQuestions: string[] = [
    `How many total records are in "${sheetName}"?`,
    catCols[0]
      ? `Summarize ${primaryMetric ? primaryMetric.name : 'records'} grouped by ${catCols[0].name}`
      : 'Summarize the dataset',
    primaryMetric
      ? `Show the top 5 records by highest ${primaryMetric.name}`
      : 'Show the first 5 records',
    primaryMetric
      ? `Calculate the total sum and average of ${primaryMetric.name}`
      : 'Analyze distributions',
    allSheets.length > 1
      ? `Compare total metrics across all ${allSheets.length} sheets`
      : 'Instruct AI to update a record or add a calculated column',
  ];

  return {
    sheet_name: sheetName,
    row_count: profile.row_count,
    column_count: profile.column_count,
    header_row: 1,
    summary_text: `Sheet "${sheetName}" contains ${profile.row_count.toLocaleString()} rows and ${profile.column_count} dimensions. Verified analytics generated ${dashboardCharts.length} interactive charts across categorical segments and distributions.`,
    insights,
    suggested_questions: suggestedQuestions,
    dashboard_charts: dashboardCharts,
    available_sheets: allSheets.length > 0 ? allSheets : [sheetName],
    is_workbook_overview: false,
  };
}

/**
 * Generates unified multi-sheet workbook insights and cross-sheet comparisons:
 * Evaluates record distributions, cross-sheet totals, and workbook data health.
 */
export function generateWorkbookInsights(file: StoredFile): InsightReport {
  const sheets = file.sheets || Object.keys(file.sheetData);
  const totalSheets = sheets.length;
  const sheetStats: Array<{ name: string; rowCount: number; colCount: number; metricSum: number }> = [];

  let grandTotalRows = 0;
  let commonMetricCol: string | null = null;

  // Find a common numeric column across sheets
  const candidateMetrics = ['revenue', 'sales', 'profit', 'total', 'amount', 'price', 'cost', 'score', 'salary', 'units'];
  for (const cand of candidateMetrics) {
    let appearsInAll = true;
    for (const s of sheets) {
      const cols = file.sheetData[s]?.columns || [];
      if (!cols.some((c) => c.toLowerCase().includes(cand))) {
        appearsInAll = false;
        break;
      }
    }
    if (appearsInAll) {
      commonMetricCol = cand;
      break;
    }
  }

  // Profile each sheet
  let totalWorkbookEmptyCells = 0;
  for (const s of sheets) {
    const sRows = file.sheetData[s]?.rows || [];
    const sCols = file.sheetData[s]?.columns || [];
    grandTotalRows += sRows.length;

    let sMetricSum = 0;
    const metricColFound = commonMetricCol
      ? sCols.find((c) => c.toLowerCase().includes(commonMetricCol!))
      : null;

    for (const r of sRows) {
      for (const c of sCols) {
        if (r[c] === null || r[c] === undefined || r[c] === '') {
          totalWorkbookEmptyCells++;
        }
      }
      if (metricColFound) {
        const num = parseNumericValue(r[metricColFound]);
        if (num !== null) sMetricSum += num;
      }
    }

    sheetStats.push({
      name: s,
      rowCount: sRows.length,
      colCount: sCols.length,
      metricSum: sMetricSum,
    });
  }

  const dashboardCharts: DashboardChartSpec[] = [];

  // Chart 1: Record Counts across all sheets
  dashboardCharts.push({
    id: 'wb_chart_row_counts',
    title: 'Record Distribution Across All Sheets',
    chart_type: 'bar',
    x: 'Sheet Name',
    y: 'Record Count',
    plotly: {
      data: [
        {
          x: sheetStats.map((s) => s.name),
          y: sheetStats.map((s) => s.rowCount),
          type: 'bar',
          text: sheetStats.map((s) => s.rowCount.toLocaleString()),
          textposition: 'outside',
          marker: {
            color: sheetStats.map((_, i) => PRIMARY_BAR_COLORS[i % PRIMARY_BAR_COLORS.length]),
            opacity: 0.94,
            line: { color: '#ffffff', width: 1.5 },
            cornerradius: 8,
          },
          hovertemplate: 'Sheet: <b>%{x}</b><br>Rows: <b>%{y:,.0f}</b><extra></extra>',
        },
      ],
      layout: {
        title: { text: 'Workbook Sheets by Record Count', font: { size: 14, weight: 'bold' } },
        autosize: true,
        margin: { t: 35, r: 20, l: 55, b: 65 },
        xaxis: { title: 'Sheet Name', tickangle: -20 },
        yaxis: { title: 'Record Count' },
      },
    },
  });

  // Chart 2: Common Metric across sheets (if exists) or Donut Share of records
  if (commonMetricCol && sheetStats.some((s) => s.metricSum > 0)) {
    const isWbMetricCurrency = ['revenue', 'sales', 'profit', 'amount', 'price', 'cost', 'salary', 'fee', 'expense', 'budget'].some((k) => commonMetricCol!.toLowerCase().includes(k));
    dashboardCharts.push({
      id: 'wb_chart_common_metric',
      title: `Cross-Sheet Total ${commonMetricCol.toUpperCase()} by Sheet`,
      chart_type: 'bar',
      x: 'Sheet Name',
      y: commonMetricCol,
      isCurrency: isWbMetricCurrency,
      plotly: {
        data: [
          {
            x: sheetStats.map((s) => s.name),
            y: sheetStats.map((s) => Number(s.metricSum.toFixed(2))),
            type: 'bar',
            text: sheetStats.map((s) => (isWbMetricCurrency ? `$${formatCompactNumber(s.metricSum)}` : formatCompactNumber(s.metricSum))),
            textposition: 'outside',
            marker: {
              color: sheetStats.map((_, i) => SECONDARY_BAR_COLORS[i % SECONDARY_BAR_COLORS.length]),
              opacity: 0.94,
              line: { color: '#ffffff', width: 1.5 },
              cornerradius: 8,
            },
            hovertemplate: isWbMetricCurrency
              ? `Sheet: <b>%{x}</b><br>${commonMetricCol}: <b>$%{y:,.2f}</b><extra></extra>`
              : `Sheet: <b>%{x}</b><br>${commonMetricCol}: <b>%{y:,.2f}</b><extra></extra>`,
          },
        ],
        layout: {
          title: { text: `Total ${commonMetricCol.toUpperCase()} Comparison`, font: { size: 14, weight: 'bold' } },
          autosize: true,
          margin: { t: 35, r: 20, l: 55, b: 65 },
          xaxis: { title: 'Sheet Name', tickangle: -20 },
          yaxis: { title: `Total ${commonMetricCol}` },
        },
      },
    });
  }

  // Chart 3: Donut chart of volume share across sheets
  dashboardCharts.push({
    id: 'wb_chart_donut_share',
    title: 'Workbook Volume Share by Sheet',
    chart_type: 'pie',
    x: 'Sheet Name',
    y: 'Rows',
    plotly: {
      data: [
        {
          labels: sheetStats.map((s) => s.name),
          values: sheetStats.map((s) => s.rowCount),
          type: 'pie',
          hole: 0.45,
          textinfo: 'percent+label',
          marker: {
            colors: ['#4F46E5', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'],
            line: { color: '#FFFFFF', width: 2 },
          },
          hovertemplate: 'Sheet: <b>%{label}</b><br>Rows: <b>%{value:,.0f}</b><br>Share: <b>%{percent}</b><extra></extra>',
        },
      ],
      layout: {
        title: { text: 'Sheet Volume Share', font: { size: 14, weight: 'bold' } },
        autosize: true,
        margin: { t: 35, r: 20, l: 20, b: 35 },
      },
    },
  });

  const insights: InsightItem[] = [
    {
      id: 'wb_overview',
      category: 'trends',
      severity: 'info',
      title: `Workbook Structure: ${totalSheets} Sheets (${grandTotalRows.toLocaleString()} Records)`,
      detail: `Contains ${sheets.join(', ')}. Largest sheet is "${sheetStats.sort((a, b) => b.rowCount - a.rowCount)[0]?.name}" with ${sheetStats[0]?.rowCount.toLocaleString()} records.`,
      affected_rows: [],
      question_to_ask: 'How many total records across all sheets?',
    },
    {
      id: 'wb_quality',
      category: 'data_quality',
      severity: totalWorkbookEmptyCells > 0 ? 'warning' : 'info',
      title: totalWorkbookEmptyCells > 0 ? `Workbook Empty Cells: ${totalWorkbookEmptyCells}` : 'All Sheets 100% Populated',
      detail: totalWorkbookEmptyCells > 0
        ? `Found ${totalWorkbookEmptyCells} total blank cells across the ${totalSheets} sheets.`
        : `Zero blank cells found across the entire workbook.`,
      affected_rows: [],
      question_to_ask: 'Which sheet has the most missing data?',
    },
  ];

  return {
    sheet_name: `Workbook Overview (${totalSheets} Sheets)`,
    row_count: grandTotalRows,
    column_count: sheetStats.reduce((acc, s) => acc + s.colCount, 0),
    header_row: 1,
    summary_text: `Comprehensive workbook intelligence spanning ${totalSheets} sheets (${sheets.join(', ')}) with ${grandTotalRows.toLocaleString()} aggregate records.`,
    insights,
    suggested_questions: [
      'Compare total records across all sheets',
      'What is the grand total sales across all sheets?',
      'Which sheet has the highest volume of data?',
      'List all sheets with their columns and row counts',
    ],
    dashboard_charts: dashboardCharts,
    available_sheets: sheets,
    is_workbook_overview: true,
  };
}

