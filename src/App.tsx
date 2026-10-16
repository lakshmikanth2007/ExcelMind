import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Table,
  Sparkles,
  Send,
  Mic,
  MicOff,
  AlertCircle,
  LayoutDashboard,
} from 'lucide-react';

import { Header } from './components/common/Header';
import { FileUploader } from './components/upload/FileUploader';
import { UploadModal } from './components/upload/UploadModal';
import { ExecutiveDashboard } from './components/dashboard/ExecutiveDashboard';
import { LeftRail } from './components/layout/LeftRail';
import { DataPreview } from './components/spreadsheet/DataPreview';
import { EvidencePanel } from './components/results/EvidencePanel';
import { MessageBubble, ChatMessage } from './components/chat/MessageBubble';
import { ActiveFilterChips } from './components/chat/ActiveFilterChips';
import { InsightsDashboard } from './components/insights/InsightsDashboard';
import { ParticleBackground } from './components/common/ParticleBackground';

import {
  uploadSpreadsheet,
  loadSampleSpreadsheet,
  createNewSpreadsheet,
  fetchSchema,
  deleteSpreadsheet,
  listUserFiles,
  revertSpreadsheet,
  fetchSheets,
} from './api/files';
import { clearOwnerToken, setOwnerToken } from './api/client';
import { sendNaturalLanguageQuery, updateChartType } from './api/queries';
import {
  SheetProfile,
  QueryResponse,
  UploadResponse,
  FileHistoryItem,
  ChartData,
} from './api/types';
import { useSpeechInput } from './hooks/useSpeechInput';
import { useSpeechOutput } from './hooks/useSpeechOutput';

type ActiveViewMode = 'dashboard' | 'chat' | 'preview' | 'insights';
type ThemeMode = 'light' | 'dark';

