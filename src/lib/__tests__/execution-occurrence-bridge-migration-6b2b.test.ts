/**
 * Execution 6B.2B — bridge occurrence 5E ↔ execução autenticada do checklist.
 *
 * Esta suíte prova ESTRUTURALMENTE que a migration:
 *
 *   - reutiliza integralmente o schema 5E.2A (started_at / completed_at /
 *     response_id + UNIQUE(response_id)) sem criar tabela, coluna, FK, índice,
 *     policy, trigger ou cron;
 *   - autoriza dentro do banco a partir de auth.uid() e das linhas reais
 *     (occurrence → schedule → checklist → workspace_member);
 *   - é idempotente no SQL (start: started_at IS NULL; complete:
 *     completed_at IS NULL) e exige response status = 'submitted', o que só
 *     finalize_public_response produz;
 *   - mantém superfície de privilégios mínima (helper interno service_role).
 *
 * Comentários e corpos dollar-quoted são removidos antes das asserções, para
 * que prosa SQL jamais satisfaça uma verificação.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260914140000_6b2b_occurrence_execution_bridge.sql";
const BASE_SCHEMA_MIGRATION =
  "supabase/migrations/20260910120000_5e2a_execution_schedules_occurrences.sql";
const LAST_APPLIED_VERSION = "20260914130000";

const source = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");
const baseSchema = readFileSync(resolve(process.cwd(), BASE_SCHEMA_MIGRATION), "utf8");

/** Remove comentários de bloco e de linha (a prosa não pode satisfazer regras). */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Remove os corpos dollar-quoted das funções (nada executado ali é DML top-level). */
function stripDollarBodies(sql: string): string {
  return sql.replace(/\$[a-z_]*\$[\s\S]*?\$[a-z_]*\$/g, " ");
}

const sql = stripSqlComments(source);
const topLevel = stripDollarBodies(sql);

/** Seção de uma função específica (do CREATE até o próximo CREATE/REVOKE). */
function functionSection(name: string): string {
  const marker = `FUNCTION public.${name}(`;
  const idx = sql.indexOf(marker);
  expect(idx, `função ${name} não encontrada`).toBeGreaterThan(-1);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION", idx + marker.length);
  return next === -1 ? sql.slice(idx) : sql.slice(idx, next);
}

const helperSection = functionSection("checklist_occurrence_execution_context");
const openSection = functionSection("open_checklist_execution_occurrence");
const completeSection = functionSection("complete_checklist_execution_occurrence");

const migrationVersions = readdirSync(resolve(process.cwd(), "supabase/migrations"))
  .map((f) => f.slice(0, 14))
  .filter((v) => /^\d{14}$/.test(v));

describe("6B.2B — versão e escopo da migration", () => {
  it("usa versão monotônica posterior a 20260914130000 e sem colisão", () => {
    const version = MIGRATION.split("/").pop()!.slice(0, 14);
    expect(/^\d{14}$/.test(version)).toBe(true);
    expect(version > LAST_APPLIED_VERSION).toBe(true);

    const sameVersion = readdirSync(resolve(process.cwd(), "supabase/migrations")).filter((f) =>
      f.startsWith(version),
    );
    expect(sameVersion).toHaveLength(1);

    // Nenhuma outra migration usa uma versão IGUAL à desta (colisão real).
    // A pasta possui prefixos duplicados históricos e não relacionados — por
    // isso a checagem é escopada a este arquivo, não global.
    expect(migrationVersions.filter((v) => v === version)).toHaveLength(1);
  });

  it("NÃO altera schema: zero TABLE/COLUMN/INDEX/POLICY/TRIGGER/VIEW/RLS", () => {
    expect(topLevel).not.toMatch(/CREATE\s+TABLE/i);
    expect(topLevel).not.toMatch(/ALTER\s+TABLE/i);
    expect(topLevel).not.toMatch(/ADD\s+COLUMN/i);
    expect(topLevel).not.toMatch(/DROP\s+TABLE/i);
    expect(topLevel).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
    expect(topLevel).not.toMatch(/CREATE\s+POLICY/i);
    expect(topLevel).not.toMatch(/ALTER\s+POLICY/i);
    expect(topLevel).not.toMatch(/CREATE\s+TRIGGER/i);
    expect(topLevel).not.toMatch(/ROW LEVEL SECURITY/i);
    expect(topLevel).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?VIEW/i);
    expect(topLevel).not.toMatch(/cron/i);
    expect(topLevel).not.toMatch(/CREATE\s+EXTENSION/i);
  });

  it("zero DML no nível superior (nenhum INSERT/UPDATE/DELETE fora dos corpos)", () => {
    expect(topLevel).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(topLevel).not.toMatch(/\bUPDATE\s+public\./i);
    expect(topLevel).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(topLevel).not.toMatch(/\bTRUNCATE\b/i);
    expect(topLevel).not.toMatch(/DO\s+\$/i);
  });

  it("define exatamente três funções, todas SECURITY DEFINER com search_path fixo", () => {
    const declarations = sql.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    expect(declarations).toHaveLength(3);
    expect(sql.match(/SECURITY DEFINER/g) ?? []).toHaveLength(3);
    expect(sql.match(/SET search_path = public, pg_temp/g) ?? []).toHaveLength(3);
  });

  it("NÃO toca nas migrations 5E já aplicadas nem em task_executions/dashboard", () => {
    expect(source).not.toMatch(/analytics_unit_daily_compliance/);
    expect(source).not.toMatch(/task_executions/);
    expect(source).not.toMatch(/checklist_execution_schedules\s*$/m);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.checklist_execution_(schedules|occurrences)/i);
    expect(sql).not.toMatch(/checklist_execution_schedule_integrity/);
    // Apenas LEITURA da occurrence em si.
    expect(sql).not.toMatch(
      /UPDATE\s+public\.checklist_execution_occurrences\s+SET\s+schedule_id/i,
    );
  });

  it("o schema base da occurrence segue com os três campos de verdade (nada novo)", () => {
    expect(baseSchema).toMatch(/started_at timestamptz NULL/);
    expect(baseSchema).toMatch(/completed_at timestamptz NULL/);
    expect(baseSchema).toMatch(
      /response_id uuid NULL REFERENCES public\.checklist_responses\(id\) ON DELETE SET NULL/,
    );
    expect(baseSchema).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_occurrences_response/,
    );
  });
});

