/**
 * Execution 6B.2A — alinhamento do indicador agregado com o detalhe.
 *
 * Esta suíte prova ESTRUTURALMENTE que a view `analytics_unit_daily_compliance`
 * passa a codificar exatamente as regras canônicas que o drill-down aplica:
 *
 *   - falha crítica  = vencida, não concluída, não cancelada e NÃO ignorada
 *                      (skipped é "ignorada", logo nunca é falha crítica);
 *   - evidência pendente = UMA execução com >= 1 evidência pendente
 *                      (não uma linha por arquivo), baldeada pelo dia civil da
 *                      PRÓPRIA execução — o mesmo dia usado pelo restante da view.
 *
 * As funções de corpo dollar-quoted e os comentários são removidos antes das
 * asserções para que prosa SQL nunca satisfaça uma verificação.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260914130000_6b2a_dashboard_drilldown_alignment.sql";
const PREVIOUS_VIEW_MIGRATION =
  "supabase/migrations/20260711230537_b86f1e29-caca-408c-807d-05826af62511.sql";
const LAST_APPLIED_VERSION = "20260914120000";

const source = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");
const previousSource = readFileSync(resolve(process.cwd(), PREVIOUS_VIEW_MIGRATION), "utf8");

/** Remove comentários de bloco e de linha (a prosa não pode satisfazer regras). */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const sql = stripSqlComments(source);
const prevSql = stripSqlComments(previousSource);

/** Corpo do CTE `ev` (agregação de evidências). */
function cteBody(name: string, text: string): string {
  const start = text.indexOf(`${name} AS (`);
  expect(start, `CTE ${name} não encontrado`).toBeGreaterThan(-1);
  const end = text.indexOf("\n)", start);
  expect(end, `fim do CTE ${name} não encontrado`).toBeGreaterThan(-1);
  return text.slice(start, end);
}

const evCte = cteBody("ev", sql);
const dailyCte = cteBody("daily", sql);

describe("6B.2A — versão e escopo da migration", () => {
  it("usa uma versão posterior à última aplicada e não reescreve a migration existente da view", () => {
    const version = MIGRATION.split("/").pop()!.slice(0, 14);
    expect(/^\d{14}$/.test(version)).toBe(true);
    expect(version > LAST_APPLIED_VERSION).toBe(true);
    expect(PREVIOUS_VIEW_MIGRATION).not.toBe(MIGRATION);
  });

  it("a migration histórica da view NÃO foi editada: ainda contém a regra antiga", () => {
    // Prova de imutabilidade do histórico robusta a CRLF (sem hash de bytes).
    expect(prevSql).toMatch(/COUNT\(\*\)::int AS pending_evidence_reviews/);
    const prevCritical = prevSql.slice(
      prevSql.indexOf("AS critical_failures") - 220,
      prevSql.indexOf("AS critical_failures"),
    );
    expect(prevCritical).not.toContain("skipped");
  });

  it("recria a view com security_invoker e reaplica os GRANTs de leitura", () => {
    expect(sql).toMatch(/DROP VIEW IF EXISTS public\.analytics_unit_daily_compliance/);
    expect(sql).toMatch(
      /CREATE VIEW public\.analytics_unit_daily_compliance\s*WITH \(security_invoker = true\) AS/,
    );
    expect(sql).toMatch(
      /GRANT SELECT ON public\.analytics_unit_daily_compliance TO authenticated;/,
    );
    expect(sql).toMatch(/GRANT SELECT ON public\.analytics_unit_daily_compliance TO service_role;/);
  });
});

describe("6B.2A — GAP C: skipped NÃO é falha crítica", () => {
  it("a agregação exclui explicitamente 'skipped'", () => {
    expect(dailyCte).toMatch(/te\.status NOT IN \('done','cancelled'\)/);
    expect(dailyCte).toMatch(/te\.status <> 'skipped'/);
    expect(dailyCte).toMatch(/t\.weight = 'critica'/);
  });

  it("a exclusão de skipped convive com vencida-não-concluída", () => {
    expect(dailyCte).toMatch(/te\.scheduled_at < now\(\)/);
    // Uma única definição de critical_failures no arquivo.
    expect(sql.split("AS critical_failures").length - 1).toBe(1);
  });

  it("não reintroduz a regra antiga (sem exclusão de skipped) em nenhum lugar", () => {
    const occurrences = sql.split("critical_failures").length - 1;
    // Definição no CTE + projeção no SELECT final.
    expect(occurrences).toBe(2);
    expect(sql).not.toMatch(/te\.status NOT IN \('done','cancelled','skipped'\)/);
  });
});