export default function App() {
  // Theme state
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('excelmind_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // Apply dark class to <html> element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('excelmind_theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // File & Sheet state
  const [fileId, setFileId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [sheets, setSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [profile, setProfile] = useState<SheetProfile | undefined>(undefined);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isTempModified, setIsTempModified] = useState<boolean>(false);
  const [isHomeView, setIsHomeView] = useState<boolean>(true);

  // File history state
  const [fileHistory, setFileHistory] = useState<FileHistoryItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('excelmind_file_history');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  // View state - Dashboard is 1st view!
  const [viewMode, setViewMode] = useState<ActiveViewMode>('dashboard');

  // Load history from backend on mount
  useEffect(() => {
    listUserFiles()
      .then((res) => {
        if (res.files && res.files.length > 0) {
          setFileHistory((prev) => {
            const map = new Map<string, FileHistoryItem>();
            prev.forEach((f) => map.set(f.file_id, f));
            res.files.forEach((f) => {
              const existing = map.get(f.file_id);
              map.set(f.file_id, { ...existing, ...f });
            });
            const merged = Array.from(map.values()).sort(
              (a, b) => (b.last_accessed_at || b.created_at) - (a.last_accessed_at || a.created_at)
            );
            try {
              localStorage.setItem('excelmind_file_history', JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      })
      .catch(() => {});
  }, []);

  // Sync fileHistory to localStorage
  const saveHistory = (items: FileHistoryItem[]) => {
    setFileHistory(items);
    try {
      localStorage.setItem('excelmind_file_history', JSON.stringify(items));
    } catch {}
  };

  // Upload error banner state
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [activeFilters, setActiveFilters] = useState<
    Array<{ column: string; op: string; value: any }>
  >([]);

  // Selected Result for Evidence Panel
  const [currentResult, setCurrentResult] = useState<QueryResponse | null>(null);

  // Speech Hooks
  const speechOutput = useSpeechOutput();
  const speechInput = useSpeechInput();

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // No mock data auto-loaded - clean dashboard initial state

  // Sync speech input transcript into text box
  useEffect(() => {
    if (speechInput.transcript) {
      setInputQuery(speechInput.transcript);
    }
  }, [speechInput.transcript]);

  // Scroll to bottom of chat on new message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isQuerying]);

  // Handle File Upload
  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const res = await uploadSpreadsheet(file);
      initWorkbook(res);
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadError(`Upload failed: ${err.message || 'Could not parse or process spreadsheet'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Create New Spreadsheet
  const handleCreateNewFile = async (template: string = 'blank') => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const res = await createNewSpreadsheet('New_Workbook.xlsx', template);
      initWorkbook(res);
    } catch (err: any) {
      console.error('Failed to create new file:', err);
      setUploadError(`Error creating spreadsheet: ${err.message || 'Failed'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Pre-generated Sample Workbooks
  const handleSelectSample = async (sampleName: string) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const res = await loadSampleSpreadsheet(sampleName);
      initWorkbook(res);
    } catch (err: any) {
      console.error('Failed to load sample:', err);
      setUploadError(`Failed to load sample: ${err.message || 'Error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Initialize Loaded Workbook
  const initWorkbook = (res: UploadResponse) => {
    setUploadError(null);
    if (res.owner_token) {
      setOwnerToken(res.owner_token);
    }
    setFileId(res.file_id);
    setFilename(res.filename);
    setSheets(res.sheets);
    setActiveSheet(res.active_sheet);
    setProfile(res.profile_summary);
    setIsTempModified(res.is_temp_modified || false);
    setIsHomeView(false);
    setViewMode('dashboard');

    // Add / update in history
    const historyItem: FileHistoryItem = {
      file_id: res.file_id,
      filename: res.filename,
      file_type: res.file_type,
      sheets: res.sheets,
      row_count: res.profile_summary?.row_count,
      column_count: res.profile_summary?.column_count,
      created_at: Date.now(),
      last_accessed_at: Date.now(),
      is_temp_modified: res.is_temp_modified || false,
    };
    setFileHistory((prev) => {
      const filtered = prev.filter((f) => f.file_id !== res.file_id);
      const updated = [historyItem, ...filtered];
      saveHistory(updated);
      return updated;
    });

    setMessages([
      {
        id: 'welcome',
        sender: 'assistant',
        text: `Loaded "${res.filename}" with sheet "${res.active_sheet}" (${res.profile_summary.row_count.toLocaleString()} records, ${res.profile_summary.column_count} columns). You can ask questions, instruct AI to modify values in the temp Excel, or view charts on the Executive Dashboard!`,
        timestamp: Date.now(),
      },
    ]);
    setCurrentResult(null);
    setActiveFilters([]);
  };

  // Open file from history
  const handleOpenFileFromHistory = async (targetFileId: string, targetFilename: string) => {
    setIsUploading(true);
    try {
      const sheetsRes = await fetchSheets(targetFileId);
      const sheetNames = sheetsRes.sheets.map((s) => s.name);
      const targetSheet = sheetNames[0] || 'Sheet1';
      const schemaRes = await fetchSchema(targetFileId, targetSheet);

      setFileId(targetFileId);
      setFilename(targetFilename || schemaRes.filename || 'Workbook.xlsx');
      setSheets(sheetNames);
      setActiveSheet(targetSheet);
      setProfile(schemaRes.profile);
      setIsTempModified(schemaRes.is_temp_modified || false);
      setIsHomeView(false);
      setViewMode('dashboard');

      // Update last_accessed_at in history
      setFileHistory((prev) => {
        const updated = prev.map((f) =>
          f.file_id === targetFileId
            ? { ...f, last_accessed_at: Date.now(), is_temp_modified: schemaRes.is_temp_modified || false }
            : f
        ).sort((a, b) => (b.last_accessed_at || b.created_at) - (a.last_accessed_at || a.created_at));
        saveHistory(updated);
        return updated;
      });

      setMessages([
        {
          id: `open-${Date.now()}`,
          sender: 'assistant',
          text: `Opened "${targetFilename || schemaRes.filename}" (${schemaRes.profile.row_count.toLocaleString()} records, ${schemaRes.profile.column_count} columns).`,
          timestamp: Date.now(),
        },
      ]);
      setCurrentResult(null);
      setActiveFilters([]);
    } catch (err: any) {
      console.error('Failed to open spreadsheet from history:', err);
      alert(`Could not open spreadsheet: ${err.message || 'Error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Delete file from history
  const handleDeleteFileFromHistory = async (targetFileId: string) => {
    try {
      await deleteSpreadsheet(targetFileId);
    } catch (err) {
      console.error('Delete history error:', err);
    }
    const updated = fileHistory.filter((f) => f.file_id !== targetFileId);
    saveHistory(updated);

    if (fileId === targetFileId) {
      setFileId(null);
      setFilename('');
      setSheets([]);
      setActiveSheet('');
      setProfile(undefined);
      setIsTempModified(false);
      setIsHomeView(true);
      setMessages([]);
    }
  };

  // Revert temp working copy back to original main Excel file
  const handleRevertToOriginal = async () => {
    if (!fileId) return;
    setIsUploading(true);
    try {
      const res = await revertSpreadsheet(fileId, activeSheet);
      setProfile(res.profile);
      setIsTempModified(false);

      // Update history item
      setFileHistory((prev) => {
        const updated = prev.map((f) =>
          f.file_id === fileId ? { ...f, is_temp_modified: false } : f
        );
        saveHistory(updated);
        return updated;
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `revert-${Date.now()}`,
          sender: 'assistant',
          text: 'Reverted temp working Excel back to your original pristine main Excel file.',
          timestamp: Date.now(),
        },
      ]);
    } catch (err: any) {
      console.error('Revert error:', err);
      alert(`Could not revert: ${err.message || 'Error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGoHome = () => {
    setIsHomeView(true);
  };

  const handleResumeWorkspace = () => {
    setIsHomeView(false);
    setViewMode('dashboard');
  };

  // Handle Sheet Change
  const handleSheetChange = async (newSheet: string) => {
    if (newSheet === activeSheet || !fileId) return;
    setActiveSheet(newSheet);
    try {
      const schemaRes = await fetchSchema(fileId, newSheet);
      setProfile(schemaRes.profile);
      setMessages((prev) => [
        ...prev,
        {
          id: `sheet-switch-${Date.now()}`,
          sender: 'assistant',
          text: `Switched active sheet to "${newSheet}" (${schemaRes.profile.row_count.toLocaleString()} records, ${schemaRes.profile.column_count} columns).`,
          timestamp: Date.now(),
        },
      ]);
      setCurrentResult(null);
      setActiveFilters([]);
    } catch (err) {
      console.error('Failed to switch sheet:', err);
    }
  };

  // Handle Delete Data (Privacy feature)
  const handleDeleteData = async () => {
    if (!fileId) return;
    if (confirm('Are you sure you want to delete this spreadsheet and clear all session data?')) {
      try {
        await deleteSpreadsheet(fileId);
      } catch (err) {
        console.error('Delete error:', err);
      }
      clearOwnerToken();
      setFileId(null);
      setFilename('');
      setSheets([]);
      setActiveSheet('');
      setProfile(undefined);
      setMessages([]);
      setCurrentResult(null);
      setActiveFilters([]);
      setViewMode('dashboard');
    }
  };

  // Execute Query or Modification Instruction
  const handleSendQuery = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || !fileId || isQuerying) return;

    if (speechInput.isListening) {
      speechInput.stopListening();
    }
    speechInput.clearTranscript();
    setInputQuery('');

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsQuerying(true);

    try {
      const res = await sendNaturalLanguageQuery(fileId, {
        question: textToSend,
        sheet: activeSheet,
        session_id: sessionId,
      });

      setSessionId(res.session_id);
      res.question = queryText;

      // Add assistant message
      const assistantMsg: ChatMessage = {
        id: `assistant-${res.result_id || Date.now()}`,
        sender: 'assistant',
        text: res.answer,
        response: res,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Speak answer if audio is enabled
      if (speechOutput.isEnabled && res.answer) {
        speechOutput.speak(res.answer);
      }

      // Update active evidence if ok result
      if (res.status === 'ok') {
        setCurrentResult(res);

        // If data was modified live in spreadsheet, refresh schema and profile immediately!
        if (res.result_id === 'modified') {
          setIsTempModified(true);
          fetchSchema(fileId, activeSheet)
            .then((s) => setProfile(s.profile))
            .catch(() => {});

          setFileHistory((prev) => {
            const updated = prev.map((f) =>
              f.file_id === fileId ? { ...f, is_temp_modified: true } : f
            );
            saveHistory(updated);
            return updated;
          });
        }

        // Update active filters chip display if plan has filters
        if (res.plan && res.plan.filters) {
          setActiveFilters(res.plan.filters);
        }
      }
    } catch (err: any) {
      console.error('Query execution error:', err);
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `Sorry, I encountered an issue processing your query: ${err.message || 'Unknown error'}. Please try rephrasing or inspect the data preview.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsQuerying(false);
    }
  };

  // Handle Chart Type Switch in Evidence Panel
  const handleUpdateChartType = (newType: string) => {
    if (!currentResult) return;
    const VIBRANT_PALETTE = [
      '#2563EB', '#059669', '#7C3AED', '#D97706', '#EC4899', '#0891B2',
      '#EA580C', '#6366F1', '#10B981', '#F43F5E', '#8B5CF6', '#06B6D4',
      '#F59E0B', '#3B82F6'
    ];

    const existingChart = currentResult.chart;
    if (existingChart) {
      const existingTrace = existingChart.plotly?.data?.[0] || {};
      const labels = existingTrace.labels || existingTrace.x || [];
      const values = existingTrace.values || existingTrace.y || [];

      const newChart: ChartData = {
        ...existingChart,
        type: newType as any,
        plotly: {
          data: [{
            ...existingTrace,
            type: newType === 'pie' ? 'pie' : (newType === 'line' || newType === 'scatter' ? 'scatter' : 'bar'),
            mode: newType === 'line' ? 'lines+markers' : (newType === 'scatter' ? 'markers' : undefined),
            labels: newType === 'pie' ? labels : undefined,
            values: newType === 'pie' ? values : undefined,
            x: newType === 'pie' ? undefined : labels,
            y: newType === 'pie' ? undefined : values,
            hole: newType === 'pie' ? 0.45 : undefined,
            textinfo: newType === 'pie' ? 'percent+label' : undefined,
            hoverinfo: newType === 'pie' ? 'label+value+percent' : undefined,
            marker: {
              ...existingTrace.marker,
              colors: newType === 'pie' ? VIBRANT_PALETTE : undefined,
              color: newType === 'pie'
                ? undefined
                : (newType === 'bar' ? labels.map((_: any, i: number) => VIBRANT_PALETTE[i % VIBRANT_PALETTE.length]) : '#2563EB'),
              line: { color: '#ffffff', width: newType === 'pie' ? 2 : 1.5 },
            },
          }],
          layout: {
            ...existingChart.plotly?.layout,
            margin: newType === 'pie' ? { t: 40, r: 25, l: 25, b: 35 } : { t: 40, r: 25, l: 55, b: 65 },
            xaxis: newType === 'pie' ? undefined : existingChart.plotly?.layout?.xaxis,
            yaxis: newType === 'pie' ? undefined : existingChart.plotly?.layout?.yaxis,
          },
        },
      };
      setCurrentResult((prev) => (prev ? { ...prev, chart: newChart } : null));
    }
  };

  // Sample prompt suggestions based on sheet profile
  const samplePrompts = [
    'How many total records are there in this sheet?',
    'Summarize records by category with a chart',
    'Show top 5 records by highest values',
    'Calculate average and distribution for numerical columns',
    'Instruct AI to update a record or add a new column',
  ];

  return (
    <div className={`flex flex-col h-screen w-screen bg-slate-100 dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100 font-sans transition-colors ${theme}`}>
      {/* Top Header */}
      <Header
        filename={filename}
        activeSheet={activeSheet}
        isSpeechEnabled={speechOutput.isEnabled}
        onToggleSpeech={speechOutput.toggleEnabled}
        onDeleteData={fileId ? handleDeleteData : undefined}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenFileUpload={() => setIsUploadModalOpen(true)}
        onCreateNewSheet={() => handleCreateNewFile('blank')}
        onGoHome={handleGoHome}
        isTempModified={isTempModified}
        onRevertToOriginal={handleRevertToOriginal}
        isHomeView={isHomeView || !fileId}
        onResumeWorkspace={fileId ? handleResumeWorkspace : undefined}
      />

      {(!fileId || isHomeView) ? (
        // State 0: Executive Welcome Dashboard & Centered Upload & History with Cyan Glowing Particles
        <div className="flex-1 relative overflow-y-auto min-w-0 bg-slate-50/60 dark:bg-slate-950 dashboard-ambient-bg bg-dot-matrix transition-colors">
          {/* Cyan glowing moving particles & atmospheric background glow on Home Page */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
            <ParticleBackground />
            <div className="absolute -top-36 -left-36 w-[34rem] h-[34rem] rounded-full bg-gradient-to-tr from-blue-600/30 via-cyan-400/25 to-indigo-500/20 blur-3xl animate-float-1" />
            <div className="absolute top-1/4 -right-36 w-[34rem] h-[34rem] rounded-full bg-gradient-to-bl from-purple-600/25 via-fuchsia-500/20 to-pink-500/20 blur-3xl animate-float-2" />
            <div className="absolute -bottom-36 left-1/4 w-[36rem] h-[36rem] rounded-full bg-gradient-to-tr from-emerald-500/20 via-teal-400/20 to-cyan-500/15 blur-3xl animate-float-3" />
            <div className="absolute top-2/3 right-1/4 w-[28rem] h-[28rem] rounded-full bg-gradient-to-tl from-indigo-500/20 via-rose-500/15 to-amber-400/10 blur-3xl animate-float-4" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[42rem] h-[28rem] rounded-full bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-indigo-500/10 blur-3xl animate-pulse-subtle" />
          </div>

          <div className="relative z-10 min-h-full flex flex-col">
            <ExecutiveDashboard
              fileId={null}
              filename={filename}
              activeSheet={activeSheet}
              sheets={sheets}
              theme={theme}
              isUploading={isUploading}
              fileHistory={fileHistory}
              onOpenFileFromHistory={handleOpenFileFromHistory}
              onDeleteFileFromHistory={handleDeleteFileFromHistory}
              isTempModified={isTempModified}
              onRevertToOriginal={handleRevertToOriginal}
              uploadError={uploadError}
              onClearUploadError={() => setUploadError(null)}
              onNavigateTab={(tab) => {
                setIsHomeView(false);
                setViewMode(tab);
              }}
              onAskQuestion={(q) => {
                setIsHomeView(false);
                handleSendQuery(q);
              }}
              onOpenFileUpload={() => setIsUploadModalOpen(true)}
              onFileUpload={handleFileUpload}
              onCreateNewFile={handleCreateNewFile}
              onGoHome={handleGoHome}
            />
          </div>
        </div>
      ) : (
        // State 1: Active Spreadsheet Workspace
        <div className="flex-1 flex overflow-hidden">
          {/* Left Rail: Sheet Tabs & Column Schemas */}
          <LeftRail
            fileId={fileId}
            sheets={sheets}
            activeSheet={activeSheet}
            onSelectSheet={handleSheetChange}
            profile={profile}
            onOpenFileUpload={() => setIsUploadModalOpen(true)}
            onCreateNewSheet={() => handleCreateNewFile('blank')}
          />

          {/* Center Main Workspace */}
          <div className="flex-1 flex flex-col min-w-0 bg-slate-50/60 dark:bg-slate-950 dashboard-ambient-bg bg-dot-matrix transition-colors relative overflow-hidden">
            {/* Ambient Floating Gradient Orbs & Glowing Blue/Cyan Moving Particles */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
              {/* Glowing Blue / Cyan Particle Canvas */}
              <ParticleBackground />

              {/* Orb 1: Radiant Blue & Sky Cyan */}
              <div className="absolute -top-36 -left-36 w-[32rem] h-[32rem] rounded-full bg-gradient-to-tr from-blue-600/30 via-cyan-400/25 to-indigo-500/20 blur-3xl animate-float-1" />
              {/* Orb 2: Vivid Violet & Fuchsia Purple */}
              <div className="absolute top-1/4 -right-36 w-[34rem] h-[34rem] rounded-full bg-gradient-to-bl from-purple-600/25 via-fuchsia-500/20 to-pink-500/20 blur-3xl animate-float-2" />
              {/* Orb 3: Emerald & Teal Luminous Glow */}
              <div className="absolute -bottom-36 left-1/4 w-[36rem] h-[36rem] rounded-full bg-gradient-to-tr from-emerald-500/20 via-teal-400/20 to-cyan-500/15 blur-3xl animate-float-3" />
              {/* Orb 4: Rose & Amber Sunset Warmth */}
              <div className="absolute top-2/3 right-1/4 w-[26rem] h-[26rem] rounded-full bg-gradient-to-tl from-indigo-500/20 via-rose-500/15 to-amber-400/10 blur-3xl animate-float-4" />
              {/* Center Subtle Breathing Aura */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[42rem] h-[28rem] rounded-full bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-indigo-500/10 blur-3xl animate-pulse-subtle" />
            </div>

            {/* View Mode Navigation Tabs */}
            <div className="h-15 px-4 sm:px-6 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-between shrink-0 relative z-10">
              <div className="flex items-center gap-2 overflow-x-auto py-1.5 scrollbar-none">
                {/* 1st Tab: Executive Dashboard */}
                <button
                  onClick={() => setViewMode('dashboard')}
                  className={`px-4 sm:px-5 py-2 rounded-xl text-sm sm:text-base font-semibold flex items-center gap-2.5 transition-all cursor-pointer ${
                    viewMode === 'dashboard'
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800'
                  }`}
                >
                  <LayoutDashboard className="w-4.5 h-4.5" />
                  <span>Dashboard</span>
                </button>

                {/* 2nd Tab: Chat & AI Editor */}
                <button
                  onClick={() => setViewMode('chat')}
                  className={`px-4 sm:px-5 py-2 rounded-xl text-sm sm:text-base font-semibold flex items-center gap-2.5 transition-all cursor-pointer ${
                    viewMode === 'chat'
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800'
                  }`}
                >
                  <MessageSquare className="w-4.5 h-4.5" />
                  <span>Chat & Evidence</span>
                </button>

                {/* 3rd Tab: Data Preview & Search */}
                <button
                  onClick={() => setViewMode('preview')}
                  className={`px-4 sm:px-5 py-2 rounded-xl text-sm sm:text-base font-semibold flex items-center gap-2.5 transition-all cursor-pointer ${
                    viewMode === 'preview'
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800'
                  }`}
                >
                  <Table className="w-4.5 h-4.5" />
                  <span>Data Preview & Search</span>
                </button>

                {/* 4th Tab: Auto-Insights & Analytics */}
                <button
                  onClick={() => setViewMode('insights')}
                  className={`px-4 sm:px-5 py-2 rounded-xl text-sm sm:text-base font-semibold flex items-center gap-2.5 transition-all cursor-pointer ${
                    viewMode === 'insights'
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800'
                  }`}
                >
                  <Sparkles className="w-4.5 h-4.5" />
                  <span>Auto-Insights & Analytics</span>
                </button>
              </div>

              <div className="text-xs text-slate-400 dark:text-slate-500 font-mono hidden lg:block">
                Session: {sessionId?.slice(0, 8) || 'active'}
              </div>
            </div>

            {/* View 0: Executive Dashboard (Seen 1st when entering) */}
            {viewMode === 'dashboard' && (
              <ExecutiveDashboard
                fileId={fileId}
                filename={filename}
                activeSheet={activeSheet}
                profile={profile}
                sheets={sheets}
                theme={theme}
                isUploading={isUploading}
                fileHistory={fileHistory}
                onOpenFileFromHistory={handleOpenFileFromHistory}
                onDeleteFileFromHistory={handleDeleteFileFromHistory}
                isTempModified={isTempModified}
                onRevertToOriginal={handleRevertToOriginal}
                uploadError={uploadError}
                onClearUploadError={() => setUploadError(null)}
                onNavigateTab={(tab) => setViewMode(tab)}
                onAskQuestion={(q) => {
                  setViewMode('chat');
                  handleSendQuery(q);
                }}
                onOpenFileUpload={() => setIsUploadModalOpen(true)}
                onFileUpload={handleFileUpload}
                onCreateNewFile={handleCreateNewFile}
                onSelectSheet={handleSheetChange}
                onSelectSample={handleSelectSample}
                onGoHome={handleGoHome}
              />
            )}

            {/* View 1: Chat & Evidence */}
            {viewMode === 'chat' && (
              <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Chat Column */}
                <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40">
                  {/* Active Filter Chips Bar */}
                  <ActiveFilterChips
                    filters={activeFilters}
                    onRemoveFilter={(col) => {
                      setActiveFilters((prev) => prev.filter((f) => f.column !== col));
                      handleSendQuery(`Clear filter on ${col}`);
                    }}
                  />

                  {/* Messages Feed */}
                  <div
                    ref={chatScrollRef}
                    className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
                  >
                    {messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        activeSheet={activeSheet}
                        onSelectSheet={handleSheetChange}
                        onSelectEvidence={(res) => setCurrentResult(res)}
                        onClarificationOption={(opt) => handleSendQuery(opt)}
                      />
                    ))}

                    {isQuerying && (
                      <div className="flex justify-start mb-4">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
                          <span>Interpreting instruction & executing deterministic plan...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Prompt Chips */}
                  {messages.length <= 2 && (
                    <div className="px-4 py-2 border-t border-slate-200/60 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
                      <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                        Try asking or editing:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {samplePrompts.map((p, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSendQuery(p)}
                            className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300 text-slate-600 dark:text-slate-300 text-[11px] font-medium border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Voice / Text Query Input */}
                  <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendQuery();
                      }}
                      className="relative flex items-center gap-2"
                    >
                      {/* Microphone toggle */}
                      {speechInput.isSupported && (
                        <button
                          type="button"
                          onClick={() => {
                            if (speechInput.isListening) {
                              speechInput.stopListening();
                            } else {
                              speechInput.startListening();
                            }
                          }}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                            speechInput.isListening
                              ? 'bg-red-500 border-red-600 text-white animate-pulse'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                          title={
                            speechInput.isListening
                              ? 'Listening... Click to stop'
                              : 'Click to speak question'
                          }
                        >
                          {speechInput.isListening ? (
                            <MicOff className="w-4 h-4" />
                          ) : (
                            <Mic className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      {/* Text Input */}
                      <input
                        type="text"
                        value={inputQuery}
                        onChange={(e) => setInputQuery(e.target.value)}
                        placeholder={
                          speechInput.isListening
                            ? 'Listening to speech...'
                            : 'Ask a question or instruct AI to modify spreadsheet data...'
                        }
                        className="flex-1 text-xs sm:text-sm py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        disabled={isQuerying}
                      />

                      {/* Send Button */}
                      <button
                        type="submit"
                        disabled={!inputQuery.trim() || isQuerying}
                        className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium transition-colors shadow-xs flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>

                    {speechInput.error && (
                      <div className="text-[11px] text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {speechInput.error}
                      </div>
                    )}
                  </div>
                </div>

                {/* Evidence Panel (Right Column) */}
                <div className="w-[45%] min-w-[340px] max-w-[550px] hidden md:flex flex-col bg-white dark:bg-slate-900">
                  {currentResult ? (
                    <EvidencePanel
                      fileId={fileId}
                      resultId={currentResult.result_id}
                      question={currentResult.question}
                      interpretation={currentResult.interpretation}
                      evidence={currentResult.evidence}
                      result={currentResult.result}
                      chart={currentResult.chart}
                      onUpdateChartType={handleUpdateChartType}
                      theme={theme}
                      sourceSheets={currentResult.source_sheets}
                      activeSheet={activeSheet}
                      onSelectSheet={handleSheetChange}
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500 bg-slate-50/20 dark:bg-slate-950/20">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                        <Sparkles className="w-6 h-6 stroke-[1.5]" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Evidence & Source Row Panel
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                        Ask a question in chat to see the verified plan, matched source rows with Excel row numbers, and interactive charts here.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* View 2: Data Preview & Keyword Search */}
            {viewMode === 'preview' && (
              <div className="flex-1 overflow-hidden">
                <DataPreview
                  fileId={fileId}
                  activeSheet={activeSheet}
                  profile={profile}
                />
              </div>
            )}

            {/* View 3: Auto-Insights & Dashboard */}
            {viewMode === 'insights' && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <InsightsDashboard
                  fileId={fileId}
                  activeSheet={activeSheet}
                  sheets={sheets}
                  onSelectSheet={handleSheetChange}
                  onAskQuestion={(q) => {
                    setViewMode('chat');
                    handleSendQuery(q);
                  }}
                  theme={theme}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Excel File Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onFileSelected={handleFileUpload}
        isLoading={isUploading}
        onCreateNewFile={handleCreateNewFile}
      />
    </div>
  );
}

