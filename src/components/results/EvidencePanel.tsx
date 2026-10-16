import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, Download, Table, BarChart2, Eye } from 'lucide-react';
import { Evidence, QueryResultData, ChartData } from '../../api/types';
import { ResultsTable } from './ResultsTable';
import { ResultChart } from '../charts/ResultChart';
import { getResultExportUrl } from '../../api/files';

interface EvidencePanelProps {
  fileId: string;
  resultId: string;
  interpretation: string;
  evidence: Evidence;
  result: QueryResultData;
  chart?: ChartData | null;
  question?: string;
  onUpdateChartType?: (type: string) => void;
  theme?: 'light' | 'dark';
  sourceSheets?: string[];
  activeSheet?: string;
  onSelectSheet?: (sheet: string) => void;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  fileId,
  resultId,
  question,
  interpretation,
  evidence,
  result,
  chart,
  onUpdateChartType,
  theme = 'light',
  sourceSheets,
  activeSheet,
  onSelectSheet,
}) => {
  // Synthesize effectiveChart: use backend chart or build one from result rows & columns
  const effectiveChart: ChartData | null = React.useMemo(() => {
    const VIBRANT_PALETTE = [
      '#2563EB', '#059669', '#7C3AED', '#D97706', '#EC4899', '#0891B2',
      '#EA580C', '#6366F1', '#10B981', '#F43F5E', '#8B5CF6', '#06B6D4',
      '#F59E0B', '#3B82F6'
    ];

    const isPieRequested =
      (question || '').toLowerCase().includes('pie') ||
      (question || '').toLowerCase().includes('donut') ||
      (question || '').toLowerCase().includes('circle') ||
      (evidence?.plan_plain_english || '').toLowerCase().includes('pie') ||
      (interpretation || '').toLowerCase().includes('pie') ||
      (chart?.type === 'pie') ||
      (chart?.title || '').toLowerCase().includes('pie') ||
      (chart?.plotly?.data?.[0]?.type === 'pie');

    if (chart && chart.plotly?.data && chart.plotly.data.length > 0) {
      if (chart.type === 'pie' || isPieRequested) {
        const trace = chart.plotly.data[0] || {};
        const labels = trace.labels || trace.x || [];
        const values = trace.values || trace.y || [];
        const sliceColors = (trace.marker?.colors && Array.isArray(trace.marker.colors) && trace.marker.colors.length > 0)
          ? trace.marker.colors
          : VIBRANT_PALETTE;

        return {
          ...chart,
          type: 'pie',
          plotly: {
            data: [{
              type: 'pie',
              labels,
              values,
              hole: 0.45,
              textinfo: 'percent+label',
              hoverinfo: 'label+value+percent',
              marker: {
                colors: sliceColors,
                line: { color: '#ffffff', width: 2 },
              },
            }],
            layout: {
              title: { text: chart.title || 'Category Distribution' },
              autosize: true,
              margin: { t: 40, r: 20, l: 20, b: 30 },
              showlegend: true,
            },
          },
        };
      }

      // Ensure bar charts also have vibrant colors per bar if only a single color was set
      const trace = chart.plotly.data[0] || {};
      const labels = trace.x || trace.labels || [];
      const hasMultiColors = Array.isArray(trace.marker?.color) && trace.marker.color.length > 1;

      if (!hasMultiColors && labels.length > 0) {
        return {
          ...chart,
          plotly: {
            ...chart.plotly,
            data: [{
              ...trace,
              marker: {
                ...trace.marker,
                color: labels.map((_: any, i: number) => VIBRANT_PALETTE[i % VIBRANT_PALETTE.length]),
                cornerradius: 8,
                line: { color: '#ffffff', width: 1.5 },
              },
            }],
          },
        };
      }

      return chart;
    }

    if (!result.rows || result.rows.length === 0) return null;

    const cols = result.columns && result.columns.length > 0
      ? result.columns
      : Object.keys(result.rows[0] || {});

    const isExplicitMetricSum =
      (interpretation || '').toLowerCase().includes('sum') ||
      (interpretation || '').toLowerCase().includes('total');

    // Find numeric column only if explicit sum requested
    const numCol = isExplicitMetricSum ? cols.find((c) => {
      const val = Number(result.rows[0]?.[c]);
      return !isNaN(val) && typeof result.rows[0]?.[c] !== 'boolean';
    }) : undefined;
    
    const catCol = cols.find((c) => c !== numCol && c !== '__row__') || cols[0];

    // Aggregate items accurately
    const groupMap = new Map<string, number>();
    for (const r of result.rows) {
      const k = String(r[catCol] ?? 'Item').trim() || 'Other';
      const v = (isExplicitMetricSum && numCol) ? (Number(r[numCol]) || 0) : 1;
      groupMap.set(k, (groupMap.get(k) || 0) + v);
    }

    const sortedEntries = Array.from(groupMap.entries()).sort((a, b) => b[1] - a[1]);
    const topEntries = sortedEntries.slice(0, 7);
    const remEntries = sortedEntries.slice(7);

    const labels = topEntries.map((e) => e[0]);
    const values = topEntries.map((e) => (isExplicitMetricSum && numCol) ? Number(e[1].toFixed(2)) : e[1]);

    if (remEntries.length > 0) {
      const remSum = remEntries.reduce((acc, curr) => acc + curr[1], 0);
      labels.push(`Other (${remEntries.length})`);
      values.push((isExplicitMetricSum && numCol) ? Number(remSum.toFixed(2)) : remSum);
    }

    const targetType = isPieRequested ? 'pie' : 'bar';
    const title = (isExplicitMetricSum && numCol)
      ? `${numCol} by ${catCol}`
      : `${catCol} Distribution (${result.rows.length.toLocaleString()} Total Records)`;

    return {
      type: targetType,
      x: catCol,
      y: (isExplicitMetricSum && numCol) ? numCol : 'Record Count',
      title,
      plotly: {
        data: [{
          type: targetType,
          labels: targetType === 'pie' ? labels : undefined,
          values: targetType === 'pie' ? values : undefined,
          x: targetType === 'pie' ? undefined : labels,
          y: targetType === 'pie' ? undefined : values,
          hole: targetType === 'pie' ? 0.45 : undefined,
          textinfo: targetType === 'pie' ? 'percent+label' : undefined,
          hoverinfo: targetType === 'pie' ? 'label+value+percent' : undefined,
          marker: {
            color: targetType === 'pie' ? undefined : labels.map((_, i) => VIBRANT_PALETTE[i % VIBRANT_PALETTE.length]),
            colors: targetType === 'pie' ? VIBRANT_PALETTE : undefined,
            cornerradius: targetType === 'bar' ? 8 : undefined,
            line: { color: '#ffffff', width: 2 },
          },
        }],
        layout: {
          title: { text: title },
          autosize: true,
          margin: targetType === 'pie' ? { t: 40, r: 20, l: 20, b: 30 } : { t: 40, r: 20, l: 55, b: 65 },
          showlegend: true,
          xaxis: targetType === 'pie' ? undefined : { title: catCol, tickangle: -20 },
          yaxis: targetType === 'pie' ? undefined : { title: (isExplicitMetricSum && numCol) ? numCol : 'Record Count' },
        },
      },
    };
  }, [chart, result, interpretation, question]);

  const [activeTab, setActiveTab] = useState<'result' | 'source' | 'chart'>('chart');

  // Auto-switch to chart when a new result arrives
  useEffect(() => {
    setActiveTab('chart');
  }, [resultId]);

  const sourceColumns =
    evidence.source_rows && evidence.source_rows.length > 0
      ? Object.keys(evidence.source_rows[0])
      : [];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
      {/* Evidence Panel Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/70">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Verified Evidence & Source Trace
          </div>
          {resultId !== 'none' && (
            <div className="flex items-center gap-1.5">
              <a
                href={getResultExportUrl(fileId, resultId, 'csv')}
                download
                className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 shadow-2xs"
                title="Export as CSV"
              >
                <Download className="w-3 h-3 text-slate-500" />
                CSV
              </a>
              <a
                href={getResultExportUrl(fileId, resultId, 'xlsx')}
                download
                className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 shadow-2xs"
                title="Export as XLSX"
              >
                <Download className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                XLSX
              </a>
            </div>
          )}
        </div>

        {/* Multi-Sheet Trace Bar */}
        {sourceSheets && sourceSheets.length > 0 && (
          <div className="mb-2 p-2 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">
              {sourceSheets.length > 1
                ? `Cross-Sheet Analysis (${sourceSheets.length} sheets):`
                : 'Target Sheet:'}
            </span>
            <div className="flex flex-wrap gap-1">
              {sourceSheets.map((s) => (
                <button
                  key={s}
                  onClick={() => onSelectSheet?.(s)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    s === activeSheet
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-indigo-200 dark:border-indigo-800 hover:border-indigo-400'
                  }`}
                  title={`View sheet "${s}"`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Deterministic Plan Summary */}
        <div className="text-xs text-slate-700 dark:text-slate-300 font-medium bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 rounded-lg p-2.5 mb-2.5">
          <span className="font-bold text-blue-900 dark:text-blue-300 block mb-0.5">Execution Plan:</span>
          {evidence.plan_plain_english || interpretation}
        </div>

        {/* Operation Steps Badges */}
        <div className="space-y-1">
          {evidence.operation_steps.map((step, idx) => (
            <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>{step}</span>
            </div>
          ))}
        </div>

        {/* Missing Values Note */}
        {evidence.skipped_missing && Object.keys(evidence.skipped_missing).length > 0 && (
          <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded p-1.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
            <span>
              Excluded missing values:{' '}
              {Object.entries(evidence.skipped_missing)
                .map(([col, count]) => `${count} in ${col}`)
                .join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* View Switcher Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 pt-2 gap-1 text-xs font-medium">
        <button
          onClick={() => setActiveTab('chart')}
          className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'chart'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Interactive Chart</span>
          {effectiveChart && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('result')}
          className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'result'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Table className="w-3.5 h-3.5" />
          <span>Query Result ({result.total_matches})</span>
        </button>

        <button
          onClick={() => setActiveTab('source')}
          className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'source'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Source Rows ({evidence.matched_row_count})</span>
        </button>
      </div>

      {/* Tab Content Canvas */}
      <div className="flex-1 overflow-hidden p-3 bg-slate-50/30 dark:bg-slate-950/40">
        {activeTab === 'chart' && (
          effectiveChart ? (
            <ResultChart
              chartData={effectiveChart}
              onUpdateChartType={onUpdateChartType}
              theme={theme}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
              <BarChart2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-2 stroke-[1.5]" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Generating graph...</p>
              <p className="text-xs text-slate-400 mt-1">Ask a question with columns or categories to see visualizations here.</p>
            </div>
          )
        )}

        {activeTab === 'result' && (
          <div className="flex flex-col h-full space-y-2">
            {effectiveChart && (
              <div className="p-2 px-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-center justify-between text-xs">
                <span className="text-blue-700 dark:text-blue-300 font-medium flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  Interactive graph ready for this data
                </span>
                <button
                  onClick={() => setActiveTab('chart')}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors cursor-pointer"
                >
                  View Chart →
                </button>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <ResultsTable
                columns={result.columns}
                rows={result.rows}
                totalMatches={result.total_matches}
              />
            </div>
          </div>
        )}

        {activeTab === 'source' && (
          <ResultsTable
            columns={sourceColumns}
            rows={evidence.source_rows}
            totalMatches={evidence.matched_row_count}
            isSourceRows={true}
          />
        )}
      </div>
    </div>
  );
};
