/**
 * Extracts all unique keys in chartData excluding the xAxis key.
 * This is crucial for Recharts to know what keys to stack, group, or plot.
 */
export function getChartKeys(chartData: any[], xAxisKey: string): string[] {
  if (!chartData || chartData.length === 0) return [];
  const keysSet = new Set<string>();
  chartData.forEach(item => {
    Object.keys(item).forEach(key => {
      if (key !== xAxisKey) {
        keysSet.add(key);
      }
    });
  });
  return Array.from(keysSet);
}

// Validated categorical palette (CVD-safe, fixed order — never cycled).
// Source: dataviz reference palette; adjacent-pair CVD ΔE ≥ 24 on a light surface.
// Order is the CVD-safety mechanism, so it must not be reordered.
export const CHART_COLORS = [
  '#2a78d6', // 1 blue
  '#1baf7a', // 2 aqua
  '#eda100', // 3 yellow
  '#008300', // 4 green
  '#4a3aa7', // 5 violet
  '#e34948', // 6 red
  '#e87ba4', // 7 magenta
  '#eb6834', // 8 orange
];

// Beyond 8 series, categorical hues are never recycled — everything extra
// collapses to a neutral "Other" gray so identity stays honest.
const OTHER_GRAY = '#98968f';

export function getColor(index: number): string {
  return index < CHART_COLORS.length ? CHART_COLORS[index] : OTHER_GRAY;
}
