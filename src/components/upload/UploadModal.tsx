import React, { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, PlusCircle, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { formatFileSize } from '../../lib/format';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelected: (file: File) => void;
  isLoading: boolean;
  onCreateNewFile: (template?: string) => void;
  onSelectSample?: (sampleName: string) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onFileSelected,
  isLoading,
  onCreateNewFile,
  onSelectSample,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const validateAndHandleFile = (file: File) => {
    setErrorMessage(null);
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const name = file.name.toLowerCase();
    const hasValidExt = validExtensions.some((ext) => name.endsWith(ext));

    if (!hasValidExt) {
      setErrorMessage('Unsupported format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage(`File exceeds 10MB limit (${formatFileSize(file.size)}). Please choose a smaller file.`);
      return;
    }

    onFileSelected(file);
    onClose();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndHandleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Add Excel File
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload a spreadsheet or create a new workbook
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drag & Drop Zone */}
        <div className="py-6">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              isDragOver
                ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30'
                : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
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

            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-blue-50 dark:bg-blue-950/70 border border-blue-100 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Upload className="w-6 h-6 stroke-[1.75]" />
            </div>

            <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
              Click to browse or drag and drop spreadsheet
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Supports .xlsx, .xls, and .csv files up to 10MB
            </p>
          </div>

          {errorMessage && (
            <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Quick Options: Create Blank Workbook */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => {
              onCreateNewFile('blank');
              onClose();
            }}
            className="w-full p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 text-left transition-all group flex items-center justify-between"
          >
            <div className="flex items-center gap-2 font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              <PlusCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Or Start with a Blank Spreadsheet</span>
            </div>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              New .xlsx ready for edits
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
