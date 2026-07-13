import React, { useMemo } from 'react';
import { FilterSection } from './FilterSection';
import { MultiSelectFilter } from './MultiSelectFilter';
import { RangeFilter } from './RangeFilter';
import { DateFilter } from './DateFilter';
import type { FilterState } from '../../types/tender';
import { prettyKey } from '../../utils/columnLabels';
import { SlidersHorizontal, Eraser } from 'lucide-react';

interface FilterPanelProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  filterOptions: Record<string, string[] | number[]>;
  metadata: {
    columns: {
      key: string;
      originalName: string;
      type: string;
      isFilterable: boolean;
      isMetric: boolean;
      isDate: boolean;
    }[];
  };
  onClearAll: () => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  setFilters,
  filterOptions,
  metadata,
  onClearAll,
}) => {
  const columns = metadata.columns;

  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const hasOptions = (key: string) => {
    return filterOptions[key] && filterOptions[key].length > 0;
  };

  const geoColumns = useMemo(() => {
    return ['region', 'country', 'state'].filter(hasOptions);
  }, [filterOptions]);

  const countryOptions = useMemo(() => {
    const rawCountries = (filterOptions.country as string[]) || [];
    const selectedRegions = filters.region as string[];
    if (!selectedRegions || selectedRegions.length === 0) {
      return rawCountries;
    }
    return rawCountries;
  }, [filters.region, filterOptions.country]);

  const projectDetailColumns = useMemo(() => {
    return ['technology', 'installationType', 'developmentStatus', 'programName'].filter(hasOptions);
  }, [filterOptions]);

  const orgColumns = useMemo(() => {
    return [
      'issuingAuthority',
      'developer',
      'epc',
      'moduleSupplier',
      'inverterSupplier',
      'bessSupplier',
      'floaterSupplier',
      'trackerSupplier',
    ].filter(hasOptions);
  }, [filterOptions]);

  const numberColumns = useMemo(() => {
    return columns.filter((col) => col.type === 'number').map((col) => col.key);
  }, [columns]);

  const dateColumns = useMemo(() => {
    return columns.filter((col) => col.type === 'date');
  }, [columns]);

  const dateFieldsForSelector = useMemo(() => {
    return dateColumns.map((col) => ({
      label: prettyKey(col.key, col.originalName),
      value: col.key,
    }));
  }, [dateColumns]);

  const activeDateKey = filters.activeDateKey || dateFieldsForSelector[0]?.value || '';

  const handleDateSelectorChange = (field: string) => {
    setFilters((prev) => {
      const prevDateKey = prev.activeDateKey || '';
      const next: FilterState = {
        ...prev,
        activeDateKey: field,
      };
      if (prevDateKey) {
        next[`${prevDateKey}Year`] = [];
        next[prevDateKey] = { min: '', max: '' };
      }
      return next;
    });
  };

  // Count of active filters for the badge
  const activeCount = useMemo(() => {
    let n = 0;
    Object.entries(filters).forEach(([key, val]) => {
      if (key === 'tariffCurrency' || key === 'activeDateKey') return;
      if (Array.isArray(val)) n += val.length > 0 ? 1 : 0;
      else if (val && typeof val === 'object') {
        if ((val as any).min || (val as any).max) n += 1;
      }
    });
    return n;
  }, [filters]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-brand-600" />
          <span className="text-sm font-semibold text-slate-800">Filters</span>
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-3xs font-bold bg-brand-600 text-white rounded-full tnum">
              {activeCount}
            </span>
          )}
        </div>
        <button
          onClick={onClearAll}
          className="flex items-center gap-1.5 text-2xs font-semibold text-slate-400 hover:text-brand-600 hover:bg-brand-50 px-2 py-1 rounded-md transition cursor-pointer"
        >
          <Eraser className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      <div className="flex flex-col gap-1 overflow-y-auto -mr-2 pr-2 select-none">
        {geoColumns.length > 0 && (
          <FilterSection title="Geography" sectionKey="geography">
            {geoColumns.includes('region') && (
              <MultiSelectFilter
                label="Region"
                options={(filterOptions.region as string[]) || []}
                selected={(filters.region as string[]) || []}
                onChange={(val) => handleFilterChange('region', val)}
                placeholder="All regions"
              />
            )}
            {geoColumns.includes('country') && (
              <MultiSelectFilter
                label="Country"
                options={countryOptions}
                selected={(filters.country as string[]) || []}
                onChange={(val) => handleFilterChange('country', val)}
                placeholder="All countries"
                searchable
              />
            )}
            {geoColumns.includes('state') && (
              <MultiSelectFilter
                label="State"
                options={(filterOptions.state as string[]) || []}
                selected={(filters.state as string[]) || []}
                onChange={(val) => handleFilterChange('state', val)}
                placeholder="All states"
                searchable
              />
            )}
          </FilterSection>
        )}

        {projectDetailColumns.length > 0 && (
          <FilterSection title="Project Details" sectionKey="project-details">
            {projectDetailColumns.map((colKey) => {
              const colMeta = columns.find((c) => c.key === colKey);
              const nice = prettyKey(colKey, colMeta?.originalName);
              return (
                <MultiSelectFilter
                  key={colKey}
                  label={nice}
                  options={(filterOptions[colKey] as string[]) || []}
                  selected={(filters[colKey] as string[]) || []}
                  onChange={(val) => handleFilterChange(colKey, val)}
                  placeholder={`All ${nice}`}
                />
              );
            })}
          </FilterSection>
        )}

        {orgColumns.length > 0 && (
          <FilterSection title="Organizations" sectionKey="organizations">
            {orgColumns.map((colKey) => {
              const colMeta = columns.find((c) => c.key === colKey);
              const nice = prettyKey(colKey, colMeta?.originalName);
              return (
                <MultiSelectFilter
                  key={colKey}
                  label={nice}
                  options={(filterOptions[colKey] as string[]) || []}
                  selected={(filters[colKey] as string[]) || []}
                  onChange={(val) => handleFilterChange(colKey, val)}
                  placeholder={`Search ${nice}`}
                  searchable
                />
              );
            })}
          </FilterSection>
        )}

        {dateFieldsForSelector.length > 0 && (
          <FilterSection title="Timeline" sectionKey="timeline">
            <DateFilter
              dateFields={dateFieldsForSelector}
              selectedField={activeDateKey}
              onFieldChange={handleDateSelectorChange}
              years={(filterOptions.years as number[]) || []}
              selectedYears={(filters[`${activeDateKey}Year`] as number[]) || []}
              onYearsChange={(val) => handleFilterChange(`${activeDateKey}Year`, val)}
              minDate={(filters[activeDateKey] as any)?.min || ''}
              maxDate={(filters[activeDateKey] as any)?.max || ''}
              onMinDateChange={(val) =>
                handleFilterChange(activeDateKey, {
                  ...((filters[activeDateKey] as any) || {}),
                  min: val,
                })
              }
              onMaxDateChange={(val) =>
                handleFilterChange(activeDateKey, {
                  ...((filters[activeDateKey] as any) || {}),
                  max: val,
                })
              }
            />
          </FilterSection>
        )}

        {numberColumns.length > 0 && (
          <FilterSection title="Numeric Ranges" sectionKey="ranges">
            {numberColumns.map((colKey) => {
              const colMeta = columns.find((c) => c.key === colKey);
              const isTariff = colKey.includes('winningTariff') || colKey.includes('tariff');

              let currencyProp: 'INR' | 'USD' | undefined = undefined;
              let onCurrencyChange: ((curr: 'INR' | 'USD') => void) | undefined = undefined;

              if (isTariff) {
                currencyProp = filters.tariffCurrency || 'INR';
                onCurrencyChange = (curr) => {
                  handleFilterChange('tariffCurrency', curr);
                };
              }

              const val = (filters[colKey] as any) || { min: '', max: '' };

              return (
                <RangeFilter
                  key={colKey}
                  label={prettyKey(colKey, colMeta?.originalName)}
                  min={val.min || ''}
                  max={val.max || ''}
                  onMinChange={(minVal) => handleFilterChange(colKey, { ...val, min: minVal })}
                  onMaxChange={(maxVal) => handleFilterChange(colKey, { ...val, max: maxVal })}
                  currency={currencyProp}
                  onCurrencyChange={onCurrencyChange}
                />
              );
            })}
          </FilterSection>
        )}
      </div>
    </div>
  );
};
