import { useMemo } from "react";
import { EChart } from "./EChart";
import { heatmapColorStops } from "./theme";

export interface HeatmapPoint {
  day: number; // 0 = Dom .. 6 = Sáb
  hour: number; // 0..23
  value: number;
}

interface Props {
  data: HeatmapPoint[];
  height?: number;
  valueLabel?: string; // ex: "atrasos", "não-conformes"
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}h`);

/**
 * Heatmap dia × hora — usa Apache ECharts.
 * Ideal para "horários com mais atrasos" e "mapa de calor operacional".
 */
export function HeatmapDayHour({ data, height = 340, valueLabel = "ocorrências" }: Props) {
  const option = useMemo(() => {
    const values = data.map((d) => [d.hour, d.day, d.value]);
    const max = data.reduce((m, d) => Math.max(m, d.value), 0);
    return {
      tooltip: {
        position: "top",
        formatter: (p: { data: [number, number, number] }) => {
          const [h, d, v] = p.data;
          return `<b>${DAYS[d]} · ${HOURS[h]}</b><br/>${v} ${valueLabel}`;
        },
      },
      grid: { left: 40, right: 20, top: 20, bottom: 60, containLabel: true },
      xAxis: {
        type: "category",
        data: HOURS,
        splitArea: { show: true },
        axisLabel: { interval: 1 },
      },
      yAxis: { type: "category", data: DAYS, splitArea: { show: true } },
      visualMap: {
        min: 0,
        max: max || 1,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        itemWidth: 12,
        itemHeight: 120,
        inRange: { color: heatmapColorStops },
      },
      series: [
        {
          name: valueLabel,
          type: "heatmap",
          data: values,
          label: { show: false },
          emphasis: {
            itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.2)" },
          },
          itemStyle: { borderColor: "#ffffff", borderWidth: 1 },
        },
      ],
    } as const;
  }, [data, valueLabel]);

  return <EChart option={option as never} height={height} />;
}