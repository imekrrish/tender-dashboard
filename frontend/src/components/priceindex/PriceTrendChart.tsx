import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { getColor } from '../../utils/chartTransform';
import { EmptyState } from '../dashboard/EmptyState';
import type {
  PriceChartGranularity,
  PriceChartRow,
  PriceChartScale,
  PriceSeriesResult,
} from '../../types/priceIndex';

/** Palette order is the CVD-safety mechanism, so identity is capped at 8 lines. */
export const MAX_PLOTTED_SERIES = 8;

// Chart chrome — recessive by design, matching the tender dashboard.
const AXIS_INK = '#94a3b8';
const TICK_INK = '#64748b';
const GRID_INK = '#eaedf2';

const CHART_H = 400;

interface PriceTrendChartProps {
  chartData: PriceChartRow[];
  series: PriceSeriesResult[];
  scale: PriceChartScale;
  granularity: PriceChartGranularity;
  onScaleChange: (scale: PriceChartScale) => void;
  onGranularityChange: (granularity: PriceChartGranularity) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatWeekTick(iso: string) {
  const [y, m] = iso.split('-');
  return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`;
}

function formatMonthTick(key: string) {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`;
}

function formatValue(value: number, unit: string) {
  // RMB/W and USD/W quotes live around 0.3, glass and polysilicon in the tens.
  const decimals = Math.abs(value) < 10 ? 3 : Math.abs(value) < 100 ? 2 : 1;
  const num = value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return unit ? `${num} ${unit}` : num;
}

function formatSigned(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export const PriceTrendChart: React.FC<PriceTrendChartProps> = ({
  chartData,
  series,
  scale,
  granularity,
  onScaleChange,
  onGranularityChange,
}) => {
  // Memoised so the reshaping below is not redone on every unrelated render.
  const plotted = useMemo(() => series.slice(0, MAX_PLOTTED_SERIES), [series]);
  const hiddenCount = series.length - plotted.length;

  const units = Array.from(new Set(plotted.map((s) => s.unit)));
  const mixedUnits = units.length > 1;
  // Two measures on different scales must never share an axis, so a mixed-unit
  // selection is always rebased to 100 rather than plotted raw.
  const effectiveScale: PriceChartScale = mixedUnits ? 'indexed' : scale;

  const { rows, xKey } = useMemo(() => {
    let working: any[] = chartData;

    if (granularity === 'monthly') {
      const buckets = new Map<string, { sums: Record<string, number>; counts: Record<string, number> }>();
      chartData.forEach((row) => {
        const key = String(row.date).slice(0, 7);
        if (!buckets.has(key)) buckets.set(key, { sums: {}, counts: {} });
        const bucket = buckets.get(key)!;
        plotted.forEach((s) => {
          const v = row[s.id];
          if (typeof v === 'number') {
            bucket.sums[s.id] = (bucket.sums[s.id] || 0) + v;
            bucket.counts[s.id] = (bucket.counts[s.id] || 0) + 1;
          }
        });
      });
      working = Array.from(buckets.entries()).map(([month, bucket]) => {
        const row: any = { month };
        plotted.forEach((s) => {
          row[s.id] = bucket.counts[s.id] ? bucket.sums[s.id] / bucket.counts[s.id] : null;
        });
        return row;
      });
    }

    if (effectiveScale === 'indexed') {
      const bases: Record<string, number> = {};
      plotted.forEach((s) => {
        const first = working.find((r) => typeof r[s.id] === 'number');
        if (first) bases[s.id] = first[s.id];
      });
      working = working.map((row) => {
        const next: any = { ...row };
        plotted.forEach((s) => {
          const base = bases[s.id];
          next[s.id] =
            typeof row[s.id] === 'number' && base ? (row[s.id] / base) * 100 : null;
        });
        return next;
      });
    }

    return { rows: working, xKey: granularity === 'monthly' ? 'month' : 'date' };
  }, [chartData, plotted, granularity, effectiveScale]);

  const axisUnit = effectiveScale === 'indexed' ? 'Index (first period = 100)' : units[0] || '';

  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const entries = payload
      .filter((p: any) => p.value !== null && p.value !== undefined)
      .sort((a: any, b: any) => b.value - a.value);
    if (!entries.length) return null;

    return (
      <div className="rounded-xl bg-white shadow-pop px-3 py-2.5 max-w-[340px]">
        <p className="text-2xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          {granularity === 'monthly' ? formatMonthTick(label) : label}
        </p>
        <div className="flex flex-col gap-1">
          {entries.map((entry: any) => {
            const meta = plotted.find((s) => s.id === entry.dataKey);
            return (
              <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-slate-600 truncate flex-1">{meta?.name}</span>
                <span className="font-semibold text-slate-900 tnum shrink-0">
                  {effectiveScale === 'indexed'
                    ? entry.value.toFixed(1)
                    : formatValue(entry.value, meta?.unit || '')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-2xl bg-white shadow-card ring-1 ring-line overflow-hidden">
      {/* Card header + controls */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-slate-900">Price trend</h2>
          <p className="text-2xs text-slate-400 font-medium mt-0.5">
            {series.length} series · {rows.length} {granularity === 'monthly' ? 'months' : 'weeks'}
            {axisUnit ? ` · ${axisUnit}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex p-0.5 rounded-lg bg-slate-100 ring-1 ring-line">
            {(['weekly', 'monthly'] as PriceChartGranularity[]).map((g) => (
              <button
                key={g}
                onClick={() => onGranularityChange(g)}
                className={`px-2.5 py-1 rounded-md text-2xs font-semibold capitalize transition cursor-pointer ${
                  granularity === g
                    ? 'bg-white text-brand-700 shadow-soft'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="flex p-0.5 rounded-lg bg-slate-100 ring-1 ring-line">
            {(['absolute', 'indexed'] as PriceChartScale[]).map((s) => (
              <button
                key={s}
                onClick={() => onScaleChange(s)}
                disabled={mixedUnits && s === 'absolute'}
                title={
                  mixedUnits && s === 'absolute'
                    ? 'Selected series use different units — rebased to 100 so they share one axis'
                    : undefined
                }
                className={`px-2.5 py-1 rounded-md text-2xs font-semibold capitalize transition ${
                  effectiveScale === s
                    ? 'bg-white text-brand-700 shadow-soft'
                    : mixedUnits && s === 'absolute'
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-500 hover:text-slate-800 cursor-pointer'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mixedUnits && (
        <p className="mx-5 mb-3 text-2xs text-slate-500 bg-amber-50 ring-1 ring-amber-100 rounded-lg px-3 py-2">
          Mixed units ({units.join(', ')}) — every series is rebased to 100 at the start of the
          window so they can share a single axis.
        </p>
      )}

      {plotted.length === 0 ? (
        <div className="px-5 pb-6">
          <EmptyState />
        </div>
      ) : (
        <>
          <div className="px-2 pb-1">
            <ResponsiveContainer width="100%" height={CHART_H}>
              <LineChart data={rows} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid stroke={GRID_INK} strokeDasharray="0" vertical={false} />
                <XAxis
                  dataKey={xKey}
                  tickFormatter={granularity === 'monthly' ? formatMonthTick : formatWeekTick}
                  tick={{ fontSize: 11, fill: TICK_INK }}
                  axisLine={{ stroke: GRID_INK }}
                  tickLine={false}
                  minTickGap={44}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: TICK_INK }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  content={renderTooltip}
                  cursor={{ stroke: AXIS_INK, strokeWidth: 1, strokeDasharray: '3 3' }}
                />
                {plotted.map((s, i) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    name={s.name}
                    stroke={getColor(i)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legend — identity plus the latest quote, so colour is never the only cue. */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 px-5 pb-5 pt-2 border-t border-line">
            {plotted.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: getColor(i) }}
                />
                <span className="text-2xs font-medium text-slate-600 truncate max-w-[220px]">
                  {s.name}
                </span>
                {s.stats && (
                  <span className="text-2xs font-semibold text-slate-900 tnum shrink-0">
                    {formatValue(s.stats.latest, s.unit)}
                    <span
                      className={`ml-1 font-semibold ${
                        s.stats.wow === null || s.stats.wow === 0
                          ? 'text-slate-400'
                          : s.stats.wow > 0
                          ? 'text-rose-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {s.stats.wow ? (s.stats.wow > 0 ? '▲' : '▼') : '■'}
                      {formatSigned(s.stats.wow)}
                    </span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {hiddenCount > 0 && (
        <p className="px-5 pb-5 -mt-2 text-2xs text-slate-500">
          Showing the first {MAX_PLOTTED_SERIES} of {series.length} series — categorical colours are
          never recycled. Narrow the filters to plot the rest; the table below covers all{' '}
          {series.length}.
        </p>
      )}
    </section>
  );
};
