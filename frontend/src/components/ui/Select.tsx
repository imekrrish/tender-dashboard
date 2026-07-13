import React, { useRef, useState } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { FloatingMenu } from './FloatingMenu';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  align?: 'left' | 'right';
  matchWidth?: boolean;
  size?: 'md' | 'sm';
}

export const Select: React.FC<SelectProps> = ({
  value,
  options,
  onChange,
  label,
  placeholder = 'Select…',
  disabled = false,
  searchable = false,
  align = 'left',
  matchWidth = true,
  size = 'md',
}) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = term
    ? options.filter((o) => o.label.toLowerCase().includes(term.toLowerCase()))
    : options;

  const height = size === 'sm' ? 'h-8 text-sm' : 'h-9 text-sm';

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setTerm('');
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-2xs font-semibold text-slate-500">{label}</label>}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`flex items-center justify-between gap-2 w-full px-3 ${height} bg-white rounded-lg text-left transition ring-1 ${
          disabled
            ? 'ring-line text-slate-300 cursor-not-allowed bg-slate-50/60'
            : open
            ? 'ring-2 ring-brand-500 cursor-pointer'
            : 'ring-line-strong hover:ring-slate-300 cursor-pointer'
        }`}
      >
        <span className={`truncate ${selected ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      <FloatingMenu anchorRef={btnRef} open={open} onClose={() => setOpen(false)} align={align} matchWidth={matchWidth}>
        {searchable && (
          <div className="p-2 border-b border-line shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-sm bg-slate-50 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white placeholder-slate-400 transition"
              />
            </div>
          </div>
        )}
        <div className="overflow-y-auto p-1 flex-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-400 italic text-center">No matches</div>
          ) : (
            filtered.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => pick(opt.value)}
                  className={`flex items-center justify-between gap-2 w-full px-2.5 py-2 text-sm text-left rounded-lg transition cursor-pointer ${
                    active
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {active && <Check className="w-4 h-4 shrink-0 text-brand-600" strokeWidth={2.5} />}
                </button>
              );
            })
          )}
        </div>
      </FloatingMenu>
    </div>
  );
};
