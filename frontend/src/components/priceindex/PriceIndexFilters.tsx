import React from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { FilterSection } from '../filters/FilterSection';
import type { PriceIndexFilters, PriceIndexMeta } from '../../types/priceIndex';

export interface DateRangePreset {
  id: string;
  label: string;
  /** Resolve the window start from the workbook's own date axis. */
  resolve: (meta: PriceIndexMeta) => string | null;
}

/**
 * "2024 to date" is the default the client asked for: the index starts in 2023,
 * but the useful comparison window opens at the start of 2024.
 */
export const DATE_PRESETS: DateRangePreset[] = [
  { id: '2024', label: '2024 to date', resolve: () => '2024-01-01' },
  { id: '2025', label: '2025 to date', resolve: () => '2025-01-01' },
  {
    id: 'ytd',
    label: 'This year',
    resolve: (meta) => (meta.latestDate ? `${meta.latestDate.slice(0, 4)}-01-01` : null),
  },
  {
    id: '26w',
    label: 'Last 26 weeks',
    resolve: (meta) => meta.dates[Math.max(0, meta.dates.length - 26)] || null,
  },
  {
    id: '12w',
    label: 'Last 12 weeks',
    resolve: (meta) => meta.dates[Math.max(0, meta.dates.length - 12)] || null,
  },
  { id: 'all', label: 'All history', resolve: (meta) => meta.firstDate },
];

