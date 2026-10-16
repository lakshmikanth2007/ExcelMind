import React from 'react';
import { Table, Trash2, Volume2, VolumeX, Sun, Moon, Plus, Upload, LayoutDashboard, Undo2, Home, FileEdit } from 'lucide-react';

interface HeaderProps {
  filename?: string;
  isSpeechEnabled?: boolean;
  onToggleSpeech?: () => void;
  onDeleteData?: () => void;
  activeSheet?: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenFileUpload?: () => void;
  onCreateNewSheet?: () => void;
  onGoHome?: () => void;
  isTempModified?: boolean;
  onRevertToOriginal?: () => void;
  isHomeView?: boolean;
  onResumeWorkspace?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  filename,
  isSpeechEnabled,
  onToggleSpeech,
  onDeleteData,
  activeSheet,
  theme,
  onToggleTheme,
  onOpenFileUpload,
  onCreateNewSheet,
  onGoHome,
  isTempModified = false,
  onRevertToOriginal,
  isHomeView = false,
  onResumeWorkspace,
}) => {
  return (
    <header className="h-18 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-xs z-10 transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={onGoHome}
          className="flex items-center gap-3 text-left group focus:outline-hidden cursor-pointer"
          title="Click to go to Home Page"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold shadow-sm shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 dark:text-white tracking-tight text-lg sm:text-xl group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                ExcelMind AI
              </span>
              {isTempModified && (
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 font-bold border border-amber-300 dark:border-amber-700 flex items-center gap-1 shadow-2xs"
                  title="AI edits applied in temp working Excel. Main Excel file remains original."
                >
                  <FileEdit className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Working Copy (AI Modified)</span>
                </span>
              )}
            </div>
            {filename && (
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium truncate max-w-xs md:max-w-md">
                {filename} {activeSheet && <span className="text-slate-400 dark:text-slate-500">· Sheet: {activeSheet}</span>}
              </p>
            )}
          </div>
        </button>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Revert Temp Excel Button if modified */}
        {isTempModified && onRevertToOriginal && (
          <button
            onClick={onRevertToOriginal}
            className="px-3.5 py-2 rounded-xl text-sm font-semibold bg-amber-100 dark:bg-amber-950/80 hover:bg-amber-200 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Revert working temp Excel back to pristine main Excel file"
          >
            <Undo2 className="w-4 h-4" />
            <span className="hidden md:inline">Revert to Main</span>
          </button>
        )}

        {/* If on Home View and have an active workbook, provide Resume button */}
        {isHomeView && filename && onResumeWorkspace && (
          <button
            onClick={onResumeWorkspace}
            className="px-3.5 py-2 rounded-xl text-sm font-bold bg-blue-50 dark:bg-blue-950/80 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Resume working on open workbook"
          >
            <LayoutDashboard className="w-4 h-4 text-blue-600" />
            <span>Resume {filename.length > 15 ? filename.slice(0, 15) + '…' : filename}</span>
          </button>
        )}

        {/* Add Excel File */}
        {onOpenFileUpload && (
          <button
            onClick={onOpenFileUpload}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Upload and add a new Excel file"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Add Excel File</span>
          </button>
        )}

        {/* Create New Sheet */}
        {onCreateNewSheet && (
          <button
            onClick={onCreateNewSheet}
            className="px-3 py-2 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer hidden md:flex"
            title="Create a new blank sheet"
          >
            <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>New Sheet</span>
          </button>
        )}

        {/* Dark Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* Speech Output Toggle */}
        {onToggleSpeech && (
          <button
            onClick={onToggleSpeech}
            className={`p-2.5 rounded-xl text-sm font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
              isSpeechEnabled
                ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
            title={isSpeechEnabled ? 'Spoken answers active' : 'Click to enable spoken answers'}
          >
            {isSpeechEnabled ? (
              <Volume2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            )}
            <span className="hidden lg:inline text-xs font-semibold">Voice</span>
          </button>
        )}

        {/* Delete Data */}
        {filename && onDeleteData && (
          <button
            onClick={onDeleteData}
            className="p-2.5 rounded-xl text-sm font-medium border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/30 hover:bg-red-50 dark:hover:bg-red-900/40 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Wipe spreadsheet and session data"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
