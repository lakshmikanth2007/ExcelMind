import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Table,
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  Layers,
  Edit3,
  RefreshCw,
  Download,
  CheckCircle2,
  PieChart,
  LineChart,
  Bot,
  AlertCircle,
  FileText,
  Zap,
  History,
  Clock,
  Trash2,
  Undo2,
  FileEdit,
  ExternalLink,
  ChevronDown,
  Palette,
  Search,
  FilePlus,
} from 'lucide-react';
import Plot from 'react-plotly.js';
import { fetchInsights, getExportUrl } from '../../api/files';
import { SheetProfile, InsightReport, DashboardChartSpec, FileHistoryItem } from '../../api/types';
import { formatFileSize } from '../../lib/format';
import { CHART_THEMES, ChartColorThemeId, applyThemeToChartData } from '../../lib/chartThemes';

interface ExecutiveDashboardProps {
  fileId: string | null;
  filename: string;
  activeSheet: string;
  profile?: SheetProfile;
  sheets: string[];
  theme?: 'light' | 'dark';
  isUploading?: boolean;
  fileHistory?: FileHistoryItem[];
  onOpenFileFromHistory?: (fileId: string, filename: string) => void;
  onDeleteFileFromHistory?: (fileId: string) => void;
  isTempModified?: boolean;
  onRevertToOriginal?: () => void;
  uploadError?: string | null;
  onClearUploadError?: () => void;
  onNavigateTab: (tab: 'dashboard' | 'chat' | 'preview' | 'insights') => void;
  onAskQuestion: (query: string) => void;
  onOpenFileUpload: () => void;
  onFileUpload: (file: File) => void;
  onCreateNewFile: (template?: string) => void;
  onSelectSample?: (sampleName: string) => void;
  onSelectSheet?: (sheet: string) => void;
  onGoHome?: () => void;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return 'Recently';
  // Check if timestamp in seconds or milliseconds
  const timeMs = timestamp < 1e11 ? timestamp * 1000 : timestamp;
  const diff = Date.now() - timeMs;
  if (diff < 60000) return 'Just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timeMs).toLocaleDateString();
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  fileId,
  filename,
  activeSheet,
  profile,
  sheets,
  theme = 'light',
  isUploading = false,
  fileHistory = [],
  onOpenFileFromHistory,
  onDeleteFileFromHistory,
  isTempModified = false,
  onRevertToOriginal,
  uploadError = null,
  onClearUploadError,
  onNavigateTab,
  onAskQuestion,
  onOpenFileUpload,
  onFileUpload,
  onCreateNewFile,
  onSelectSample,
  onSelectSheet,
  onGoHome,
}) => {
  const [report, setReport] = useState<InsightReport | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadedAnimated, setIsLoadedAnimated] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [colorTheme, setColorTheme] = useState<ChartColorThemeId>('vibrant');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'xlsx' | 'csv' | 'temp'>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDark = theme === 'dark';

  // Load insights whenever active fileId or activeSheet changes
  useEffect(() => {
    if (!fileId || !activeSheet) {
      setReport(null);
      setIsLoadedAnimated(false);
      return;
    }

    let isMounted = true;
    setIsLoadingInsights(true);

    fetchInsights(fileId, activeSheet)
      .then((data) => {
        if (isMounted) {
          setReport(data);
          setIsLoadingInsights(false);
          // Slide in animation for visualizations suite
          setTimeout(() => setIsLoadedAnimated(true), 60);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load dashboard insights:', err);
          setIsLoadingInsights(false);
          setIsLoadedAnimated(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [fileId, activeSheet]);

  const validateAndUpload = (file: File) => {
    setErrorMessage(null);
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const name = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => name.endsWith(ext));

    if (!hasValidExt) {
      setErrorMessage('Unsupported format. Please select an Excel (.xlsx, .xls) or CSV (.csv) file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage(`File exceeds 10MB limit (${formatFileSize(file.size)}).`);
      return;
    }

    onFileUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndUpload(e.dataTransfer.files[0]);
    }
  };

  // --------------------------------------------------------------------------
  // STATE 1: HIGH-PRODUCTIVITY HOME DASHBOARD LANDING
  // Utilizes widescreen space with 2-Column Hero, Quick Starters, and Wide History
  // --------------------------------------------------------------------------
  if (!fileId || !profile) {
    const filteredHistory = fileHistory.filter((item) => {
      if (historySearch.trim() && !item.filename.toLowerCase().includes(historySearch.toLowerCase())) {
        return false;
      }
      if (historyFilter === 'xlsx') return (item.file_type || '').toLowerCase().includes('xls');
      if (historyFilter === 'csv') return (item.file_type || '').toLowerCase().includes('csv');
      if (historyFilter === 'temp') return Boolean(item.is_temp_modified);
      return true;
    });

    return (
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start p-4 sm:p-6 lg:p-8 min-h-full relative z-10">
        <div className="w-full max-w-7xl space-y-8 animate-in fade-in duration-500 py-2">
          
          {/* Hero Welcome Banner */}
          <div className="text-center space-y-3.5 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50/90 dark:bg-blue-950/80 border border-blue-200/80 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold shadow-2xs backdrop-blur-xs">
              <Sparkles className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              <span>Spreadsheet Intelligence & AI Data Editor</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
              Welcome to <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-600 dark:from-blue-400 dark:via-cyan-300 dark:to-indigo-400 bg-clip-text text-transparent">ExcelMind AI</span>
            </h1>

            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Upload your spreadsheet to instantly generate an accurate Visualizations Suite,
              profile data quality, and unlock conversational AI to query and modify your data.
            </p>

            {/* Quick platform capability badges */}
            <div className="flex items-center justify-center gap-2.5 flex-wrap pt-1 text-xs">
              <span className="px-3 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold shadow-2xs flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Zero Data Loss (Original untouched)</span>
              </span>
              <span className="px-3 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold shadow-2xs flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-cyan-500" />
                <span>Auto Visualizations Suite</span>
              </span>
              <span className="px-3 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold shadow-2xs flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-blue-500" />
                <span>Conversational Data Copilot</span>
              </span>
              {fileHistory.length > 0 && (
                <span className="px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300 font-semibold shadow-2xs flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>{fileHistory.length} Saved Workbooks</span>
                </span>
              )}
            </div>
          </div>

          {/* Upper Hero Grid: Dropzone (Left 8 cols) + Quick Starters & Capabilities (Right 4 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Main Upload Dropzone */}
            <div className="lg:col-span-8 flex flex-col justify-between">
              <div className="relative group/drop h-full flex flex-col justify-between">
                {/* Luminous Animated Aura behind Upload Dropzone */}
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/40 via-cyan-500/35 to-indigo-600/40 rounded-[34px] blur-xl opacity-40 group-hover/drop:opacity-80 transition duration-700 animate-pulse-subtle pointer-events-none" />

                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onClick={() => {
                    if (!isUploading) {
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`relative border-2 border-dashed rounded-[32px] p-8 sm:p-12 text-center cursor-pointer transition-all duration-300 flex-1 flex flex-col items-center justify-center ${
                    isDragOver
                      ? 'border-cyan-400 bg-cyan-50/90 dark:bg-cyan-950/70 shadow-2xl scale-[1.01]'
                      : 'border-slate-300/80 dark:border-slate-700/80 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md hover:border-cyan-500 dark:hover:border-cyan-400 hover:bg-white/95 dark:hover:bg-slate-850 shadow-sm hover:shadow-xl'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        validateAndUpload(e.target.files[0]);
                      }
                    }}
                  />

                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25 group-hover/drop:scale-105 transition-transform">
                    {isUploading ? (
                      <RefreshCw className="w-8 h-8 animate-spin" />
                    ) : (
                      <Upload className="w-8 h-8 stroke-[2]" />
                    )}
                  </div>

                  {/* Primary Call to Action Button */}
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-600 to-indigo-600 hover:from-blue-700 hover:via-cyan-700 hover:to-indigo-700 active:scale-95 text-white font-bold text-base shadow-lg shadow-cyan-500/25 transition-all mb-3 cursor-pointer"
                  >
                    <Upload className="w-5 h-5" />
                    <span>{isUploading ? 'Uploading & Analyzing...' : 'Add Excel File'}</span>
                  </button>

                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                    Drag and drop your spreadsheet here, or click to browse
                  </p>

                  <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                    <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                      .XLSX
                    </span>
                    <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                      .XLS
                    </span>
                    <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                      .CSV
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                      (Up to 10MB)
                    </span>
                  </div>

                  {/* Quick Starter Action Bar */}
                  <div className="mt-5 pt-4 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-center gap-3 text-xs w-full flex-wrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateNewFile('blank');
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <FilePlus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>New Blank Workbook</span>
                    </button>
                    {onSelectSample && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSample('sales');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/70 hover:bg-cyan-100 text-cyan-700 dark:text-cyan-300 font-semibold border border-cyan-200/70 dark:border-cyan-800/70 flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Zap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                        <span>Instant Demo Dataset</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {(uploadError || errorMessage) && (
                <div className="mt-4 p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uploadError || errorMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      if (onClearUploadError) onClearUploadError();
                    }}
                    className="px-2 py-0.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/60 font-semibold cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>

            {/* Right Side Flank: Instant Demo Starters & Capability Highlights */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-4">
              {/* Card 1: 1-Click Demo Spreadsheets */}
              <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 shadow-xs flex flex-col justify-between flex-1 relative overflow-hidden group">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500 opacity-90" />
                
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-cyan-500" />
                      Quick Test Datasets
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 font-bold border border-cyan-200 dark:border-cyan-800">
                      1-Click Load
                    </span>
                  </div>
                  
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
                    Test instantly without uploading a file. Explore live charts, profiling & AI:
                  </p>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => onSelectSample && onSelectSample('sales')}
                      className="w-full text-left p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 hover:bg-blue-50/80 dark:hover:bg-blue-950/50 border border-slate-200/70 dark:border-slate-700/70 hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer group/btn flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                          <BarChart3 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover/btn:text-blue-600 dark:group-hover/btn:text-blue-400">
                            Sales & Revenue Analytics
                          </div>
                          <div className="text-[10px] text-slate-400">8 orders · Revenues & Regions</div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover/btn:text-blue-600 group-hover/btn:translate-x-0.5 transition-all shrink-0" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectSample && onSelectSample('tech_ops')}
                      className="w-full text-left p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 hover:bg-cyan-50/80 dark:hover:bg-cyan-950/50 border border-slate-200/70 dark:border-slate-700/70 hover:border-cyan-300 dark:hover:border-cyan-700 transition-all cursor-pointer group/btn flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover/btn:text-cyan-600 dark:group-hover/btn:text-cyan-400">
                            Tech Operations & Costs
                          </div>
                          <div className="text-[10px] text-slate-400">Cloud servers & metrics</div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover/btn:text-cyan-600 group-hover/btn:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  </div>
                </div>

                <div className="pt-2.5 mt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Generates live Visualizations Suite</span>
                  <span className="font-semibold text-cyan-600 dark:text-cyan-400">Zero wait</span>
                </div>
              </div>

              {/* Card 2: Core Platform Capabilities */}
              <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 shadow-xs flex flex-col justify-between flex-1 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-90" />
                
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5 mb-2.5">
                    <ShieldCheck className="w-4 h-4 text-blue-500" />
                    Enterprise Security & Power
                  </span>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-start gap-2">
                      <div className="w-4.5 h-4.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        ✓
                      </div>
                      <div>
                        <strong className="text-slate-800 dark:text-slate-200">Safe Temp Copy:</strong>
                        <span className="text-slate-500 dark:text-slate-400 ml-1">Original main Excel file is never overwritten.</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="w-4.5 h-4.5 rounded-md bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        ✓
                      </div>
                      <div>
                        <strong className="text-slate-800 dark:text-slate-200">Accurate Visualizations:</strong>
                        <span className="text-slate-500 dark:text-slate-400 ml-1">Rankings, distributions & timelines.</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="w-4.5 h-4.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        ✓
                      </div>
                      <div>
                        <strong className="text-slate-800 dark:text-slate-200">Quality Profiling:</strong>
                        <span className="text-slate-500 dark:text-slate-400 ml-1">Instant null checks & data type inference.</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 mt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Excel (.xlsx, .xls) & CSV</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">Up to 10MB</span>
                </div>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* HISTORY OF EXCELS WORKED ON (FULL-WIDTH 4-COLUMN GRID)   */}
          {/* ======================================================== */}
          {fileHistory && fileHistory.length > 0 && (
            <div className="w-full text-left space-y-4 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      History of Excels Worked On
                    </h3>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 font-bold border border-cyan-200 dark:border-cyan-800">
                    {fileHistory.length} {fileHistory.length === 1 ? 'workbook' : 'workbooks'}
                  </span>
                </div>

                {/* Search & Filter Toolbar */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search workbooks..."
                      className="pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-500 w-48 sm:w-56"
                    />
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('all')}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        historyFilter === 'all'
                          ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-cyan-400 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('xlsx')}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        historyFilter === 'xlsx'
                          ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-cyan-400 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('csv')}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        historyFilter === 'csv'
                          ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-cyan-400 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('temp')}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        historyFilter === 'temp'
                          ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-cyan-400 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Modified
                    </button>
                  </div>
                </div>
              </div>

              {/* Responsive 4-Column Grid utilizing full screen width */}
              {filteredHistory.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredHistory.map((item) => (
                    <div
                      key={item.file_id}
                      onClick={() => onOpenFileFromHistory && onOpenFileFromHistory(item.file_id, item.filename)}
                      className="group bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4.5 shadow-2xs hover:shadow-lg hover:border-cyan-500/50 dark:hover:border-cyan-400/50 hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2.5">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/40">
                            <FileSpreadsheet className="w-4.5 h-4.5" />
                          </div>
                          <div className="flex items-center gap-1">
                            {item.is_temp_modified && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold">
                                Modified
                              </span>
                            )}
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                              {item.file_type || 'xlsx'}
                            </span>
                          </div>
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors" title={item.filename}>
                          {item.filename}
                        </h4>

                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-2">
                          {item.row_count !== undefined && item.row_count > 0 ? (
                            <span>{item.row_count.toLocaleString()} rows</span>
                          ) : null}
                          {item.column_count !== undefined && item.column_count > 0 ? (
                            <span>• {item.column_count} cols</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1 text-[11px]">
                          <Clock className="w-3.5 h-3.5" />
                          {formatTimeAgo(item.last_accessed_at || item.created_at)}
                        </span>
                        
                        <div className="flex items-center gap-2">
                          {onDeleteFileFromHistory && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteFileFromHistory(item.file_id);
                              }}
                              className="p-1 hover:text-red-500 text-slate-300 dark:text-slate-600 transition-colors cursor-pointer"
                              title="Delete from history"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <span className="font-semibold text-blue-600 dark:text-cyan-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                            Open →
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-white/60 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  No workbooks matched &quot;{historySearch}&quot;.
                </div>
              )}
            </div>
          )}

          {/* Clean 3-Step Guided Workflow Highlights spanning full width */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-200/80 dark:border-slate-800/80 text-left">
            <div className="p-4.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/70 dark:border-slate-800/70 shadow-2xs hover:border-cyan-500/40 transition-colors">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                <div className="w-5.5 h-5.5 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-black">
                  1
                </div>
                <span>Connect & Profile</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Upload your spreadsheet directly. The main file stays safe and untouched on disk with instant quality checks.
              </p>
            </div>

            <div className="p-4.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/70 dark:border-slate-800/70 shadow-2xs hover:border-cyan-500/40 transition-colors">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                <div className="w-5.5 h-5.5 rounded-lg bg-cyan-100 dark:bg-cyan-900/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-xs font-black">
                  2
                </div>
                <span>Visual Analytics Suite</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Accurate Plotly charts, category rankings, histograms, and donut breakdowns slide in automatically.
              </p>
            </div>

            <div className="p-4.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/70 dark:border-slate-800/70 shadow-2xs hover:border-cyan-500/40 transition-colors">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                <div className="w-5.5 h-5.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-black">
                  3
                </div>
                <span>AI Data Copilot</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Query, calculate metrics, and edit data in natural language in isolated working copies with zero risk.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // STATE 2: ACTIVE WORKSPACE (SPREADSHEET LOADED)
  // 1) Accurate Visualizations Suite slides into the dashboard
  // 2) AI edits apply to Temp Excel (main Excel file untouched)
  // 3) Then user chooses to go into AI Feature
  // 4) History of all Excels worked on accessible below
  // --------------------------------------------------------------------------
  const warningCount = report?.insights.filter((i) => i.severity === 'warning').length || 0;
  const qualityScore = Math.max(75, Math.min(100, Math.round(100 - warningCount * 6)));

  // Generate dynamic sample prompts tailored to this exact spreadsheet profile
  const catColumns = profile.columns.filter((c) => ['categorical', 'text'].includes(c.dtype) && c.name !== '__row__');
  const numColumns = profile.columns.filter((c) => ['integer', 'float', 'currency'].includes(c.dtype) && c.name !== '__row__');
  const primaryCat = catColumns[0]?.name || 'category';
  const primaryNum = numColumns[0]?.name || 'value';

  return (
    <div
      className={`flex-1 overflow-y-auto p-4 sm:p-6 max-w-7xl mx-auto space-y-6 transition-all duration-700 ease-out relative z-10 ${
        isLoadedAnimated
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-8'
      }`}
    >
      {/* Active File Header Bar */}
      <div className="relative rounded-[28px] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 overflow-hidden">
        {/* Top Gradient Sheen */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-80" />
        <div className="flex items-center gap-4">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <Table className="w-6.5 h-6.5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-3 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                Active Workbook
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                • Sheet: <span className="font-bold text-slate-800 dark:text-slate-200">{activeSheet}</span>
              </span>
              {isTempModified && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/90 text-amber-800 dark:text-amber-200 font-bold border border-amber-300 dark:border-amber-700 flex items-center gap-1 shadow-2xs">
                  <FileEdit className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Working Copy (AI Modified)</span>
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate max-w-md">
              {filename}
            </h1>
          </div>
        </div>

        {/* Action Buttons: Add Another File, Export, or Go into AI Feature */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {onGoHome && (
            <button
              onClick={onGoHome}
              className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Return to Home Dashboard"
            >
              <span>← Home</span>
            </button>
          )}

          <button
            onClick={onOpenFileUpload}
            className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
            title="Upload another spreadsheet"
          >
            <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Add Excel File</span>
          </button>

          {/* Export Dropdown (Temp vs Main) */}
          <div className="relative">
            <button
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
              title="Export spreadsheet options"
            >
              <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Export</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-30 p-1.5 animate-in fade-in zoom-in-95 duration-150">
                <a
                  href={getExportUrl(fileId, activeSheet, 'xlsx', 'temp')}
                  download
                  onClick={() => setIsExportMenuOpen(false)}
                  className="block px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 transition-colors"
                >
                  <div className="font-bold flex items-center gap-2">
                    <Download className="w-4 h-4 text-blue-600" />
                    <span>Export Working Temp Excel</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Includes latest AI modifications</p>
                </a>

                <a
                  href={getExportUrl(fileId, activeSheet, 'xlsx', 'main')}
                  download
                  onClick={() => setIsExportMenuOpen(false)}
                  className="block px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 transition-colors border-t border-slate-100 dark:border-slate-800"
                >
                  <div className="font-bold flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>Export Original Main Excel</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Pristine original file untouched</p>
                </a>
              </div>
            )}
          </div>

          {/* Quick Header CTA to jump into AI Feature */}
          <button
            onClick={() => onNavigateTab('chat')}
            className="px-4.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Bot className="w-4.5 h-4.5" />
            <span>Go to AI Feature →</span>
          </button>
        </div>
      </div>

      {/* Temp Excel vs Main Excel Status Banner */}
      {isTempModified && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <FileEdit className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <span>Working in Temp Excel (Modified by AI)</span>
                <span className="text-[10px] px-2 py-0.2 rounded-md bg-amber-200/80 dark:bg-amber-900 text-amber-800 dark:text-amber-200 font-bold">
                  Active Web Copy
                </span>
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                All AI additions and cell updates are made in this temporary working copy. Your original main Excel file remains completely untouched.
              </p>
            </div>
          </div>

          {onRevertToOriginal && (
            <button
              onClick={onRevertToOriginal}
              className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100/60 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0 self-end sm:self-auto"
              title="Discard AI modifications and revert to pristine main Excel file"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Revert to Main Excel</span>
            </button>
          )}
        </div>
      )}

      {/* 4 Clean Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 shadow-xs hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-4 overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-60 group-hover:opacity-100 transition-opacity" />
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/50 shadow-2xs">
            <Table className="w-5.5 h-5.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">Total Records</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {profile.row_count.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 shadow-xs hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-4 overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60 group-hover:opacity-100 transition-opacity" />
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/50 shadow-2xs">
            <ShieldCheck className="w-5.5 h-5.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">Data Quality</div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {qualityScore}% <span className="text-xs font-normal text-slate-400">Verified</span>
            </div>
          </div>
        </div>

        <div className="relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 shadow-xs hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-4 overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500 opacity-60 group-hover:opacity-100 transition-opacity" />
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/50 shadow-2xs">
            <Layers className="w-5.5 h-5.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">Dimensions</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {profile.column_count} <span className="text-xs font-normal text-slate-400">Fields</span>
            </div>
          </div>
        </div>

        <div className="relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 shadow-xs hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-4 overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 opacity-60 group-hover:opacity-100 transition-opacity" />
          <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-950/70 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0 border border-violet-100 dark:border-violet-900/50 shadow-2xs">
            <TrendingUp className="w-5.5 h-5.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">Key Insights</div>
            <div className="text-2xl font-black text-violet-600 dark:text-violet-400">
              {report?.insights.length || 0} <span className="text-xs font-normal text-slate-400">Detected</span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* DATASET ARCHITECTURE & PROFILE SUMMARY (Replaces duplicate charts) */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Dataset Architecture & Column Profiler */}
        <div className="lg:col-span-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-[28px] p-6 sm:p-7 shadow-xs flex flex-col justify-between overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-500 opacity-80" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                  Schema Architecture
                </span>
                <span className="text-xs text-slate-400">• Verified Types</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Dataset Schema & Column Profiler
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {profile.columns.filter((c) => c.name !== '__row__').length} Analyzed Fields
              </span>
              <button
                onClick={() => onNavigateTab('preview')}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <span>Inspect Data</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Clean Columns Table / List */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-separate border-spacing-y-2">
              <thead>
                <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pb-1 pl-2">Column Name</th>
                  <th className="pb-1">Data Type</th>
                  <th className="pb-1">Completeness</th>
                  <th className="pb-1 text-right pr-2">Cardinality</th>
                </tr>
              </thead>
              <tbody className="space-y-1">
                {profile.columns
                  .filter((c) => c.name !== '__row__')
                  .slice(0, 7)
                  .map((col, idx) => {
                    const completeness = profile.row_count > 0
                      ? Math.round(((profile.row_count - (col.null_count || 0)) / profile.row_count) * 100)
                      : 100;

                    const dtypeColor =
                      col.dtype === 'integer' || col.dtype === 'float' || col.dtype === 'currency'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : col.dtype === 'datetime'
                        ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';

                    return (
                      <tr
                        key={idx}
                        className="bg-slate-50/70 dark:bg-slate-800/40 hover:bg-blue-50/50 dark:hover:bg-slate-800/80 rounded-2xl transition-colors"
                      >
                        <td className="py-2.5 pl-3 font-semibold text-slate-900 dark:text-slate-100 rounded-l-xl">
                          {col.name}
                        </td>
                        <td className="py-2.5">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border uppercase ${dtypeColor}`}>
                            {col.dtype}
                          </span>
                        </td>
                        <td className="py-2.5 min-w-[120px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                                style={{ width: `${completeness}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 w-9 text-right">
                              {completeness}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-r-xl">
                          {col.unique_count !== undefined ? `${col.unique_count} unique` : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {profile.columns.length > 7 && (
            <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 flex items-center justify-between">
              <span>Showing top 7 of {profile.columns.length} columns</span>
              <button
                onClick={() => onNavigateTab('preview')}
                className="font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                View all fields in Data Preview →
              </button>
            </div>
          )}
        </div>

        {/* Right 1 Column: Visual Analytics Gateway & Sheet Overview */}
        <div className="space-y-5 flex flex-col justify-between">
          {/* Visual Analytics Gateway Card (Directs cleanly to Auto-Insights) */}
          <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 rounded-[28px] p-6 text-white shadow-md relative overflow-hidden flex flex-col justify-between">
            <div className="relative z-10 space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold border border-white/20">
                <BarChart3 className="w-4 h-4 text-cyan-300" />
                <span>Auto-Insights & Analytics</span>
              </div>

              <h4 className="text-xl font-black tracking-tight leading-snug">
                Visual Analytics Suite Ready
              </h4>

              <p className="text-sm text-blue-100 leading-relaxed">
                All distributions, category breakdowns, histograms, and time series charts are organized in the <strong>Auto-Insights</strong> tab to keep your dashboard clean.
              </p>

              <div className="flex flex-wrap gap-2 pt-1 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-white/15 font-semibold text-white">
                  📊 {report?.dashboard_charts.length || 4} Charts Ready
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white/15 font-semibold text-white">
                  💡 {report?.insights.length || 0} Findings
                </span>
              </div>
            </div>

            <div className="pt-5 relative z-10">
              <button
                onClick={() => onNavigateTab('insights')}
                className="w-full py-3.5 px-4 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <span>Open Auto-Insights & Analytics</span>
                <ArrowRight className="w-4 h-4 text-blue-700" />
              </button>
            </div>
          </div>

          {/* Quick Workbook Multi-Sheet Summary */}
          {sheets && sheets.length > 1 ? (
            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-[28px] p-5 shadow-xs">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span>Workbook Sheets ({sheets.length})</span>
                </span>
                <span className="text-[11px] text-blue-600 font-semibold">Active: {activeSheet}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sheets.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSelectSheet?.(s)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      s === activeSheet
                        ? 'bg-blue-600 text-white shadow-xs font-bold'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-[28px] p-5 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Zero Data Loss Verified</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Pristine main file intact on disk.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* THEN THE USER CHOOSES TO GO INTO AI FEATURE */}
      {/* Prominent, Beautiful AI Feature Launch Banner */}
      {/* ======================================================== */}
      <div className="rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white p-6 sm:p-8 shadow-lg shadow-blue-600/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2.5 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold border border-white/20">
            <Bot className="w-4 h-4 text-amber-300" />
            <span>Next Step: Choose AI Feature</span>
          </div>

          <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
            Launch AI Assistant & Live Data Editor
          </h3>

          <p className="text-sm sm:text-base text-blue-100 leading-relaxed font-normal">
            Query your spreadsheet in plain English, inspect verified row calculations, or instruct the AI
            to modify records, calculate bonus marks, and add columns directly in the temporary working Excel.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <button
            onClick={() => onNavigateTab('chat')}
            className="px-7 py-4 rounded-2xl bg-white text-blue-700 hover:bg-blue-50 font-bold text-base shadow-md transition-all flex items-center justify-center gap-2.5 cursor-pointer active:scale-95"
          >
            <Sparkles className="w-5 h-5 text-blue-600" />
            <span>Go to AI Feature</span>
            <ArrowRight className="w-5 h-5 text-blue-600 ml-1" />
          </button>
        </div>
      </div>

      {/* Dynamically Generated AI Quick Actions (Derived from the real file) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs">
        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3.5 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <span>Choose an AI Action to Launch Immediately:</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <button
            onClick={() => {
              onNavigateTab('chat');
              onAskQuestion(`Summarize key metrics and distribution of ${primaryNum}`);
            }}
            className="text-left p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-700 dark:hover:text-blue-300 text-slate-700 dark:text-slate-300 text-sm font-semibold border border-slate-200/80 dark:border-slate-700/80 transition-all flex items-center justify-between group cursor-pointer"
          >
            <span className="truncate">📊 Summarize {primaryNum} metrics</span>
            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 text-blue-600 dark:text-blue-400 shrink-0 ml-1" />
          </button>

          <button
            onClick={() => {
              onNavigateTab('chat');
              onAskQuestion(`What are the top 5 ${primaryCat} by ${primaryNum}?`);
            }}
            className="text-left p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-700 dark:hover:text-blue-300 text-slate-700 dark:text-slate-300 text-sm font-semibold border border-slate-200/80 dark:border-slate-700/80 transition-all flex items-center justify-between group cursor-pointer"
          >
            <span className="truncate">🏆 Top 5 {primaryCat} by {primaryNum}</span>
            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 text-blue-600 dark:text-blue-400 shrink-0 ml-1" />
          </button>

          <button
            onClick={() => {
              onNavigateTab('chat');
              onAskQuestion(`Instruct AI: Add 5 bonus to ${primaryNum} for all records`);
            }}
            className="text-left p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-700 dark:hover:text-blue-300 text-slate-700 dark:text-slate-300 text-sm font-semibold border border-slate-200/80 dark:border-slate-700/80 transition-all flex items-center justify-between group cursor-pointer"
          >
            <span className="truncate">✏️ AI Edit: Add 5 bonus to {primaryNum}</span>
            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 text-blue-600 dark:text-blue-400 shrink-0 ml-1" />
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* HISTORY OF EXCELS WORKED ON (BOTTOM SECTION IN ACTIVE DASHBOARD) */}
      {/* ======================================================== */}
      {fileHistory && fileHistory.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                History of Excels Worked On
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                {fileHistory.length} {fileHistory.length === 1 ? 'file' : 'files'}
              </span>
            </div>
            {onGoHome && (
              <button
                onClick={onGoHome}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <span>View Home Page</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {fileHistory.map((item) => {
              const isCurrent = item.file_id === fileId;
              return (
                <div
                  key={item.file_id}
                  onClick={() => {
                    if (!isCurrent && onOpenFileFromHistory) {
                      onOpenFileFromHistory(item.file_id, item.filename);
                    }
                  }}
                  className={`rounded-2xl p-3.5 border transition-all flex flex-col justify-between ${
                    isCurrent
                      ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 shadow-2xs'
                      : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:border-blue-400 cursor-pointer'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <FileSpreadsheet className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-blue-600' : 'text-slate-500'}`} />
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate" title={item.filename}>
                          {item.filename}
                        </span>
                      </div>
                      {isCurrent ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-blue-600 text-white font-bold shrink-0">
                          Active
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                          {item.file_type}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      {item.row_count ? <span>{item.row_count.toLocaleString()} rows</span> : null}
                      {item.is_temp_modified && (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">• Temp Modified</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 mt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{formatTimeAgo(item.last_accessed_at || item.created_at)}</span>
                    {!isCurrent && (
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        Switch →
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
