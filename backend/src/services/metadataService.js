import { parseExcelData } from './excelParserService.js';

/**
 * Retrieves cached or freshly parsed schema metadata of the active Excel workbook.
 */
export function getExcelMetadata() {
  const { metadata } = parseExcelData();
  return metadata;
}
