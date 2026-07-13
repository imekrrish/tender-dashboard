import { getExcelMetadata } from './metadataService.js';

/**
 * Dynamically filters tender records based on column metadata and incoming filter values.
 * Uses AND logic across different fields, and OR logic within multi-value options.
 */
export function filterTenders(tenders, filtersInput) {
  if (!filtersInput || Object.keys(filtersInput).length === 0) {
    return tenders;
  }
  
  const metadata = getExcelMetadata();
  const columns = metadata.columns;
  
  return tenders.filter(({ normalized }) => {
    for (const [key, filterVal] of Object.entries(filtersInput)) {
      if (filterVal === null || filterVal === undefined) continue;

      // 1. Year filters on date columns (e.g. expectedCompletionYear)
      if (key.endsWith('Year')) {
        const baseKey = key.slice(0, -4);
        const colMeta = columns.find(c => c.key === baseKey);
        if (colMeta && colMeta.type === 'date') {
          const selectedYears = Array.isArray(filterVal) 
            ? filterVal.map(Number).filter(y => !isNaN(y)) 
            : [];
          if (selectedYears.length > 0) {
            const rowYearVal = normalized[key];
            if (rowYearVal === null || rowYearVal === undefined || !selectedYears.includes(Number(rowYearVal))) {
              return false;
            }
          }
          continue;
        }
      }

      const colMeta = columns.find(c => c.key === key);
      if (!colMeta) continue;

      // 2. Text filters (Multi-select)
      if (colMeta.type === 'text') {
        const selectedList = Array.isArray(filterVal) ? filterVal : [];
        if (selectedList.length > 0) {
          const rowVal = String(normalized[key] || '').toLowerCase().trim();
          const matched = selectedList.some(
            v => String(v).toLowerCase().trim() === rowVal
          );
          if (!matched) return false;
        }
      } 
      // 3. Number filters (Range)
      else if (colMeta.type === 'number') {
        const val = normalized[key];
        const minVal = filterVal.min;
        const maxVal = filterVal.max;

        const hasMin = minVal !== undefined && minVal !== null && minVal !== '';
        const hasMax = maxVal !== undefined && maxVal !== null && maxVal !== '';

        if (hasMin || hasMax) {
          if (val === null || val === undefined || isNaN(val)) {
            return false;
          }
          if (hasMin && val < Number(minVal)) return false;
          if (hasMax && val > Number(maxVal)) return false;
        }
      } 
      // 4. Date filters (Range)
      else if (colMeta.type === 'date') {
        const val = normalized[key]; // Date is a YYYY-MM-DD string
        const minDate = filterVal.min;
        const maxDate = filterVal.max;

        const hasMin = minDate !== undefined && minDate !== null && minDate !== '';
        const hasMax = maxDate !== undefined && maxDate !== null && maxDate !== '';

        if (hasMin || hasMax) {
          if (val === null || val === undefined || val === '') {
            return false;
          }
          if (hasMin && val < minDate) return false;
          if (hasMax && val > maxDate) return false;
        }
      }
    }
    return true;
  });
}

/**
 * Returns dynamic list of unique options for each filterable column.
 */
export function getUniqueFilterValues(tenders) {
  const metadata = getExcelMetadata();
  const filterableColumns = metadata.columns.filter(c => c.isFilterable);
  const dateColumns = metadata.columns.filter(c => c.isDate);

  const filtersOptions = {};

  // Initialize arrays
  filterableColumns.forEach(col => {
    filtersOptions[col.key] = new Set();
  });

  // Extract unique values
  tenders.forEach(({ normalized }) => {
    filterableColumns.forEach(col => {
      const val = normalized[col.key];
      if (val !== null && val !== undefined && val !== '') {
        filtersOptions[col.key].add(val);
      }
    });
  });

  // Convert Sets to sorted Arrays
  const options = {};
  filterableColumns.forEach(col => {
    options[col.key] = Array.from(filtersOptions[col.key]).sort();
  });

  // Accumulate years from all date fields
  const yearsSet = new Set();
  tenders.forEach(({ normalized }) => {
    dateColumns.forEach(col => {
      const yr = normalized[`${col.key}Year`];
      if (yr !== null && yr !== undefined && !isNaN(yr)) {
        yearsSet.add(yr);
      }
    });
  });

  options.years = Array.from(yearsSet).sort((a, b) => a - b);

  return options;
}
