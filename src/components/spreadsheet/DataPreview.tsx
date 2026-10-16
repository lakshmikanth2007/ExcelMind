import React, { useState, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, Download, Filter, RefreshCw } from 'lucide-react';
import { fetchPreview, searchSpreadsheet, getExportUrl } from '../../api/files';
import { PreviewResponse, SheetProfile } from '../../api/types';
import { formatValue } from '../../lib/format';

interface DataPreviewProps {
  fileId: string;
  activeSheet: string;
  profile?: SheetProfile;
}

export const DataPreview: React.FC<DataPreviewProps> = ({
  fileId,
  activeSheet,
  profile,
}) => {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchHits, setSearchHits] = useState<Record<number, string[]>>({});

  const loadData = async (targetPage: number, query: string) => {
    setIsLoading(true);
    try {
      if (query.trim()) {
        const searchRes = await searchSpreadsheet(fileId, query.trim(), activeSheet, undefined, targetPage);
        setData(searchRes);
        setSearchHits(searchRes.matched_columns || {});
      } else {
        const previewRes = await fetchPreview(fileId, activeSheet, targetPage, 50);
        setData(previewRes);
        setSearchHits({});
      }
    } catch (err) {
      console.error('Failed to load preview:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    loadData(1, searchQuery);
  }, [fileId, activeSheet]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData(1, searchQuery);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    loadData(newPage, searchQuery);
  };

  const colTypeMap = profile
    ? Object.fromEntries(profile.columns.map((c) => [c.name, c.dtype]))
    : {};

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 transition-colors">
      {/* Search & Actions Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-950/70">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="w-4.5 h-4.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search keywords across all columns..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs"
          />
        </form>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500 dark:text-slate-400 font-medium">
            {data ? `${data.total_rows.toLocaleString()} matching records` : 'Loading...'}
          </span>
          <a
            href={getExportUrl(fileId, activeSheet, 'csv')}
            download
            className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 font-semibold text-sm cursor-pointer shadow-2xs"
            title="Download CSV"
          >
            <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto relative">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center h-64 gap-3">
            <RefreshCw className="w-7 h-7 animate-spin text-blue-600" />
            <span className="text-sm font-medium">Loading sheet data...</span>
          </div>
        ) : data && data.rows.length > 0 ? (
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-100/95 dark:bg-slate-800/95 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {data.columns.map((col) => (
                  <th
                    key={col}
                    className={`py-3 px-3.5 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap text-sm ${
                      col === '__row__' ? 'w-20 bg-slate-200/60 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-mono text-xs' : ''
                    }`}
                  >
                    {col === '__row__' ? 'Row #' : col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.rows.map((row, rIdx) => {
                const excelRowNum = row['__row__'];
                const hitCols = searchHits[excelRowNum] || [];

                return (
                  <tr key={rIdx} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/60 transition-colors">
                    {data.columns.map((col) => {
                      const val = row[col];
                      const isHit = hitCols.includes(col);
                      const isRowCol = col === '__row__';

                      return (
                        <td
                          key={col}
                          className={`py-2.5 px-3.5 whitespace-nowrap text-slate-700 dark:text-slate-300 text-sm ${
                            isRowCol
                              ? 'bg-slate-50/70 dark:bg-slate-950 font-mono text-slate-400 dark:text-slate-500 text-xs font-semibold border-r border-slate-100 dark:border-slate-800'
                              : isHit
                              ? 'bg-amber-100/70 dark:bg-amber-950/70 font-semibold'
                              : ''
                          }`}
                        >
                          {isRowCol ? val : formatValue(val, colTypeMap[col], col)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-16 text-center text-slate-400">
            <Filter className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-base font-semibold">No rows found matching your criteria</p>
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {data && data.total_pages > 1 && (
        <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-950/60">
          <div>
            Page <span className="font-bold text-slate-900 dark:text-white">{data.page}</span> of{' '}
            <span className="font-bold text-slate-900 dark:text-white">{data.total_pages}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handlePageChange(data.page - 1)}
              disabled={data.page <= 1}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handlePageChange(data.page + 1)}
              disabled={data.page >= data.total_pages}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
