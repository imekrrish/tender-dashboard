import {
  clearPriceIndexCache,
  getPriceIndexData,
  getPriceIndexMeta,
  queryPriceIndex,
} from '../services/priceIndexService.js';

/**
 * GET /api/price-index/meta
 * Catalogue of components, sub-groups and series plus the publication date axis.
 */
export function getMeta(req, res) {
  try {
    res.json(getPriceIndexMeta());
  } catch (error) {
    console.error('Price index metadata error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/price-index/query
 * Body: { components, groups, seriesIds, from, to, activeOnly }
 */
export function query(req, res) {
  try {
    res.json(queryPriceIndex(req.body || {}));
  } catch (error) {
    console.error('Price index query error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/price-index/upload
 * Accepts the next weekly TaiyangNews workbook and re-parses it immediately.
 */
export function uploadPriceIndexFile(req, res) {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, error: 'No file uploaded or file rejected by validator.' });
    }

    clearPriceIndexCache();
    const data = getPriceIndexData(true);
    const meta = getPriceIndexMeta();

    res.json({
      success: true,
      fileName: meta.fileName,
      latestDate: meta.latestDate,
      totalWeeks: meta.totalWeeks,
      seriesCount: data.series.length,
    });
  } catch (error) {
    // A workbook missing Sheet2 (or with a changed layout) lands here — surface
    // the reason so the operator knows the upload was rejected, not silently lost.
    console.error('Price index upload error:', error);
    clearPriceIndexCache();
    res.status(500).json({ success: false, error: error.message });
  }
}
