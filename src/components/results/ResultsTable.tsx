import React from 'react';
import { formatValue } from '../../lib/format';

interface ResultsTableProps {
  columns: string[];
  rows: Record<string, any>[];
  totalMatches: number;
  isSourceRows?: boolean;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({
  columns,
  rows,
  totalMatches,
  isSourceRows = false,
}) => {
  if (!rows || rows.length === 0) {
    return <div className="p-4 text-xs text-slate-400 italic">No rows available.</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-2xs transition-colors">
      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex justify-between items-center">
        <span>
          {isSourceRows ? 'Matched Source Rows' : 'Computed Query Result'} ({totalMatches.toLocaleString()} rows)
        </span>
        {isSourceRows && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
            Highlighted with original Excel row numbers
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100/80 dark:bg-slate-800 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className={`py-2 px-3 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap ${
                    col === '__row__' ? 'w-16 bg-slate-200/50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-mono text-[11px]' : ''
                  }`}
                >
                  {col === '__row__' ? 'Excel Row #' : col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-blue-50/20 dark:hover:bg-slate-800/60 transition-colors">
                {columns.map((col) => {
                  const val = row[col];
                  const isRowCol = col === '__row__';

                  return (
                    <td
                      key={col}
                      className={`py-1.5 px-3 whitespace-nowrap text-slate-700 dark:text-slate-300 ${
                        isRowCol
                          ? 'bg-blue-50/50 dark:bg-blue-950/40 font-mono text-blue-700 dark:text-blue-400 text-[11px] font-bold border-r border-slate-100 dark:border-slate-800'
                          : ''
                      }`}
                    >
                      {isRowCol ? val : formatValue(val, undefined, col)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
