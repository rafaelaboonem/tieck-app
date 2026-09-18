/**
 * RealChecklistActivity — estados e conteúdo do card de atividade.
 *
 * O gráfico em si (recharts) não desenha em jsdom, então o módulo é substituído
 * por espiões controlados que EXPÕEM o que o componente pediu para desenhar: a
 * série recebida (pontos) e as séries ligadas (dataKey). É assim que a suíte
 * prova que o card mostra o dado RECEBIDO por props — sem fixture escondida.
 *
 * Cobertura:
 *   T) loading → esqueleto no lugar do gráfico;
 *   U) erro → mensagem + retry (nunca "sem atividade");
 *   V) sem atividade → estado vazio honesto, nenhum gráfico zerado;
 *   W) com dados → duas séries de TAREFA: Programadas e Concluídas;
 *   X) o tooltip usa os mesmos dataKeys/valores recebidos e o rótulo do eixo é a
 *      data civil da string;
 *   Y) nenhum texto diz que `completed_tasks` são respostas de checklist.
 */
import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const areaChartSpy = vi.fn();

vi.mock("recharts", () => {
  const AreaChart = ({
    data,
    margin,
    children,
  }: {
    data?: unknown[];
    margin?: Record<string, number>;
    children?: React.ReactNode;
  }) => {
    areaChartSpy(data);
    // `<svg>`: os filhos (`<defs>`/`<linearGradient>`) são marcação SVG real —
    // sem o contexto de SVG o React avisa de casing em cada render.
    return (
      <svg
        data-testid="area-chart"
        data-points={JSON.stringify(data ?? [])}
        data-margin={JSON.stringify(margin ?? {})}
      >
        {children}
      </svg>
    );
  };
  const Area = ({ dataKey, fill, type }: { dataKey?: string; fill?: string; type?: string }) => (
    <div
      data-testid="chart-area"
      data-key={String(dataKey)}
      data-fill={String(fill)}
      data-type={String(type)}
    />
  );
  const passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    AreaChart,
    Area,
    CartesianGrid: () => <div data-testid="grid" />,
    XAxis: ({
      dataKey,
      tickFormatter,
      interval,
    }: {
      dataKey?: string;
      tickFormatter?: (v: unknown) => string;
      interval?: number | string;
    }) => (
      <div
        data-testid="x-axis"
        data-key={String(dataKey)}
        data-interval={String(interval)}
        data-tick={tickFormatter ? tickFormatter("2026-09-17") : ""}
      />
    ),
    YAxis: () => <div data-testid="y-axis" />,
    ResponsiveContainer: passthrough,
    Tooltip: () => null,
    Legend: () => null,
  };
});

import {
  CHECKLIST_ACTIVITY_CHART_CONFIG,
  RealChecklistActivity,
} from "../RealChecklistActivity";

const SERIES = [
  { date: "2026-09-15", scheduled: 4, completed: 0 },
  { date: "2026-09-16", scheduled: 12, completed: 9 },
  { date: "2026-09-17", scheduled: 5, completed: 5 },
];

beforeEach(() => {
  areaChartSpy.mockClear();
  cleanup();
});

describe("T) loading", () => {
  it("mostra esqueleto e NÃO desenha gráfico nem vazio", () => {
    render(<RealChecklistActivity data={[]} loading />);

    expect(screen.getByTestId("checklist-activity-loading")).toBeTruthy();
    expect(screen.queryByTestId("area-chart")).toBeNull();
    expect(screen.queryByTestId("checklist-activity-empty")).toBeNull();
    expect(screen.queryByTestId("checklist-activity-error")).toBeNull();
  });
});

