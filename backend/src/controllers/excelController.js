import { parseExcelData, clearCache } from '../services/excelParserService.js';
import { getExcelMetadata } from '../services/metadataService.js';

/**
 * GET /api/excel/metadata
 * Exposes active file statistics and column schema rules.
 */
export function getMetadata(req, res) {
  try {
    const metadata = getExcelMetadata();
    res.json(metadata);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/excel/upload
 * Processes multer file upload, clears cache, and returns dynamic metadata properties.
 */
export function uploadExcelFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded or file rejected by validator.' });
    }

    // Force re-parsing the newly uploaded spreadsheet by resetting cache
    clearCache();
    const db = parseExcelData(true);
    const metadata = db.metadata;

    res.json({
      success: true,
      fileName: metadata.fileName,
      totalRows: metadata.totalRows,
      totalColumns: metadata.totalColumns,
      columns: metadata.columns,
      sheets: metadata.sheets
    });
  } catch (error) {
    console.error('Error handling upload of excel file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