describe("6B.2B — autorização fail-closed", () => {
  it("o helper resolve o ator exclusivamente de auth.uid()", () => {
    expect(helperSection).toMatch(/v_user_id := auth\.uid\(\)/);
    expect(helperSection).toMatch(/IF v_user_id IS NULL THEN[\s\S]*occurrence_actor_required/);
    // Nenhum parâmetro de workspace/membro/usuário vindo do cliente.
    expect(sql).not.toMatch(/p_actor|p_user_id|p_workspace_id|p_member_id/);
  });

  it("trava occurrence, schedule e checklist atomicamente (TOCTOU)", () => {
    expect(helperSection).toMatch(/FOR UPDATE OF o, s, c/);
    expect(helperSection).toMatch(
      /JOIN public\.checklist_execution_schedules s ON s\.id = o\.schedule_id/,
    );
    expect(helperSection).toMatch(/JOIN public\.checklists c ON c\.id = s\.checklist_id/);
  });

  it("recusa occurrence inexistente", () => {
    expect(helperSection).toMatch(/IF v_schedule_id IS NULL THEN[\s\S]*occurrence_not_found/);
  });

  it("recusa occurrence de outro checklist (vínculo schedule.checklist_id)", () => {
    expect(helperSection).toMatch(
      /v_schedule_checklist_id IS DISTINCT FROM p_checklist_id[\s\S]*occurrence_checklist_mismatch/,
    );
  });

  it("recusa checklist pessoal (sem workspace)", () => {
    expect(helperSection).toMatch(
      /v_checklist_workspace_id IS NULL[\s\S]*occurrence_checklist_not_found/,
    );
  });

  it("exige o membro responsável ATIVO do MESMO workspace do checklist", () => {
    expect(helperSection).toMatch(
      /FROM public\.workspace_members wm\s+WHERE wm\.id = v_schedule_member_id/,
    );
    expect(helperSection).toMatch(
      /v_member_workspace_id IS DISTINCT FROM v_checklist_workspace_id/,
    );
    expect(helperSection).toMatch(/v_member_user_id IS DISTINCT FROM v_user_id/);
    expect(helperSection).toMatch(
      /v_member_status IS DISTINCT FROM 'active'::public\.member_status/,
    );
    expect(helperSection).toMatch(/occurrence_not_assignee/);
  });

  it("todos os erros usam P0001 e nenhuma mensagem técnica vaza schema", () => {
    const raises = sql.match(/RAISE EXCEPTION '([a-z_]+)'/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(10);
    expect(sql.match(/ERRCODE = 'P0001'/g) ?? []).toHaveLength(raises.length);
    expect(raises.join("\n")).not.toMatch(/relation|column|table|pg_/i);
  });
});

describe("6B.2B — start idempotente", () => {
  it("autoriza ANTES de qualquer escrita e marca started_at apenas se ainda for NULL", () => {
    const authorizeIdx = openSection.indexOf("checklist_occurrence_execution_context");
    const updateIdx = openSection.indexOf("UPDATE public.checklist_execution_occurrences");
    expect(authorizeIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(authorizeIdx);
    expect(openSection).toMatch(/SET started_at = now\(\)/);
    expect(openSection).toMatch(/AND started_at IS NULL/);
  });

  it("devolve o contexto autoritativo relido depois do start (refresh é no-op)", () => {
    const updateIdx = openSection.indexOf("UPDATE public.checklist_execution_occurrences");
    const rereadIdx = openSection.lastIndexOf(
      "RETURN public.checklist_occurrence_execution_context",
    );
    expect(rereadIdx).toBeGreaterThan(updateIdx);
  });

  it("não cria occurrence nem altera due_at/occurrence_date", () => {
    expect(openSection).not.toMatch(/INSERT INTO/i);
    expect(openSection).not.toMatch(/due_at\s*=/);
    expect(openSection).not.toMatch(/occurrence_date\s*=/);
    expect(openSection).not.toMatch(/response_id\s*=/);
    // Não invalida a rotina desativada: o estado is_active nem é lido.
    expect(openSection).not.toMatch(/is_active/);
  });
});

describe("6B.2B — conclusão idempotente e vinculada à submissão", () => {
  it("autoriza antes de tudo e devolve o contexto quando já concluída (retry seguro)", () => {
    const authorizeIdx = completeSection.indexOf("checklist_occurrence_execution_context");
    const updateIdx = completeSection.indexOf("UPDATE public.checklist_execution_occurrences");
    expect(authorizeIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(authorizeIdx);
    expect(completeSection).toMatch(/v_completed_at IS NOT NULL THEN\s+RETURN v_context/);
  });

  it("só grava em occurrence ainda aberta (completed_at IS NULL)", () => {
    expect(completeSection).toMatch(/AND completed_at IS NULL/);
    expect(completeSection).toMatch(/SET completed_at = now\(\),\s+response_id = p_response_id/);
    expect(completeSection).toMatch(
      /RETURNING|RETURN public\.checklist_occurrence_execution_context/,
    );
  });

  it("exige response existente, do MESMO checklist", () => {
    expect(completeSection).toMatch(
      /FROM public\.checklist_responses cr\s+WHERE cr\.id = p_response_id/,
    );
    expect(completeSection).toMatch(
      /v_response_checklist_id IS DISTINCT FROM p_checklist_id[\s\S]*occurrence_response_mismatch/,
    );
  });

  it("exige status = 'submitted' — falha no envio nunca conclui a occurrence", () => {
    expect(completeSection).toMatch(
      /v_response_status IS DISTINCT FROM 'submitted'[\s\S]*occurrence_response_not_submitted/,
    );
  });

  it("não inventa started_at nem duplica resposta", () => {
    expect(completeSection).not.toMatch(/started_at\s*=/);
    expect(completeSection).not.toMatch(/INSERT INTO/i);
    expect(completeSection).not.toMatch(/DELETE FROM/i);
  });
});

describe("6B.2B — superfície de privilégios", () => {
  it("o helper interno é service_role-only", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION\s+public\.checklist_occurrence_execution_context\(uuid, uuid\)\s+FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.checklist_occurrence_execution_context\(uuid, uuid\)\s+TO service_role/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.checklist_occurrence_execution_context\(uuid, uuid\)\s+TO authenticated/,
    );
  });

  it("open/complete são executáveis por authenticated e service_role, nunca por anon/PUBLIC", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION\s+public\.open_checklist_execution_occurrence\(uuid, uuid\)\s+FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.open_checklist_execution_occurrence\(uuid, uuid\)\s+TO authenticated, service_role/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION\s+public\.complete_checklist_execution_occurrence\(uuid, uuid, uuid\)\s+FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.complete_checklist_execution_occurrence\(uuid, uuid, uuid\)\s+TO authenticated, service_role/,
    );
    expect(sql).not.toMatch(/TO anon/);
  });

  it("assinaturas conferem com o contrato do cliente", () => {
    expect(sql).toMatch(
      /open_checklist_execution_occurrence\(\s*p_occurrence_id uuid,\s*p_checklist_id uuid\s*\)/,
    );
    expect(sql).toMatch(
      /complete_checklist_execution_occurrence\(\s*p_occurrence_id uuid,\s*p_checklist_id uuid,\s*p_response_id uuid\s*\)/,
    );
    expect(sql).toMatch(/RETURNS jsonb/);
  });

  it("não concede DML direto nas tabelas 5E", () => {
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON\s+public\./i);
  });
});
