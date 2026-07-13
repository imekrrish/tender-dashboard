import React, { useState, useMemo } from 'react';
import { ColumnManager } from './ColumnManager';
import { Select } from '../ui/Select';
import { prettyColumn } from '../../utils/columnLabels';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileCode,
} from 'lucide-react';

interface Column {
  key: string;
  originalName: string;
  type: string;
  isFilterable: boolean;
  isMetric: boolean;
  isDate: boolean;
}

interface DataTableProps {
  data: any[];
  columns: Column[];
  visibleColumns: string[];
  onVisibleColumnsChange: (visibleKeys: string[]) => void;
  onExportXlsx: () => void;
  onExportCsv: () => void;
}

type SortField = string;
type SortOrder = 'asc' | 'desc' | null;

const prettyName = prettyColumn;

export const DataTable: React.FC<DataTableProps> = ({
  data,
  columns,
  visibleColumns,
  onVisibleColumnsChange,
  onExportXlsx,
  onExportCsv,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('projectName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const pinnedColumns = ['projectName', 'country', 'pvCapacityMW', 'developmentStatus'];

  const activeColumns = useMemo(() => {
    return columns.filter(
      (col) => visibleColumns.includes(col.key) || pinnedColumns.includes(col.key)
    );
  }, [columns, visibleColumns]);

  const searchedData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase().trim();
    return data.filter((row) => {
      return activeColumns.some((col) => {
        const val = row[col.key];
        return val !== null && val !== undefined && String(val).toLowerCase().includes(term);
      });
    });
  }, [data, searchTerm, activeColumns]);

  const sortedData = useMemo(() => {
    if (!sortField || !sortOrder) return searchedData;

    return [...searchedData].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      if (valA === null || valA === undefined) return sortOrder === 'asc' ? 1 : -1;
      if (valB === null || valB === undefined) return sortOrder === 'asc' ? -1 : 1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortOrder === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [searchedData, sortField, sortOrder]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedData.slice(startIndex, startIndex + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, data.length]);

  const handleSort = (key: string) => {
    if (sortField === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : sortOrder === 'desc' ? null : 'asc');
    } else {
      setSortField(key);
      setSortOrder('asc');
    }
  };

  const renderSortIcon = (key: string) => {
    if (sortField !== key || sortOrder === null) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1.5 shrink-0" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-brand-600 ml-1.5 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-brand-600 ml-1.5 shrink-0" />
    );
  };

  const badgeClass = (tone: string) =>
    `inline-flex items-center px-2 py-0.5 text-3xs font-semibold rounded-md ring-1 ${tone}`;

  const renderCellContent = (row: any, col: Column) => {
    const val = row[col.key];
    if (val === null || val === undefined || val === '') {
      return <span className="text-slate-300">—</span>;
    }

    if (col.type === 'url') {
      return (
        <a
          href={val}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 hover:underline font-semibold"
          title="Open source URL"
        >
          <span>Link</span>
          <ExternalLink className="w-3.5 h-3.5" strokeWidth={2.25} />
        </a>
      );
    }

    if (col.type === 'number') {
      const isTariff = col.key.toLowerCase().includes('tariff');
      if (isTariff) {
        const isUsd = col.key.toLowerCase().includes('usd');
        return (
          <span className="tnum">{isUsd ? `$${Number(val).toFixed(3)}` : `₹${Number(val).toFixed(2)}`}</span>
        );
      }
      return <span className="tnum">{Number(val).toLocaleString()}</span>;
    }

    if (col.type === 'date') {
      return <span className="tnum text-slate-600">{String(val)}</span>;
    }

    const textStr = String(val);

    if (col.key === 'technology') {
      return (
        <span
          className={badgeClass(
            val === 'PV'
              ? 'bg-blue-50 text-blue-700 ring-blue-100'
              : val === 'PV-Storage'
              ? 'bg-violet-50 text-violet-700 ring-violet-100'
              : val === 'FPV'
              ? 'bg-cyan-50 text-cyan-700 ring-cyan-100'
              : 'bg-slate-100 text-slate-600 ring-slate-200'
          )}
        >
          {val}
        </span>
      );
    }

    if (col.key === 'developmentStatus') {
      const statusLower = String(val).toLowerCase();
      return (
        <span
          className={badgeClass(
            statusLower === 'completed'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
              : statusLower === 'planning'
              ? 'bg-orange-50 text-orange-700 ring-orange-100'
              : statusLower === 'under construction'
              ? 'bg-amber-50 text-amber-700 ring-amber-100'
              : 'bg-slate-100 text-slate-600 ring-slate-200'
          )}
        >
          {val}
        </span>
      );
    }

    if (textStr.length > 60) {
      return (
        <span className="truncate max-w-[240px] block" title={textStr}>
          {textStr}
        </span>
      );
    }

    return textStr;
  };

  const iconBtn =
    'grid place-items-center w-9 h-9 rounded-lg bg-white ring-1 ring-line-strong hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition';

  return (
    <div className="rounded-2xl bg-white shadow-card ring-1 ring-line p-5 sm:p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Records</h3>
          <p className="text-2xs text-slate-400 font-medium mt-0.5">
            {searchedData.length.toLocaleString()} matching current filters
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full lg:w-auto shrink-0 select-none">
          <div className="relative flex-1 lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search records…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 h-9 text-sm bg-white ring-1 ring-line-strong rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-slate-400 transition"
            />
          </div>

          <ColumnManager
            columns={columns}
            visibleColumns={visibleColumns}
            onChange={onVisibleColumnsChange}
          />

          <div className="flex rounded-lg ring-1 ring-line-strong bg-white p-0.5">
            <button
              onClick={onExportCsv}
              className="flex items-center gap-1.5 px-2.5 h-8 text-2xs font-semibold text-slate-600 hover:bg-slate-50 rounded-md cursor-pointer transition"
              title="Export to CSV"
            >
              <FileCode className="w-3.5 h-3.5 text-slate-400" />
              CSV
            </button>
            <button
              onClick={onExportXlsx}
              className="flex items-center gap-1.5 px-2.5 h-8 text-2xs font-semibold text-slate-600 hover:bg-slate-50 rounded-md cursor-pointer transition"
              title="Export to XLSX"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              XLSX
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl ring-1 ring-line">
        <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
          <thead>
            <tr className="bg-slate-50/80 text-3xs font-bold text-slate-500 uppercase tracking-wider">
              {activeColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  title={col.originalName}
                  className={`px-4 py-3 cursor-pointer hover:bg-slate-100 transition select-none ${
                    col.key === 'projectName' ? 'w-72' : 'w-40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{prettyName(col)}</span>
                    {renderSortIcon(col.key)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-sm text-slate-600">
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={activeColumns.length}
                  className="px-4 py-16 text-center text-slate-400"
                >
                  No records match your filters
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  className="border-t border-line hover:bg-brand-50/30 transition"
                >
                  {activeColumns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 truncate ${
                        col.key === 'projectName'
                          ? 'font-semibold text-slate-800'
                          : 'font-medium'
                      }`}
                    >
                      {renderCellContent(row, col)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-2xs text-slate-500 select-none">
        <div className="flex items-center gap-2">
          <span className="font-medium">Rows per page</span>
          <div className="w-20">
            <Select
              size="sm"
              value={String(pageSize)}
              onChange={(v) => {
                setPageSize(Number(v));
                setCurrentPage(1);
              }}
              options={[5, 10, 20, 50].map((s) => ({ label: String(s), value: String(s) }))}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="font-medium tnum">
            Page <span className="text-slate-800 font-semibold">{currentPage}</span> of{' '}
            <span className="text-slate-800 font-semibold">{totalPages}</span>
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className={iconBtn}
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className={iconBtn}
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
