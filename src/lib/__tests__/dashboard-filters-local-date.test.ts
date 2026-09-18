/**
 * Filtros do painel — DATA CIVIL LOCAL (6B.2F).
 *
 * O bug corrigido: `todayISO()` usava `new Date().toISOString().slice(0, 10)`,
 * ou seja o dia UTC. Em fuso UTC-3, às 21h30 locais o UTC já está no dia
 * seguinte, então "Hoje"/"7 dias"/"30 dias" avançavam um dia durante parte da
 * noite — e o preset deixava de casar com o que o calendário produz para o
 * mesmo dia (o calendário converte por componentes locais desde sempre).
 *
 * Sobre a prova do bug: o sintoma depende do offset da máquina. O primeiro
 * teste fixa o relógio em 17/09 21h30 LOCAIS e exige "2026-09-17" — ele falha
 * com a implementação UTC em qualquer fuso negativo (o caso do produto) e passa
 * trivialmente num runner UTC. Os demais testes provam a propriedade
 * independentemente do fuso, comparando com os componentes locais do mesmo
 * instante.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  daysAgoISO,
  defaultFilters,
  detectPreset,
  presetToRange,
  toCivilDateISO,
  todayISO,
} from "../dashboard-filters";

const pad = (n: number) => String(n).padStart(2, "0");

/** Data civil local do instante, derivada por componentes (a referência certa). */
function localCivil(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("todayISO — data civil local", () => {
  it("às 21h30 locais devolve o dia LOCAL, não o dia UTC", () => {
    // 21h30 do dia 17 no relógio local. Em UTC-3 este instante já é 18/09 00h30
    // em UTC — exatamente a virada que fazia o recorte pular um dia.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 21, 30, 0));

    expect(todayISO()).toBe("2026-09-17");
  });

  it("nunca devolve o dia UTC quando ele difere do dia local", () => {
    // Meia-noite e meia de 18/09 em UTC: em qualquer fuso a oeste, o dia local
    // ainda é 17/09.
    const instant = new Date(Date.UTC(2026, 8, 18, 0, 30, 0));
    const expected = localCivil(instant);
    const utcDay = instant.toISOString().slice(0, 10);

    expect(todayISO(instant)).toBe(expected);
    if (utcDay !== expected) {
      expect(todayISO(instant)).not.toBe(utcDay);
    }
  });

  it("usa os componentes locais do instante (propriedade, independente do fuso)", () => {
    for (const build of [
      () => new Date(2026, 0, 1, 0, 0, 1),
      () => new Date(2026, 8, 17, 23, 59, 59),
      () => new Date(2026, 11, 31, 23, 59, 59),
      () => new Date(Date.UTC(2026, 5, 15, 12, 0, 0)),
    ]) {
      const instant = build();
      expect(todayISO(instant)).toBe(localCivil(instant));
      expect(toCivilDateISO(instant)).toBe(localCivil(instant));
    }
  });

  it("formata sempre YYYY-MM-DD com zero à esquerda", () => {
    expect(todayISO(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
    expect(todayISO(new Date(2026, 10, 30, 12))).toBe("2026-11-30");
  });
});

describe("daysAgoISO — janelas ancoradas no hoje local", () => {
  it("7 dias termina no hoje LOCAL e começa 6 dias antes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 21, 30, 0));

    expect(daysAgoISO(6)).toBe("2026-09-11");
    expect(defaultFilters()).toEqual({ startDate: "2026-09-11", endDate: "2026-09-17" });
  });

  it("30 dias termina no hoje LOCAL e começa 29 dias antes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 21, 30, 0));

    expect(daysAgoISO(29)).toBe("2026-08-19");
  });

  it("atravessa virada de mês e de hora de verão sem off-by-one", () => {
    // 01/03 12h local menos 6 dias = 23/02 (subtração por calendário, não por
    // milissegundos — somar/subtrair ms erra o dia quando o horário de verão
    // entra ou sai no meio do intervalo).
    expect(daysAgoISO(6, new Date(2026, 2, 1, 12))).toBe("2026-02-23");
    expect(daysAgoISO(29, new Date(2026, 2, 1, 12))).toBe("2026-01-31");
    expect(daysAgoISO(0, new Date(2026, 8, 17, 21, 30))).toBe("2026-09-17");
  });

  it("presets e calendário concordam com a data civil local", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 21, 30, 0));

    const hoje = presetToRange("hoje");
    const sete = presetToRange("7d");
    const trinta = presetToRange("30d");

    expect(hoje).toEqual({ startDate: "2026-09-17", endDate: "2026-09-17" });
    expect(sete).toEqual({ startDate: "2026-09-11", endDate: "2026-09-17" });
    expect(trinta).toEqual({ startDate: "2026-08-19", endDate: "2026-09-17" });

    // O calendário da toolbar converte Date → ISO por componentes locais
    // (`toIsoDate`). Converter as datas do preset de volta para um Date local e
    // reformatar tem de devolver EXATAMENTE o mesmo dia — é isso que impede o
    // preset "Hoje" de selecionar visualmente um dia diferente do aplicado.
    for (const iso of [hoje!.startDate, sete!.startDate, trinta!.endDate]) {
      const [y, m, d] = iso.split("-").map(Number);
      expect(todayISO(new Date(y, m - 1, d, 12))).toBe(iso);
    }

    // E os presets são reconhecidos a partir do próprio recorte aplicado.
    expect(detectPreset(hoje!)).toBe("hoje");
    expect(detectPreset(sete!)).toBe("7d");
    expect(detectPreset(trinta!)).toBe("30d");
  });
});
