import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from 'recharts';
import type { ChartConfig } from '../../types/tender';
import { ChartSettingsDrawer } from './ChartSettingsDrawer';
import { EmptyState } from './EmptyState';
import { getChartKeys, getColor } from '../../utils/chartTransform';
import { BarChart3, SlidersHorizontal } from 'lucide-react';

interface ChartCardProps {
  chartData: any[];
  config: ChartConfig;
  onChangeConfig: (newConfig: ChartConfig) => void;
  metadata: any;
  recordsCount: number;
}

// Chart chrome — recessive by design (dataviz: thin marks, hairline grid, muted axes)
const AXIS_INK = '#94a3b8';
const TICK_INK = '#64748b';
const GRID_INK = '#eaedf2';
const PLOT_FILL = '#fafbfc'; // faint plot surface so low-contrast fills lift off white
const SURFACE = '#ffffff';

const CHART_H = 380;

const tooltipStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: 'none',
  borderRadius: '12px',
  boxShadow: '0 12px 32px -8px rgb(16 24 40 / 0.22), 0 2px 6px rgb(16 24 40 / 0.06)',
  padding: '10px 12px',
  fontSize: '12px',
};

const CHART_TYPE_LABEL: Record<string, string> = {
  clusteredColumn: 'Column',
  stackedColumn: 'Stacked column',
  line: 'Line',
  area: 'Area',
  pie: 'Donut',
};