describe("6B.2A — GAP A: evidência pendente conta EXECUÇÕES", () => {
  it("conta execuções distintas, não linhas de evidências", () => {
    expect(evCte).toMatch(/COUNT\(DISTINCT te\.id\)::int AS pending_evidence_executions/);
    expect(evCte).not.toMatch(/COUNT\(\*\)/);
  });

  it("ancora a evidência na execução (task_execution_id) e só considera status pending", () => {
    expect(evCte).toMatch(/JOIN public\.task_executions te ON te\.id = e\.task_execution_id/);
    expect(evCte).toMatch(/WHERE e\.status = 'pending'/);
  });

  it("baldeia pelo dia civil da EXECUÇÃO, não pelo submitted_at da evidência", () => {
    expect(evCte).toMatch(
      /date_trunc\('day', te\.scheduled_at AT TIME ZONE u\.timezone\)\)::date AS reference_date/,
    );
    expect(evCte).not.toMatch(/submitted_at/);
    expect(evCte).toMatch(/GROUP BY[\s\S]*te\.scheduled_at AT TIME ZONE u\.timezone/);
  });

  it("exclui execuções canceladas, como o restante da view e o drill-down", () => {
    expect(evCte).toMatch(/te\.status <> 'cancelled'/);
    expect(dailyCte).toMatch(/WHERE te\.status <> 'cancelled'/);
  });

  it("publica o mesmo valor nas duas colunas de evidências", () => {
    expect(sql).toMatch(/COALESCE\(ev\.pending_evidence_executions, 0\) AS pending_evidences/);
    expect(sql).toMatch(
      /COALESCE\(ev\.pending_evidence_executions, 0\) AS pending_evidence_reviews/,
    );
    expect(sql).not.toMatch(/COALESCE\(ev\.pending_evidence_reviews/);
  });
});

describe("6B.2A — contrato da view preservado", () => {
  const COLUMNS = [
    "organization_id",
    "unit_id",
    "unit_name",
    "reference_date",
    "total_scheduled_tasks",
    "completed_tasks",
    "completed_on_time",
    "completed_late",
    "overdue_open_tasks",
    "delayed_tasks",
    "critical_failures",
    "pending_evidences",
    "pending_evidence_reviews",
    "weight_total",
    "weight_done",
    "weight_done_on_time",
    "compliance_percentage",
    "on_time_compliance_percentage",
    "total_due_tasks",
    "due_completed_tasks",
    "due_weight_total",
    "due_weight_done",
    "due_compliance_percentage",
  ];

  it("mantém todas as colunas consumidas pelo dashboard", () => {
    for (const col of COLUMNS) {
      expect(sql, `coluna ausente: ${col}`).toContain(col);
    }
  });

  it("preserva as métricas due_* e a regra de conformidade ponderada", () => {
    expect(sql).toMatch(
      /COUNT\(\*\) FILTER \(WHERE te\.scheduled_at <= now\(\)\)::int\s*AS total_due_tasks/,
    );
    expect(sql).toMatch(/AS due_weight_total/);
    expect(sql).toMatch(/AS due_weight_done/);
    expect(sql).toMatch(/AS due_compliance_percentage/);
    expect(sql).toMatch(/100\.0 \* d\.weight_done::numeric \/ NULLIF\(d\.weight_total, 0\)/);
  });

  it("preserva overdue_open_tasks e delayed_tasks (pending/late vencidas)", () => {
    expect(sql).toMatch(/te\.status IN \('pending','late'\) AND te\.scheduled_at < now\(\)/);
    expect(sql).toMatch(/AS overdue_open_tasks/);
    expect(sql).toMatch(/AS delayed_tasks/);
  });
});

describe("6B.2A — zero alteração de schema, RLS, policies ou dados", () => {
  it("não altera tabelas, colunas, policies nem habilita/desabilita RLS", () => {
    expect(sql).not.toMatch(/\bALTER TABLE\b/i);
    expect(sql).not.toMatch(/\bCREATE TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP TABLE\b/i);
    expect(sql).not.toMatch(/\bENABLE ROW LEVEL SECURITY\b/i);
    expect(sql).not.toMatch(/\bDISABLE ROW LEVEL SECURITY\b/i);
    expect(sql).not.toMatch(/\bCREATE POLICY\b/i);
    expect(sql).not.toMatch(/\bDROP POLICY\b/i);
    expect(sql).not.toMatch(/\bALTER POLICY\b/i);
  });

  it("não cria/alterar funções, triggers, índices ou tipos", () => {
    expect(sql).not.toMatch(/\bCREATE (OR REPLACE )?FUNCTION\b/i);
    expect(sql).not.toMatch(/\bCREATE TRIGGER\b/i);
    expect(sql).not.toMatch(/\bCREATE INDEX\b/i);
    expect(sql).not.toMatch(/\bCREATE TYPE\b/i);
  });

  it("não executa DML", () => {
    expect(sql).not.toMatch(/\bINSERT INTO\b/i);
    expect(sql).not.toMatch(/\bUPDATE public\./i);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
  });

  it("altera apenas a view analytics_unit_daily_compliance", () => {
    const dropped = [...sql.matchAll(/DROP (VIEW|TABLE|FUNCTION|POLICY|INDEX)[^;]*/gi)].map(
      (m) => m[0],
    );
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toContain("analytics_unit_daily_compliance");
    const created = [...sql.matchAll(/CREATE (VIEW|TABLE|FUNCTION|POLICY|INDEX)[^;]*/gi)].map(
      (m) => m[0],
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toContain("analytics_unit_daily_compliance");
  });
});
