import { useEffect, useRef } from "react";
import * as echarts from "echarts";

export type UnitComplianceData = {
  unitId: string;
  unitName: string;
  compliancePercentage: number;
  completedTasks: number;
  totalScheduledTasks: number;
  delayedTasks: number;
  criticalFailures: number;
  // Métricas opcionais (fornecidas pelo hook expandido). Se ausentes,
  // o componente cai no modo "compliance geral".
  dueCompliancePercentage?: number | null;
  dueWeightTotal?: number;
  totalDueTasks?: number;
  dueCompletedTasks?: number;
  overdueOpenTasks?: number;
  completedLate?: number;
};

export type UnitComplianceChartProps = {
  data: UnitComplianceData[];
  loading?: boolean;
  height?: number;
  theme?: "light" | "dark";
  metric?: "due" | "planned";
};

export function UnitComplianceChart({
  data,
  loading = false,
  height = 320,
  theme = "light",
  metric = "due",
}: UnitComplianceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => chart.resize());
      ro.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", resize);
      ro?.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (loading) {
      chart.showLoading("default", {
        text: "Carregando…",
        color: "#FF007F",
        textColor: theme === "dark" ? "#e5e7eb" : "#374151",
        maskColor: theme === "dark" ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.6)",
      });
      return;
    }
    chart.hideLoading();

    const isDark = theme === "dark";
    const axisColor = isDark ? "#9ca3af" : "#6b7280";
    const splitColor = isDark ? "rgba(148,163,184,0.15)" : "#e5e7eb";

    if (data.length === 0) {
      chart.setOption(
        {
          title: {
            text: "Sem dados no período selecionado",
            left: "center",
            top: "middle",
            textStyle: { color: axisColor, fontSize: 13, fontWeight: 500 },
          },
          xAxis: { show: false },
          yAxis: { show: false },
          series: [],
        },
        true,
      );
      return;
    }

    // Ordena por métrica ativa; unidades sem atividade ficam ao final.
    const pickPct = (d: UnitComplianceData): number | null =>
      metric === "due" ? (d.dueCompliancePercentage ?? null) : d.compliancePercentage;
    const isInactive = (d: UnitComplianceData): boolean =>
      metric === "due" ? (d.dueWeightTotal ?? 0) <= 0 : false;
    const sorted = [...data].sort((a, b) => {
      const ia = isInactive(a) ? 1 : 0;
      const ib = isInactive(b) ? 1 : 0;
      if (ia !== ib) return ia - ib;
      return (pickPct(b) ?? -1) - (pickPct(a) ?? -1);
    });

    chart.setOption(
      {
        grid: { left: 12, right: 24, top: 24, bottom: 32, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: isDark ? "#1f2937" : "#ffffff",
          borderColor: isDark ? "#374151" : "#e5e7eb",
          textStyle: { color: isDark ? "#f3f4f6" : "#111827" },
          formatter: (params: unknown) => {
            const arr = params as Array<{ dataIndex: number }>;
            if (!arr.length) return "";
            const d = sorted[arr[0].dataIndex];
            const inactive = isInactive(d);
            const due = d.dueCompliancePercentage;
            const dueTxt =
              due === null || due === undefined
                ? inactive
                  ? "Sem atividade"
                  : "—"
                : `${due.toFixed(1)}%`;
            return `
              <div style="font-weight:600;margin-bottom:4px">${escapeHtml(d.unitName)}</div>
              <div>Operação agora: <b>${dueTxt}</b></div>
              <div>Planejamento: <b>${d.compliancePercentage.toFixed(1)}%</b></div>
              <div>Vencidas: <b>${d.totalDueTasks ?? "—"}</b> · Concluídas: <b>${d.dueCompletedTasks ?? d.completedTasks}</b></div>
              <div>Abertas em atraso: <b>${d.overdueOpenTasks ?? 0}</b></div>
              <div>Concluídas com atraso: <b>${d.completedLate ?? 0}</b></div>
              <div>Falhas críticas: <b>${d.criticalFailures}</b></div>
            `;
          },
        },
        xAxis: {
          type: "category",
          data: sorted.map((d) => d.unitName),
          axisLine: { lineStyle: { color: splitColor } },
          axisLabel: { color: axisColor, interval: 0, rotate: sorted.length > 6 ? 25 : 0 },
        },
        yAxis: {
          type: "value",
          min: 0,
          max: 100,
          axisLabel: { color: axisColor, formatter: "{value}%" },
          splitLine: { lineStyle: { color: splitColor } },
        },
        series: [
          {
            type: "bar",
            barMaxWidth: 40,
            data: sorted.map((d) => {
              const inactive = isInactive(d);
              const pct = pickPct(d);
              // "Sem atividade" -> barra vazia com marcação neutra
              if (inactive || pct === null) {
                return {
                  value: 0,
                  itemStyle: { color: "#e5e7eb", borderRadius: [6, 6, 0, 0] },
                  label: {
                    show: true,
                    position: "top" as const,
                    formatter: "Sem atividade",
                    color: axisColor,
                    fontSize: 10,
                    fontWeight: 600,
                  },
                };
              }
              return {
                value: Number(pct.toFixed(1)),
                itemStyle: {
                  color: pct >= 90 ? "#10b981" : pct >= 70 ? "#f59e0b" : "#f43f5e",
                  borderRadius: [6, 6, 0, 0],
                },
              };
            }),
            label: {
              show: true,
              position: "top",
              formatter: (p: { value: number }) => `${p.value.toFixed(1)}%`,
              color: axisColor,
              fontSize: 11,
              fontWeight: 600,
            },
          },
        ],
      },
      true,
    );
  }, [data, loading, theme, metric]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Gráfico de conformidade por unidade"
      style={{ width: "100%", height }}
    />
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
