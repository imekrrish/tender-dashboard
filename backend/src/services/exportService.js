import { parseExcelData } from './excelParserService.js';
import { filterTenders } from './filterService.js';
import xlsx from 'xlsx';

/**
 * Filter, search, and sort records before exporting.
 */
function getFilteredRowsForExport(filters, search, sort) {
  const { tenders, metadata } = parseExcelData();
  let rows = filterTenders(tenders, filters);

  // Apply search filter (case-insensitive across normalized values)
  if (search && search.trim()) {
    const term = search.toLowerCase().trim();
    rows = rows.filter(({ normalized }) => {
      return Object.entries(normalized).some(([k, val]) => {
        // Skip technical keys
        if (k.endsWith('Year') || k === 'id') return false;
        return val !== null && val !== undefined && String(val).toLowerCase().includes(term);
      });
    });
  }

  // Apply sort parameters if any
  if (sort && sort.field && sort.order) {
    const { field, order } = sort;
    rows.sort((a, b) => {
      const valA = a.normalized[field];
      const valB = b.normalized[field];
      if (valA === null || valA === undefined) return order === 'asc' ? 1 : -1;
      if (valB === null || valB === undefined) return order === 'asc' ? -1 : 1;
      
      if (typeof valA === 'number' && typeof valB === 'number') {
        return order === 'asc' ? valA - valB : valB - valA;
      }
      
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return order === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }

  return { rows, metadata };
}

/**
 * Exports tailored rows to XLSX binary buffer.
 */
export function exportToXlsx({ filters, visibleColumns, sort, search }) {
  const { rows, metadata } = getFilteredRowsForExport(filters, search, sort);

  const exportData = rows.map(({ normalized }) => {
    const obj = {};
    metadata.columns.forEach(col => {
      // Skip if column is toggled invisible
      if (visibleColumns && visibleColumns.length > 0 && !visibleColumns.includes(col.key)) {
        return;
      }
      obj[col.originalName] = normalized[col.key];
    });
    return obj;
  });

  const ws = xlsx.utils.json_to_sheet(exportData);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Filtered Tenders');
  
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Exports tailored rows to CSV plain text string.
 */
export function exportToCsv({ filters, visibleColumns, sort, search }) {
  const { rows, metadata } = getFilteredRowsForExport(filters, search, sort);

  const exportData = rows.map(({ normalized }) => {
    const obj = {};
    metadata.columns.forEach(col => {
      if (visibleColumns && visibleColumns.length > 0 && !visibleColumns.includes(col.key)) {
        return;
      }
      obj[col.originalName] = normalized[col.key];
    });
    return obj;
  });

  const ws = xlsx.utils.json_to_sheet(exportData);
  return xlsx.utils.sheet_to_csv(ws);
}
