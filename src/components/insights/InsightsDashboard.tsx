import React, { useEffect, useState, useRef } from 'react';
import {
  Sparkles,
  AlertTriangle,
  Info,
  HelpCircle,
  BarChart3,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Layers,
  Table,
  CheckCircle2,
  PieChart,
  LineChart,
  LayoutGrid,
  Maximize2,
  SlidersHorizontal,
  Flame,
  Download,
  Calendar,
  Eye,
  FileSpreadsheet,
  Palette,
} from 'lucide-react';
import Plot from 'react-plotly.js';
import { fetchInsights } from '../../api/files';
import { InsightReport, DashboardChartSpec } from '../../api/types';
import { CHART_THEMES, ChartColorThemeId, applyThemeToChartData } from '../../lib/chartThemes';

interface InsightsDashboardProps {
  fileId: string;
  activeSheet: string;
  sheets?: string[];
  onSelectSheet?: (sheet: string) => void;
  onAskQuestion: (question: string) => void;
  theme?: 'light' | 'dark';
}

type TabFilter = 'all' | 'charts' | 'quality' | 'queries';

export const InsightsDashboard: React.FC<InsightsDashboardProps> = ({
  fileId,
  activeSheet,
  sheets = [],
  onSelectSheet,
  onAskQuestion,
  theme = 'light',
}) => {
  const [currentSheet, setCurrentSheet] = useState<string>(activeSheet);
  const [report, setReport] = useState<InsightReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [chartLayout, setChartLayout] = useState<'grid' | 'full'>('grid');
  // State for chart color palette theme: 'vibrant' | 'ocean' | 'sunset' | 'emerald' | 'twilight'
  const [colorTheme, setColorTheme] = useState<ChartColorThemeId>('vibrant');
  // State for metric mode toggles per chart: 'sum' | 'mean' | 'count'
  const [metricModes, setMetricModes] = useState<Record<string, 'sum' | 'mean' | 'count'>>({});
  // Zoomed chart modal
  const [zoomedChart, setZoomedChart] = useState<DashboardChartSpec | null>(null);

  // Sync if activeSheet changes from parent
  useEffect(() => {
    setCurrentSheet(activeSheet);
  }, [activeSheet]);

  // Load insights whenever currentSheet or fileId changes
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchInsights(fileId, currentSheet)
      .then((data) => {
        if (isMounted) {
          setReport(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load insights:', err);
          setError('Failed to generate insights for this sheet.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [fileId, currentSheet]);

  const isDark = theme === 'dark';

  const handleSheetSwitch = (sheetName: string) => {
    setCurrentSheet(sheetName);
    if (sheetName !== '__ALL__' && onSelectSheet) {
      onSelectSheet(sheetName);
    }
  };

  const getChartIcon = (type: string) => {
    switch (type) {
      case 'line':
        return <LineChart className="w-3.5 h-3.5 text-emerald-500" />;
      case 'pie':
        return <PieChart className="w-3.5 h-3.5 text-violet-500" />;
      case 'histogram':
        return <SlidersHorizontal className="w-3.5 h-3.5 text-teal-500" />;
      default:
        return <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />;
    }
  };

  const getChartBadgeColor = (type: string) => {
    switch (type) {
      case 'line':
        return 'from-emerald-500 to-teal-500';
      case 'pie':
        return 'from-violet-500 to-pink-500';
      case 'scatter':
        return 'from-cyan-500 to-blue-500';
      case 'histogram':
        return 'from-teal-500 to-emerald-500';
      default:
        return 'from-indigo-600 to-blue-600';
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-slate-400 gap-4">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20 animate-pulse">
            <RefreshCw className="w-7 h-7 text-white animate-spin" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Synthesizing Autonomous Insights & Visual Analytics...
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            Evaluating distributions, variance models, time trends & categorical aggregations
          </p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto mb-3 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">Insights Unavailable</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{error || 'No insights report could be generated.'}</p>
        <button
          onClick={() => onAskQuestion('Give me an overview of this dataset')}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          Ask AI for Dataset Overview
        </button>
      </div>
    );
  }

  // Calculate high-level health score
  const warningCount = report.insights.filter((i) => i.severity === 'warning').length;
  const qualityScore = Math.max(70, Math.min(100, Math.round(100 - warningCount * 6)));
  const availableSheetsList = report.available_sheets || (sheets.length > 0 ? sheets : [activeSheet]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-7 animate-fadeIn">
      {/* Multi-Sheet Selection Pill Bar (when file has multiple sheets) */}
      {availableSheetsList.length > 1 && (
        <div className="bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-2.5 rounded-2xl flex items-center gap-2 overflow-x-auto shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 px-2 shrink-0">
            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Select Sheet:</span>
          </div>

          {/* Workbook Overview Button */}
          <button
            onClick={() => handleSheetSwitch('__ALL__')}
            className={`px-4 py-2.5 rounded-xl text-sm sm:text-base font-bold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
              currentSheet === '__ALL__'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Workbook Overview (All {availableSheetsList.length} Sheets)</span>
          </button>

          {/* Individual Sheet Tabs */}
          {availableSheetsList.map((sName) => (
            <button
              key={sName}
              onClick={() => handleSheetSwitch(sName)}
              className={`px-4 py-2.5 rounded-xl text-sm sm:text-base font-semibold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
                currentSheet === sName
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200/80 dark:border-slate-700/80'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{sName}</span>
            </button>
          ))}
        </div>
      )}

      {/* Executive Hero Banner */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-violet-600/10 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-slate-900 border border-blue-200/80 dark:border-indigo-900/50 p-6 sm:p-8 shadow-xs backdrop-blur-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/25 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 bg-blue-100/80 dark:bg-blue-900/50 px-3 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                  {report.is_workbook_overview ? 'Workbook Overview' : 'Verified Sheet Intelligence'}
                </span>
                <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">· Exact Calculations</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                Auto-Insights & Visual Analytics:{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-300">
                  {report.sheet_name}
                </span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-4 py-2 rounded-full text-sm font-bold bg-white/80 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 shadow-2xs">
              {report.row_count.toLocaleString()} records · {report.column_count} fields
            </span>
          </div>
        </div>

        <p className="text-base sm:text-lg text-slate-700 dark:text-slate-300 leading-relaxed font-normal bg-white/70 dark:bg-slate-900/70 p-5 rounded-2xl border border-white/60 dark:border-slate-800 shadow-2xs">
          {report.summary_text}
        </p>

        {/* 4 Executive KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/50">
              <Table className="w-5.5 h-5.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">Total Records</div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {report.row_count.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50">
              <ShieldCheck className="w-5.5 h-5.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">Data Quality</div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {qualityScore}% <span className="text-xs font-normal text-slate-400">Clean</span>
              </div>
            </div>
          </div>

          <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/50">
              <Layers className="w-5.5 h-5.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">Dimensions</div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {report.column_count} <span className="text-xs font-normal text-slate-400">Fields</span>
              </div>
            </div>
          </div>

          <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-2xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-950/70 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0 border border-violet-100 dark:border-violet-900/50">
              <TrendingUp className="w-5.5 h-5.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">Visual Charts</div>
              <div className="text-2xl sm:text-3xl font-black text-violet-600 dark:text-violet-400">
                {report.dashboard_charts.length} <span className="text-xs font-normal text-slate-400">Charts</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Segmented Filter Bar & Graph Color Palette Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-3.5">
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Insights
          </button>
          <button
            onClick={() => setActiveTab('charts')}
            className={`px-3.5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'charts'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Dashboard Visuals ({report.dashboard_charts.length})
          </button>
          <button
            onClick={() => setActiveTab('quality')}
            className={`px-3.5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'quality'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Quality & Findings ({report.insights.length})
          </button>
          <button
            onClick={() => setActiveTab('queries')}
            className={`px-3.5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'queries'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            Inquiries ({report.suggested_questions.length})
          </button>
        </div>

        {/* Color Palette Switcher & Chart View Layout Controls */}
        {(activeTab === 'all' || activeTab === 'charts') && report.dashboard_charts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Color Palette Selector with Color Swatches */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 px-2.5">
                <Palette className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:inline">Graph Colors:</span>
              </div>
              {(Object.keys(CHART_THEMES) as ChartColorThemeId[]).map((tid) => {
                const t = CHART_THEMES[tid];
                const isAct = colorTheme === tid;
                return (
                  <button
                    key={tid}
                    onClick={() => setColorTheme(tid)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isAct
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title={`Switch graphs to ${t.name} palette`}
                  >
                    <span className="flex items-center -space-x-1">
                      {t.previewColors.map((c, i) => (
                        <span
                          key={i}
                          className="w-2.5 h-2.5 rounded-full border border-white dark:border-slate-800"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </span>
                    <span className="hidden xl:inline">{t.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Layout switch buttons */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
              <button
                onClick={() => setChartLayout('grid')}
                className={`p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                  chartLayout === 'grid'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="2-Column Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setChartLayout('full')}
                className={`p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                  chartLayout === 'full'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Full-Width Focus View"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* AUTOMATIC DASHBOARD VISUALIZATIONS CAPSULE */}
      {/* ======================================================== */}
      {(activeTab === 'all' || activeTab === 'charts') && report.dashboard_charts && report.dashboard_charts.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
            <div className="flex items-center gap-2">
              <span className="px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-extrabold bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-sm shadow-blue-500/20 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Executive Visual Analytics Suite ({report.dashboard_charts.length})
              </span>
              <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                Accurate Distributions, Aggregations & Trends
              </span>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Interactive · Tooltip Shares · Verified Values
            </span>
          </div>

          <div className={`grid gap-6 ${chartLayout === 'full' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
            {report.dashboard_charts.map((chartSpec: DashboardChartSpec) => {
              const badgeGradient = getChartBadgeColor(chartSpec.chart_type);
              const chartIcon = getChartIcon(chartSpec.chart_type);
              const currentMode = metricModes[chartSpec.id] || 'count';

              // Apply the user's selected color theme/shades to the chart data
              const themedData = applyThemeToChartData(chartSpec, colorTheme);
              let displayData = themedData;

              if (chartSpec.metricsData && chartSpec.chart_type === 'bar') {
                const categories = chartSpec.metricsData.categories;
                let values = chartSpec.metricsData.counts;

                if (currentMode === 'sum') {
                  values = chartSpec.metricsData.sums;
                } else if (currentMode === 'mean') {
                  values = chartSpec.metricsData.means;
                }

                displayData = [
                  {
                    ...themedData[0],
                    x: categories,
                    y: values,
                    text: values.map((v: number) => {
                      if (currentMode === 'count') return `${v.toLocaleString()} records`;
                      return chartSpec.isCurrency ? `$${v.toLocaleString()}` : v.toLocaleString();
                    }),
                  },
                ];
              }

              return (
                <div
                  key={chartSpec.id}
                  className="group relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-[28px] p-5 sm:p-6 shadow-sm hover:shadow-xl hover:border-blue-400/40 dark:hover:border-blue-500/30 transition-all duration-300 flex flex-col justify-between overflow-hidden"
                >
                  {/* Top Colorful Accent Line */}
                  <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${badgeGradient}`} />

                  {/* Chart Card Header */}
                  <div className="mb-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            {chartIcon}
                            {chartSpec.chart_type.toUpperCase()} CHART
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400 truncate">
                            {chartSpec.x} {chartSpec.y ? `vs ${chartSpec.y}` : ''}
                          </span>
                        </div>
                        <h4 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight" title={chartSpec.title}>
                          {chartSpec.title}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Ask AI button */}
                        <button
                          onClick={() => onAskQuestion(`Analyze the findings and breakdown in "${chartSpec.title}"`)}
                          className="px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-blue-50 dark:bg-blue-950/70 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/80 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                          title="Ask AI about this visualization"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>Ask AI</span>
                        </button>
                      </div>
                    </div>

                    {/* Chart Metric Mode Switcher (Record Count / Total Sum / Average) if metricsData exists */}
                    {chartSpec.metricsData && chartSpec.chart_type === 'bar' && (
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs sm:text-sm font-semibold">
                          <button
                            onClick={() => setMetricModes((prev) => ({ ...prev, [chartSpec.id]: 'count' }))}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                              currentMode === 'count'
                                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-2xs font-bold'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                          >
                            Record Count
                          </button>
                          <button
                            onClick={() => setMetricModes((prev) => ({ ...prev, [chartSpec.id]: 'sum' }))}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                              currentMode === 'sum'
                                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-2xs font-bold'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                          >
                            Total Sum
                          </button>
                          <button
                            onClick={() => setMetricModes((prev) => ({ ...prev, [chartSpec.id]: 'mean' }))}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                              currentMode === 'mean'
                                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-2xs font-bold'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                          >
                            Average
                          </button>
                        </div>

                        {chartSpec.stats?.topSegment && (
                          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                            Leader:{' '}
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {chartSpec.stats.topSegment}
                            </span>{' '}
                            ({chartSpec.stats.topSegmentPct}%)
                          </div>
                        )}
                      </div>
                    )}

                    {/* Chart Stat Badges Strip */}
                    {chartSpec.stats && !chartSpec.metricsData && (
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 pt-0.5 flex-wrap">
                        {chartSpec.stats.total !== undefined && (
                          <span className="bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                            Total: <strong className="text-slate-800 dark:text-slate-100">{chartSpec.isCurrency ? `$${chartSpec.stats.total.toLocaleString()}` : chartSpec.stats.total.toLocaleString()}</strong>
                          </span>
                        )}
                        {chartSpec.stats.mean !== undefined && (
                          <span className="bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                            Mean: <strong className="text-slate-800 dark:text-slate-100">{chartSpec.isCurrency ? `$${chartSpec.stats.mean.toLocaleString()}` : chartSpec.stats.mean.toLocaleString()}</strong>
                          </span>
                        )}
                        {chartSpec.stats.topSegment && (
                          <span className="bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                            Top: <strong className="text-slate-800 dark:text-slate-100">{chartSpec.stats.topSegment}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Plotly Canvas Container with Smooth Box Radius */}
                  <div className="h-84 sm:h-96 w-full rounded-2xl overflow-hidden bg-gradient-to-b from-slate-50/70 via-white/40 to-slate-50/40 dark:from-slate-950/70 dark:via-slate-900/40 dark:to-slate-950/40 p-2.5 sm:p-3 border border-slate-200/60 dark:border-slate-800/60 shadow-inner">
                    <Plot
                      data={displayData}
                      layout={{
                        ...chartSpec.plotly.layout,
                        autosize: true,
                        margin: { l: 55, r: 25, t: 30, b: 65 },
                        paper_bgcolor: 'transparent',
                        plot_bgcolor: 'transparent',
                        font: {
                          color: isDark ? '#cbd5e1' : '#334155',
                          family: 'Plus Jakarta Sans, system-ui, sans-serif',
                          size: 13,
                        },
                        xaxis: {
                          ...chartSpec.plotly.layout?.xaxis,
                          automargin: true,
                          gridcolor: isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(241, 245, 249, 0.9)',
                          zeroline: false,
                          tickfont: { size: 12 },
                          title: {
                            ...chartSpec.plotly.layout?.xaxis?.title,
                            font: { size: 13, weight: 'bold' },
                          },
                        },
                        yaxis: {
                          ...chartSpec.plotly.layout?.yaxis,
                          automargin: true,
                          gridcolor: isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(241, 245, 249, 0.9)',
                          zeroline: false,
                          tickfont: { size: 12 },
                          title: {
                            ...chartSpec.plotly.layout?.yaxis?.title,
                            font: { size: 13, weight: 'bold' },
                          },
                        },
                      }}
                      useResizeHandler={true}
                      style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }}
                      config={{
                        responsive: true,
                        displayModeBar: 'hover',
                        displaylogo: false,
                        toImageButtonOptions: {
                          format: 'png',
                          filename: chartSpec.title.replace(/\s+/g, '_'),
                          height: 600,
                          width: 900,
                          scale: 2,
                        },
                        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
                      }}
                    />
                  </div>

                  {/* Bottom Analytical Highlight Footer */}
                  <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs sm:text-sm">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Flame className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="truncate">Autonomously computed & verified from source records</span>
                    </div>

                    <button
                      onClick={() => onAskQuestion(`Show me the breakdown of ${chartSpec.title}`)}
                      className="font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 group/btn shrink-0 cursor-pointer"
                    >
                      <span>Drill Down</span>
                      <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ======================================================== */}
      {/* RECOMMENDED NATURAL-LANGUAGE QUERIES SECTION */}
      {/* ======================================================== */}
      {(activeTab === 'all' || activeTab === 'queries') && report.suggested_questions && report.suggested_questions.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <HelpCircle className="w-4.5 h-4.5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Recommended Natural-Language Queries
              </h3>
            </div>
            <span className="text-xs sm:text-sm text-slate-400">Click any question to analyze</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {report.suggested_questions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => onAskQuestion(q)}
                className="p-4 rounded-2xl text-left bg-slate-50/70 dark:bg-slate-800/60 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-300 border border-slate-200/80 dark:border-slate-700/80 hover:border-blue-300 dark:hover:border-blue-700 transition-all group shadow-2xs flex flex-col justify-between cursor-pointer"
              >
                <div className="text-sm sm:text-base font-semibold leading-snug mb-3 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                  "{q}"
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm text-slate-400 font-bold pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                  <span>Run Query</span>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ======================================================== */}
      {/* DATA QUALITY & STATISTICAL FINDINGS */}
      {/* ======================================================== */}
      {(activeTab === 'all' || activeTab === 'quality') && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>Data Quality & Statistical Findings ({report.insights.length})</span>
            </h3>
            <span className="text-xs sm:text-sm text-slate-400 font-semibold">
              {warningCount > 0 ? `${warningCount} warnings flagged` : 'Zero critical defects found'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {report.insights.map((item) => {
              const isWarn = item.severity === 'warning';
              return (
                <div
                  key={item.id}
                  className={`p-5 sm:p-6 rounded-2xl border transition-all ${
                    isWarn
                      ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60 hover:border-amber-300 dark:hover:border-amber-800'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  } shadow-2xs flex flex-col justify-between`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        {isWarn ? (
                          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                        ) : (
                          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                        )}
                        {item.title}
                      </span>
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                          isWarn
                            ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {item.category.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                      {item.detail}
                    </p>
                  </div>

                  {item.question_to_ask && (
                    <button
                      onClick={() => onAskQuestion(item.question_to_ask!)}
                      className="mt-1 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1.5 w-fit group cursor-pointer"
                    >
                      <span>Investigate: "{item.question_to_ask}"</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};


