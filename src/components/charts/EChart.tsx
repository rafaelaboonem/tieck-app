import ReactECharts from "echarts-for-react";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import {
  BarChart,
  LineChart,
  HeatmapChart,
  PieChart,
  ScatterChart,
  CustomChart,
} from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  CalendarComponent,
} from "echarts/components";
import type { EChartsOption } from "echarts";
import { tieckTheme } from "./theme";

let registered = false;
function ensureRegistered() {
  if (registered) return;
  echarts.use([
    CanvasRenderer,
    BarChart,
    LineChart,
    HeatmapChart,
    PieChart,
    ScatterChart,
    CustomChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    TitleComponent,
    VisualMapComponent,
    DataZoomComponent,
    MarkLineComponent,
    MarkAreaComponent,
    CalendarComponent,
  ]);
  echarts.registerTheme("tieck", tieckTheme);
  registered = true;
}

interface Props {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  loading?: boolean;
}

export function EChart({ option, height = 320, className, loading }: Props) {
  ensureRegistered();
  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      theme="tieck"
      showLoading={loading}
      loadingOption={{ text: "", color: "#FF007F", maskColor: "rgba(255,255,255,0.6)" }}
      style={{ height, width: "100%" }}
      className={className}
      opts={{ renderer: "canvas" }}
      notMerge
      lazyUpdate
    />
  );
}