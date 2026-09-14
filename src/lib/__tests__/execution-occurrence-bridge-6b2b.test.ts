/**
 * Execution 6B.2B — superfície cliente do bridge occurrence ↔ execução.
 *
 * Prova comportamento real (não strings): parsing fail-closed do jsonb, derivação
 * canônica de estado a partir dos timestamps 5E.2A, classificação de erro sem
 * vazamento de SQL, e as duas RPCs — argumentos exatos, zero escrita direta em
 * tabela e retry idempotente que NÃO dispara uma segunda chamada destrutiva.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/integrations/supabase/client", () => {
  const rpc = vi.fn();
  return { supabase: { rpc, __rpcMock: rpc } };
});

import { supabase } from "@/integrations/supabase/client";
import {
  isUuid,
  parseOccurrenceContext,
  deriveOccurrenceState,
  extractFinalizedResponseId,
  classifyOccurrenceError,
  isOccurrenceDenial,
  getOccurrenceBridgeErrorMessage,
  OCCURRENCE_BRIDGE_MESSAGES,
  openChecklistExecutionOccurrence,
  completeChecklistExecutionOccurrence,
} from "../execution-occurrence";

const rpcMock = (supabase as unknown as { __rpcMock: ReturnType<typeof vi.fn> }).__rpcMock;

const OCC = "11111111-1111-4111-8111-111111111111";
const CHK = "22222222-2222-4222-8222-222222222222";
const OTHER_CHK = "33333333-3333-4333-8333-333333333333";
const SCHED = "44444444-4444-4444-8444-444444444444";
const WS = "55555555-5555-4555-8555-555555555555";
const WM = "66666666-6666-4666-8666-666666666666";
const RESP = "77777777-7777-4777-8777-777777777777";

const payload = (over: Record<string, unknown> = {}) => ({
  occurrence_id: OCC,
  checklist_id: CHK,
  schedule_id: SCHED,
  workspace_id: WS,
  workspace_member_id: WM,
  occurrence_date: "2026-09-13",
  due_at: "2026-09-13T21:00:00+00:00",
  started_at: null,
  completed_at: null,
  response_id: null,
  ...over,
});

beforeEach(() => {
  rpcMock.mockReset();
});

describe("6B.2B — identidade e parsing fail-closed", () => {
  it("isUuid aceita apenas uuid v4-like completo", () => {
    expect(isUuid(OCC)).toBe(true);
    expect(isUuid("chk-1")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid(`${OCC} `)).toBe(false);
  });

  it("parseOccurrenceContext aceita o payload canônico e converte para camelCase", () => {
    const ctx = parseOccurrenceContext(payload({ started_at: "2026-09-13T10:00:00+00:00" }));
    expect(ctx).not.toBeNull();
    expect(ctx!.occurrenceId).toBe(OCC);
    expect(ctx!.checklistId).toBe(CHK);
    expect(ctx!.scheduleId).toBe(SCHED);
    expect(ctx!.workspaceId).toBe(WS);
    expect(ctx!.workspaceMemberId).toBe(WM);
    expect(ctx!.occurrenceDate).toBe("2026-09-13");
    expect(ctx!.startedAt).toBe("2026-09-13T10:00:00+00:00");
    expect(ctx!.completedAt).toBeNull();
    expect(ctx!.responseId).toBeNull();
  });

  it("rejeita payload parcial: identidade ausente nunca vira occurrence válida", () => {
    expect(parseOccurrenceContext(null)).toBeNull();
    expect(parseOccurrenceContext(undefined)).toBeNull();
    expect(parseOccurrenceContext("string")).toBeNull();
    expect(parseOccurrenceContext([])).toBeNull();
    expect(parseOccurrenceContext([payload()])).toBeNull();

    for (const field of [
      "occurrence_id",
      "checklist_id",
      "schedule_id",
      "workspace_id",
      "workspace_member_id",
      "occurrence_date",
      "due_at",
    ]) {
      expect(parseOccurrenceContext(payload({ [field]: null })), field).toBeNull();
      expect(parseOccurrenceContext(payload({ [field]: "" })), field).toBeNull();
    }

    expect(parseOccurrenceContext(payload({ occurrence_id: "not-a-uuid" }))).toBeNull();
    expect(parseOccurrenceContext(payload({ due_at: "not-a-date" }))).toBeNull();
    expect(parseOccurrenceContext(payload({ started_at: "ontem" }))).toBeNull();
    expect(parseOccurrenceContext(payload({ completed_at: "ontem" }))).toBeNull();
  });
});

describe("6B.2B — estado canônico derivado dos timestamps", () => {
  const now = new Date("2026-09-13T12:00:00Z");

  it("completed tem precedência sobre qualquer outro estado", () => {
    const state = deriveOccurrenceState(
      {
        dueAt: "2026-09-01T00:00:00Z",
        startedAt: "2026-09-01T00:00:00Z",
        completedAt: "2026-09-10T00:00:00Z",
      } as never,
      now,
    );
    expect(state).toBe("completed");
  });

  it("vencida e não concluída é overdue, mesmo já iniciada", () => {
    expect(
      deriveOccurrenceState(
        {
          dueAt: "2026-09-13T11:00:00Z",
          startedAt: "2026-09-13T10:00:00Z",
          completedAt: null,
        } as never,
        now,
      ),
    ).toBe("overdue");
    expect(
      deriveOccurrenceState(
        { dueAt: "2026-09-13T11:00:00Z", startedAt: null, completedAt: null } as never,
        now,
      ),
    ).toBe("overdue");
  });

  it("iniciada dentro do prazo é started; nunca iniciada é pending", () => {
    expect(
      deriveOccurrenceState(
        {
          dueAt: "2026-09-13T23:00:00Z",
          startedAt: "2026-09-13T10:00:00Z",
          completedAt: null,
        } as never,
        now,
      ),
    ).toBe("started");
    expect(
      deriveOccurrenceState(
        { dueAt: "2026-09-13T23:00:00Z", startedAt: null, completedAt: null } as never,
        now,
      ),
    ).toBe("pending");
  });
});

describe("6B.2B — vínculo com a resposta finalizada", () => {
  it("extrai response_id do retorno TABLE (array) do finalize", () => {
    expect(extractFinalizedResponseId([{ response_id: RESP, status: "submitted" }])).toBe(RESP);
  });

  it("aceita também objeto puro (independência de forma de transporte)", () => {
    expect(extractFinalizedResponseId({ response_id: RESP })).toBe(RESP);
  });

  it("devolve null para formatos inesperados, sem inventar id", () => {
    expect(extractFinalizedResponseId(null)).toBeNull();
    expect(extractFinalizedResponseId([])).toBeNull();
    expect(extractFinalizedResponseId([{}])).toBeNull();
    expect(extractFinalizedResponseId({ response_id: "" })).toBeNull();
    expect(extractFinalizedResponseId("abc")).toBeNull();
    expect(extractFinalizedResponseId(7)).toBeNull();
  });
});

describe("6B.2B — classificação de erro e mensagens sanitizadas", () => {
  it("mapeia cada código do banco para um motivo estável", () => {
    expect(classifyOccurrenceError({ message: "occurrence_not_found" })).toBe("not_found");
    expect(classifyOccurrenceError("occurrence_checklist_mismatch")).toBe("checklist_mismatch");
    expect(classifyOccurrenceError({ message: "occurrence_not_assignee" })).toBe("not_assignee");
    expect(classifyOccurrenceError({ message: "occurrence_response_not_submitted" })).toBe(
      "response_not_submitted",
    );
    expect(classifyOccurrenceError({ message: "occurrence_response_mismatch" })).toBe(
      "response_mismatch",
    );
  });

  it("erro desconhecido vira unavailable e nunca expõe detalhe técnico", () => {
    expect(classifyOccurrenceError({ message: 'relation "public.x" does not exist' })).toBe(
      "unavailable",
    );
    expect(classifyOccurrenceError(null)).toBe("unavailable");
    expect(classifyOccurrenceError(new Error(""))).toBe("unavailable");
  });

  it("negativas (existe em outro workspace/checklist/membro) são indistinguíveis", () => {
    expect(isOccurrenceDenial("not_found")).toBe(true);
    expect(isOccurrenceDenial("checklist_mismatch")).toBe(true);
    expect(isOccurrenceDenial("not_assignee")).toBe(true);
    expect(isOccurrenceDenial("unavailable")).toBe(false);
    expect(getOccurrenceBridgeErrorMessage("not_found")).toBe(
      OCCURRENCE_BRIDGE_MESSAGES.bridgeDenied,
    );
    expect(getOccurrenceBridgeErrorMessage("not_assignee")).toBe(
      OCCURRENCE_BRIDGE_MESSAGES.bridgeDenied,
    );
    expect(getOccurrenceBridgeErrorMessage("unavailable")).toBe(
      OCCURRENCE_BRIDGE_MESSAGES.bridgeUnavailable,
    );
  });

  it("nenhuma mensagem visível menciona tabela, schema, view ou SQL", () => {
    const messages = Object.values(OCCURRENCE_BRIDGE_MESSAGES).join(" ");
    expect(messages).not.toMatch(
      /public\.|checklist_execution_occurrences|SELECT|UPDATE|column|relation|pg_/i,
    );
  });
});

describe("6B.2B — RPCs (única superfície de escrita)", () => {
  it("open: rejeita argumento malformado sem tocar no banco", async () => {
    const result = await openChecklistExecutionOccurrence("chk", CHK);
    expect(result).toEqual({ ok: false, reason: "invalid_argument" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("open: chama a RPC exatamente uma vez com os parâmetros nominais corretos", async () => {
    rpcMock.mockResolvedValueOnce({ data: payload(), error: null });

    const result = await openChecklistExecutionOccurrence(OCC, CHK);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("open_checklist_execution_occurrence", {
      p_occurrence_id: OCC,
      p_checklist_id: CHK,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.context.occurrenceId).toBe(OCC);
  });

  it("open: erro do banco é classificado e não devolve contexto", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "occurrence_checklist_mismatch" },
    });
    const result = await openChecklistExecutionOccurrence(OCC, OTHER_CHK);
    expect(result).toEqual({ ok: false, reason: "checklist_mismatch" });
  });

  it("open: payload inesperado (mesmo sem erro) falha fechado", async () => {
    rpcMock.mockResolvedValueOnce({ data: { occurrence_id: OCC }, error: null });
    const result = await openChecklistExecutionOccurrence(OCC, CHK);
    expect(result).toEqual({ ok: false, reason: "invalid_payload" });
  });

  it("open: refresh (segunda chamada) reusa a mesma RPC idempotente, sem escrita local", async () => {
    rpcMock.mockResolvedValue({
      data: payload({ started_at: "2026-09-13T10:00:00+00:00" }),
      error: null,
    });

    const first = await openChecklistExecutionOccurrence(OCC, CHK);
    const second = await openChecklistExecutionOccurrence(OCC, CHK);

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[0]).toEqual(rpcMock.mock.calls[1]);
    expect(first.ok && second.ok).toBe(true);
    // O timestamp original é preservado pelo banco; o cliente não o reescreve.
    expect(second.ok && second.context.startedAt).toBe("2026-09-13T10:00:00+00:00");
  });

  it("complete: exige os três ids válidos antes de qualquer chamada", async () => {
    expect(await completeChecklistExecutionOccurrence(OCC, CHK, "")).toEqual({
      ok: false,
      reason: "invalid_argument",
    });
    expect(await completeChecklistExecutionOccurrence("x", CHK, RESP)).toEqual({
      ok: false,
      reason: "invalid_argument",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("complete: envia occurrence, checklist e response exatos", async () => {
    rpcMock.mockResolvedValueOnce({
      data: payload({ completed_at: "2026-09-13T12:00:00+00:00", response_id: RESP }),
      error: null,
    });

    const result = await completeChecklistExecutionOccurrence(OCC, CHK, RESP);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("complete_checklist_execution_occurrence", {
      p_occurrence_id: OCC,
      p_checklist_id: CHK,
      p_response_id: RESP,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.context.responseId).toBe(RESP);
  });

  it("complete: retry sobre occurrence já concluída permanece sucesso, sem novo resultado divergente", async () => {
    rpcMock.mockResolvedValue({
      data: payload({ completed_at: "2026-09-13T12:00:00+00:00", response_id: RESP }),
      error: null,
    });

    const first = await completeChecklistExecutionOccurrence(OCC, CHK, RESP);
    const retry = await completeChecklistExecutionOccurrence(OCC, CHK, RESP);

    expect(first).toEqual(retry);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    if (retry.ok) {
      expect(retry.context.completedAt).toBe("2026-09-13T12:00:00+00:00");
      expect(retry.context.responseId).toBe(RESP);
    }
  });

  it("complete: envio não finalizado é recusado pelo banco e propaga motivo", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "occurrence_response_not_submitted" },
    });
    const result = await completeChecklistExecutionOccurrence(OCC, CHK, RESP);
    expect(result).toEqual({ ok: false, reason: "response_not_submitted" });
  });

  it("o módulo nunca escreve direto em tabela (RPC é o único caminho)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/execution-occurrence.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toMatch(/\.from\(/);
    expect(code).not.toMatch(/\.insert\(/);
    expect(code).not.toMatch(/\.update\(/);
    expect(code).not.toMatch(/\.delete\(/);
    expect(code).not.toMatch(/\.upsert\(/);
    expect(code.match(/\.rpc\(/g) ?? []).toHaveLength(2);
  });
});
