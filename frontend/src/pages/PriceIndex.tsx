import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Header } from '../components/layout/Header';
import type { ModuleId } from '../components/layout/ModuleSwitcher';
import { KpiCard } from '../components/dashboard/KpiCard';
import { PriceTrendChart } from '../components/priceindex/PriceTrendChart';
import { PriceChangeTable } from '../components/priceindex/PriceChangeTable';
import {
  DATE_PRESETS,
  PriceIndexFiltersPanel,
} from '../components/priceindex/PriceIndexFilters';
import {
  getPriceIndexMeta,
  queryPriceIndex,
  uploadPriceIndexFile,
} from '../services/api';
import type {
  PriceChartGranularity,
  PriceChartScale,
  PriceIndexFilters,
  PriceIndexMeta,
  PriceIndexQueryResult,
} from '../types/priceIndex';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Info,
  Layers,
  Loader2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface PriceIndexPageProps {
  activeModule: ModuleId;
  onModuleChange: (id: ModuleId) => void;
}

const DEFAULT_PRESET = '2024';

/** The client's brief opens the window at 2024 and runs to the latest publication. */
const initialFilters: PriceIndexFilters = {
  components: ['Polysilicon'],
  groups: [],
  seriesIds: [],
  from: '2024-01-01',
  to: null,
  activeOnly: true,
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export const PriceIndex: React.FC<PriceIndexPageProps> = ({ activeModule, onModuleChange }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isQuerying, setIsQuerying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [meta, setMeta] = useState<PriceIndexMeta | null>(null);
  const [result, setResult] = useState<PriceIndexQueryResult | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [filters, setFilters] = useState<PriceIndexFilters>(initialFilters);
  const [activePreset, setActivePreset] = useState<string>(DEFAULT_PRESET);
  const [seriesSearch, setSeriesSearch] = useState('');

  const [scale, setScale] = useState<PriceChartScale>('absolute');
  const [granularity, setGranularity] = useState<PriceChartGranularity>('weekly');

  const showToast = useCallback(
    (message: string, type: Toast['type'] = 'success') => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    },
    []
  );

  const loadMeta = useCallback(
    async (notify = false) => {
      try {
        const metaRes = await getPriceIndexMeta();
        setMeta(metaRes);
        setLoadError(null);
        if (notify) showToast('Price index reloaded', 'success');
      } catch (e: any) {
        console.error('Price index metadata error:', e);
        setLoadError(e?.response?.data?.error || e.message || 'Could not reach the price index API');
      } finally {
        setIsLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  // Re-query on any filter change, lightly debounced.
  useEffect(() => {
    if (!meta) return;
    const timer = setTimeout(async () => {
      setIsQuerying(true);
      try {
        setResult(await queryPriceIndex(filters));
      } catch (e) {
        console.error('Price index query error:', e);
        showToast('Could not load price series', 'error');
      } finally {
        setIsQuerying(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [filters, meta, showToast]);

  const handlePresetChange = useCallback(
    (presetId: string) => {
      setActivePreset(presetId);
      if (presetId === 'custom' || !meta) return;
      const preset = DATE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      setFilters((f) => ({ ...f, from: preset.resolve(meta), to: null }));
    },
    [meta]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      showToast('Uploading price index workbook…', 'info');
      try {
        const res = await uploadPriceIndexFile(file);
        if (res.success) {
          showToast(`Loaded ${res.totalWeeks} weeks through ${formatDate(res.latestDate)}`, 'success');
          await loadMeta();
          // Force a re-query against the new workbook.
          setFilters((f) => ({ ...f }));
        } else {
          showToast('Could not parse that workbook', 'error');
        }
      } catch (e: any) {
        console.error('Price index upload error:', e);
        showToast(
          e?.response?.data?.error || 'Upload failed — the workbook needs its Sheet2 price grid',
          'error'
        );
      } finally {
        setIsUploading(false);
      }
    },
    [loadMeta, showToast]
  );

  const handleClearAll = useCallback(() => {
    setFilters(initialFilters);
    setActivePreset(DEFAULT_PRESET);
    setSeriesSearch('');
    showToast('Filters reset', 'info');
  }, [showToast]);

  const summary = result?.summary;

  const windowLabel = useMemo(() => {
    if (!summary?.from || !summary?.to) return '—';
    return `${formatDate(summary.from)} – ${formatDate(summary.to)}`;
  }, [summary]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5">
        <div className="grid place-items-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-card">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <div className="text-center">
          <p className="font-display text-base font-semibold text-slate-800">Loading price index</p>
          <p className="text-2xs text-slate-400 font-medium mt-1 animate-pulse">
            Reading the TaiyangNews weekly price grid…
          </p>
        </div>
      </div>
    );
  }

  if (loadError || !meta) {
    return (
      <DashboardLayout
        header={
          <Header
            onUpload={handleUpload}
            isUploading={isUploading}
            uploadedFileName=""
            onRefresh={() => loadMeta(true)}
            subtitle="PV price index"
            activeModule={activeModule}
            onModuleChange={onModuleChange}
          />
        }
        sidebar={<p className="text-2xs text-slate-400">Filters unavailable.</p>}
      >
        <div className="rounded-2xl bg-white shadow-card ring-1 ring-line p-8 text-center">
          <div className="grid place-items-center w-12 h-12 rounded-xl bg-red-50 mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="font-display text-base font-semibold text-slate-800">
            Price index unavailable
          </h2>
          <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">{loadError}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      header={
        <Header
          onUpload={handleUpload}
          isUploading={isUploading}
          uploadedFileName={meta.fileName}
          onRefresh={() => loadMeta(true)}
          isRefreshing={isQuerying}
          subtitle="TaiyangNews PV price index"
          activeModule={activeModule}
          onModuleChange={onModuleChange}
        />
      }
      sidebar={
        <PriceIndexFiltersPanel
          meta={meta}
          filters={filters}
          setFilters={setFilters}
          activePreset={activePreset}
          onPresetChange={handlePresetChange}
          onClearAll={handleClearAll}
          seriesSearch={seriesSearch}
          onSeriesSearchChange={setSeriesSearch}
        />
      }
    >
      <div className="flex flex-col gap-5 sm:gap-6">
        {/* Source strip */}
        <div className="rounded-2xl bg-white shadow-card ring-1 ring-line px-5 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">
              Source workbook
            </p>
            <p className="font-display text-sm font-semibold text-slate-900 truncate mt-1">
              {meta.fileName}
            </p>
          </div>
          <div>
            <p className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">
              Published through
            </p>
            <p className="font-display text-sm font-semibold text-slate-900 mt-1 tnum">
              {formatDate(meta.latestDate)}
            </p>
          </div>
          <div>
            <p className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">
              History
            </p>
            <p className="font-display text-sm font-semibold text-slate-900 mt-1 tnum">
              {meta.totalWeeks} weeks from {formatDate(meta.firstDate)}
            </p>
          </div>
          <div>
            <p className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">
              Catalogue
            </p>
            <p className="font-display text-sm font-semibold text-slate-900 mt-1 tnum">
              {meta.series.filter((s) => s.isActive).length} quoted / {meta.series.length} tracked
            </p>
          </div>
        </div>

        {/* KPI strip — the week's headline movement across whatever is in view */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            label="Series in view"
            value={summary?.seriesCount ?? 0}
            subtitle={`${summary?.weeks ?? 0} weeks · ${windowLabel}`}
            icon={<Layers className="w-4 h-4" />}
          />
          <KpiCard
            label="Avg week on week"
            value={formatPct(summary?.avgWow)}
            subtitle={`${summary?.risersWow ?? 0} up · ${summary?.fallersWow ?? 0} down · ${
              summary?.flatWow ?? 0
            } flat`}
            icon={
              (summary?.avgWow ?? 0) >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )
            }
            accent={
              (summary?.avgWow ?? 0) > 0
                ? 'bg-rose-50 text-rose-600'
                : (summary?.avgWow ?? 0) < 0
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-slate-100 text-slate-500'
            }
          />
          <KpiCard
            label="Avg month on month"
            value={formatPct(summary?.avgMom)}
            subtitle="Trailing 4 quotes vs the 4 before"
            icon={
              (summary?.avgMom ?? 0) >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )
            }
            accent={
              (summary?.avgMom ?? 0) > 0
                ? 'bg-rose-50 text-rose-600'
                : (summary?.avgMom ?? 0) < 0
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-slate-100 text-slate-500'
            }
          />
          <KpiCard
            label="Avg year to date"
            value={formatPct(summary?.avgYtd)}
            subtitle={`Year on year ${formatPct(summary?.avgYoy)}`}
            icon={<CalendarDays className="w-4 h-4" />}
            accent={
              (summary?.avgYtd ?? 0) > 0
                ? 'bg-rose-50 text-rose-600'
                : (summary?.avgYtd ?? 0) < 0
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-slate-100 text-slate-500'
            }
          />
        </div>

        {result && (
          <>
            <PriceTrendChart
              chartData={result.chartData}
              series={result.series}
              scale={scale}
              granularity={granularity}
              onScaleChange={setScale}
              onGranularityChange={setGranularity}
            />

            <PriceChangeTable
              series={result.series}
              windowLabel={windowLabel}
              latestPublished={summary?.to ?? null}
            />
          </>
        )}
      </div>

      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2.5 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2.5 pl-3.5 pr-4 py-3 rounded-xl shadow-pop ring-1 text-sm font-medium pointer-events-auto animate-toast ${
              toast.type === 'success'
                ? 'bg-white ring-emerald-100 text-emerald-800'
                : toast.type === 'error'
                ? 'bg-white ring-red-100 text-red-800'
                : 'bg-white ring-brand-100 text-brand-800'
            }`}
          >
            {toast.type === 'success' && (
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
            )}
            {toast.type === 'error' && <AlertCircle className="w-4.5 h-4.5 text-red-500 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4.5 h-4.5 text-brand-500 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
};
