/**
 * Aggregates and groups rows based on chart configuration.
 * Groups by xAxis, optionally pivots on groupBy field, and applies yAxis aggregation.
 */
export function aggregateData(rows, chartConfig, filters = {}) {
  const { xAxis, yAxis, groupBy, aggregation } = chartConfig;

  // 1. Resolve field mappings
  const activeYearType = filters.yearType || 'expectedCompletionYear';
  const xAxisKey = mapField(xAxis, activeYearType);
  const yAxisKey = mapMetric(yAxis);
  const groupByKey = groupBy ? mapField(groupBy, activeYearType) : null;

  // 2. Group rows by xAxis key
  const groups = {};

  rows.forEach(row => {
    let xVal = row[xAxisKey];
    if (xVal === null || xVal === undefined || xVal === '') {
      xVal = 'N/A';
    } else {
      xVal = String(xVal);
    }

    if (!groups[xVal]) {
      groups[xVal] = [];
    }
    groups[xVal].push(row);
  });

  // 3. For each group, compute aggregation and pivot if groupBy is defined
  const chartData = Object.entries(groups).map(([xVal, groupRows]) => {
    const item = {
      [xAxis]: xVal // dynamically use the xAxis parameter name as key
    };

    if (groupByKey) {
      // Pivot rows by groupBy value
      const subGroups = {};
      groupRows.forEach(row => {
        let subVal = row[groupByKey];
        if (subVal === null || subVal === undefined || subVal === '') {
          subVal = 'N/A';
        } else {
          subVal = String(subVal);
        }
        if (!subGroups[subVal]) {
          subGroups[subVal] = [];
        }
        subGroups[subVal].push(row);
      });

      // Aggregate each pivot subgroup
      Object.entries(subGroups).forEach(([subVal, subRows]) => {
        item[subVal] = computeMetric(subRows, yAxisKey, aggregation);
      });
    } else {
      // Just aggregate directly for the xAxis value
      item[yAxis] = computeMetric(groupRows, yAxisKey, aggregation);
    }

    return item;
  });

  // Sort by xAxis value to keep it neat
  return chartData.sort((a, b) => {
    const aVal = a[xAxis];
    const bVal = b[xAxis];
    if (!isNaN(aVal) && !isNaN(bVal)) {
      return Number(aVal) - Number(bVal);
    }
    return String(aVal).localeCompare(String(bVal));
  });
}

/**
 * Maps readable front-end field labels or identifiers to backend row properties.
 */
function mapField(field, defaultYearType) {
  if (!field) return '';
  const f = field.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (f === 'country') return 'country';
  if (f === 'region') return 'region';
  if (f === 'state') return 'state';
  if (f === 'technologyspecification' || f === 'technology') return 'technology';
  if (f === 'installationtype') return 'installationType';
  if (f === 'developmentstatus') return 'developmentStatus';
  if (f === 'issuingauthority') return 'issuingAuthority';
  if (f === 'tenderwinnerdeveloper' || f === 'developer') return 'developer';
  if (f === 'programname') return 'programName';
  if (f === 'year') return defaultYearType;
  return field;
}

/**
 * Maps readable front-end metric labels to numeric fields.
 */
function mapMetric(metric) {
  if (!metric) return 'pvCapacityMW';
  const m = metric.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (m === 'pvcapacitymw' || m === 'pvcapacity' || m === 'sumofpvcapacity') return 'pvCapacityMW';
  if (m === 'winningtariffinr' || m === 'tariffinr' || m === 'averagewinningtariffinr') return 'winningTariffINR';
  if (m === 'winningtariffusd' || m === 'tariffusd' || m === 'averagewinningtariffusd') return 'winningTariffUSD';
  if (m === 'ppatenureyears' || m === 'ppatenure' || m === 'averageppatenure') return 'ppaTenureYears';
  if (m === 'count' || m === 'projectscount' || m === 'countofprojects') return 'id';
  return metric;
}

/**
 * Applies aggregation mathematical formula.
 */
function computeMetric(rows, field, aggregation) {
  const agg = (aggregation || 'sum').toLowerCase();
  
  if (agg === 'count' || field === 'id') {
    return rows.length;
  }

  // Filter out invalid/NA values
  const values = rows
    .map(r => r[field])
    .filter(val => val !== null && val !== undefined && !isNaN(val))
    .map(Number);

  if (values.length === 0) return 0;

  switch (agg) {
    case 'sum':
      return Number(values.reduce((sum, val) => sum + val, 0).toFixed(2));
    case 'average':
    case 'avg':
      const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
      return Number(avg.toFixed(3));
    case 'min':
      return Number(Math.min(...values).toFixed(3));
    case 'max':
      return Number(Math.max(...values).toFixed(3));
    default:
      return Number(values.reduce((sum, val) => sum + val, 0).toFixed(2));
  }
}
