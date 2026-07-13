import { parseExcelData } from '../services/excelParserService.js';
import { filterTenders, getUniqueFilterValues } from '../services/filterService.js';
import { aggregateData } from '../services/aggregationService.js';

/**
 * Computes dashboard KPI indicators dynamically depending on columns present.
 */
function calculateKpis(rows, columns) {
  const totalProjects = rows.length;

  const capacityCol = columns.find(c => c.key === 'pvCapacityMW');
  const tariffInrCol = columns.find(c => c.key === 'winningTariffINR');
  const tariffUsdCol = columns.find(c => c.key === 'winningTariffUSD');
  const countryCol = columns.find(c => c.key === 'country');
  const developerCol = columns.find(c => c.key === 'developer');
  const statusCol = columns.find(c => c.key === 'developmentStatus');

  let totalCapacityMW = 0;
  if (capacityCol) {
    const capacities = rows
      .map(({ normalized }) => normalized[capacityCol.key])
      .filter(v => v !== null && !isNaN(v));
    totalCapacityMW = Number(capacities.reduce((sum, val) => sum + val, 0).toFixed(2));
  }
  const totalCapacityGW = Number((totalCapacityMW / 1000).toFixed(4));

  let avgTariffINR = 0;
  if (tariffInrCol) {
    const tariffs = rows
      .map(({ normalized }) => normalized[tariffInrCol.key])
      .filter(v => v !== null && !isNaN(v));
    avgTariffINR = tariffs.length > 0
      ? Number((tariffs.reduce((sum, val) => sum + val, 0) / tariffs.length).toFixed(3))
      : 0;
  }

  let avgTariffUSD = 0;
  if (tariffUsdCol) {
    const tariffs = rows
      .map(({ normalized }) => normalized[tariffUsdCol.key])
      .filter(v => v !== null && !isNaN(v));
    avgTariffUSD = tariffs.length > 0
      ? Number((tariffs.reduce((sum, val) => sum + val, 0) / tariffs.length).toFixed(4))
      : 0;
  }

  let countriesCount = 0;
  if (countryCol) {
    countriesCount = new Set(
      rows.map(({ normalized }) => String(normalized[countryCol.key] || '').toLowerCase().trim()).filter(Boolean)
    ).size;
  }

  let developersCount = 0;
  if (developerCol) {
    developersCount = new Set(
      rows.map(({ normalized }) => String(normalized[developerCol.key] || '').toLowerCase().trim()).filter(Boolean)
    ).size;
  }

  let completedCount = 0;
  if (statusCol) {
    completedCount = rows.filter(
      ({ normalized }) => String(normalized[statusCol.key] || '').toLowerCase().trim() === 'completed'
    ).length;
  }

  let planningCount = 0;
  if (statusCol) {
    planningCount = rows.filter(
      ({ normalized }) => String(normalized[statusCol.key] || '').toLowerCase().trim() === 'planning'
    ).length;
  }

  return {
    totalProjects,
    totalCapacityMW,
    totalCapacityGW,
    avgTariffINR,
    avgTariffUSD,
    countriesCount,
    developersCount,
    completedCount,
    planningCount
  };
}

// GET /api/tenders
export function getAllTenders(req, res) {
  try {
    const { tenders } = parseExcelData();
    res.json(tenders.map(t => t.normalized));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// GET /api/tenders/filters
export function getFilters(req, res) {
  try {
    const { tenders } = parseExcelData();
    const filterOptions = getUniqueFilterValues(tenders);
    res.json(filterOptions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// POST /api/tenders/query
export function queryTenders(req, res) {
  try {
    const { filters, chart } = req.body;
    const { tenders, metadata } = parseExcelData();

    // 1. Filter rows
    const filteredRows = filterTenders(tenders, filters);

    // 2. Compute dynamic KPIs
    const summary = calculateKpis(filteredRows, metadata.columns);

    // 3. Compute chart aggregation coordinates
    let chartData = [];
    if (chart) {
      chartData = aggregateData(filteredRows, chart);
    } else {
      // Default: PV Capacity MW by Country
      const capacityCol = metadata.columns.find(c => c.key === 'pvCapacityMW') || { key: 'id' };
      const countryCol = metadata.columns.find(c => c.key === 'country') || { key: 'id' };
      chartData = aggregateData(filteredRows, {
        xAxis: countryCol.key,
        yAxis: capacityCol.key,
        groupBy: null,
        aggregation: 'sum',
        sort: 'desc',
        limit: 'all'
      });
    }

    res.json({
      data: filteredRows.map(r => r.normalized),
      summary,
      chartData
    });
  } catch (error) {
    console.error('Error querying tenders:', error);
    res.status(500).json({ error: error.message });
  }
}

// GET /api/news
export function getNews(req, res) {
  try {
    const { news } = parseExcelData();
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
