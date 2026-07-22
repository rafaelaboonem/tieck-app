// Tema ECharts alinhado à identidade Tieck.
// Registrado uma vez em EChart.tsx.

export const tieckTheme = {
  color: [
    "#FF007F", // marca
    "#10b981", // emerald
    "#06b6d4", // cyan
    "#f59e0b", // amber
    "#8b5cf6", // violet
    "#ef4444", // red
    "#0ea5e9", // sky
    "#84cc16", // lime
  ],
  backgroundColor: "transparent",
  textStyle: {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
    color: "#111827",
  },
  title: {
    textStyle: { color: "#111827", fontWeight: 600, fontSize: 14 },
    subtextStyle: { color: "#6b7280", fontSize: 12 },
  },
  legend: {
    textStyle: { color: "#4b5563", fontSize: 12 },
  },
  tooltip: {
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
    borderWidth: 1,
    textStyle: { color: "#111827", fontSize: 12 },
    extraCssText: "box-shadow: 0 4px 12px rgba(0,0,0,0.06); border-radius: 8px;",
  },
  grid: { left: 40, right: 16, top: 32, bottom: 32, containLabel: true },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#e5e7eb" } },
    axisTick: { show: false },
    axisLabel: { color: "#6b7280", fontSize: 11 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: "#6b7280", fontSize: 11 },
    splitLine: { lineStyle: { color: "#f3f4f6", type: "dashed" } },
  },
  visualMap: {
    color: ["#FF007F", "#fca5a5", "#f3f4f6"],
    textStyle: { color: "#6b7280", fontSize: 11 },
  },
} as const;

export const heatmapColorStops = ["#f3f4f6", "#fecdd3", "#fb7185", "#e11d48", "#7f1d1d"];