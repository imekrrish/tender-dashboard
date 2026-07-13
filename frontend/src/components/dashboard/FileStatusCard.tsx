import React from 'react';
import { Database, FileSpreadsheet, Clock, Table2 } from 'lucide-react';

interface FileStatusCardProps {
  fileName: string;
  lastUploadedTime: string;
  totalRows: number;
  totalColumns: number;
  activeSheet: string;
}

export const FileStatusCard: React.FC<FileStatusCardProps> = ({
  fileName,
  lastUploadedTime,
  totalRows,
  totalColumns,
  activeSheet,
}) => {
  const formatTime = (timeStr: string) => {
    try {
      return new Date(timeStr).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return timeStr;
    }
  };

  return (
    <div className="rounded-2xl bg-white shadow-card ring-1 ring-line px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
      <div className="flex items-center gap-4 min-w-0">
        <div className="grid place-items-center w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-600 ring-1 ring-emerald-100 shrink-0">
          <Database className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Active Workspace</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-3xs font-semibold text-emerald-600 ring-1 ring-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-2xs text-slate-500 font-medium">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="truncate max-w-[220px] text-slate-700 font-semibold" title={fileName}>
                {fileName}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Table2 className="w-3.5 h-3.5 text-brand-500" />
              Sheet <span className="text-slate-700 font-semibold">{activeSheet}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {formatTime(lastUploadedTime)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-stretch gap-6 lg:gap-8 border-t lg:border-t-0 lg:border-l border-line pt-4 lg:pt-0 lg:pl-8">
        <Stat label="Records" value={totalRows.toLocaleString()} />
        <Stat label="Columns" value={String(totalColumns)} />
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col justify-center">
    <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
    <span className="font-display text-xl font-semibold text-slate-900 tnum mt-0.5">{value}</span>
  </div>
);
