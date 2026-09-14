/**
 * Execution 6B.3 — filtro global de turno.
 *
 * Prova ESTRUTURALMENTE que a migration:
 *
 *   1. recria as DUAS views analíticas com a dimensão de turno no grão
 *      (organização + unidade + turno + dia), preservando security_invoker;
 *   2. tira o turno da origem CORRETA em cada domínio: task_executions.shift_id
 *      para tarefas e checklists.shift_id para occurrences;
 *   3. mantém o turno no GROUP BY de cada agregação e casa as evidências com
 *      igualdade null-safe (IS NOT DISTINCT FROM), para que execuções sem turno
 *      não percam nem dupliquem evidências;
 *   4. preserva toda a semântica certificada na 6B.2A/6B.2D (reference_date da
 *      occurrence, sem reagrupar por due_at, categorias de atraso separadas);
 *   5. NÃO toca tabelas, colunas, RLS, policies, RPCs, triggers ou cron, e não
 *      executa DML no nível superior;
 *   6. NÃO altera as migrations já aplicadas remotamente.
 *
 * Comentários são removidos antes das asserções para que prosa SQL nunca
 * satisfaça uma verificação.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260914170000_6b3_global_shift_filter.sql";
const COMPLIANCE = "analytics_unit_daily_compliance";
const OCCURRENCES = "analytics_unit_daily_occurrences";

/** Migrations já aplicadas remotamente — intocáveis nesta execução. */
const APPLIED_MIGRATIONS: Record<string, string> = {
  "20260914130000_6b2a_dashboard_drilldown_alignment.sql":
    "2a15ab3c5cc57510cff6aa1e35e1261462aa59e7fbc5412a315b61674edeafbd",
  "20260914140000_6b2b_occurrence_execution_bridge.sql":
    "1d2de20ecf42d4ae51860037c9cedcdaef2011e87b87ec70e89ac08f5c2664bb",
  "20260914150000_6b2c_my_execution_occurrences.sql":
    "6d752914c6086b539c97a042292121bc6f964b7e4e871afb3ac3daf392d5b41f",
  "20260914160000_6b2d_occurrence_dashboard.sql":
    "1d6da7f6abed8162adb38aceffa62843e77f95d75531e16b1544236c2193eb10",
};

const source = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const sql = stripComments(source);

/** Corpo da view, do CREATE até o GRANT/drop seguinte. */
function viewBody(view: string): string {
  const start = sql.indexOf(`CREATE VIEW public.${view}`);
  expect(start, `view ${view} não encontrada`).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.search(/GRANT SELECT ON public\./);
  return end === -1 ? rest : rest.slice(0, end);
}

/** Cláusula GROUP BY que fecha um corpo de agregação. */
function groupByClauses(body: string): string[] {
  return Array.from(body.matchAll(/GROUP BY([\s\S]*?)(?=;|\n\s*\)|\nSELECT|\nFROM)/gi)).map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );
}

const complianceBody = viewBody(COMPLIANCE);
const occurrencesBody = viewBody(OCCURRENCES);

