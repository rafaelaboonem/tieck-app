/**
 * Execution 6B.2D — superfície de rotinas no dashboard operacional.
 *
 * Prova ESTRUTURALMENTE que a migration:
 *
 *   1. cria uma view PARALELA (analytics_unit_daily_occurrences) que agrega
 *      occurrences por workspace + unidade + occurrence_date, sem nunca
 *      reagrupar pelo dia UTC de due_at;
 *   2. codifica as métricas canônicas do lifecycle 5E, com as duas identidades
 *      (total e completed) expressas em SQL;
 *   3. distingue "aberta em atraso" de "concluída com atraso";
 *   4. expõe a leitura detalhada do gestor por RPC escopada, com autorização
 *      resolvida dentro do banco pela regra canônica do projeto;
 *   5. NÃO toca task_executions, tabelas, RLS, policies, triggers, RPCs
 *      existentes, nem faz DML no nível superior;
 *   6. NÃO altera as migrations já aplicadas (14130000/14140000/14150000).
 *
 * Comentários e corpos dollar-quoted são removidos antes das asserções para que
 * prosa SQL nunca satisfaça uma verificação.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260914160000_6b2d_occurrence_dashboard.sql";
const MIGRATIONS_DIR = "supabase/migrations";

const VIEW = "analytics_unit_daily_occurrences";
const RPC = "list_workspace_execution_occurrences";

/** Migrations já aplicadas remotamente — intocáveis nesta execução. */
const APPLIED_MIGRATIONS: Record<string, string> = {
  "20260914130000_6b2a_dashboard_drilldown_alignment.sql":
    "2a15ab3c5cc57510cff6aa1e35e1261462aa59e7fbc5412a315b61674edeafbd",
  "20260914140000_6b2b_occurrence_execution_bridge.sql":
    "1d2de20ecf42d4ae51860037c9cedcdaef2011e87b87ec70e89ac08f5c2664bb",
  "20260914150000_6b2c_my_execution_occurrences.sql":
    "6d752914c6086b539c97a042292121bc6f964b7e4e871afb3ac3daf392d5b41f",
};

const source = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