interface PriceIndexFiltersPanelProps {
  meta: PriceIndexMeta;
  filters: PriceIndexFilters;
  setFilters: React.Dispatch<React.SetStateAction<PriceIndexFilters>>;
  activePreset: string;
  onPresetChange: (presetId: string) => void;
  onClearAll: () => void;
  seriesSearch: string;
  onSeriesSearchChange: (value: string) => void;
}

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export const PriceIndexFiltersPanel: React.FC<PriceIndexFiltersPanelProps> = ({
  meta,
  filters,
  setFilters,
  activePreset,
  onPresetChange,
  onClearAll,
  seriesSearch,
  onSeriesSearchChange,
}) => {
  // Sub-groups narrow to whatever components are currently selected.
  const visibleComponents = filters.components.length
    ? meta.components.filter((c) => filters.components.includes(c.component))
    : meta.components;

  const availableGroups = Array.from(
    new Set(visibleComponents.flatMap((c) => c.groups))
  ).sort();

  const candidateSeries = meta.series
    .filter((s) => (filters.activeOnly ? s.isActive : true))
    .filter((s) => !filters.components.length || filters.components.includes(s.component))
    .filter((s) => !filters.groups.length || filters.groups.includes(s.group))
    .filter((s) =>
      seriesSearch.trim()
        ? `${s.name} ${s.spec} ${s.component} ${s.group}`
            .toLowerCase()
            .includes(seriesSearch.trim().toLowerCase())
        : true
    );

  const activeFilterCount =
    filters.components.length + filters.groups.length + filters.seriesIds.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900">Filters</h2>
          <p className="text-2xs text-slate-400 font-medium mt-0.5">
            {activeFilterCount > 0 ? `${activeFilterCount} active` : 'No filters applied'}
          </p>
        </div>
        <button
          onClick={onClearAll}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-2xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {/* ------------------------------------------------------------ period */}
      <FilterSection title="Period" sectionKey="pi-period">
        <div className="grid grid-cols-2 gap-1.5">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onPresetChange(preset.id)}
              className={`px-2.5 py-1.5 rounded-lg text-2xs font-semibold transition cursor-pointer ring-1 ${
                activePreset === preset.id
                  ? 'bg-brand-50 text-brand-700 ring-brand-200'
                  : 'bg-white text-slate-500 ring-line hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <label className="flex flex-col gap-1">
            <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider">
              From
            </span>
            <input
              type="date"
              value={filters.from || ''}
              min={meta.firstDate || undefined}
              max={meta.latestDate || undefined}
              onChange={(e) => {
                onPresetChange('custom');
                setFilters((f) => ({ ...f, from: e.target.value || null }));
              }}
              className="w-full px-2 py-1.5 rounded-lg text-2xs bg-white ring-1 ring-line focus:ring-brand-500 focus:outline-none text-slate-700"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider">
              To
            </span>
            <input
              type="date"
              value={filters.to || ''}
              min={meta.firstDate || undefined}
              max={meta.latestDate || undefined}
              onChange={(e) => {
                onPresetChange('custom');
                setFilters((f) => ({ ...f, to: e.target.value || null }));
              }}
              className="w-full px-2 py-1.5 rounded-lg text-2xs bg-white ring-1 ring-line focus:ring-brand-500 focus:outline-none text-slate-700"
            />
          </label>
        </div>
      </FilterSection>

      {/* --------------------------------------------------------- components */}
      <FilterSection title="Component" sectionKey="pi-component">
        <div className="flex flex-col gap-1">
          {meta.components.map((c) => (
            <label
              key={c.component}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer transition"
            >
              <input
                type="checkbox"
                checked={filters.components.includes(c.component)}
                onChange={() =>
                  setFilters((f) => ({
                    ...f,
                    components: toggle(f.components, c.component),
                    // Sub-group and series picks belong to the old component set.
                    groups: [],
                    seriesIds: [],
                  }))
                }
                className="w-3.5 h-3.5 rounded border-line-strong cursor-pointer"
              />
              <span className="text-xs font-medium text-slate-700 flex-1">{c.component}</span>
              <span className="text-3xs text-slate-400 tnum">
                {filters.activeOnly ? c.activeCount : c.seriesCount}
              </span>
            </label>
          ))}
        </div>
      </FilterSection>

      {/* ------------------------------------------------------------- groups */}
      <FilterSection title="Sub-component" sectionKey="pi-group">
        <div className="flex flex-wrap gap-1.5">
          {availableGroups.map((group) => (
            <button
              key={group}
              onClick={() =>
                setFilters((f) => ({ ...f, groups: toggle(f.groups, group), seriesIds: [] }))
              }
              className={`px-2.5 py-1.5 rounded-lg text-2xs font-semibold transition cursor-pointer ring-1 ${
                filters.groups.includes(group)
                  ? 'bg-brand-50 text-brand-700 ring-brand-200'
                  : 'bg-white text-slate-500 ring-line hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {group}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* ------------------------------------------------------------- series */}
      <FilterSection title="Series" sectionKey="pi-series">
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="search"
            value={seriesSearch}
            onChange={(e) => onSeriesSearchChange(e.target.value)}
            placeholder="Search series…"
            className="w-full pl-8 pr-2.5 py-1.5 rounded-lg text-2xs bg-white ring-1 ring-line focus:ring-brand-500 focus:outline-none text-slate-700 placeholder:text-slate-400"
          />
        </div>

        <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5 pr-1">
          {candidateSeries.length === 0 && (
            <p className="text-2xs text-slate-400 px-2 py-3">No series match this search.</p>
          )}
          {candidateSeries.map((s) => (
            <label
              key={s.id}
              className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer transition"
            >
              <input
                type="checkbox"
                checked={filters.seriesIds.includes(s.id)}
                onChange={() => setFilters((f) => ({ ...f, seriesIds: toggle(f.seriesIds, s.id) }))}
                className="w-3.5 h-3.5 mt-0.5 rounded border-line-strong cursor-pointer shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-2xs font-medium text-slate-700 leading-snug">
                  {s.name}
                </span>
                <span className="block text-3xs text-slate-400">
                  {s.component} · {s.unit}
                </span>
              </span>
            </label>
          ))}
        </div>

        {filters.seriesIds.length > 0 && (
          <button
            onClick={() => setFilters((f) => ({ ...f, seriesIds: [] }))}
            className="mt-2 text-2xs font-semibold text-brand-600 hover:text-brand-700 cursor-pointer"
          >
            Clear {filters.seriesIds.length} selected
          </button>
        )}
      </FilterSection>

      {/* -------------------------------------------------------------- scope */}
      <FilterSection title="Scope" sectionKey="pi-scope">
        <label className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer transition">
          <input
            type="checkbox"
            checked={filters.activeOnly}
            onChange={() =>
              setFilters((f) => ({ ...f, activeOnly: !f.activeOnly, seriesIds: [] }))
            }
            className="w-3.5 h-3.5 mt-0.5 rounded border-line-strong cursor-pointer shrink-0"
          />
          <span>
            <span className="block text-xs font-medium text-slate-700">
              Currently quoted only
            </span>
            <span className="block text-3xs text-slate-400 leading-snug mt-0.5">
              Hides products that have come off the index, such as the PERC and p-type lines.
            </span>
          </span>
        </label>
      </FilterSection>
    </div>
  );
};
