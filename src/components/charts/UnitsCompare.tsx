import { useMemo } from "react";
import { EChart } from "./EChart";

export interface UnitRow {
  unit: string;
  conformity: number; // 0..100
  target?: number; // meta em %, opcional
}

interface Props {
  data: UnitRow[];
  height?: number;
}

/**
 * Barras horizontais de conformidade por unidade, com linha de meta opcional.
 * Cor da barra reflete o nível de conformidade (vermelho → âmbar → verde).
 */
export function UnitsCompare({ data, height = 340 }: Props) {
  const option = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.conformity - b.conformity);
    const target = data.find((d) => d.target != null)?.target;

    const colorFor = (v: number) =>
      v >= 90 ? "#10b981" : v >= 75 ? "#f59e0b" : "#ef4444";

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: { name: string; value: number }[]) => {
          const p = params[0];
          return `<b>${p.name}</b><br/>Conformidade: ${p.value.toFixed(1)}%`;
        },
      },
      grid: { left: 8, right: 40, top: 12, bottom: 24, containLabel: true },
      xAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { formatter: "{value}%" },
      },
      yAxis: {
        type: "category",
        data: sorted.map((d) => d.unit),
        axisLabel: { fontSize: 12 },
      },
      series: [
        {
          type: "bar",
          data: sorted.map((d) => ({
            value: d.conformity,
            itemStyle: { color: colorFor(d.conformity), borderRadius: [0, 6, 6, 0] },
          })),
          barMaxWidth: 22,
          label: {
            show: true,
            position: "right",
            formatter: (p: { value: number }) => `${p.value.toFixed(0)}%`,
            color: "#374151",
            fontSize: 11,
            fontWeight: 600,
          },
          markLine:
            target != null
              ? {
                  symbol: "none",
                  lineStyle: { color: "#FF007F", type: "dashed", width: 2 },
                  label: { formatter: `Meta ${target}%`, color: "#FF007F", fontSize: 11 },
                  data: [{ xAxis: target }],
                }
              : undefined,
        },
      ],
    } as const;
  }, [data]);

  return <EChart option={option as never} height={height} />;
}