import React, { useRef, useState } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { FloatingMenu } from '../ui/FloatingMenu';

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
}

export const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({
  label,
  options,
  selected,
  onChange,
  placeholder = 'All values',
  searchable = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleToggle = (option: string) => {
    const newSelected = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    onChange(newSelected);
  };

  const filteredOptions = searchTerm
    ? options.filter((opt) => String(opt).toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === options.length && options.length > 0
      ? 'All selected'
      : selected.join(', ');

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-2xs font-semibold text-slate-500">{label}</label>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className={`flex items-center justify-between w-full px-3 h-9 text-sm bg-white rounded-lg text-left transition cursor-pointer ring-1 ${
          isOpen
            ? 'ring-2 ring-brand-500'
            : selected.length > 0
            ? 'ring-brand-200 bg-brand-50/40'
            : 'ring-line-strong hover:ring-slate-300'
        }`}
      >
        <span
          className={`truncate max-w-[80%] ${
            selected.length === 0 ? 'text-slate-400 font-normal' : 'text-slate-700 font-medium'
          }`}
        >
          {summary}
        </span>
        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          {selected.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-3xs font-bold bg-brand-600 text-white rounded-full tnum">
              {selected.length}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      <FloatingMenu anchorRef={btnRef} open={isOpen} onClose={() => setIsOpen(false)}>
        {searchable && (
          <div className="p-2 border-b border-line shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-sm bg-slate-50 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white placeholder-slate-400 transition"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-3 py-1.5 border-b border-line shrink-0">
          <button
            type="button"
            onClick={() => onChange([...options])}
            className="text-3xs font-semibold uppercase tracking-wide text-slate-400 hover:text-brand-600 transition cursor-pointer"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-3xs font-semibold uppercase tracking-wide text-slate-400 hover:text-brand-600 transition cursor-pointer"
          >
            Clear
          </button>
        </div>

        <div className="overflow-y-auto p-1 flex-1">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-400 italic text-center">No options found</div>
          ) : (
            filteredOptions.map((option) => {
              const isChecked = selected.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleToggle(option)}
                  className={`flex items-center justify-between w-full px-2.5 py-2 text-sm text-left rounded-lg transition cursor-pointer ${
                    isChecked ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate max-w-[85%]">{option}</span>
                  <div
                    className={`grid place-items-center w-4 h-4 rounded transition-all duration-150 shrink-0 ${
                      isChecked ? 'bg-brand-600 text-white' : 'ring-1 ring-slate-300 bg-white'
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3" strokeWidth={3} />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </FloatingMenu>
    </div>
  );
};
