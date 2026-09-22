import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { fileURLToPath } from 'url';
import {
  COMPONENTS,
  COMPONENT_DEFAULT_UNIT,
  ID_PREFIX_COMPONENT,
  SERIES_MAP,
  seriesKey,
} from './priceIndexSeriesMap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADED_PATH = path.join(__dirname, '../../uploads/current-price-index.xlsx');
const BUNDLED_PATH = path.join(__dirname, '../data/TaiyangNews Price Index.xlsx');

/** Sheet2 is the dated grid: ID | 品种 | 规格 | 单位 | <one column per publication date>. */
const GRID_SHEET = 'Sheet2';
const FIRST_DATA_COL = 4;

let cache = null;

export function clearPriceIndexCache() {
  cache = null;
}

function activeWorkbookPath() {
  return fs.existsSync(UPLOADED_PATH) ? UPLOADED_PATH : BUNDLED_PATH;
}

/**
 * Header cells arrive either as an Excel serial (newer columns) or as a
 * "2023/1/4" string (the oldest ones). Normalise both to an ISO date.
 */
function headerToIsoDate(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    // Excel's 1900 serial epoch, using UTC so the date never shifts by timezone.
    const ms = Date.UTC(1899, 11, 30) + value * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  const match = String(value).trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Stable, URL-safe id so the frontend can key selections on something readable. */
function slugify(component, name) {
  const base = `${component}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'series';
}

function parseWorkbook() {
  const filePath = activeWorkbookPath();
  const workbook = xlsx.readFile(filePath);

  const sheet = workbook.Sheets[GRID_SHEET];
  if (!sheet) {
    throw new Error(
      `Price index workbook is missing "${GRID_SHEET}". Found: ${workbook.SheetNames.join(', ')}`
    );
  }

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const header = rows[0] || [];

  // Build the date axis once; every series is indexed against it.
  const dates = [];
  const columnIndexes = [];
  for (let c = FIRST_DATA_COL; c < header.length; c++) {
    const iso = headerToIsoDate(header[c]);
    if (iso) {
      dates.push(iso);
      columnIndexes.push(c);
    }
  }

  const usedIds = new Set();
  const series = [];
  const unmapped = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const id = row[0];
    const variety = row[1];
    const spec = row[2];
    if (!variety && !spec) continue;

    const key = seriesKey(variety, spec);
    const mapped = SERIES_MAP[key];

    const component =
      mapped?.component ||
      ID_PREFIX_COMPONENT[String(id ?? '').trim().charAt(0).toUpperCase()] ||
      null;

    if (!component) {
      unmapped.push(key);
      continue;
    }
    if (!mapped) unmapped.push(key);

    const values = columnIndexes.map((c) => toNumber(row[c]));
    if (!values.some((v) => v !== null)) {
      // Row is present in the template but has never been quoted — skip entirely.
      continue;
    }

    const name = mapped?.name || `${variety} ${spec || ''}`.trim();
    let seriesId = slugify(component, name);
    let suffix = 2;
    while (usedIds.has(seriesId)) seriesId = `${slugify(component, name)}-${suffix++}`;
    usedIds.add(seriesId);

    series.push({
      id: seriesId,
      component,
      group: mapped?.group || 'Other',
      name,
      spec: String(spec ?? '').replace(/\s+/g, ' ').trim(),
      variety: String(variety ?? '').trim(),
      unit: mapped?.unit || COMPONENT_DEFAULT_UNIT[component] || '',
      currency: mapped?.currency || (String(row[3] ?? '').includes('美元') ? 'USD' : 'RMB'),
      values,
    });
  }

  if (unmapped.length) {
    console.warn(
      `[price-index] ${unmapped.length} sheet row(s) had no dictionary entry and fell back to raw labels:`,
      unmapped.slice(0, 10)
    );
  }

  const stat = fs.statSync(filePath);

  return {
    fileName: path.basename(filePath),
    isDefault: filePath === BUNDLED_PATH,
    lastUploadedTime: stat.mtime.toISOString(),
    dates,
    series,
  };
}

export function getPriceIndexData(force = false) {
  if (!cache || force) cache = parseWorkbook();
  return cache;
}

// ---------------------------------------------------------------------------
// Analytics
//
// The workbook computes its own change columns and this mirrors them exactly:
//   WoW = 100 * latest / previous - 100
//   MoM = (sum(last 4 quotes) - sum(prior 4 quotes)) / sum(prior 4 quotes) * 100
//   YtD = 100 * latest / first quote of the latest year - 100
// YoY is an addition: latest versus the quote nearest the same date a year back.
// ---------------------------------------------------------------------------

const MONTH_BLOCK = 4;

function pctChange(current, base) {
  if (current === null || base === null || base === 0) return null;
  return (current / base - 1) * 100;
}

/** Collect the [date, value] pairs a series actually has inside the window. */
function presentPoints(series, dates, fromIdx, toIdx) {
  const points = [];
  for (let i = fromIdx; i <= toIdx; i++) {
    if (series.values[i] !== null) points.push({ date: dates[i], value: series.values[i], index: i });
  }
  return points;
}

function computeStats(series, dates, fromIdx, toIdx) {
  const points = presentPoints(series, dates, fromIdx, toIdx);
  if (!points.length) return null;

  const latest = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : null;

  // Trailing 4-quote block against the 4 before it.
  let mom = null;
  if (points.length >= MONTH_BLOCK * 2) {
    const recent = points.slice(-MONTH_BLOCK);
    const prior = points.slice(-MONTH_BLOCK * 2, -MONTH_BLOCK);
    const sum = (arr) => arr.reduce((acc, p) => acc + p.value, 0);
    const priorSum = sum(prior);
    if (priorSum !== 0) mom = ((sum(recent) - priorSum) / priorSum) * 100;
  }

  // Year to date: first quote that falls in the latest point's calendar year.
  const latestYear = latest.date.slice(0, 4);
  const firstOfYear = points.find((p) => p.date.slice(0, 4) === latestYear);
  const ytd = firstOfYear && firstOfYear !== latest ? pctChange(latest.value, firstOfYear.value) : null;

  // Year on year: the last quote at or before the same calendar date a year ago.
  const yearAgoDate = `${Number(latestYear) - 1}${latest.date.slice(4)}`;
  const yearAgoCandidates = points.filter((p) => p.date <= yearAgoDate);
  const yearAgo = yearAgoCandidates.length ? yearAgoCandidates[yearAgoCandidates.length - 1] : null;
  const yoy = yearAgo ? pctChange(latest.value, yearAgo.value) : null;

  const values = points.map((p) => p.value);
  const first = points[0];

  return {
    latest: latest.value,
    latestDate: latest.date,
    previous: previous ? previous.value : null,
    previousDate: previous ? previous.date : null,
    wow: previous ? pctChange(latest.value, previous.value) : null,
    mom,
    yoy,
    ytd,
    periodChange: pctChange(latest.value, first.value),
    periodStart: first.value,
    periodStartDate: first.date,
    high: Math.max(...values),
    low: Math.min(...values),
    average: values.reduce((a, b) => a + b, 0) / values.length,
    quotes: points.length,
  };
}

/**
 * Resolve a requested window onto the date axis. `from`/`to` are ISO dates;
 * missing bounds fall back to the full extent of the workbook.
 */
function resolveWindow(dates, from, to) {
  let fromIdx = 0;
  let toIdx = dates.length - 1;
  if (from) {
    const i = dates.findIndex((d) => d >= from);
    fromIdx = i === -1 ? dates.length - 1 : i;
  }
  if (to) {
    let i = -1;
    for (let k = 0; k < dates.length; k++) if (dates[k] <= to) i = k;
    if (i !== -1) toIdx = i;
  }
  if (toIdx < fromIdx) toIdx = fromIdx;
  return { fromIdx, toIdx };
}

export function getPriceIndexMeta() {
  const data = getPriceIndexData();
  const { dates, series } = data;

  // A series counts as active if it has been quoted in the last 8 publications.
  const recentFrom = Math.max(0, dates.length - 8);

  const catalogue = series.map((s) => {
    const isActive = s.values.slice(recentFrom).some((v) => v !== null);
    const nonNull = s.values.filter((v) => v !== null).length;
    return {
      id: s.id,
      component: s.component,
      group: s.group,
      name: s.name,
      spec: s.spec,
      unit: s.unit,
      currency: s.currency,
      isActive,
      quotes: nonNull,
    };
  });

  const componentsInFile = COMPONENTS.filter((c) => catalogue.some((s) => s.component === c));

  return {
    fileName: data.fileName,
    isDefault: data.isDefault,
    lastUploadedTime: data.lastUploadedTime,
    firstDate: dates[0] || null,
    latestDate: dates[dates.length - 1] || null,
    totalWeeks: dates.length,
    dates,
    components: componentsInFile.map((component) => ({
      component,
      groups: Array.from(
        new Set(catalogue.filter((s) => s.component === component).map((s) => s.group))
      ),
      seriesCount: catalogue.filter((s) => s.component === component).length,
      activeCount: catalogue.filter((s) => s.component === component && s.isActive).length,
    })),
    series: catalogue,
  };
}

/**
 * Main query used by the dashboard.
 *
 * filters: { components[], groups[], seriesIds[], from, to, activeOnly }
 * Returns the chart-ready rows (one per date, one key per series), each series'
 * change statistics, and a roll-up for the KPI strip.
 */
export function queryPriceIndex(filters = {}) {
  const data = getPriceIndexData();
  const { dates } = data;

  const {
    components = [],
    groups = [],
    seriesIds = [],
    from = null,
    to = null,
    activeOnly = true,
  } = filters;

  const { fromIdx, toIdx } = resolveWindow(dates, from, to);
  const windowDates = dates.slice(fromIdx, toIdx + 1);
  const recentFrom = Math.max(0, dates.length - 8);

  let selected = data.series.filter((s) => {
    if (components.length && !components.includes(s.component)) return false;
    if (groups.length && !groups.includes(s.group)) return false;
    if (seriesIds.length && !seriesIds.includes(s.id)) return false;
    if (activeOnly && !s.values.slice(recentFrom).some((v) => v !== null)) return false;
    // Must have at least one quote inside the requested window.
    return s.values.slice(fromIdx, toIdx + 1).some((v) => v !== null);
  });

  const series = selected.map((s) => ({
    id: s.id,
    component: s.component,
    group: s.group,
    name: s.name,
    spec: s.spec,
    unit: s.unit,
    currency: s.currency,
    stats: computeStats(s, dates, fromIdx, toIdx),
  }));

  // Chart rows: one object per publication date, keyed by series id.
  const chartData = windowDates.map((date, i) => {
    const row = { date };
    selected.forEach((s) => {
      row[s.id] = s.values[fromIdx + i];
    });
    return row;
  });

  const withStats = series.filter((s) => s.stats);
  const avg = (pick) => {
    const nums = withStats.map(pick).filter((v) => v !== null && v !== undefined);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };

  const summary = {
    seriesCount: series.length,
    weeks: windowDates.length,
    from: windowDates[0] || null,
    to: windowDates[windowDates.length - 1] || null,
    avgWow: avg((s) => s.stats.wow),
    avgMom: avg((s) => s.stats.mom),
    avgYoy: avg((s) => s.stats.yoy),
    avgYtd: avg((s) => s.stats.ytd),
    risersWow: withStats.filter((s) => s.stats.wow > 0).length,
    fallersWow: withStats.filter((s) => s.stats.wow < 0).length,
    flatWow: withStats.filter((s) => s.stats.wow === 0).length,
  };

  return { dates: windowDates, series, chartData, summary };
}
