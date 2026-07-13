import { exportToXlsx, exportToCsv } from '../services/exportService.js';

/**
 * POST /api/export/xlsx
 * Exports filtered records into an XLSX file.
 */
export function downloadXlsx(req, res) {
  try {
    const { filters, visibleColumns, sort, search } = req.body;
    const buffer = exportToXlsx({ filters, visibleColumns, sort, search });
    
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="auction-tracker-filtered-${dateStr}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Error downloading XLSX:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/export/csv
 * Exports filtered records into a CSV file.
 */
export function downloadCsv(req, res) {
  try {
    const { filters, visibleColumns, sort, search } = req.body;
    const csvContent = exportToCsv({ filters, visibleColumns, sort, search });
    
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="auction-tracker-filtered-${dateStr}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error downloading CSV:', error);
    res.status(500).json({ error: error.message });
  }
}
