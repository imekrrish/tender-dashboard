import xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { excelDateToJSDate, extractYear } from '../utils/dateUtils.js';
import { normalizeNumber } from '../utils/numberUtils.js';
import { normalizeColumnName } from '../utils/normalizeColumnName.js';
import { detectColumnType } from '../utils/detectColumnType.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const UPLOADED_EXCEL_PATH = path.join(UPLOADS_DIR, 'current-database.xlsx');
const DEFAULT_EXCEL_PATH = path.join(__dirname, '../data/Auction Tracker Database_Version 1.xlsx');

let cachedDb = {
  tenders: null,
  news: null,
  metadata: null
};

/**
 * Returns the path of the active Excel file.
 * Priority: 1. Uploaded file, 2. Default workspace file
 */
export function getActiveExcelPath() {
  if (fs.existsSync(UPLOADED_EXCEL_PATH)) {
    return UPLOADED_EXCEL_PATH;
  }
  return DEFAULT_EXCEL_PATH;
}

/**
 * Parses the active Excel sheet dynamically.
 */
export function parseExcelData(forceReload = false) {
  if (!forceReload && cachedDb.tenders && cachedDb.metadata) {
    return cachedDb;
  }

  const excelPath = getActiveExcelPath();
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel database file not found at ${excelPath}`);
  }

  try {
    const workbook = xlsx.readFile(excelPath, { defval: null });
    const sheets = workbook.SheetNames;
    const activeSheetName = sheets[0]; // main sheet
    const mainSheet = workbook.Sheets[activeSheetName];
    
    // Read raw values to detect headers and column values accurately
    const rawData = xlsx.utils.sheet_to_json(mainSheet, { header: 1, defval: null });
    if (rawData.length === 0) {
      throw new Error("Active sheet is empty");
    }

    const rawHeaders = rawData[0] || [];
    // Clean and filter empty header strings
    const headers = rawHeaders.map(h => String(h || '').trim()).filter(h => h !== '');

    // Identify a serial/index column so it doesn't count as "real" content
    const serialIdx = rawHeaders.findIndex(h =>
      /^\s*(serial\s*number|serial|sr\.?\s*no\.?|s\.?\s*no\.?|#)\s*$/i.test(String(h || ''))
    );

    // Extract data rows (excluding header row) and drop fully-blank rows.
    // The source workbook is padded with hundreds of empty rows; keeping them
    // inflates counts and floods the table with empty "—" cells.
    const rawRows = rawData.slice(1).filter((row) => {
      if (!Array.isArray(row)) return false;
      return row.some((cell, idx) =>
        idx !== serialIdx &&
        idx < rawHeaders.length &&
        cell !== null &&
        cell !== undefined &&
        String(cell).trim() !== ''
      );
    });

    // Group values by header columns for type detection
    const columnsValues = {};
    headers.forEach((header) => {
      columnsValues[header] = [];
    });

    rawRows.forEach((row) => {
      headers.forEach((header, idx) => {
        if (row && idx < row.length) {
          columnsValues[header].push(row[idx]);
        } else {
          columnsValues[header].push(null);
        }
      });
    });

    // Detect column types and configurations dynamically
    const columnsMetadata = headers.map((header) => {
      const values = columnsValues[header] || [];
      const type = detectColumnType(values, header);
      const key = normalizeColumnName(header);
      const uniqueVals = new Set(values.filter(v => v !== null && v !== undefined && v !== ''));

      return {
        key,
        originalName: header,
        type,
        // Heuristic: filterable if text type and cardinality is reasonable (< 200)
        isFilterable: type === 'text' && uniqueVals.size < 200 && !['projectName', 'remarks', 'link'].includes(key),
        isMetric: type === 'number',
        isDate: type === 'date'
      };
    });

    // Normalize rows using schema metadata
    const parsedTenders = rawRows.map((row, rowIdx) => {
      const original = {};
      const normalized = { id: rowIdx + 1 };

      headers.forEach((header, colIdx) => {
        const meta = columnsMetadata.find(m => m.originalName === header);
        const rawVal = row && colIdx < row.length ? row[colIdx] : null;
        original[header] = rawVal;

        let normVal = rawVal;
        if (meta.type === 'number') {
          normVal = normalizeNumber(rawVal);
        } else if (meta.type === 'date') {
          normVal = excelDateToJSDate(rawVal);
          // Auto-inject a year key for date dimensions to support dynamic filtering
          normalized[`${meta.key}Year`] = extractYear(normVal);
        } else if (meta.type === 'url') {
          normVal = String(rawVal || '').trim();
        } else {
          const strVal = String(rawVal === null || rawVal === undefined ? '' : rawVal).trim();
          normVal = (strVal.toUpperCase() === 'NA' || strVal.toUpperCase() === 'N/A') ? '' : strVal;
        }

        normalized[meta.key] = normVal;
      });

      return { original, normalized };
    });

    // Parse Sheet2 for news updates if it exists
    let parsedNews = [];
    if (sheets.length > 1) {
      const newsSheetName = sheets[1];
      const newsSheet = workbook.Sheets[newsSheetName];
      const rawNewsData = xlsx.utils.sheet_to_json(newsSheet, { range: 1, defval: null });
      parsedNews = rawNewsData.map((row, idx) => {
        return {
          id: idx + 1,
          date: excelDateToJSDate(row['Date']),
          country: String(row['Country'] || '').trim(),
          news: String(row['News'] || '').trim(),
          acquirer: String(row['Acquirer (Buyer)'] || '').trim(),
          acquiree: String(row['Acquiree (target company)'] || '').trim(),
          stake: row['Stake'] !== undefined ? row['Stake'] : '',
          investmentUSD: String(row['Investment (USD)'] || '').trim(),
          marketImpact: String(row['Market Impact'] || '').trim()
        };
      });
    }

    // Build database status summary
    const fileStats = fs.statSync(excelPath);
    const metadata = {
      fileName: path.basename(excelPath),
      lastUploadedTime: fileStats.mtime.toISOString(),
      sheets,
      activeSheet: activeSheetName,
      totalRows: parsedTenders.length,
      totalColumns: headers.length,
      columns: columnsMetadata
    };

    cachedDb = {
      tenders: parsedTenders,
      news: parsedNews,
      metadata
    };

    return cachedDb;
  } catch (error) {
    console.error('Error parsing dynamic Excel workbook:', error);
    throw error;
  }
}

/**
 * Resets the in-memory parsed data cache.
 */
export function clearCache() {
  cachedDb = {
    tenders: null,
    news: null,
    metadata: null
  };
}
