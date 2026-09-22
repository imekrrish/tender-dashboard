export interface PriceSeriesMeta {
  id: string;
  component: string;
  group: string;
  name: string;
  spec: string;
  unit: string;
  currency: string;
  isActive: boolean;
  quotes: number;
}

export interface PriceComponentMeta {
  component: string;
  groups: string[];
  seriesCount: number;
  activeCount: number;
}

export interface PriceIndexMeta {
  fileName: string;
  isDefault: boolean;
  lastUploadedTime: string;
  firstDate: string | null;
  latestDate: string | null;
  totalWeeks: number;
  dates: string[];
  components: PriceComponentMeta[];
  series: PriceSeriesMeta[];
}

/**
 * Change measures mirror the workbook's own columns:
 *   wow — latest quote vs the quote before it
 *   mom — trailing 4 quotes vs the 4 before them
 *   ytd — latest quote vs the first quote of the latest year
 * yoy is an addition: latest vs the quote nearest the same date a year earlier.
 */
export interface PriceSeriesStats {
  latest: number;
  latestDate: string;
  previous: number | null;
  previousDate: string | null;
  wow: number | null;
  mom: number | null;
  yoy: number | null;
  ytd: number | null;
  periodChange: number | null;
  periodStart: number;
  periodStartDate: string;
  high: number;
  low: number;
  average: number;
  quotes: number;
}

export interface PriceSeriesResult {
  id: string;
  component: string;
  group: string;
  name: string;
  spec: string;
  unit: string;
  currency: string;
  stats: PriceSeriesStats | null;
}

export interface PriceIndexSummary {
  seriesCount: number;
  weeks: number;
  from: string | null;
  to: string | null;
  avgWow: number | null;
  avgMom: number | null;
  avgYoy: number | null;
  avgYtd: number | null;
  risersWow: number;
  fallersWow: number;
  flatWow: number;
}

export type PriceChartRow = { date: string } & Record<string, number | null | string>;

export interface PriceIndexQueryResult {
  dates: string[];
  series: PriceSeriesResult[];
  chartData: PriceChartRow[];
  summary: PriceIndexSummary;
}

export interface PriceIndexFilters {
  components: string[];
  groups: string[];
  seriesIds: string[];
  from: string | null;
  to: string | null;
  activeOnly: boolean;
}

export type PriceChartScale = 'absolute' | 'indexed';
export type PriceChartGranularity = 'weekly' | 'monthly';
