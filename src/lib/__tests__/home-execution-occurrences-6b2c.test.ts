/**
 * Execution 6B.2C — lib pura das occurrences na Home.
 *
 * Cobre: parsing fail-closed do payload da RPC, status canônico (started NÃO é
 * concluída), contagem separada de obrigações abertas, ordenação canônica
 * (atrasada mais antiga → pendente mais próxima), múltiplas ocorrências do mesmo
 * checklist como itens distintos, gate de contexto e o orquestrador fail-closed.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseMyExecutionOccurrences,
  deriveHomeOccurrenceStatus,
  isActionableHomeOccurrence,
  countHomeOpenOccurrences,
  buildHomeOccurrencePriorities,
  formatOccurrencePriorityStatus,
  canLoadMyExecutionOccurrences,
  loadMyExecutionOccurrences,
  HOME_OCCURRENCE_PRIORITY_LIMIT,
  HOME_OCCURRENCE_FALLBACK_TITLE,
  type HomeExecutionOccurrence,
} from "../home-execution-occurrences";

const OCC_1 = "11111111-1111-4111-8111-111111111111";
const OCC_2 = "22222222-2222-4222-8222-222222222222";
const OCC_3 = "33333333-3333-4333-8333-333333333333";
const SCHED = "44444444-4444-4444-8444-444444444444";
const CHK = "55555555-5555-4555-8555-555555555555";
const CHK_B = "66666666-6666-4666-8666-666666666666";
const WM = "77777777-7777-4777-8777-777777777777";
const WS = "88888888-8888-4888-8888-888888888888";
const UNIT = "99999999-9999-4999-8999-999999999999";
const SHIFT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const NOW = new Date("2026-09-13T12:00:00Z");
const past = (n: number) => new Date(NOW.getTime() - n * 3600_000).toISOString();
const future = (n: number) => new Date(NOW.getTime() + n * 3600_000).toISOString();

const row = (over: Record<string, unknown> = {}) => ({
  occurrence_id: OCC_1,
  schedule_id: SCHED,
  checklist_id: CHK,
  checklist_title: "Rotina da manhã",
  workspace_member_id: WM,
  occurrence_date: "2026-09-13",
  due_at: past(1),
  started_at: null,
  completed_at: null,
  response_id: null,
  unit_id: UNIT,
  shift_id: SHIFT,
  ...over,
});

const occurrence = (over: Partial<HomeExecutionOccurrence> = {}): HomeExecutionOccurrence => ({
  occurrenceId: OCC_1,
  scheduleId: SCHED,
  checklistId: CHK,
  checklistTitle: "Rotina da manhã",
  workspaceMemberId: WM,
  occurrenceDate: "2026-09-13",
  dueAt: past(1),
  startedAt: null,
  completedAt: null,
  responseId: null,
  unitId: UNIT,
  shiftId: SHIFT,
  ...over,
});

describe("6B.2C — parsing fail-closed", () => {
  it("aceita um payload canônico completo", () => {
    const parsed = parseMyExecutionOccurrences([row()]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      occurrenceId: OCC_1,
      checklistId: CHK,
      scheduleId: SCHED,
      workspaceMemberId: WM,
      occurrenceDate: "2026-09-13",
      unitId: UNIT,
      shiftId: SHIFT,
      startedAt: null,
      completedAt: null,
    });
  });

  it("nunca aceita payload que não seja array", () => {
    expect(parseMyExecutionOccurrences(null)).toEqual([]);
    expect(parseMyExecutionOccurrences(undefined)).toEqual([]);
    expect(parseMyExecutionOccurrences({})).toEqual([]);
    expect(parseMyExecutionOccurrences("rows")).toEqual([]);
  });

  it("descarta linha sem identidade utilizável (navegação/execução seria inválida)", () => {
    expect(parseMyExecutionOccurrences([row({ occurrence_id: null })])).toEqual([]);
    expect(parseMyExecutionOccurrences([row({ occurrence_id: "occ-1" })])).toEqual([]);
    expect(parseMyExecutionOccurrences([row({ checklist_id: null })])).toEqual([]);
    expect(parseMyExecutionOccurrences([row({ schedule_id: "" })])).toEqual([]);
    expect(parseMyExecutionOccurrences([row({ workspace_member_id: null })])).toEqual([]);
    expect(parseMyExecutionOccurrences([row({ occurrence_date: null })])).toEqual([]);
    expect(parseMyExecutionOccurrences([row({ due_at: "ontem" })])).toEqual([]);
  });

  it("timestamp presente e inválido é violação de contrato, não null", () => {
    expect(parseMyExecutionOccurrences([row({ started_at: "nope" })])).toEqual([]);
    expect(parseMyExecutionOccurrences([row({ completed_at: "nope" })])).toEqual([]);
    expect(parseMyExecutionOccurrences([row({ started_at: "" })])).toHaveLength(1);
    expect(parseMyExecutionOccurrences([row({ completed_at: "" })])).toHaveLength(1);
  });

  it("título ausente usa fallback, unit/shift opcionais não invalidam", () => {
    const parsed = parseMyExecutionOccurrences([
      row({ checklist_title: null, unit_id: null, shift_id: null, response_id: "x" }),
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].checklistTitle).toBe(HOME_OCCURRENCE_FALLBACK_TITLE);
    expect(parsed[0].unitId).toBeNull();
    expect(parsed[0].shiftId).toBeNull();
    expect(parsed[0].responseId).toBeNull();
  });

  it("preserva as linhas válidas e descarta só as inválidas", () => {
    const parsed = parseMyExecutionOccurrences([
      row(),
      row({ occurrence_id: "inválido" }),
      row({ occurrence_id: OCC_2 }),
    ]);
    expect(parsed.map((o) => o.occurrenceId)).toEqual([OCC_1, OCC_2]);
  });
});

describe("6B.2C — status canônico (lifecycle 5E, sem segunda semântica)", () => {
  it("não concluída e dentro do prazo é pendente", () => {
    expect(deriveHomeOccurrenceStatus(occurrence({ dueAt: future(2) }), NOW)).toBe("pendente");
  });

  it("started NÃO é concluída: continua pendente ou atrasada conforme due_at", () => {
    expect(
      deriveHomeOccurrenceStatus(occurrence({ dueAt: future(2), startedAt: past(1) }), NOW),
    ).toBe("pendente");
    expect(
      deriveHomeOccurrenceStatus(occurrence({ dueAt: past(1), startedAt: past(3) }), NOW),
    ).toBe("atrasada");
  });

  it("vencida e não concluída é atrasada", () => {
    expect(deriveHomeOccurrenceStatus(occurrence({ dueAt: past(1) }), NOW)).toBe("atrasada");
  });

  it("concluída tem precedência mesmo se vencida", () => {
    expect(
      deriveHomeOccurrenceStatus(occurrence({ dueAt: past(5), completedAt: past(1) }), NOW),
    ).toBe("concluida");
  });

  it("isActionableHomeOccurrence exclui somente o que foi cumprido", () => {
    expect(isActionableHomeOccurrence(occurrence())).toBe(true);
    expect(isActionableHomeOccurrence(occurrence({ completedAt: past(1) }))).toBe(false);
  });

  it("formatOccurrencePriorityStatus rotula as três projeções", () => {
    expect(formatOccurrencePriorityStatus("atrasada")).toBe("Atrasada");
    expect(formatOccurrencePriorityStatus("pendente")).toBe("Pendente");
    expect(formatOccurrencePriorityStatus("concluida")).toBe("Concluída");
  });
});

describe("6B.2C — contagem separada das obrigações abertas", () => {
  it("conta atrasadas e pendentes e ignora concluídas", () => {
    const counts = countHomeOpenOccurrences(
      [
        occurrence({ occurrenceId: OCC_1, dueAt: past(2) }),
        occurrence({ occurrenceId: OCC_2, dueAt: past(1) }),
        occurrence({ occurrenceId: OCC_3, dueAt: future(2) }),
        occurrence({
          occurrenceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          dueAt: past(9),
          completedAt: past(1),
        }),
      ],
      NOW,
    );
    expect(counts).toEqual({ total: 3, atrasadas: 2, pendentes: 1 });
  });

  it("lista vazia zera tudo (nunca NaN)", () => {
    expect(countHomeOpenOccurrences([], NOW)).toEqual({ total: 0, atrasadas: 0, pendentes: 0 });
  });

  it("concluídas sozinhas não produzem obrigação", () => {
    const counts = countHomeOpenOccurrences(
      [occurrence({ completedAt: past(1), dueAt: past(5) })],
      NOW,
    );
    expect(counts.total).toBe(0);
  });
});

describe("6B.2C — prioridades: ordem e múltiplas occurrences", () => {
  it("atrasadas primeiro (mais antiga primeiro), depois pendentes (mais próxima primeiro)", () => {
    const { items } = buildHomeOccurrencePriorities(
      [
        occurrence({ occurrenceId: OCC_1, dueAt: future(3) }), // pendente mais distante
        occurrence({ occurrenceId: OCC_2, dueAt: past(1) }), // atrasada recente
        occurrence({ occurrenceId: OCC_3, dueAt: past(10) }), // atrasada antiga
        occurrence({ occurrenceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", dueAt: future(1) }),
      ],
      { now: NOW },
    );
    expect(items.map((i) => i.occurrenceId)).toEqual([
      OCC_3, // atrasada mais antiga
      OCC_2, // atrasada recente
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", // pendente mais próxima
      OCC_1, // pendente mais distante
    ]);
    expect(items.map((i) => i.status)).toEqual(["atrasada", "atrasada", "pendente", "pendente"]);
  });

  it("duas occurrences do MESMO checklist são duas obrigações acionáveis", () => {
    const { items, remaining } = buildHomeOccurrencePriorities(
      [
        occurrence({ occurrenceId: OCC_1, dueAt: past(20) }), // ontem, atrasada
        occurrence({ occurrenceId: OCC_2, dueAt: future(6) }), // hoje, pendente
      ],
      { now: NOW },
    );
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.checklistId)).toEqual([CHK, CHK]);
    expect(new Set(items.map((i) => i.occurrenceId)).size).toBe(2);
    expect(remaining).toBe(0);
  });

  it("desempate por occurrenceId é determinístico", () => {
    const a = buildHomeOccurrencePriorities(
      [
        occurrence({ occurrenceId: OCC_2, dueAt: past(1) }),
        occurrence({ occurrenceId: OCC_1, dueAt: past(1) }),
      ],
      { now: NOW },
    );
    const b = buildHomeOccurrencePriorities(
      [
        occurrence({ occurrenceId: OCC_1, dueAt: past(1) }),
        occurrence({ occurrenceId: OCC_2, dueAt: past(1) }),
      ],
      { now: NOW },
    );
    expect(a.items.map((i) => i.occurrenceId)).toEqual([OCC_1, OCC_2]);
    expect(a.items.map((i) => i.occurrenceId)).toEqual(b.items.map((i) => i.occurrenceId));
  });

  it("concluídas nunca entram como prioridade, mas são reportadas", () => {
    const { items, completedCount } = buildHomeOccurrencePriorities(
      [
        occurrence({ occurrenceId: OCC_1, completedAt: past(1) }),
        occurrence({ occurrenceId: OCC_2, dueAt: past(2) }),
      ],
      { now: NOW },
    );
    expect(items.map((i) => i.occurrenceId)).toEqual([OCC_2]);
    expect(completedCount).toBe(1);
  });

  it("limita a lista e reporta o restante sem fazer obrigação desaparecer", () => {
    const rows = Array.from({ length: HOME_OCCURRENCE_PRIORITY_LIMIT + 2 }, (_, i) =>
      occurrence({
        occurrenceId: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`,
        dueAt: past(100 - i),
      }),
    );
    const { items, remaining } = buildHomeOccurrencePriorities(rows, { now: NOW });
    expect(items).toHaveLength(HOME_OCCURRENCE_PRIORITY_LIMIT);
    expect(remaining).toBe(2);
    expect(items.length + remaining).toBe(rows.length);
  });

  it("não muta a lista recebida", () => {
    const rows = [
      occurrence({ occurrenceId: OCC_1, dueAt: future(3) }),
      occurrence({ occurrenceId: OCC_2, dueAt: past(1) }),
    ];
    const snapshot = rows.map((r) => r.occurrenceId);
    buildHomeOccurrencePriorities(rows, { now: NOW });
    expect(rows.map((r) => r.occurrenceId)).toEqual(snapshot);
  });
});

describe("6B.2C — gate de contexto", () => {
  it("só consulta autenticado, em contexto de workspace, com workspace resolvido", () => {
    expect(
      canLoadMyExecutionOccurrences({
        isAuthenticated: true,
        isWorkspaceContext: true,
        workspaceId: WS,
      }),
    ).toBe(true);
  });

  it("não consulta no contexto pessoal", () => {
    expect(
      canLoadMyExecutionOccurrences({
        isAuthenticated: true,
        isWorkspaceContext: false,
        workspaceId: WS,
      }),
    ).toBe(false);
  });

  it("não consulta sem usuário ou sem workspace resolvido", () => {
    expect(
      canLoadMyExecutionOccurrences({
        isAuthenticated: false,
        isWorkspaceContext: true,
        workspaceId: WS,
      }),
    ).toBe(false);
    expect(
      canLoadMyExecutionOccurrences({
        isAuthenticated: true,
        isWorkspaceContext: true,
        workspaceId: null,
      }),
    ).toBe(false);
    expect(
      canLoadMyExecutionOccurrences({
        isAuthenticated: true,
        isWorkspaceContext: true,
        workspaceId: "",
      }),
    ).toBe(false);
  });

  it("o gate NÃO depende de papel (viewer também precisa cumprir a própria obrigação)", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/home-execution-occurrences.ts"),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    // Sem role: bloquear por papel esconderia do responsável a própria obrigação.
    expect(code).not.toMatch(/isViewer|canManage|workspaceRole/);
    // O mesmo contexto resolve igual, independentemente de qualquer papel.
    const base = { isAuthenticated: true, isWorkspaceContext: true, workspaceId: WS };
    expect(canLoadMyExecutionOccurrences(base)).toBe(true);
    expect(canLoadMyExecutionOccurrences({ ...base, role: "viewer" } as never)).toBe(true);
    expect(canLoadMyExecutionOccurrences({ ...base, role: "admin" } as never)).toBe(true);
  });
});

describe("6B.2C — orquestrador fail-closed", () => {
  it("sem workspace não consulta nada e não é erro", async () => {
    const fetchOccurrences = vi.fn();
    const result = await loadMyExecutionOccurrences({ fetchOccurrences }, null);
    expect(fetchOccurrences).not.toHaveBeenCalled();
    expect(result).toEqual({ occurrences: [], error: false });
  });

  it("passa exatamente o workspace pedido para a consulta", async () => {
    const fetchOccurrences = vi.fn(async () => ({ data: [row()], error: null }));
    await loadMyExecutionOccurrences({ fetchOccurrences }, WS);
    expect(fetchOccurrences).toHaveBeenCalledWith(WS);
  });

  it("erro da RPC vira fail-closed com error=true (nunca zero silencioso)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await loadMyExecutionOccurrences(
      { fetchOccurrences: async () => ({ data: null, error: { message: "boom" } }) },
      WS,
    );
    expect(result).toEqual({ occurrences: [], error: true });
    errorSpy.mockRestore();
  });

  it("payload não-array é tratado como falha de contrato", async () => {
    const result = await loadMyExecutionOccurrences(
      { fetchOccurrences: async () => ({ data: { nope: true }, error: null }) },
      WS,
    );
    expect(result).toEqual({ occurrences: [], error: true });
  });

  it("sucesso devolve as occurrences parseadas", async () => {
    const result = await loadMyExecutionOccurrences(
      {
        fetchOccurrences: async () => ({
          data: [row(), row({ occurrence_id: OCC_B() })],
          error: null,
        }),
      },
      WS,
    );
    expect(result.error).toBe(false);
    expect(result.occurrences).toHaveLength(2);
  });
});

const OCC_B = () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("6B.2C — isolamento entre checklists distintos", () => {
  it("duas occurrences de checklists diferentes mantêm suas próprias identidades", () => {
    const parsed = parseMyExecutionOccurrences([
      row(),
      row({ occurrence_id: OCC_2, checklist_id: CHK_B, checklist_title: "Rotina da noite" }),
    ]);
    expect(parsed.map((o) => o.checklistId)).toEqual([CHK, CHK_B]);
    expect(parsed.map((o) => o.checklistTitle)).toEqual(["Rotina da manhã", "Rotina da noite"]);
  });
});
