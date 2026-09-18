/**
 * Drill-down da unidade — o calendário personalizado grava DIA CIVIL LOCAL.
 *
 * O bug: `OperationalDashboardFilters.setStart/setEnd` convertiam o dia
 * escolhido com `d.toISOString().slice(0, 10)`, ou seja o dia UTC. Este
 * componente é o filtro REAL de `/unidades/$unitId/operacao`, então o recorte
 * podia cair num dia diferente do que o calendário mostra (em fuso UTC-3, um
 * instante no fim do dia local já é o dia seguinte em UTC).
 *
 * A suíte cobre três camadas, de propósito:
 *   1. COMPORTAMENTO — clicar um dia no calendário entrega ao `onChange` o
 *      mesmo dia civil que foi clicado (data inicial e data final);
 *   2. CONVERSÃO — o caso 17/09/2026 21h30 locais, que é exatamente o instante
 *      em que o dia UTC deixa de ser o dia local (o teste falha com a
 *      implementação antiga em qualquer fuso a oeste de Greenwich);
 *   3. ESTRUTURA — os handlers usam o helper canônico e não voltaram a chamar
 *      `toISOString` (regressão invisível em fuso positivo, onde o dia local
 *      de uma meia-noite "anda" para trás em UTC).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { toCivilDateISO } from "@/lib/dashboard-filters";

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({ currentWorkspace: { id: "org-1", name: "Org Um" } }),
}));
vi.mock("@/hooks/useAccessibleUnits", () => ({
  useAccessibleUnits: () => ({ units: [], loading: false, error: null }),
}));

import { OperationalDashboardFilters } from "../OperationalDashboardFilters";

const FILTERS_SRC = readFileSync(resolve(__dirname, "../OperationalDashboardFilters.tsx"), "utf8");

const PAD = (n: number) => String(n).padStart(2, "0");

/**
 * Dia no calendário (react-day-picker 9, locale padrão en-US): o botão do dia
 * expõe o nome acessível completo — "Thursday, September 17th, 2026".
 */
function dayButton(label: string): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter((b) =>
    (b.getAttribute("aria-label") ?? "").includes(label),
  );
  if (buttons.length !== 1) {
    throw new Error(`esperava 1 botão para "${label}", encontrei ${buttons.length}`);
  }
  return buttons[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("calendário do drill-down grava dia civil local", () => {
  it("data inicial: o dia clicado volta como o MESMO dia civil", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OperationalDashboardFilters
        value={{ startDate: "2026-09-01", endDate: "2026-09-10" }}
        onChange={onChange}
      />,
    );

    // Abre o calendário da data inicial ("01 set 2026" no gatilho).
    await user.click(screen.getByRole("button", { name: /01 set 2026/i }));
    await user.click(dayButton("September 17th, 2026"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      startDate: "2026-09-17",
      endDate: "2026-09-17",
    });
  });

  it("data final: o dia clicado volta como o MESMO dia civil", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OperationalDashboardFilters
        value={{ startDate: "2026-09-01", endDate: "2026-09-10" }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /10 set 2026/i }));
    await user.click(dayButton("September 20th, 2026"));

    expect(onChange).toHaveBeenCalledWith({
      startDate: "2026-09-01",
      endDate: "2026-09-20",
    });
  });
});

describe("conversão — dia civil local, nunca o dia UTC", () => {
  it("17/09/2026 às 21h30 locais continua 2026-09-17", () => {
    // Fim do dia local: em UTC-3 este instante já é 18/09 00h30 em UTC. É a
    // virada que `toISOString().slice(0, 10)` reportava errado.
    const evening = new Date(2026, 8, 17, 21, 30, 0);

    expect(toCivilDateISO(evening)).toBe("2026-09-17");

    const utcDay = evening.toISOString().slice(0, 10);
    if (utcDay !== "2026-09-17") {
      expect(toCivilDateISO(evening)).not.toBe(utcDay);
    }
  });

  it("a meia-noite local que o calendário entrega continua no mesmo dia", () => {
    // react-day-picker devolve o dia clicado à meia-noite LOCAL.
    for (const day of [1, 10, 17, 30]) {
      const picked = new Date(2026, 8, day);
      const expected = `2026-09-${PAD(day)}`;
      const utcDay = picked.toISOString().slice(0, 10);

      expect(toCivilDateISO(picked)).toBe(expected);
      // Em fuso positivo a meia-noite local pertence ao dia anterior em UTC:
      // é esse o off-by-one que o helper canônico elimina.
      if (utcDay !== expected) {
        expect(toCivilDateISO(picked)).not.toBe(utcDay);
      }
    }
  });
});

describe("estrutura — os handlers não voltaram para UTC", () => {
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("setStart/setEnd usam toCivilDateISO e não toISOString", () => {
    expect(FILTERS_SRC).toMatch(
      /import\s*\{[\s\S]*?toCivilDateISO[\s\S]*?\}\s*from\s*"@\/lib\/dashboard-filters"/,
    );

    const src = stripComments(FILTERS_SRC);
    const start = src.slice(src.indexOf("function setStart"), src.indexOf("function setEnd"));
    const endBody = src.slice(src.indexOf("function setEnd"), src.indexOf("const dirty"));

    expect(start).toContain("toCivilDateISO(d)");
    expect(endBody).toContain("toCivilDateISO(d)");
    expect(start).not.toContain("toISOString");
    expect(endBody).not.toContain("toISOString");
    // E nenhuma outra conversão de dia por UTC sobrou no arquivo.
    expect(src).not.toMatch(/toISOString\(\)\.(slice|substring)\(0, ?10\)/);
  });
});
