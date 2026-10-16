import React from 'react';
import { Layers, Hash, Calendar, DollarSign, Type, Tag, Key, Download, Plus, Upload } from 'lucide-react';
import { SheetProfile } from '../../api/types';
import { getExportUrl } from '../../api/files';

interface LeftRailProps {
  fileId: string;
  sheets: string[];
  activeSheet: string;
  onSelectSheet: (sheet: string) => void;
  profile?: SheetProfile;
  onOpenFileUpload?: () => void;
  onCreateNewSheet?: () => void;
}

export const LeftRail: React.FC<LeftRailProps> = ({
  fileId,
  sheets,
  activeSheet,
  onSelectSheet,
  profile,
  onOpenFileUpload,
  onCreateNewSheet,
}) => {
  const getTypeBadge = (dtype: string) => {
    switch (dtype) {
      case 'integer':
      case 'float':
        return { label: dtype, icon: Hash, bg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
      case 'currency':
        return { label: 'currency', icon: DollarSign, bg: 'bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' };
      case 'percent':
        return { label: 'percent', icon: Hash, bg: 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800' };
      case 'date':
      case 'datetime':
        return { label: dtype, icon: Calendar, bg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
      case 'categorical':
        return { label: 'category', icon: Tag, bg: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' };
      case 'id-like':
        return { label: 'id', icon: Key, bg: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' };
      default:
        return { label: 'text', icon: Type, bg: 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
    }
  };

  return (
    <aside className="w-68 bg-slate-50/70 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 h-full overflow-hidden transition-colors">
      {/* Sheets Section */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          Workbook Sheets ({sheets.length})
        </div>
        <div className="space-y-1.5">
          {sheets.map((sheet) => (
            <button
              key={sheet}
              onClick={() => onSelectSheet(sheet)}
              className={`w-full text-left px-3.5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center justify-between cursor-pointer ${
                activeSheet === sheet
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
              }`}
            >
              <span className="truncate">{sheet}</span>
              {activeSheet === sheet && (
                <span className="w-2 h-2 rounded-full bg-white shrink-0"></span>
              )}
            </button>
          ))}
        </div>

        {onOpenFileUpload && (
          <button
            onClick={onOpenFileUpload}
            className="w-full mt-3 px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Add New Excel File</span>
          </button>
        )}
      </div>

      {/* Sheet Metadata */}
      {profile && (
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 text-xs sm:text-sm text-slate-600 dark:text-slate-400 flex justify-between items-center">
          <div>
            <span className="font-bold text-slate-900 dark:text-white">{profile.row_count.toLocaleString()}</span> rows
          </div>
          <div>
            <span className="font-bold text-slate-900 dark:text-white">{profile.column_count}</span> cols
          </div>
          <div>
            Header: <span className="font-semibold text-slate-900 dark:text-slate-200">Row {profile.header_row}</span>
          </div>
        </div>
      )}

      {/* Columns List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          Columns & Types ({profile?.columns.length || 0})
        </div>

        {profile ? (
          <div className="space-y-2.5">
            {profile.columns.map((col) => {
              const badge = getTypeBadge(col.dtype);
              const Icon = badge.icon;
              return (
                <div
                  key={col.name}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-blue-300 dark:hover:border-blue-800/60 transition-colors"
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate" title={col.name}>
                      {col.name}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-md font-semibold border flex items-center gap-1 shrink-0 ${badge.bg}`}
                    >
                      <Icon className="w-3 h-3" />
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex justify-between">
                    <span>{col.unique_count} distinct</span>
                    {col.null_count > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">{col.null_pct}% missing</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">100% complete</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-slate-400 italic">Loading column schema...</div>
        )}
      </div>

      {/* Export Cleaned Sheet */}
      <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <a
          href={getExportUrl(fileId, activeSheet, 'csv')}
          download
          className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export Sheet (CSV)
        </a>
      </div>
    </aside>
  );
};