describe("6B.3 migration — superfície e privilégios", () => {
  it("recria exatamente as duas views analíticas, sem tocar em mais nada", () => {
    const drops = Array.from(sql.matchAll(/DROP VIEW IF EXISTS public\.(\w+)/g)).map((m) => m[1]);
    expect(drops).toEqual([COMPLIANCE, OCCURRENCES]);
    const creates = Array.from(sql.matchAll(/CREATE VIEW public\.(\w+)/g)).map((m) => m[1]);
    expect(creates).toEqual([COMPLIANCE, OCCURRENCES]);
  });

  it("mantém security_invoker = true nas duas views", () => {
    const invokers = Array.from(
      sql.matchAll(/CREATE VIEW public\.\w+\s*WITH \(security_invoker = true\) AS/g),
    );
    expect(invokers).toHaveLength(2);
  });

  it("concede SELECT somente para authenticated e service_role (anon nunca)", () => {
    for (const view of [COMPLIANCE, OCCURRENCES]) {
      expect(sql).toContain(`GRANT SELECT ON public.${view} TO authenticated;`);
      expect(sql).toContain(`GRANT SELECT ON public.${view} TO service_role;`);
      expect(sql).not.toMatch(new RegExp(`GRANT[^;]*${view}[^;]*\\banon\\b`, "i"));
    }
    expect(sql).not.toMatch(/\bTO anon\b/i);
    expect(sql).not.toMatch(/\bTO PUBLIC\b/i);
  });

  it("não altera tabela, coluna, RLS, policy, função, trigger ou cron", () => {
    expect(sql).not.toMatch(/\bALTER TABLE\b/i);
    expect(sql).not.toMatch(/\bCREATE TABLE\b/i);
    expect(sql).not.toMatch(/\bALTER COLUMN\b/i);
    expect(sql).not.toMatch(/\bCREATE POLICY\b/i);
    expect(sql).not.toMatch(/\bALTER POLICY\b/i);
    expect(sql).not.toMatch(/\bDROP POLICY\b/i);
    expect(sql).not.toMatch(/\bENABLE ROW LEVEL SECURITY\b/i);
    expect(sql).not.toMatch(/\bCREATE (OR REPLACE )?FUNCTION\b/i);
    expect(sql).not.toMatch(/\bCREATE TRIGGER\b/i);
    expect(sql).not.toMatch(/\bcron\./i);
    expect(sql).not.toMatch(/\bCREATE EXTENSION\b/i);
    expect(sql).not.toMatch(/\bCREATE INDEX\b/i);
  });

  it("não executa DML no nível superior", () => {
    expect(sql).not.toMatch(/\bINSERT INTO\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
  });
});

describe("6B.3 migration — turno das TAREFAS", () => {
  it("usa task_executions.shift_id como origem do turno (nunca o checklist)", () => {
    expect(complianceBody).toMatch(/te\.shift_id\b/);
    expect(complianceBody).not.toMatch(/c\.shift_id/);
    expect(complianceBody).not.toMatch(/checklists/);
  });

  it("expõe shift_id/shift_name e resolve o nome pelo LEFT JOIN de shifts", () => {
    expect(complianceBody).toMatch(/te\.shift_id,/);
    expect(complianceBody).toMatch(/sh\.name AS shift_name/);
    expect(complianceBody).toMatch(/LEFT JOIN public\.shifts sh ON sh\.id = te\.shift_id/);
  });

  it("inclui shift_id no GROUP BY das duas agregações (daily e evidências)", () => {
    const groups = groupByClauses(complianceBody);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    for (const g of groups) {
      expect(g).toMatch(/te\.shift_id/);
    }
  });

  it("casa as evidências com igualdade null-safe por turno", () => {
    expect(complianceBody).toMatch(/ev\.shift_id IS NOT DISTINCT FROM d\.shift_id/);
  });
});

describe("6B.3 migration — turno das ROTINAS", () => {
  it("herda o turno do CHECKLIST (nunca da execução)", () => {
    expect(occurrencesBody).toMatch(/c\.shift_id\s+AS shift_id/);
    expect(occurrencesBody).toMatch(/LEFT JOIN public\.shifts sh ON sh\.id = c\.shift_id/);
    expect(occurrencesBody).not.toMatch(/te\.shift_id/);
  });

  it("inclui shift_id/shift_name no GROUP BY", () => {
    const groups = groupByClauses(occurrencesBody);
    expect(groups.length).toBeGreaterThanOrEqual(1);
    for (const g of groups) {
      expect(g).toMatch(/c\.shift_id/);
      expect(g).toMatch(/sh\.name/);
    }
  });

  it("preserva a semântica da 6B.2D (reference_date = occurrence_date, sem due_at::date)", () => {
    expect(occurrencesBody).toMatch(/o\.occurrence_date\s+AS reference_date/);
    expect(occurrencesBody).not.toMatch(/due_at\s*\)::date/);
    expect(occurrencesBody).not.toMatch(/date_trunc\([^)]*due_at/i);
    // Atraso aberto e atraso concluído continuam categorias distintas.
    expect(occurrencesBody).toMatch(/completed_at IS NULL AND o\.due_at < now\(\)/);
    expect(occurrencesBody).toMatch(/completed_at IS NOT NULL AND o\.completed_at > o\.due_at/);
    // Somente checklists com unidade entram na agregação POR unidade.
    expect(occurrencesBody).toMatch(/WHERE c\.unit_id IS NOT NULL/);
  });
});

describe("6B.3 migration — migrations já aplicadas permanecem intactas", () => {
  it.each(Object.entries(APPLIED_MIGRATIONS))("%s mantém o SHA-256 certificado", (file, hash) => {
    const content = readFileSync(resolve(process.cwd(), "supabase/migrations", file));
    expect(createHash("sha256").update(content).digest("hex")).toBe(hash);
  });
});
