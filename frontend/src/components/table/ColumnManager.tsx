import React, { useState, useRef, useEffect } from 'react';
import { Columns3, ChevronDown, Check, Lock } from 'lucide-react';

interface Column {
  key: string;
  originalName: string;
  type: string;
  isFilterable: boolean;
  isMetric: boolean;
  isDate: boolean;
}

interface ColumnManagerProps {
  columns: Column[];
  visibleColumns: string[];
  onChange: (visibleKeys: string[]) => void;
}

export const ColumnManager: React.FC<ColumnManagerProps> = ({
  columns,
  visibleColumns,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const pinnedColumns = ['projectName', 'country', 'pvCapacityMW', 'developmentStatus'];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (colKey: string) => {
    if (pinnedColumns.includes(colKey)) return;
    const newVisible = visibleColumns.includes(colKey)
      ? visibleColumns.filter((k) => k !== colKey)
      : [...visibleColumns, colKey];
    onChange(newVisible);
  };

  const handleReset = () => {
    const defaultVisible = [
      'projectName', 'region', 'country', 'state', 'pvCapacityMW',
      'technology', 'developmentStatus', 'issuingAuthority',
      'developer', 'winningTariffINR', 'expectedCompletion', 'link',
    ];
    const presentDefaults = defaultVisible.filter((k) => columns.some((c) => c.key === k));
    onChange(presentDefaults);
  };

  return (
    <div className="relative inline-block text-left select-none" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 h-9 text-sm font-semibold text-slate-700 bg-white ring-1 ring-line-strong hover:bg-slate-50 transition rounded-lg cursor-pointer"
      >
        <Columns3 className="w-4 h-4 text-slate-400" />
        <span className="hidden sm:inline">Columns</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 z-40 w-64 bg-white rounded-xl shadow-pop ring-1 ring-line overflow-hidden animate-pop">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-line">
            <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">
              Columns
            </span>
            <button
              onClick={handleReset}
              className="text-3xs font-semibold uppercase tracking-wide text-slate-400 hover:text-brand-600 cursor-pointer transition"
            >
              Reset
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto p-1.5">
            {columns.map((col) => {
              const isPinned = pinnedColumns.includes(col.key);
              const isVisible = visibleColumns.includes(col.key) || isPinned;

              return (
                <button
                  key={col.key}
                  onClick={() => handleToggle(col.key)}
                  disabled={isPinned}
                  className={`flex items-center justify-between w-full px-2.5 py-2 text-sm text-left rounded-lg transition ${
                    isPinned
                      ? 'cursor-not-allowed'
                      : 'hover:bg-slate-50 cursor-pointer'
                  }`}
                >
                  <span
                    className={`flex items-center gap-1.5 truncate max-w-[80%] font-medium ${
                      isPinned ? 'text-slate-400' : 'text-slate-700'
                    }`}
                  >
                    <span className="truncate">{col.originalName}</span>
                    {isPinned && <Lock className="w-3 h-3 text-slate-300 shrink-0" />}
                  </span>

                  <div
                    className={`grid place-items-center w-4 h-4 rounded transition-all duration-150 shrink-0 ${
                      isVisible
                        ? isPinned
                          ? 'bg-slate-300 text-white'
                          : 'bg-brand-600 text-white'
                        : 'ring-1 ring-slate-300 bg-white'
                    }`}
                  >
                    {isVisible && <Check className="w-3 h-3" strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
