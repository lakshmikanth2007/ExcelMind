import React from 'react';
import { Filter, X } from 'lucide-react';

interface ActiveFilterChipsProps {
  filters: Array<{
    column: string;
    op: string;
    value: any;
  }>;
  onRemoveFilter?: (column: string) => void;
}

export const ActiveFilterChips: React.FC<ActiveFilterChipsProps> = ({
  filters,
  onRemoveFilter,
}) => {
  if (!filters || filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1.5 px-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs">
      <span className="font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 text-[11px] uppercase tracking-wider">
        <Filter className="w-3 h-3 text-blue-600 dark:text-blue-400" />
        Active Filters:
      </span>
      {filters.map((f, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100/70 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 font-medium text-[11px]"
        >
          <span>
            {f.column} {f.op} {f.value !== null && f.value !== undefined ? `'${f.value}'` : ''}
          </span>
          {onRemoveFilter && (
            <button
              onClick={() => onRemoveFilter(f.column)}
              className="hover:text-blue-950 dark:hover:text-white rounded-full p-0.5"
              title={`Remove ${f.column} filter`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
};