describe("U) erro", () => {
  it("mostra a falha com retry — nunca o estado vazio de 'sem atividade'", () => {
    const onRetry = vi.fn();
    render(<RealChecklistActivity data={[]} error onRetry={onRetry} />);

    expect(screen.getByTestId("checklist-activity-error").textContent).toContain(
      "Não foi possível carregar a atividade.",
    );
    expect(screen.queryByTestId("checklist-activity-empty")).toBeNull();

    screen.getByRole("button", { name: "Tentar novamente" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("V) vazio honesto", () => {
  it("recorte inteiramente zero → estado vazio, sem gráfico zerado", () => {
    render(
      <RealChecklistActivity
        data={[
          { date: "2026-09-15", scheduled: 0, completed: 0 },
          { date: "2026-09-16", scheduled: 0, completed: 0 },
        ]}
      />,
    );

    expect(screen.getByTestId("checklist-activity-empty").textContent).toContain(
      "Sem atividade no período",
    );
    expect(screen.getByTestId("checklist-activity-empty").textContent).toContain(
      "Nenhuma tarefa foi programada no recorte selecionado.",
    );
    expect(screen.queryByTestId("area-chart")).toBeNull();
  });
});

describe("W/X) dados reais", () => {
  it("desenha as duas séries de TAREFA com os valores recebidos", () => {
    render(<RealChecklistActivity data={SERIES} />);

    const chart = screen.getByTestId("area-chart");
    expect(JSON.parse(chart.getAttribute("data-points") ?? "[]")).toEqual(SERIES);

    const keys = screen.getAllByTestId("chart-area").map((el) => el.getAttribute("data-key"));
    expect(keys).toEqual(["scheduled", "completed"]);
  });

  it("o eixo X é a data civil e o rótulo não desloca o dia", () => {
    render(<RealChecklistActivity data={SERIES} />);

    const axis = screen.getByTestId("x-axis");
    expect(axis.getAttribute("data-key")).toBe("date");
    expect(axis.getAttribute("data-tick")).toBe("17 set");
  });

  it("um dia com atividade basta para desenhar o gráfico (não vira vazio)", () => {
    render(
      <RealChecklistActivity
        data={[
          { date: "2026-09-15", scheduled: 0, completed: 0 },
          { date: "2026-09-16", scheduled: 1, completed: 0 },
        ]}
      />,
    );

    expect(screen.queryByTestId("checklist-activity-empty")).toBeNull();
    expect(screen.getByTestId("area-chart")).toBeTruthy();
  });

  it("X) o tooltip é alimentado pela mesma config das séries desenhadas", () => {
    render(<RealChecklistActivity data={SERIES} />);

    const keys = screen.getAllByTestId("chart-area").map((el) => el.getAttribute("data-key") ?? "");
    for (const key of keys) {
      expect(Object.keys(CHECKLIST_ACTIVITY_CHART_CONFIG)).toContain(key);
    }
  });
});

describe("refinamento visual (legenda, traço linear, respiro no plot)", () => {
  it("mostra a legenda compacta com as MESMAS séries, cores e rótulos do gráfico", () => {
    const { container } = render(<RealChecklistActivity data={SERIES} />);

    const legend = screen.getByTestId("checklist-activity-legend");
    expect(legend.textContent).toContain("Programadas");
    expect(legend.textContent).toContain("Concluídas");

    const dots = Array.from(legend.querySelectorAll("span[aria-hidden='true']"));
    const dotColors = dots.map((dot) => dot.getAttribute("style") ?? "");
    expect(dotColors).toHaveLength(2);
    expect(dotColors[0]).toContain(CHECKLIST_ACTIVITY_CHART_CONFIG.scheduled.color);
    expect(dotColors[1]).toContain(CHECKLIST_ACTIVITY_CHART_CONFIG.completed.color);

    // A legenda vive no header do card (não é caixa grande no meio do gráfico).
    expect(
      container.querySelector("[data-slot='card-header'] [data-testid='checklist-activity-legend']"),
    ).not.toBeNull();
  });

  it("só existe legenda quando existe gráfico desenhado", () => {
    const { unmount } = render(<RealChecklistActivity data={[]} loading />);
    expect(screen.queryByTestId("checklist-activity-legend")).toBeNull();
    unmount();

    render(<RealChecklistActivity data={[]} error />);
    expect(screen.queryByTestId("checklist-activity-legend")).toBeNull();
    cleanup();

    render(<RealChecklistActivity data={SERIES.map((d) => ({ ...d, scheduled: 0, completed: 0 }))} />);
    expect(screen.queryByTestId("checklist-activity-legend")).toBeNull();
  });

  it("as áreas usam interpolação linear — contagem diária, sem onda artificial", () => {
    render(<RealChecklistActivity data={SERIES} />);

    const types = screen.getAllByTestId("chart-area").map((el) => el.getAttribute("data-type"));
    expect(types).toEqual(["linear", "linear"]);
  });

  it("o plot ganha respiro nas duas laterais, sem perder nenhum ponto", () => {
    render(<RealChecklistActivity data={SERIES} />);

    const margin = JSON.parse(screen.getByTestId("area-chart").getAttribute("data-margin") ?? "{}");
    expect(margin.left).toBeGreaterThan(0);
    expect(margin.right).toBeGreaterThan(0);
    // O recorte continua inteiro: 3 pontos entraram, 3 pontos na série.
    expect(JSON.parse(screen.getByTestId("area-chart").getAttribute("data-points") ?? "[]")).toHaveLength(
      SERIES.length,
    );
  });

  it("7 dias mostram TODOS os rótulos; recorte longo deixa o recharts espaçar", () => {
    const week = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-09-${String(11 + i).padStart(2, "0")}`,
      scheduled: 5,
      completed: 4,
    }));
    const { unmount } = render(<RealChecklistActivity data={week} />);
    // `interval=0` = rótulo em TODOS os pontos (o formatter segue sendo o civil).
    expect(screen.getByTestId("x-axis").getAttribute("data-interval")).toBe("0");
    expect(screen.getByTestId("x-axis").getAttribute("data-tick")).toBe("17 set");
    unmount();
    cleanup();

    const month = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      scheduled: 5,
      completed: 4,
    }));
    render(<RealChecklistActivity data={month} />);
    expect(screen.getByTestId("x-axis").getAttribute("data-interval")).toBe("preserveEnd");
  });

  it("não existe eixo Y visível (valores exatos ficam no tooltip)", () => {
    render(<RealChecklistActivity data={SERIES} />);

    expect(screen.queryByTestId("y-axis")).toBeNull();
  });
});

describe("Y) vocabulário do domínio", () => {
  it("as séries são Programadas e Concluídas — nunca 'Respondidas'", () => {
    expect(CHECKLIST_ACTIVITY_CHART_CONFIG.scheduled.label).toBe("Programadas");
    expect(CHECKLIST_ACTIVITY_CHART_CONFIG.completed.label).toBe("Concluídas");

    const labels = Object.values(CHECKLIST_ACTIVITY_CHART_CONFIG).map((s) => s.label);
    expect(labels).not.toContain("Respondidas");
    expect(JSON.stringify(CHECKLIST_ACTIVITY_CHART_CONFIG).toLowerCase()).not.toContain("response");
  });

  it("o card não descreve a série como resposta de checklist", () => {
    render(<RealChecklistActivity data={SERIES} />);

    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).toContain("tarefas programadas e concluídas por dia");
    expect(text).not.toContain("respondid");
    expect(text).not.toContain("checklist response");
  });
});
