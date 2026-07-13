import React, { useMemo } from 'react';
import { X, SlidersHorizontal, BarChart2, TrendingUp, PieChart, AreaChart, Layers } from 'lucide-react';
import type { ChartConfig } from '../../types/tender';
import { Select } from '../ui/Select';
import { prettyKey } from '../../utils/columnLabels';

interface ChartSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  config: ChartConfig;
  onChange: (newConfig: ChartConfig) => void;
  metadata: {
    columns: {
      key: string;
      originalName: string;
      type: string;
      isFilterable: boolean;
      isMetric: boolean;
      isDate: boolean;
    }[];
  };
}

export const ChartSettingsDrawer: React.FC<ChartSettingsDrawerProps> = ({
  isOpen,
  onClose,
  config,
  onChange,
  metadata,
}) => {
  const columns = metadata.columns;

  const dimensions = useMemo(() => {
    return columns.filter((col) => col.type === 'text' || col.type === 'date');
  }, [columns]);

  const metrics = useMemo(() => {
    return [
      { key: 'id', originalName: 'Count of Projects', type: 'number' },
      ...columns.filter((col) => col.type === 'number'),
    ];
  }, [columns]);

  const handleConfigChange = (key: keyof ChartConfig, val: any) => {
    const nextConfig = { ...config, [key]: val };
    if (key === 'yAxis' && val === 'id') {
      nextConfig.aggregation = 'count';
    }
    if (key === 'aggregation' && val === 'count') {
      nextConfig.yAxis = 'id';
    }
    onChange(nextConfig);
  };

  const chartTypes = [
    { label: 'Column', value: 'clusteredColumn', icon: <BarChart2 className="w-4 h-4" /> },
    { label: 'Stacked', value: 'stackedColumn', icon: <Layers className="w-4 h-4" /> },
    { label: 'Line', value: 'line', icon: <TrendingUp className="w-4 h-4" /> },
    { label: 'Area', value: 'area', icon: <AreaChart className="w-4 h-4" /> },
    { label: 'Pie', value: 'pie', icon: <PieChart className="w-4 h-4" /> },
  ];

  const sorts = [
    { label: 'Highest first', value: 'desc' },
    { label: 'Lowest first', value: 'asc' },
    { label: 'Alphabetical A–Z', value: 'alphabetical-asc' },
    { label: 'Alphabetical Z–A', value: 'alphabetical-desc' },
  ];

  const limits = [
    { label: 'Top 5', value: '5' },
    { label: 'Top 10', value: '10' },
    { label: 'Top 20', value: '20' },
    { label: 'All items', value: 'all' },
  ];

  const aggregations = [
    { label: 'Sum', value: 'sum' },
    { label: 'Count', value: 'count' },
    { label: 'Average', value: 'average' },
    { label: 'Min', value: 'min' },
    { label: 'Max', value: 'max' },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-slate-950/30 backdrop-blur-[2px] animate-fade"
        onClick={onClose}
      />

      <div className="relative w-[340px] max-w-[88vw] bg-canvas h-full shadow-pop flex flex-col z-50 animate-drawer">
        <div className="px-5 h-[73px] border-b border-line flex items-center justify-between bg-surface/80 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className="grid place-items-center w-8 h-8 rounded-lg bg-brand-50 text-brand-600">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Chart Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 select-none">
          <div className="flex flex-col gap-2">
            <span className="text-2xs font-semibold text-slate-500">Chart Type</span>
            <div className="grid grid-cols-3 gap-2">
              {chartTypes.map((type) => {
                const isSelected = config.chartType === type.value;
                return (
                  <button
                    key={type.value}
                    onClick={() => handleConfigChange('chartType', type.value)}
                    className={`flex flex-col items-center gap-1.5 py-3 text-3xs font-semibold rounded-xl transition cursor-pointer ring-1 ${
                      isSelected
                        ? 'bg-brand-50 ring-brand-200 text-brand-700'
                        : 'bg-white ring-line-strong text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {type.icon}
                    <span>{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-line p-4 flex flex-col gap-4">
            <Select
              label="X-Axis (Dimension)"
              value={config.xAxis}
              onChange={(v) => handleConfigChange('xAxis', v)}
              searchable
              options={dimensions.map((opt) => ({
                label: prettyKey(opt.key, opt.originalName),
                value: opt.key,
              }))}
            />

            <Select
              label="Y-Axis (Metric)"
              value={config.yAxis}
              onChange={(v) => handleConfigChange('yAxis', v)}
              searchable
              options={metrics.map((opt) => ({
                label: opt.key === 'id' ? 'Count of Projects' : prettyKey(opt.key, opt.originalName),
                value: opt.key,
              }))}
            />

            <Select
              label="Aggregation"
              value={config.aggregation}
              onChange={(v) => handleConfigChange('aggregation', v)}
              disabled={config.yAxis === 'id'}
              options={aggregations}
            />

            <Select
              label="Group / Stack By"
              value={config.groupBy === null ? 'null' : config.groupBy}
              onChange={(v) => handleConfigChange('groupBy', v === 'null' ? null : v)}
              disabled={config.chartType === 'pie'}
              searchable
              options={[
                { label: 'None', value: 'null' },
                ...dimensions.map((opt) => ({
                  label: prettyKey(opt.key, opt.originalName),
                  value: opt.key,
                })),
              ]}
            />
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-line p-4 flex flex-col gap-4">
            <Select
              label="Sort Order"
              value={config.sort}
              onChange={(v) => handleConfigChange('sort', v)}
              options={sorts}
            />

            <Select
              label="Limit Data Points"
              value={config.limit}
              onChange={(v) => handleConfigChange('limit', v)}
              options={limits}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