/** Remove comentários de linha/bloco e corpos dollar-quoted. */
function stripSqlNoise(sql: string): string {
  return sql
    .replace(/\$[a-z_]*\$[\s\S]*?\$[a-z_]*\$/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

const sql = stripSqlNoise(source);

/** Corpo da função/RPC (dentro do dollar-quote). */
function functionBody(name: string): string {
  const signature = source.indexOf(`FUNCTION public.${name}`);
  expect(signature, `função ${name} não encontrada`).toBeGreaterThan(-1);
  const asIdx = source.indexOf("AS $", signature);
  const open = source.indexOf("$", asIdx);
  const tagEnd = source.indexOf("$", open + 1);
  const tag = source.slice(open, tagEnd + 1);
  const bodyStart = tagEnd + 1;
  const bodyEnd = source.indexOf(tag, bodyStart);
  return source.slice(bodyStart, bodyEnd);
}

const viewSql = sql.slice(
  sql.indexOf(`CREATE VIEW public.${VIEW}`),
  sql.indexOf(`CREATE OR REPLACE FUNCTION public.${RPC}`),
);
const rpcSql = sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION public.${RPC}`));
const rpcBody = functionBody(RPC);

describe("6B.2D migration — arquivo e escopo", () => {
  it("usa o próximo timestamp monotônico e é a definidora canônica dos objetos", () => {
    expect(MIGRATION).toContain("20260914160000");

    const files = readdirSync(resolve(process.cwd(), MIGRATIONS_DIR)).filter((f) =>
      f.endsWith(".sql"),
    );
    expect(files).toContain("20260914160000_6b2d_occurrence_dashboard.sql");

    // Próximo timestamp monotônico depois de 14150000 (5E.2D.1).
    const sameDay = files
      .map((f) => f.slice(0, 14))
      .filter((v) => v.startsWith("20260914"))
      .sort();
    expect(sameDay[sameDay.indexOf("20260914150000") + 1]).toBe("20260914160000");

    // A 6B.3 (14170000) recria a VIEW para adicionar a dimensão de turno — ela é
    // posterior e intencional. A RPC continua sendo definida SOMENTE aqui, e
    // nenhuma migration anterior a esta define os objetos.
    const viewDefiners = files.filter((f) =>
      readFileSync(resolve(process.cwd(), MIGRATIONS_DIR, f), "utf8").includes(
        `CREATE VIEW public.${VIEW}`,
      ),
    );
    expect(viewDefiners).toEqual([
      "20260914160000_6b2d_occurrence_dashboard.sql",
      "20260914170000_6b3_global_shift_filter.sql",
    ]);
    const rpcDefiners = files.filter((f) =>
      readFileSync(resolve(process.cwd(), MIGRATIONS_DIR, f), "utf8").includes(
        `FUNCTION public.${RPC}`,
      ),
    );
    expect(rpcDefiners).toEqual(["20260914160000_6b2d_occurrence_dashboard.sql"]);
  });

  it("não altera nenhuma migration já aplicada", () => {
    for (const [file, expected] of Object.entries(APPLIED_MIGRATIONS)) {
      const bytes = readFileSync(resolve(process.cwd(), MIGRATIONS_DIR, file));
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(digest, `${file} foi modificada`).toBe(expected);
    }
  });

  it("não altera tabela, RLS, policy, trigger, dado ou cron", () => {
    const ddl = sql.match(
      /\b(CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|POLICY|TRIGGER|INDEX|SCHEMA|TYPE|SEQUENCE)|ALTER\s+(?:TABLE|POLICY)|DROP\s+(?:TABLE|POLICY|TRIGGER|INDEX|FUNCTION)|ROW\s+LEVEL\s+SECURITY|ENABLE\s+RLS|DISABLE\s+RLS|pg_cron|INSERT\s+INTO|DELETE\s+FROM|TRUNCATE)\b/gi,
    );
    expect(ddl ?? []).toEqual([]);
  });

  it("declara apenas a view, a RPC e os grants correspondentes", () => {
    const statements = sql
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^(CREATE|DROP|ALTER|GRANT|REVOKE)\b/i.test(l));
    expect(statements.filter((l) => /^CREATE VIEW/i.test(l))).toHaveLength(1);
    expect(statements.filter((l) => /^CREATE OR REPLACE FUNCTION/i.test(l))).toHaveLength(1);
    expect(statements.filter((l) => /^DROP VIEW IF EXISTS/i.test(l))).toHaveLength(1);
    expect(statements.filter((l) => /^GRANT SELECT/i.test(l))).toHaveLength(2);
    expect(statements.filter((l) => /^(GRANT EXECUTE|REVOKE ALL)/i.test(l))).toHaveLength(2);
  });
});

describe("6B.2D view — grão, origem e segurança", () => {
  it("cria a view com security_invoker = true", () => {
    expect(viewSql).toMatch(
      new RegExp(`CREATE VIEW public\\.${VIEW}\\s+WITH \\(security_invoker = true\\) AS`),
    );
  });

  it("deriva organization_id do workspace do CHECKLIST", () => {
    expect(viewSql).toMatch(/c\.workspace_id\s+AS organization_id/);
  });

  it("usa a cadeia occurrence -> schedule -> checklist -> units", () => {
    expect(viewSql).toMatch(
      /FROM public\.checklist_execution_occurrences o\s+JOIN public\.checklist_execution_schedules s ON s\.id = o\.schedule_id\s+JOIN public\.checklists c ON c\.id = s\.checklist_id\s+JOIN public\.units u ON u\.id = c\.unit_id/,
    );
  });

  it("agrega por workspace + unidade + occurrence_date (dia civil da obrigação)", () => {
    expect(viewSql).toMatch(/GROUP BY c\.workspace_id, c\.unit_id, u\.name, o\.occurrence_date/);
    expect(viewSql).toMatch(/o\.occurrence_date\s+AS reference_date/);
  });

  it("NUNCA reagrupa pelo dia UTC de due_at", () => {
    // due_at::date e (due_at)::date caem os dois: o dia civil não é derivado do
    // instante do vencimento em UTC.
    expect(viewSql).not.toMatch(/due_at\s*\)?\s*::\s*date/i);
    expect(viewSql).not.toMatch(/date_trunc\s*\([^)]*due_at/i);
    expect(viewSql).not.toMatch(/due_at\s+AT\s+TIME\s+ZONE/i);
    // E a fonte do grão continua sendo a data civil da occurrence.
    expect(viewSql).toMatch(/o\.occurrence_date\s+AS reference_date/);
    expect(viewSql).toMatch(/GROUP BY[^;]*o\.occurrence_date/);
  });

  it("exclui occurrences sem unidade sem inventar um balde fictício", () => {
    expect(viewSql).toMatch(/WHERE c\.unit_id IS NOT NULL/);
    expect(viewSql).not.toMatch(/Sem unidade|sem_unidade/);
  });

  it("concede leitura apenas a authenticated e service_role", () => {
    expect(sql).toMatch(`GRANT SELECT ON public.${VIEW} TO authenticated;`);
    expect(sql).toMatch(`GRANT SELECT ON public.${VIEW} TO service_role;`);
    expect(sql).not.toMatch(`GRANT SELECT ON public.${VIEW} TO anon`);
  });
});

describe("6B.2D view — métricas canônicas do lifecycle", () => {
  /** Expressão do COUNT(*) FILTER que produz a métrica pedida. */
  function metricExpression(column: string): string {
    const idx = viewSql.indexOf(`AS ${column}`);
    expect(idx, `métrica ${column} ausente`).toBeGreaterThan(-1);
    const start = viewSql.lastIndexOf("COUNT(*)", idx);
    expect(start, `métrica ${column} não é um COUNT`).toBeGreaterThan(-1);
    return viewSql.slice(start, idx);
  }

  it("expõe exatamente as sete métricas contratadas", () => {
    for (const column of [
      "total_occurrences",
      "completed_occurrences",
      "completed_on_time",
      "completed_late",
      "overdue_open_occurrences",
      "pending_open_occurrences",
      "due_occurrences",
    ]) {
      expect(viewSql).toMatch(new RegExp(`AS ${column}\\b`));
    }
  });

  it("total conta todas as obrigações do dia", () => {
    expect(metricExpression("total_occurrences")).toMatch(/^COUNT\(\*\)/);
  });

  it("concluída exige completed_at (started_at nunca conclui)", () => {
    const expression = metricExpression("completed_occurrences");
    expect(expression).toMatch(/o\.completed_at IS NOT NULL/);
    expect(expression).not.toMatch(/started_at/);
  });

  it("concluída no prazo e concluída com atraso são comparações distintas com due_at", () => {
    expect(metricExpression("completed_on_time")).toMatch(
      /o\.completed_at IS NOT NULL AND o\.completed_at <= o\.due_at/,
    );
    expect(metricExpression("completed_late")).toMatch(
      /o\.completed_at IS NOT NULL AND o\.completed_at > o\.due_at/,
    );
  });

  it("ABERTA EM ATRASO exige NÃO concluída E vencida", () => {
    expect(metricExpression("overdue_open_occurrences")).toMatch(
      /o\.completed_at IS NULL AND o\.due_at < now\(\)/,
    );
  });

  it("PENDENTE exige NÃO concluída E ainda dentro do prazo", () => {
    expect(metricExpression("pending_open_occurrences")).toMatch(
      /o\.completed_at IS NULL AND o\.due_at >= now\(\)/,
    );
  });

  it("due_occurrences conta o que venceu, concluído ou não", () => {
    const expression = metricExpression("due_occurrences");
    expect(expression).toMatch(/o\.due_at <= now\(\)/);
    expect(expression).not.toMatch(/completed_at/);
  });

  it("as duas identidades canônicas são exaustivas e mutuamente exclusivas", () => {
    // total = completed + overdue_open + pending_open
    expect(metricExpression("completed_occurrences")).toMatch(/o\.completed_at IS NOT NULL/);
    expect(metricExpression("overdue_open_occurrences")).toMatch(/o\.completed_at IS NULL/);
    expect(metricExpression("pending_open_occurrences")).toMatch(/o\.completed_at IS NULL/);
    // overdue e pending se dividem em due_at < now() vs due_at >= now()
    expect(metricExpression("overdue_open_occurrences")).toMatch(/due_at < now\(\)/);
    expect(metricExpression("pending_open_occurrences")).toMatch(/due_at >= now\(\)/);
    // completed se divide em <= due_at vs > due_at
    expect(metricExpression("completed_on_time")).toMatch(/completed_at <= o\.due_at/);
    expect(metricExpression("completed_late")).toMatch(/completed_at > o\.due_at/);
  });
});

describe("6B.2D RPC — assinatura e superfície de privilégio", () => {
  it("assina (workspace, unidade, início, fim) e devolve a projeção mínima", () => {
    expect(rpcSql).toMatch(
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${RPC}\\(\\s*p_workspace_id uuid,\\s*p_unit_id uuid,\\s*p_start_date date,\\s*p_end_date date\\s*\\)`,
      ),
    );
    for (const column of [
      "occurrence_id uuid",
      "schedule_id uuid",
      "checklist_id uuid",
      "checklist_title text",
      "occurrence_date date",
      "due_at timestamptz",
      "started_at timestamptz",
      "completed_at timestamptz",
      "response_id uuid",
      "unit_id uuid",
      "shift_id uuid",
      "workspace_member_id uuid",
      "responsible_name text",
    ]) {
      expect(rpcSql).toContain(column);
    }
  });

  it("é SECURITY DEFINER com search_path fixo", () => {
    expect(rpcSql).toMatch(
      /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public, pg_temp/,
    );
  });

  it("exige ator, escopo e período válidos", () => {
    expect(rpcBody).toMatch(/v_user_id := auth\.uid\(\)/);
    expect(rpcBody).toMatch(/IF v_user_id IS NULL THEN/);
    expect(rpcBody).toMatch(/IF p_workspace_id IS NULL OR p_unit_id IS NULL THEN/);
    expect(rpcBody).toMatch(
      /IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN/,
    );
  });

  it("p_workspace_id NÃO é autorização: exige membership ATIVA", () => {
    expect(rpcBody).toMatch(
      /FROM public\.workspace_members wm\s+WHERE wm\.workspace_id = p_workspace_id\s+AND wm\.user_id = v_user_id\s+AND wm\.status = 'active'::public\.member_status/,
    );
    expect(rpcBody).toMatch(/IF v_member_id IS NULL THEN/);
  });

  it("exige papel administrativo pela regra CANÔNICA do projeto", () => {
    expect(rpcBody).toMatch(/public\.has_role_in_workspace\(v_user_id, p_workspace_id, 'editor'\)/);
    // Nenhum conceito novo de autorização inventado nesta fase.
    expect(rpcBody).not.toMatch(/is_workspace_admin|is_org_admin|app_metadata|raw_user_meta_data/);
  });

  it("exige que a UNIDADE pertença ao workspace solicitado", () => {
    expect(rpcBody).toMatch(
      /FROM public\.units u\s+WHERE u\.id = p_unit_id\s+AND u\.workspace_id = p_workspace_id/,
    );
  });

  it("limita as occurrences ao workspace E à unidade pedidos", () => {
    expect(rpcBody).toMatch(/WHERE c\.workspace_id = p_workspace_id\s+AND c\.unit_id = p_unit_id/);
  });

  it("filtra o período por occurrence_date, nunca reconvertendo para UTC", () => {
    expect(rpcBody).toMatch(/o\.occurrence_date >= p_start_date/);
    expect(rpcBody).toMatch(/o\.occurrence_date <= p_end_date/);
    expect(rpcBody).not.toMatch(/AT TIME ZONE|date_trunc|due_at::date/i);
  });

  it("revoga de PUBLIC/anon/authenticated e concede só a authenticated + service_role", () => {
    expect(sql).toMatch(
      new RegExp(
        `REVOKE ALL ON FUNCTION\\s+public\\.${RPC}\\(uuid, uuid, date, date\\)\\s+FROM PUBLIC, anon, authenticated;`,
      ),
    );
    expect(sql).toMatch(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION\\s+public\\.${RPC}\\(uuid, uuid, date, date\\)\\s+TO authenticated, service_role;`,
      ),
    );
    expect(sql).not.toMatch(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION\\s+public\\.${RPC}\\(uuid, uuid, date, date\\)\\s+TO[^;]*anon`,
      ),
    );
  });

  it("não concede nenhum privilégio de tabela", () => {
    expect(sql).not.toMatch(
      /GRANT\s+(SELECT|INSERT|UPDATE|DELETE)\s+ON\s+(TABLE\s+)?public\.(checklist_execution_occurrences|checklist_execution_schedules|checklists)/i,
    );
  });
});