export const ChartCard: React.FC<ChartCardProps> = ({
  chartData,
  config,
  onChangeConfig,
  metadata,
  recordsCount,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const chartKeys = getChartKeys(chartData, config.xAxis);
  const singleSeries = chartKeys.length === 1;

  const getMetricLabel = () => {
    const col = metadata.columns.find((c: any) => c.key === config.yAxis);
    if (config.yAxis === 'id') return 'Count of Projects';
    return col
      ? `${config.aggregation === 'sum' ? 'Sum' : config.aggregation === 'average' ? 'Avg' : config.aggregation} of ${col.originalName}`
      : config.yAxis;
  };

  const getAxisLabel = () => {
    const col = metadata.columns.find((c: any) => c.key === config.xAxis);
    return col ? col.originalName : config.xAxis;
  };

  const formatValue = (value: any) => (typeof value === 'number' ? value.toLocaleString() : value);
  const formatCompact = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`;

  const axisCommon = {
    stroke: AXIS_INK,
    tick: { fill: TICK_INK, fontSize: 11 },
    tickLine: false,
    axisLine: false,
  } as const;

  const legendStyle: React.CSSProperties = { fontSize: '12px', color: TICK_INK, paddingBottom: 10 };
  const tooltipItemStyle: React.CSSProperties = { fontSize: 12, padding: '1px 0' };
  const tooltipLabelStyle: React.CSSProperties = {
    fontWeight: 600,
    color: '#0f172a',
    marginBottom: 6,
    fontSize: 12,
  };

  const renderActiveChart = () => {
    if (!chartData || chartData.length === 0) {
      return (
        <EmptyState
          title="Nothing to plot yet"
          message="No data matches your active filter selection. Adjust the filters to see the chart."
        />
      );
    }

    const isStacked = config.chartType === 'stackedColumn';
    const isColumn = config.chartType === 'clusteredColumn' || isStacked;

    // ---- Donut ----
    if (config.chartType === 'pie') {
      const pieData = chartData
        .map((item) => {
          let sum = 0;
          chartKeys.forEach((k) => {
            sum += Number(item[k] || 0);
          });
          return { name: String(item[config.xAxis] || 'N/A'), value: Number(sum.toFixed(2)) };
        })
        .filter((item) => item.value > 0);

      if (pieData.length === 0) {
        return <EmptyState title="No slice data" message="All calculated values are zero." />;
      }

      return (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) =>
                percent && percent > 0.04 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
              }
              outerRadius={125}
              innerRadius={78}
              paddingAngle={2}
              dataKey="value"
              stroke={SURFACE}
              strokeWidth={2}
              isAnimationActive
            >
              {pieData.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={getColor(index)} />
              ))}
            </Pie>
            <Tooltip
              formatter={formatValue}
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
              labelStyle={tooltipLabelStyle}
            />
            <Legend
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              iconSize={9}
              wrapperStyle={{ fontSize: '12px', color: TICK_INK, paddingTop: 8 }}
            />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    // ---- Column (clustered / stacked) ----
    if (isColumn) {
      return (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <BarChart
            data={chartData}
            margin={{ top: 16, right: 12, left: -8, bottom: 4 }}
            barCategoryGap="22%"
            barGap={4}
          >
            <CartesianGrid strokeDasharray="0" stroke={GRID_INK} vertical={false} fill={PLOT_FILL} fillOpacity={1} />
            <XAxis dataKey={config.xAxis} {...axisCommon} interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...axisCommon} width={48} tickFormatter={formatCompact} />
            <Tooltip
              cursor={{ fill: 'rgba(15,23,42,0.04)' }}
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
              labelStyle={tooltipLabelStyle}
              formatter={formatValue}
            />
            {!singleSeries && (
              <Legend verticalAlign="top" height={34} iconType="circle" iconSize={9} wrapperStyle={legendStyle} />
            )}
            {chartKeys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                name={key}
                fill={getColor(index)}
                stackId={isStacked ? 'a' : undefined}
                // 2px surface stroke = the mark-separation gap between adjacent / stacked fills
                stroke={SURFACE}
                strokeWidth={isStacked ? 1.5 : 0}
                radius={isStacked ? [0, 0, 0, 0] : [5, 5, 0, 0]}
                maxBarSize={54}
                isAnimationActive
              >
                {/* Single-series bars get direct value labels (relief for low-contrast fills) */}
                {singleSeries && (
                  <LabelList
                    dataKey={key}
                    position="top"
                    formatter={(v: any) => (typeof v === 'number' && v > 0 ? formatCompact(v) : '')}
                    style={{ fill: TICK_INK, fontSize: 11, fontWeight: 600 }}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    // ---- Line ----
    if (config.chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <LineChart data={chartData} margin={{ top: 16, right: 16, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="0" stroke={GRID_INK} vertical={false} fill={PLOT_FILL} fillOpacity={1} />
            <XAxis dataKey={config.xAxis} {...axisCommon} interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...axisCommon} width={48} tickFormatter={formatCompact} />
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
              labelStyle={tooltipLabelStyle}
              formatter={formatValue}
            />
            {!singleSeries && (
              <Legend verticalAlign="top" height={34} iconType="circle" iconSize={9} wrapperStyle={legendStyle} />
            )}
            {chartKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={getColor(index)}
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 2, stroke: SURFACE, fill: getColor(index) }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: SURFACE }}
                isAnimationActive
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    // ---- Area ----
    if (config.chartType === 'area') {
      return (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <AreaChart data={chartData} margin={{ top: 16, right: 16, left: -8, bottom: 4 }}>
            <defs>
              {chartKeys.map((key, index) => (
                <linearGradient key={`grad-${key}`} id={`color-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={getColor(index)} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={getColor(index)} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="0" stroke={GRID_INK} vertical={false} fill={PLOT_FILL} fillOpacity={1} />
            <XAxis dataKey={config.xAxis} {...axisCommon} interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...axisCommon} width={48} tickFormatter={formatCompact} />
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
              labelStyle={tooltipLabelStyle}
              formatter={formatValue}
            />
            {!singleSeries && (
              <Legend verticalAlign="top" height={34} iconType="circle" iconSize={9} wrapperStyle={legendStyle} />
            )}
            {chartKeys.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={getColor(index)}
                strokeWidth={2.5}
                fillOpacity={1}
                fill={`url(#color-${key})`}
                isAnimationActive
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  return (
    <div className="rounded-2xl bg-white shadow-card ring-1 ring-line p-5 sm:p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shrink-0 shadow-soft">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-[15px] font-semibold text-slate-900 tracking-tight truncate">
              {getMetricLabel()} <span className="text-slate-400 font-medium">by</span> {getAxisLabel()}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-2xs font-medium text-slate-400">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 font-semibold">
                {CHART_TYPE_LABEL[config.chartType] || 'Chart'}
              </span>
              <span className="tnum">
                {chartData.length} groups · {recordsCount.toLocaleString()} records
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsDrawerOpen(true)}
          className="flex items-center gap-1.5 pl-3 pr-3.5 h-9 text-sm font-semibold text-slate-700 bg-white ring-1 ring-line-strong hover:bg-slate-50 transition rounded-lg cursor-pointer shrink-0"
        >
          <SlidersHorizontal className="w-4 h-4 text-slate-400" />
          <span className="hidden sm:inline">Configure</span>
        </button>
      </div>

      <div className="min-h-[380px] w-full">{renderActiveChart()}</div>

      <ChartSettingsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        config={config}
        onChange={onChangeConfig}
        metadata={metadata}
      />
    </div>
  );
};
