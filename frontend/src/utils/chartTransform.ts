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
// Source: dataviz reference palette. The slot ORDER is the CVD-safety mechanism,
// not cosmetic, so it must not be reordered: on a light surface this order gives
// a worst adjacent CVD ΔE of 9.1 and a worst adjacent normal-vision ΔE of 19.6.
// (The previous ordering put orange next to magenta, which failed the
// normal-vision floor at ΔE 12.9 — same eight hues, just the wrong sequence.)
export const CHART_COLORS = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
];

// Beyond 8 series, categorical hues are never recycled — everything extra
// collapses to a neutral "Other" gray so identity stays honest.
const OTHER_GRAY = '#98968f';

export function getColor(index: number): string {
  return index < CHART_COLORS.length ? CHART_COLORS[index] : OTHER_GRAY;
}
