import React, { useState } from 'react';
import {
  Lightbulb,
  TrendingUp,
  BarChart3,
  PieChart,
  LineChart,
  Download,
  Maximize2,
  X,
  CheckCircle2,
  Table,
  Layers,
  ArrowRight,
  Eye,
  Sliders,
  Sparkles
} from 'lucide-react';
import { QueryResponse, ChartData } from '../../api/types';
import { ResultChart } from '../charts/ResultChart';

interface FormattedAnswerProps {
  text: string;
  response?: QueryResponse;
  userQuery?: string;
  theme?: 'light' | 'dark';
  activeSheet?: string;
  onSelectSheet?: (sheetName: string) => void;
}

export const FormattedAnswer: React.FC<FormattedAnswerProps> = ({
  text,
  response,
  userQuery,
  theme = 'light',
  activeSheet,
  onSelectSheet,
}) => {
  const [showInteractiveChart, setShowInteractiveChart] = useState(true);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);

  const structured = response?.structured_format;
  const chart = response?.chart;
  const isModified = response?.result_id === 'modified';
  const sourceSheets = response?.source_sheets || structured?.source_sheets;
  const isMultiSheet = sourceSheets && sourceSheets.length > 1;
  const targetSheet = response?.target_sheet || structured?.target_sheet || (sourceSheets?.length === 1 ? sourceSheets[0] : undefined);

  const VIBRANT_PALETTE = [
    '#2563EB', '#059669', '#7C3AED', '#D97706', '#EC4899', '#0891B2',
    '#EA580C', '#6366F1', '#10B981', '#F43F5E', '#8B5CF6', '#06B6D4',
    '#F59E0B', '#3B82F6'
  ];

  const isPieRequested =
    (userQuery || '').toLowerCase().includes('pie') ||
    (userQuery || '').toLowerCase().includes('donut') ||
    (userQuery || '').toLowerCase().includes('circle') ||
    (response?.question || '').toLowerCase().includes('pie') ||
    (response?.question || '').toLowerCase().includes('donut') ||
    (response?.question || '').toLowerCase().includes('circle') ||
    text.toLowerCase().includes('pie') ||
    text.toLowerCase().includes('donut') ||
    text.toLowerCase().includes('circle chart') ||
    (response?.interpretation || '').toLowerCase().includes('pie') ||
    (response?.structured_format?.headline || '').toLowerCase().includes('pie') ||
    chart?.type === 'pie' ||
    chart?.plotly?.data?.[0]?.type === 'pie';

  // Synthesize displayChart so chart is ALWAYS presented when chart requested or returned
  const displayChart: ChartData | null = React.useMemo(() => {
    if (chart && chart.plotly?.data && chart.plotly.data.length > 0) {
      if (isPieRequested && chart.type !== 'pie') {
        const tr = chart.plotly.data[0] || {};
        const lbs = tr.labels || tr.x || [];
        const vals = tr.values || tr.y || [];
        const sliceColors = (tr.marker?.colors && Array.isArray(tr.marker.colors) && tr.marker.colors.length > 0)
          ? tr.marker.colors
          : VIBRANT_PALETTE;

        return {
          ...chart,
          type: 'pie',
          plotly: {
            data: [{
              type: 'pie',
              labels: lbs,
              values: vals,
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

      // If bar chart has a single color, color each bar with vibrant palette
      const tr = chart.plotly.data[0] || {};
      const labels = tr.x || tr.labels || [];
      const hasMultiColors = Array.isArray(tr.marker?.color) && tr.marker.color.length > 1;

      if (!hasMultiColors && labels.length > 0) {
        return {
          ...chart,
          plotly: {
            ...chart.plotly,
            data: [{
              ...tr,
              marker: {
                ...tr.marker,
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

    if (!response?.result?.rows || response.result.rows.length === 0) return null;
    const rows = response.result.rows;
    const cols = response.result.columns || Object.keys(rows[0] || {});
    const isExplicitMetricSum =
      text.toLowerCase().includes('sum') ||
      text.toLowerCase().includes('total') ||
      text.toLowerCase().includes('revenue') ||
      text.toLowerCase().includes('sales');

    const numCol = isExplicitMetricSum ? cols.find((c) => {
      const v = Number(rows[0]?.[c]);
      return !isNaN(v) && typeof rows[0]?.[c] !== 'boolean';
    }) : undefined;
    
    const catCol = cols.find((c) => c !== numCol && c !== '__row__') || cols[0];

    const groupMap = new Map<string, number>();
    for (const r of rows) {
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
    const chartTitle = (isExplicitMetricSum && numCol)
      ? `${numCol} by ${catCol}`
      : `${catCol} Distribution (${rows.length.toLocaleString()} Total Records)`;

    return {
      type: targetType,
      x: catCol,
      y: (isExplicitMetricSum && numCol) ? numCol : 'Record Count',
      title: chartTitle,
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
            colors: targetType === 'pie' ? VIBRANT_PALETTE : undefined,
            color: targetType === 'pie' ? undefined : labels.map((_, i) => VIBRANT_PALETTE[i % VIBRANT_PALETTE.length]),
            cornerradius: targetType === 'bar' ? 8 : undefined,
            line: { color: '#ffffff', width: 2 },
          },
        }],
        layout: {
          title: { text: chartTitle },
          autosize: true,
          margin: targetType === 'pie' ? { t: 40, r: 20, l: 20, b: 30 } : { t: 40, r: 20, l: 50, b: 60 },
          showlegend: true,
        },
      },
    };
  }, [chart, response, isPieRequested, text]);

  // Helper to trigger download of generated chart image
  const handleDownloadChart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!displayChart?.image_url) return;
    const link = document.createElement('a');
    link.href = displayChart.image_url;
    link.download = `${(displayChart.title || 'excelmind-chart').toLowerCase().replace(/\s+/g, '_')}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to parse markdown-like bold and format strings cleanly
  const renderFormattedInline = (content: string) => {
    if (!content) return null;
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="space-y-4 text-sm sm:text-base">
      {/* Multi-Sheet Context Strip */}
      {isMultiSheet ? (
        <div className="p-3 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/60 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
          <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-bold">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Analyzed across {sourceSheets.length} sheets:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {sourceSheets.map((s) => (
              <button
                key={s}
                onClick={() => onSelectSheet?.(s)}
                className={`px-2.5 py-1 rounded-lg font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                  s === activeSheet
                    ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                    : 'bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-slate-700 dark:text-slate-200 hover:border-indigo-400'
                }`}
                title={`Switch workspace to sheet "${s}"`}
              >
                <span>{s}</span>
                {s === activeSheet && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
              </button>
            ))}
          </div>
        </div>
      ) : targetSheet && activeSheet && targetSheet !== activeSheet ? (
        <div className="p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 flex items-center justify-between gap-2 text-xs sm:text-sm">
          <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
            <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>
              Data located in sheet: <strong>{targetSheet}</strong> (active view is <em>{activeSheet}</em>)
            </span>
          </div>
          {onSelectSheet && (
            <button
              onClick={() => onSelectSheet(targetSheet)}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer shrink-0 shadow-2xs"
            >
              <span>Switch to {targetSheet}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : null}

      {/* 1. Quick Headline / Direct Answer Banner */}
      {structured?.headline ? (
        <div className="p-4 sm:p-5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
              <Lightbulb className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block mb-1">
                Quick Takeaway
              </span>
              <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
                {renderFormattedInline(structured.headline)}
              </p>
            </div>
          </div>
        </div>
      ) : isModified ? (
        <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 block mb-1">
                Live Data Updated in Web Workspace
              </span>
              <p className="text-sm sm:text-base font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                Changes have been safely applied to the <strong>temporary working copy</strong>. Your original main Excel file remains pristine and untouched.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* 2. Key Metrics Grid (Instant visual numbers) */}
      {structured?.key_metrics && structured.key_metrics.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {structured.key_metrics.map((metric, idx) => (
            <div
              key={idx}
              className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                  {metric.label}
                </span>
                {metric.badge && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold shrink-0">
                    {metric.badge}
                  </span>
                )}
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white truncate">
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Interactive Chart Availability Badge (Rendered in right Evidence Panel, omitted from chat bubble per user preference) */}
      {displayChart && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              {displayChart.type === 'pie' ? (
                <PieChart className="w-3.5 h-3.5" />
              ) : displayChart.type === 'line' ? (
                <LineChart className="w-3.5 h-3.5" />
              ) : (
                <BarChart3 className="w-3.5 h-3.5" />
              )}
            </span>
            <span>
              {displayChart.title || 'Interactive Visualization'}:
            </span>
            <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
              ({displayChart.type === 'pie' ? 'Pie Chart' : 'Bar Chart'} generated in Verified Evidence & Source Trace panel)
            </span>
          </div>
          <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            <span>Ready in Right Evidence Panel →</span>
          </span>
        </div>
      )}

      {/* Multi-Sheet Breakdown Grid */}
      {structured?.sheet_breakdown && structured.sheet_breakdown.length > 0 && (
        <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Table className="w-3.5 h-3.5" />
              <span>Workbook Breakdown by Sheet</span>
            </span>
            <span className="text-[10px] text-slate-400 font-normal">
              {structured.sheet_breakdown.length} sheets analyzed
            </span>
          </div>
          <div className="space-y-1.5">
            {structured.sheet_breakdown.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectSheet?.(item.sheet_name)}
                    className="font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer flex items-center gap-1"
                    title={`Switch to sheet "${item.sheet_name}"`}
                  >
                    <span>{item.sheet_name}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                  </button>
                  <span className="text-[11px] px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-medium">
                    {item.count.toLocaleString()} rows
                  </span>
                </div>
                {item.metric_summary && (
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    {item.metric_summary}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Structured Breakdown / Bullet Points */}
      {structured?.bullet_points && structured.bullet_points.length > 0 ? (
        <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span>Key Details & Breakdown</span>
          </div>
          <ul className="space-y-2">
            {structured.bullet_points.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                <span className="leading-relaxed">{renderFormattedInline(point)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 5. Fallback Formatted Text (Clean Markdown Parser) */}
      {(!structured || (!structured.headline && !structured.bullet_points)) && (
        <div className="text-slate-800 dark:text-slate-200 leading-relaxed font-normal">
          {renderMarkdownContent(text)}
        </div>
      )}

      {/* 6. Actionable Takeaway / Conclusion */}
      {structured?.takeaway && (
        <div className="text-xs p-3 rounded-lg bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 italic">
          <strong className="not-italic text-slate-800 dark:text-slate-200">Summary: </strong>
          {structured.takeaway}
        </div>
      )}

      {/* Fullscreen Zoom Modal for Generated Chart Image */}
      {isZoomModalOpen && displayChart?.image_url && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
          onClick={() => setIsZoomModalOpen(false)}
        >
          <div
            className="relative max-w-4xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between mb-3 pb-2 border-b border-slate-800 text-white">
              <span className="text-sm font-semibold">{displayChart.title || 'Generated Chart Image'}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadChart}
                  className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Image
                </button>
                <button
                  onClick={() => setIsZoomModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <img
              src={displayChart.image_url}
              alt={displayChart.title || 'Chart Fullscreen'}
              referrerPolicy="no-referrer"
              className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain shadow-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Intelligent Markdown Parser for clean readable display
 */
function renderMarkdownContent(content: string) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let inList = false;
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="my-2.5 space-y-1.5 pl-1">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Check for Headings
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h4
          key={idx}
          className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mt-3 mb-1.5 flex items-center gap-1.5"
        >
          {formatInline(trimmed.replace('### ', ''))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h3
          key={idx}
          className="text-sm font-bold text-slate-900 dark:text-white mt-3.5 mb-1.5"
        >
          {formatInline(trimmed.replace('## ', ''))}
        </h3>
      );
      return;
    }

    // Check for List item (- or * or 1.)
    const listMatch = trimmed.match(/^([-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      inList = true;
      listItems.push(
        <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
          <span className="leading-relaxed">{formatInline(listMatch[2])}</span>
        </li>
      );
      return;
    }

    // Flush list if non-list line encountered
    flushList();

    // Blank line
    if (!trimmed) {
      elements.push(<div key={idx} className="h-1.5" />);
      return;
    }

    // Paragraph
    elements.push(
      <p key={idx} className="leading-relaxed mb-2 text-xs sm:text-sm">
        {formatInline(trimmed)}
      </p>
    );
  });

  flushList();
  return elements;
}

function formatInline(str: string): React.ReactNode {
  const parts = str.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
