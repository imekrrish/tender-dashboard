/**
 * Groups, aggregates, and filters data for chart coordinates dynamically.
 */
export function aggregateData(tenders, chartConfig) {
  const { xAxis, yAxis, groupBy, aggregation, sort = 'desc', limit = 'all' } = chartConfig;
  
  if (!xAxis || !yAxis) return [];

  // 1. Group records by xAxis value
  const groups = {};
  tenders.forEach(({ normalized }) => {
    let xVal = normalized[xAxis];
    if (xVal === null || xVal === undefined || xVal === '') {
      xVal = 'N/A';
    } else {
      xVal = String(xVal);
    }
    if (!groups[xVal]) {
      groups[xVal] = [];
    }
    groups[xVal].push(normalized);
  });

  // 2. Perform aggregation and grouping pivots
  const chartData = Object.entries(groups).map(([xVal, groupRows]) => {
    const item = { [xAxis]: xVal };

    if (groupBy) {
      // Pivot subgroups
      const subGroups = {};
      groupRows.forEach(row => {
        let subVal = row[groupBy];
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

      // Calculate metric for each pivot category
      Object.entries(subGroups).forEach(([subVal, subRows]) => {
        item[subVal] = computeMetric(subRows, yAxis, aggregation);
      });
    } else {
      // Directly compute metric for this xAxis category
      item[yAxis] = computeMetric(groupRows, yAxis, aggregation);
    }

    return item;
  });

  // 3. Sorting
  chartData.sort((a, b) => {
    if (sort === 'alphabetical-asc' || sort === 'alphabetical-desc') {
      const valA = String(a[xAxis] || '');
      const valB = String(b[xAxis] || '');
      const cmp = valA.localeCompare(valB);
      return sort === 'alphabetical-asc' ? cmp : -cmp;
    }
    
    // Sort by combined metrics
    const getMetricSum = (item) => {
      let sum = 0;
      Object.entries(item).forEach(([k, v]) => {
        if (k !== xAxis && typeof v === 'number') {
          sum += v;
        }
      });
      return sum;
    };
    
    const sumA = getMetricSum(a);
    const sumB = getMetricSum(b);

    return sort === 'asc' ? sumA - sumB : sumB - sumA;
  });

  // 4. Limit items
  if (limit && limit !== 'all') {
    const lim = parseInt(limit, 10);
    if (!isNaN(lim)) {
      return chartData.slice(0, lim);
    }
  }

  return chartData;
}

/**
 * Computes numerical metrics.
 */
function computeMetric(rows, field, aggregation) {
  const agg = (aggregation || 'sum').toLowerCase();
  
  if (agg === 'count' || field === 'id') {
    return rows.length;
  }

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
