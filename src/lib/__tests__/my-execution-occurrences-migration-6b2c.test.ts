/**
 * Execution 6B.2C — RPC de leitura segura das próprias occurrences.
 *
 * Prova ESTRUTURALMENTE que a migration:
 *   - define UMA função de leitura, SECURITY DEFINER, search_path fixo;
 *   - resolve a autorização DENTRO do banco a partir de auth.uid() e de uma
 *     membership ATIVA no workspace pedido (o p_workspace_id nunca é confiado);
 *   - prende a occurrence ao schedule do PRÓPRIO membro e o checklist ao
 *     workspace pedido — outro membro/workspace/inativo não retorna nada;
 *   - devolve só obrigações abertas (completed_at IS NULL), com look-ahead
 *     limitado no fuso do próprio schedule e SEM limite inferior (atrasada
 *     antiga continua visível);
 *   - não cria tabela, coluna, índice, policy, trigger, RLS ou cron, e não tem
 *     DML no nível superior.
 *
 * Comentários e corpos dollar-quoted são removidos antes das asserções.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260914150000_6b2c_my_execution_occurrences.sql";
const PREVIOUS_VERSION = "20260914140000";
const BRIDGE_MIGRATION = "supabase/migrations/20260914140000_6b2b_occurrence_execution_bridge.sql";

const source = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");
const bridgeSource = readFileSync(resolve(process.cwd(), BRIDGE_MIGRATION), "utf8");

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function stripDollarBodies(sql: string): string {
  return sql.replace(/\$[a-z_]*\$[\s\S]*?\$[a-z_]*\$/g, " ");
}

const sql = stripSqlComments(source);
const topLevel = stripDollarBodies(sql);

const bodyStart = sql.indexOf("AS $my_occurrences$");
const bodyEnd = sql.lastIndexOf("$my_occurrences$");
const body = sql.slice(bodyStart, bodyEnd);

describe("6B.2C — versão e escopo da migration", () => {
  it("usa versão monotônica posterior a 14140000 e sem colisão", () => {
    const version = MIGRATION.split("/").pop()!.slice(0, 14);
    expect(/^\d{14}$/.test(version)).toBe(true);
    expect(version > PREVIOUS_VERSION).toBe(true);
    const sameVersion = readdirSync(resolve(process.cwd(), "supabase/migrations")).filter((f) =>
      f.startsWith(version),
    );
    expect(sameVersion).toHaveLength(1);
  });

  it("não altera schema nem dados: zero TABLE/COLUMN/INDEX/POLICY/TRIGGER/VIEW/RLS/CRON", () => {
    expect(topLevel).not.toMatch(/CREATE\s+TABLE/i);
    expect(topLevel).not.toMatch(/ALTER\s+TABLE/i);
    expect(topLevel).not.toMatch(/ADD\s+COLUMN/i);
    expect(topLevel).not.toMatch(/DROP\s+/i);
    expect(topLevel).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
    expect(topLevel).not.toMatch(/CREATE\s+POLICY/i);
    expect(topLevel).not.toMatch(/CREATE\s+TRIGGER/i);
    expect(topLevel).not.toMatch(/ROW LEVEL SECURITY/i);
    expect(topLevel).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?VIEW/i);
    expect(topLevel).not.toMatch(/cron/i);
  });

  it("zero DML no nível superior (aplicar a migration não lê nem escreve dados)", () => {
    expect(topLevel).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(topLevel).not.toMatch(/\bUPDATE\s+public\./i);
    expect(topLevel).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(topLevel).not.toMatch(/\bTRUNCATE\b/i);
    expect(topLevel).not.toMatch(/DO\s+\$/i);
  });

  it("define exatamente uma função, SECURITY DEFINER com search_path fixo", () => {
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []).toHaveLength(1);
    expect(sql).toMatch(
      /FUNCTION public\.list_my_checklist_execution_occurrences\(\s*p_workspace_id uuid\s*\)/,
    );
    expect(sql.match(/SECURITY DEFINER/g) ?? []).toHaveLength(1);
    expect(sql.match(/SET search_path = public, pg_temp/g) ?? []).toHaveLength(1);
    expect(sql).toMatch(/RETURNS TABLE/);
  });

  it("não edita as migrations já aplicadas (bridge 6B.2B permanece intacto)", () => {
    expect(bridgeSource).toMatch(/RAISE EXCEPTION 'occurrence_not_assignee'/);
    expect(bridgeSource).toMatch(/AND started_at IS NULL/);
    expect(source).not.toMatch(/open_checklist_execution_occurrence/);
    expect(source).not.toMatch(/complete_checklist_execution_occurrence/);
  });

  it("não amplia acesso às tabelas 5E (nenhum GRANT de tabela)", () => {
    expect(sql).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE/i);
    expect(sql).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+public\./i);
  });
});

describe("6B.2C — autorização resolvida no banco", () => {
  it("o ator vem exclusivamente de auth.uid()", () => {
    expect(body).toMatch(/v_user_id := auth\.uid\(\)/);
    expect(body).toMatch(/IF v_user_id IS NULL THEN/);
    expect(body).toMatch(/occurrence_actor_required/);
    // Nenhum parâmetro de membro/usuário vindo do cliente.
    expect(sql).not.toMatch(/p_user_id|p_member_id|p_workspace_member_id/);
  });

  it("exige workspace explícito e falha fechado quando ausente", () => {
    expect(body).toMatch(/IF p_workspace_id IS NULL THEN/);
    expect(body).toMatch(/occurrence_workspace_required/);
  });

  it("exige membership ATIVA do próprio usuário no workspace pedido", () => {
    expect(body).toMatch(
      /FROM public\.workspace_members wm\s+WHERE wm\.workspace_id = p_workspace_id\s+AND wm\.user_id = v_user_id\s+AND wm\.status = 'active'::public\.member_status/,
    );
    expect(body).toMatch(/IF v_member_id IS NULL THEN/);
    expect(body).toMatch(/occurrence_not_member/);
  });

  it("prende a occurrence ao schedule do MESMO membro e o checklist ao MESMO workspace", () => {
    expect(body).toMatch(/WHERE s\.workspace_member_id = v_member_id/);
    expect(body).toMatch(/AND c\.workspace_id = p_workspace_id/);
    expect(body).toMatch(/JOIN public\.checklist_execution_schedules s ON s\.id = o\.schedule_id/);
    expect(body).toMatch(/JOIN public\.checklists c ON c\.id = s\.checklist_id/);
  });

  it("não aceita nada além do fuso do próprio schedule para o dia civil", () => {
    expect(body).toMatch(/now\(\) AT TIME ZONE s\.timezone/);
    expect(body).not.toMatch(/current_date/i);
    expect(body).not.toMatch(/CURRENT_TIMESTAMP/i);
  });
});

describe("6B.2C — escopo temporal e lifecycle", () => {
  it("retorna apenas obrigações abertas", () => {
    expect(body).toMatch(/AND o\.completed_at IS NULL/);
  });

  it("limita o look-ahead a um dia no fuso do schedule", () => {
    expect(body).toMatch(
      /AND o\.occurrence_date <= \(\(\(now\(\) AT TIME ZONE s\.timezone\)::date\) \+ 1\)/,
    );
  });

  it("NÃO esconde atrasada antiga (nenhum limite inferior de occurrence_date)", () => {
    expect(body).not.toMatch(/occurrence_date\s*>=/);
    expect(body).not.toMatch(/occurrence_date\s*>/);
    expect(body).not.toMatch(/BETWEEN/i);
    expect(body).not.toMatch(/interval\s+'/i);
  });

  it("não filtra is_active: rotina desativada não invalida obrigação já materializada", () => {
    expect(body).not.toMatch(/is_active/);
  });

  it("ordena por due_at (atrasada mais antiga primeiro) com desempate determinístico", () => {
    expect(body).toMatch(/ORDER BY o\.due_at ASC, o\.id ASC/);
  });
});

describe("6B.2C — contrato retornado", () => {
  it("projeta exatamente os campos exigidos pelo consumidor", () => {
    const returnsBlock = sql.slice(sql.indexOf("RETURNS TABLE"), sql.indexOf("LANGUAGE plpgsql"));
    for (const column of [
      "occurrence_id uuid",
      "schedule_id uuid",
      "checklist_id uuid",
      "checklist_title text",
      "workspace_member_id uuid",
      "occurrence_date date",
      "due_at timestamptz",
      "started_at timestamptz",
      "completed_at timestamptz",
      "response_id uuid",
      "unit_id uuid",
      "shift_id uuid",
    ]) {
      expect(returnsBlock).toContain(column);
    }
  });

  it("unit_id e shift_id vêm do checklist atual (não duplicados na occurrence)", () => {
    expect(body).toMatch(/c\.unit_id/);
    expect(body).toMatch(/c\.shift_id/);
    expect(body).not.toMatch(/o\.unit_id/);
    expect(body).not.toMatch(/o\.shift_id/);
  });

  it("a projeção é somente leitura (RETURN QUERY sobre SELECT)", () => {
    expect(body).toMatch(/RETURN QUERY\s+SELECT/);
    expect(body).not.toMatch(/\bINSERT\b/);
    expect(body).not.toMatch(/\bUPDATE\b/);
    expect(body).not.toMatch(/\bDELETE\b/);
  });
});

describe("6B.2C — superfície de privilégios", () => {
  it("authenticated e service_role executam; anon nunca", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION\s+public\.list_my_checklist_execution_occurrences\(uuid\)\s+FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.list_my_checklist_execution_occurrences\(uuid\)\s+TO authenticated, service_role/,
    );
    expect(sql).not.toMatch(/TO anon/);
  });

  it("todos os erros usam P0001 e não vazam nomes de relação", () => {
    const raises = sql.match(/RAISE EXCEPTION '([a-z_]+)'/g) ?? [];
    expect(raises).toHaveLength(3);
    expect(sql.match(/ERRCODE = 'P0001'/g) ?? []).toHaveLength(3);
    expect(raises.join("\n")).not.toMatch(/relation|column|table|pg_/i);
  });
});