describe("6B.2D — paridade com o lifecycle do cliente", () => {
  it("as quatro categorias da view correspondem 1:1 ao status do cliente", () => {
    const client = readFileSync(resolve(process.cwd(), "src/lib/occurrence-lifecycle.ts"), "utf8");
    // concluída = completed_at; atrasada = aberta e vencida; pendente = aberta no prazo
    expect(client).toMatch(/if \(timestamps\.completedAt\) return "completed"/);
    expect(client).toMatch(/return "overdue"/);
    expect(client).toMatch(/return "pending"/);
    // e o dashboard deriva concluída-no-prazo vs concluída-com-atraso de due_at
    const dashboard = readFileSync(
      resolve(process.cwd(), "src/lib/occurrence-dashboard.ts"),
      "utf8",
    );
    expect(dashboard).toMatch(/completed <= due \? "concluida_no_prazo" : "concluida_com_atraso"/);
  });

  it("o módulo de rotinas NÃO importa nada do domínio de tarefas", () => {
    const dashboard = readFileSync(
      resolve(process.cwd(), "src/lib/occurrence-dashboard.ts"),
      "utf8",
    );
    const imports = dashboard.match(/^import .*$/gm) ?? [];
    expect(imports.join("\n")).toMatch(/occurrence-lifecycle/);
    expect(imports.join("\n")).not.toMatch(/task-execution|operational-status|useUnitCompliance/);

    const hook = readFileSync(
      resolve(process.cwd(), "src/hooks/useUnitOccurrenceMetrics.ts"),
      "utf8",
    );
    expect(hook).toMatch(/analytics_unit_daily_occurrences/);
    expect(hook).not.toMatch(/analytics_unit_daily_compliance|task_executions/);
  });
});
