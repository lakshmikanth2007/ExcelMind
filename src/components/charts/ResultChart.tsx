import React, { useState, useEffect, useRef } from 'react';
import Plot from 'react-plotly.js';
import { BarChart3, LineChart, PieChart, ScatterChart, RefreshCw, Download } from 'lucide-react';
import { ChartData } from '../../api/types';

interface ResultChartProps {
  chartData: ChartData;
  onUpdateChartType?: (newType: string) => void;
  isLoading?: boolean;
  theme?: 'light' | 'dark';
}

const VIBRANT_CHART_COLORS = [
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

/**
 * Interactive, high-performance SVG Donut Chart.
 * 100% reliable across all browsers and iframes.
 * Perfect for both single-category (100%) and multi-category distributions.
 */
const InteractiveDonutChart: React.FC<{
  labels: string[];
  values: number[];
  colors: string[];
  title?: string;
  isDark?: boolean;
  totalLabel?: string;
}> = ({ labels, values, colors, isDark, totalLabel = 'Total Records' }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const total = values.reduce((acc, curr) => acc + (Number(curr) || 0), 0) || 1;
  const width = 500;
  const height = 300;
  const cx = 150;
  const cy = 150;
  const R = 110;
  const r = 58;

  let currentAngle = -Math.PI / 2;

  const sliceData = labels.map((label, idx) => {
    const val = Number(values[idx]) || 0;
    const fraction = val / total;
    const sliceAngle = fraction * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    const color = colors[idx % colors.length];
    const pct = (fraction * 100).toFixed(1);

    if (fraction >= 0.999 || labels.length === 1) {
      return {
        idx,
        label,
        val,
        pct,
        color,
        isSingle: true,
        pathD: '',
      };
    }

    const x1 = cx + R * Math.cos(startAngle);
    const y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle);
    const y2 = cy + R * Math.sin(endAngle);
    const x3 = cx + r * Math.cos(endAngle);
    const y3 = cy + r * Math.sin(endAngle);
    const x4 = cx + r * Math.cos(startAngle);
    const y4 = cy + r * Math.sin(startAngle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    const pathD = `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${largeArc} 0 ${x4} ${y4} Z`;

    return {
      idx,
      label,
      val,
      pct,
      color,
      isSingle: false,
      pathD,
    };
  });

  const activeSlice = hoveredIdx !== null ? sliceData[hoveredIdx] : null;

  return (
    <div className="w-full h-full flex flex-col sm:flex-row items-center justify-center gap-4 p-2 relative select-none">
      {/* SVG Canvas Area */}
      <div className="relative shrink-0 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${cx * 2} ${cy * 2}`}
          className="w-[240px] h-[240px] sm:w-[270px] sm:h-[270px] drop-shadow-sm transition-transform"
        >
          {sliceData.map((slice) => {
            const isHovered = hoveredIdx === slice.idx;

            if (slice.isSingle) {
              return (
                <g
                  key={slice.idx}
                  onMouseEnter={() => setHoveredIdx(slice.idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="cursor-pointer transition-all duration-200"
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? R + 3 : R}
                    fill={slice.color}
                    stroke={isDark ? '#0f172a' : '#ffffff'}
                    strokeWidth="3"
                    className="transition-all duration-200"
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={isDark ? '#090d16' : '#ffffff'}
                    className="transition-colors"
                  />
                </g>
              );
            }

            return (
              <path
                key={slice.idx}
                d={slice.pathD}
                fill={slice.color}
                stroke={isDark ? '#0f172a' : '#ffffff'}
                strokeWidth="2.5"
                opacity={hoveredIdx !== null && !isHovered ? 0.65 : 1}
                className="cursor-pointer transition-all duration-200 hover:opacity-100"
                onMouseEnter={() => setHoveredIdx(slice.idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}

          {/* Center Hole Information */}
          <g className="pointer-events-none text-center">
            <text
              x={cx}
              y={cy - 4}
              textAnchor="middle"
              fill={isDark ? '#f8fafc' : '#0f172a'}
              fontSize="20"
              fontWeight="800"
              fontFamily="Plus Jakarta Sans, system-ui, sans-serif"
            >
              {activeSlice ? activeSlice.val.toLocaleString() : total.toLocaleString()}
            </text>
            <text
              x={cx}
              y={cy + 15}
              textAnchor="middle"
              fill={isDark ? '#94a3b8' : '#64748b'}
              fontSize="11"
              fontWeight="600"
              fontFamily="Plus Jakarta Sans, system-ui, sans-serif"
            >
              {activeSlice ? `${activeSlice.pct}%` : totalLabel}
            </text>
          </g>
        </svg>

        {/* Hover Floating Tooltip Badge */}
        {activeSlice && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-slate-900/95 dark:bg-slate-800/95 text-white text-[11px] font-semibold shadow-lg border border-slate-700 pointer-events-none flex items-center gap-1.5 z-20 whitespace-nowrap">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: activeSlice.color }}
            />
            <span className="max-w-[120px] truncate">{activeSlice.label}:</span>
            <span className="font-bold text-amber-300">
              {activeSlice.val.toLocaleString()} records ({activeSlice.pct}%)
            </span>
          </div>
        )}
      </div>

      {/* Legend & Categories Breakdown Panel */}
      <div className="flex-1 max-w-xs w-full max-h-[260px] overflow-y-auto space-y-1.5 pr-1 py-1 custom-scrollbar">
        {sliceData.map((slice) => {
          const isHovered = hoveredIdx === slice.idx;
          return (
            <div
              key={slice.idx}
              onMouseEnter={() => setHoveredIdx(slice.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`p-2 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-2 border ${
                isHovered
                  ? 'bg-slate-100 dark:bg-slate-800 border-blue-400 dark:border-blue-500 shadow-xs'
                  : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3.5 h-3.5 rounded-md shrink-0 shadow-2xs"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate" title={slice.label}>
                  {slice.label}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  {slice.val.toLocaleString()}
                </span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block">
                  {slice.pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ResultChart: React.FC<ResultChartProps> = ({
  chartData,
  onUpdateChartType,
  isLoading,
  theme = 'light',
}) => {
  const [currentType, setCurrentType] = useState<string>(chartData.type || 'bar');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chartData.type) {
      setCurrentType(chartData.type);
    }
  }, [chartData.type, chartData]);

  const handleTypeChange = (type: string) => {
    setCurrentType(type);
    if (onUpdateChartType) {
      onUpdateChartType(type);
    }
  };

  const handleDownload = () => {
    if (chartData.image_url) {
      const link = document.createElement('a');
      link.href = chartData.image_url;
      link.download = `${(chartData.title || 'chart').toLowerCase().replace(/\s+/g, '_')}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Export SVG directly from DOM if image_url is missing
    const svgEl = containerRef.current?.querySelector('svg');
    if (svgEl) {
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svgEl);
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(chartData.title || 'chart').toLowerCase().replace(/\s+/g, '_')}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const chartTypes = [
    { type: 'bar', label: 'Bar', icon: BarChart3 },
    { type: 'line', label: 'Line', icon: LineChart },
    { type: 'pie', label: 'Pie', icon: PieChart },
    { type: 'scatter', label: 'Scatter', icon: ScatterChart },
  ];

  const isDark = theme === 'dark';

  // Extract clean labels, values, and colors from trace
  const { labels, values, colors } = React.useMemo(() => {
    const trace = chartData.plotly?.data?.[0] || {};
    const rawX = (Array.isArray(trace.labels) && trace.labels.length > 0)
      ? trace.labels
      : (Array.isArray(trace.x) && trace.x.length > 0)
        ? trace.x
        : (Array.isArray((chartData as any).labels) && (chartData as any).labels.length > 0)
          ? (chartData as any).labels
          : [];
    const rawY = (Array.isArray(trace.values) && trace.values.length > 0)
      ? trace.values
      : (Array.isArray(trace.y) && trace.y.length > 0)
        ? trace.y
        : (Array.isArray((chartData as any).values) && (chartData as any).values.length > 0)
          ? (chartData as any).values
          : [];

    const stringLabels = rawX.map((l: any) => String(l ?? 'Other'));
    const numberValues = rawY.map((v: any) => Number(v) || 0);

    const sliceColors = (trace.marker?.colors && Array.isArray(trace.marker.colors) && trace.marker.colors.length > 0)
      ? trace.marker.colors
      : (Array.isArray(trace.marker?.color) && trace.marker.color.length > 0)
        ? trace.marker.color
        : VIBRANT_CHART_COLORS;

    return {
      labels: stringLabels,
      values: numberValues,
      colors: sliceColors,
    };
  }, [chartData]);

  // Clean Plotly Cartesian data for Bar, Line, Scatter
  const cartesianPlotData = React.useMemo(() => {
    if (!chartData.plotly?.data) return undefined;
    return chartData.plotly.data.map((trace: any) => {
      const rawX = labels.length > 0 ? labels : (trace.x || trace.labels || []);
      const rawY = values.length > 0 ? values : (trace.y || trace.values || []);

      if (currentType === 'line') {
        return {
          type: 'scatter',
          mode: 'lines+markers',
          x: rawX,
          y: rawY,
          line: { shape: 'spline', width: 3.5, color: '#2563EB' },
          marker: { size: 7, color: '#1D4ED8' },
        };
      }

      if (currentType === 'scatter') {
        return {
          type: 'scatter',
          mode: 'markers',
          x: rawX,
          y: rawY,
          marker: { size: 10, color: '#0891B2' },
        };
      }

      // Default: Bar
      const barColors = rawX.map((_: any, i: number) => colors[i % colors.length]);
      return {
        type: 'bar',
        x: rawX,
        y: rawY,
        marker: {
          color: barColors,
          cornerradius: 8,
          line: { color: '#ffffff', width: 1.5 },
        },
      };
    });
  }, [chartData.plotly?.data, currentType, labels, values, colors]);

  // Clean Plotly layout strictly for Cartesian charts
  const cartesianLayout = React.useMemo(() => {
    return {
      autosize: true,
      margin: { l: 55, r: 25, t: 30, b: 65 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      showlegend: false,
      font: {
        color: isDark ? '#cbd5e1' : '#334155',
        family: 'Plus Jakarta Sans, system-ui, sans-serif',
        size: 12,
      },
      xaxis: {
        ...chartData.plotly?.layout?.xaxis,
        automargin: true,
        gridcolor: isDark ? '#1e293b' : '#f1f5f9',
        zerolinecolor: isDark ? '#334155' : '#cbd5e1',
      },
      yaxis: {
        ...chartData.plotly?.layout?.yaxis,
        automargin: true,
        gridcolor: isDark ? '#1e293b' : '#f1f5f9',
        zerolinecolor: isDark ? '#334155' : '#cbd5e1',
      },
    };
  }, [chartData.plotly?.layout, isDark]);

  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col h-full transition-colors overflow-hidden"
    >
      {/* Chart Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-sm">
          {chartData.title || `${currentType.toUpperCase()} Chart`}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download chart image"
          >
            <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Export SVG</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {chartTypes.map((item) => {
              const Icon = item.icon;
              const isActive = currentType === item.type;
              return (
                <button
                  key={item.type}
                  onClick={() => handleTypeChange(item.type)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title={`Switch to ${item.label} chart`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="flex-1 min-h-[300px] w-full relative rounded-2xl overflow-hidden flex items-center justify-center">
        {isLoading && (
          <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 z-10 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400" />
          </div>
        )}

        {currentType === 'pie' ? (
          labels.length > 0 ? (
            <InteractiveDonutChart
              labels={labels}
              values={values}
              colors={colors}
              title={chartData.title}
              isDark={isDark}
              totalLabel={chartData.y || 'Total Records'}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-slate-400">
              No categories available to display pie chart.
            </div>
          )
        ) : cartesianPlotData ? (
          <Plot
            data={cartesianPlotData}
            layout={cartesianLayout}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%', minHeight: '300px' }}
            config={{
              responsive: true,
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            No chart data available for this result.
          </div>
        )}
      </div>
    </div>
  );
};

