import React from 'react';

interface RangeFilterProps {
  label: string;
  min: string;
  max: string;
  onMinChange: (val: string) => void;
  onMaxChange: (val: string) => void;
  placeholderMin?: string;
  placeholderMax?: string;
  currency?: 'INR' | 'USD';
  onCurrencyChange?: (curr: 'INR' | 'USD') => void;
}

export const RangeFilter: React.FC<RangeFilterProps> = ({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
  placeholderMin = 'Min',
  placeholderMax = 'Max',
  currency,
  onCurrencyChange,
}) => {
  const inputClass =
    'w-full px-3 h-9 text-sm bg-white rounded-lg text-slate-700 ring-1 ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand-500 transition tnum placeholder-slate-400';

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between h-5">
        <label className="text-2xs font-semibold text-slate-500">{label}</label>

        {currency && onCurrencyChange && (
          <div className="flex bg-slate-100 p-0.5 rounded-lg">
            {(['INR', 'USD'] as const).map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => onCurrencyChange(cur)}
                className={`px-2 py-0.5 text-3xs font-bold rounded-md cursor-pointer transition ${
                  currency === cur
                    ? 'bg-white text-brand-600 shadow-soft'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {cur}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          placeholder={placeholderMin}
          value={min}
          onChange={(e) => onMinChange(e.target.value)}
          className={inputClass}
        />
        <input
          type="number"
          placeholder={placeholderMax}
          value={max}
          onChange={(e) => onMaxChange(e.target.value)}
          className={inputClass}
        />
      </div>
    </div>
  );
};
