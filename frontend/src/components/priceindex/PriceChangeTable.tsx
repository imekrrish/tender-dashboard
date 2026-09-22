import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Minus } from 'lucide-react';
import type { PriceSeriesResult } from '../../types/priceIndex';

type SortKey = 'name' | 'component' | 'latest' | 'wow' | 'mom' | 'yoy' | 'ytd';
type SortOrder = 'asc' | 'desc';

interface PriceChangeTableProps {
  series: PriceSeriesResult[];
  windowLabel: string;
  /** Last publication date in the window, used to mark series that stopped early. */
  latestPublished: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

function formatPrice(value: number) {
  const decimals = Math.abs(value) < 10 ? 3 : Math.abs(value) < 100 ? 2 : 1;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * A change cell carries its direction three ways — arrow, sign and colour — so
 * the reading never depends on colour alone.
 */
const DeltaCell: React.FC<{ value: number | null }> = ({ value }) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="text-slate-300">—</span>;
  }

  const rounded = Number(value.toFixed(2));
  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-400 font-medium tnum">
        <Minus className="w-3 h-3" />
        0.0%
      </span>
    );
  }

  const isUp = rounded > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold tnum ${
        isUp ? 'text-rose-600' : 'text-emerald-600'
      }`}
    >
      {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {isUp ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
};

const COMPONENT_CHIP: Record<string, string> = {
  Polysilicon: 'bg-brand-50 text-brand-700',
  Wafer: 'bg-sky-50 text-sky-700',
  Cell: 'bg-amber-50 text-amber-700',
  Module: 'bg-emerald-50 text-emerald-700',
  Glass: 'bg-violet-50 text-violet-700',
};

export const PriceChangeTable: React.FC<PriceChangeTableProps> = ({
  series,
  windowLabel,
  latestPublished,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('component');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder(key === 'name' || key === 'component' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    const rows = [...series];
    rows.sort((a, b) => {
      let av: string | number | null;
      let bv: string | number | null;

      if (sortKey === 'name' || sortKey === 'component') {
        av = sortKey === 'name' ? a.name : `${a.component}-${a.group}-${a.name}`;
        bv = sortKey === 'name' ? b.name : `${b.component}-${b.group}-${b.name}`;
        const cmp = String(av).localeCompare(String(bv));
        return sortOrder === 'asc' ? cmp : -cmp;
      }

      av = a.stats ? (a.stats as any)[sortKey] : null;
      bv = b.stats ? (b.stats as any)[sortKey] : null;

      // Rows without a value for the active measure always sink to the bottom.
      if (av === null || av === undefined || !Number.isFinite(av as number)) return 1;
      if (bv === null || bv === undefined || !Number.isFinite(bv as number)) return -1;
      return sortOrder === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return rows;
  }, [series, sortKey, sortOrder]);

  const SortHeader: React.FC<{ label: string; sortBy: SortKey; align?: 'left' | 'right'; hint?: string }> = ({
    label,
    sortBy,
    align = 'right',
    hint,
  }) => (
    <th
      scope="col"
      title={hint}
      className={`px-3 py-2.5 font-semibold text-2xs uppercase tracking-wider text-slate-400 whitespace-nowrap ${
        align === 'left' ? 'text-left' : 'text-right'
      }`}
    >
      <button
        onClick={() => toggleSort(sortBy)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 cursor-pointer transition ${
          sortKey === sortBy ? 'text-slate-700' : ''
        }`}
      >
        {align === 'right' && <ArrowUpDown className="w-3 h-3 opacity-50" />}
        {label}
        {align === 'left' && <ArrowUpDown className="w-3 h-3 opacity-50" />}
      </button>
    </th>
  );

  return (
    <section className="rounded-2xl bg-white shadow-card ring-1 ring-line overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h2 className="font-display text-[15px] font-semibold text-slate-900">Change table</h2>
        <p className="text-2xs text-slate-400 font-medium mt-0.5">
          All {series.length} series in view · {windowLabel}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50/70 border-y border-line">
            <tr>
              <SortHeader label="Series" sortBy="component" align="left" />
              <SortHeader label="Latest" sortBy="latest" hint="Most recent published quote" />
              <SortHeader label="WoW" sortBy="wow" hint="Latest quote vs the quote before it" />
              <SortHeader
                label="MoM"
                sortBy="mom"
                hint="Trailing 4 quotes vs the 4 quotes before them"
              />
              <SortHeader label="YoY" sortBy="yoy" hint="Latest quote vs the same point a year earlier" />
              <SortHeader
                label="YtD"
                sortBy="ytd"
                hint="Latest quote vs the first quote of the current year"
              />
              <th
                scope="col"
                className="px-3 py-2.5 text-right font-semibold text-2xs uppercase tracking-wider text-slate-400 whitespace-nowrap"
              >
                Range in view
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/60 transition">
                <td className="px-3 py-2.5 max-w-[340px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-3xs font-semibold shrink-0 ${
                        COMPONENT_CHIP[s.component] || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {s.component}
                    </span>
                    <span className="font-medium text-slate-800 truncate">{s.name}</span>
                  </div>
                  <span className="text-3xs text-slate-400 font-medium">
                    {s.group}
                    {s.spec ? ` · ${s.spec}` : ''}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {s.stats ? (
                    <>
                      <span className="font-semibold text-slate-900 tnum">
                        {formatPrice(s.stats.latest)}
                      </span>
                      <span className="text-3xs text-slate-400 ml-1">{s.unit}</span>
                      {latestPublished && s.stats.latestDate !== latestPublished && (
                        <span
                          className="block text-3xs text-amber-600 font-medium"
                          title="This product was not quoted in the most recent week"
                        >
                          as of {shortDate(s.stats.latestDate)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <DeltaCell value={s.stats?.wow ?? null} />
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <DeltaCell value={s.stats?.mom ?? null} />
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <DeltaCell value={s.stats?.yoy ?? null} />
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <DeltaCell value={s.stats?.ytd ?? null} />
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-500 tnum">
                  {s.stats ? `${formatPrice(s.stats.low)} – ${formatPrice(s.stats.high)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="px-5 py-3 text-3xs text-slate-400 border-t border-line">
        Change measures follow the TaiyangNews workbook: WoW compares the latest quote with the one
        before it, MoM compares the trailing four quotes with the four before them, and YtD compares
        the latest quote with the first of the current year. A rise is shown in rose, a fall in
        emerald.
      </p>
    </section>
  );
};
