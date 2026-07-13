import React from 'react';
import { MultiSelectFilter } from './MultiSelectFilter';
import { Select } from '../ui/Select';

interface DateFilterProps {
  dateFields: { label: string; value: string }[];
  selectedField: string;
  onFieldChange: (field: string) => void;
  years: number[];
  selectedYears: number[];
  onYearsChange: (years: number[]) => void;
  minDate: string;
  maxDate: string;
  onMinDateChange: (val: string) => void;
  onMaxDateChange: (val: string) => void;
}

export const DateFilter: React.FC<DateFilterProps> = ({
  dateFields,
  selectedField,
  onFieldChange,
  years,
  selectedYears,
  onYearsChange,
  minDate,
  maxDate,
  onMinDateChange,
  onMaxDateChange,
}) => {
  const controlClass =
    'w-full px-3 h-9 text-sm bg-white rounded-lg text-slate-700 ring-1 ring-line-strong focus:outline-none focus:ring-2 focus:ring-brand-500 transition';

  return (
    <div className="flex flex-col gap-3.5 p-3.5 bg-slate-50/70 rounded-xl ring-1 ring-line">
      <Select
        label="Date field"
        value={selectedField}
        onChange={onFieldChange}
        options={dateFields.map((f) => ({ label: f.label, value: f.value }))}
      />

      <MultiSelectFilter
        label="Year"
        options={years.map(String)}
        selected={selectedYears.map(String)}
        onChange={(val) => onYearsChange(val.map(Number))}
        placeholder="All years"
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-2xs font-semibold text-slate-500">Date range</label>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-3xs font-medium text-slate-400">From</span>
            <input
              type="date"
              value={minDate}
              onChange={(e) => onMinDateChange(e.target.value)}
              className={`${controlClass} cursor-pointer tnum`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-3xs font-medium text-slate-400">To</span>
            <input
              type="date"
              value={maxDate}
              onChange={(e) => onMaxDateChange(e.target.value)}
              className={`${controlClass} cursor-pointer tnum`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
