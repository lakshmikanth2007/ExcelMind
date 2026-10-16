import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, ShieldCheck, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { formatFileSize } from '../../lib/format';

interface FileUploaderProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
  onSelectSample: (sampleName: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onFileSelected,
  isLoading,
  onSelectSample,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndHandleFile = (file: File) => {
    setErrorMessage(null);
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const name = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => name.endsWith(ext));

    if (!hasValidExt) {
      setErrorMessage('Unsupported format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) spreadsheet.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage(`File exceeds 10MB limit (${formatFileSize(file.size)}). Please choose a smaller file.`);
      return;
    }

    onFileSelected(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndHandleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6">
      {/* Hero Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Deterministic Spreadsheet Intelligence
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
          Verifiable answers from your spreadsheets.
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
          Ask questions in plain English or voice. Every calculation is verified by a deterministic Pandas engine
          with full source-row evidence.
        </p>
      </div>

      {/* Upload Box */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
          isDragOver
            ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 shadow-lg scale-[1.01]'
            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50/50 dark:hover:bg-slate-850 shadow-xs'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              validateAndHandleFile(e.target.files[0]);
            }
          }}
        />

        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-950/70 border border-blue-100 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
          <Upload className="w-8 h-8 stroke-[1.75]" />
        </div>

        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          {isLoading ? 'Processing spreadsheet...' : 'Drag and drop your spreadsheet here'}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">or click to browse from your computer</p>

        <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 dark:text-slate-400 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
          <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          Supports .xlsx, .xls, .csv (up to 10MB, max 200,000 rows)
        </div>

        {errorMessage && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMessage}
          </div>
        )}
      </div>

      {/* Privacy Notice Banner */}
      <div className="mt-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300 transition-colors">
        <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-800 dark:text-white">Privacy & Invariant Guarantee:</span> The LLM interprets questions
          into JSON query plans only. Calculations run deterministically on our server. The LLM never computes numbers,
          never writes code, and never sees your full dataset.
        </div>
      </div>

      {/* Quick Sample Workbooks */}
      <div className="mt-8">
        <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-center mb-3">
          Or try immediately with verified sample data
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectSample('students');
            }}
            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-slate-850 text-left transition-all text-xs group"
          >
            <div className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center justify-between">
              Student Placement Records
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-blue-500" />
            </div>
            <div className="text-slate-500 dark:text-slate-400 mt-1">20 engineering students, departments, salaries in LPA, CGPA.</div>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectSample('sales');
            }}
            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-slate-850 text-left transition-all text-xs group"
          >
            <div className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center justify-between">
              Multi-Region Sales Orders
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-blue-500" />
            </div>
            <div className="text-slate-500 dark:text-slate-400 mt-1">Orders with categories, regions, dates, profits, multi-sheets.</div>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectSample('messy_headers');
            }}
            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-slate-850 text-left transition-all text-xs group"
          >
            <div className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center justify-between">
              Messy Headers & Currencies
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-blue-500" />
            </div>
            <div className="text-slate-500 dark:text-slate-400 mt-1">Headers on row 4, merged spans, currency strings like ($6,500).</div>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectSample('messy_quality');
            }}
            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-slate-850 text-left transition-all text-xs group"
          >
            <div className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center justify-between">
              Data Quality & Zero vs Blank
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-blue-500" />
            </div>
            <div className="text-slate-500 dark:text-slate-400 mt-1">Real zeroes vs blanks, duplicates, mixed types, IQR outliers.</div>
          </button>
        </div>
      </div>
    </div>
  );
};
