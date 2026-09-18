/**
 * 6B.2J — EXECUÇÃO POR CHECKLIST: prova ESTRUTURAL da migration.
 *
 * Garante que a RPC agregada `list_workspace_checklist_execution_metrics`:
 *
 *   1. é UM contrato workspace-scoped novo, sem tocar as RPCs da 6B.2D/6B.2E;
 *   2. agrupa por checklist_id (identidade estatística = OCCURRENCE), nunca
 *      por título, sem deduplicar por checklist+dia/schedule/response;
 *   3. recorta o período por `occurrence_date` (data civil) e NUNCA por
 *      due_at::date / AT TIME ZONE / date_trunc;
 *   4. devolve CONTADORES do lifecycle 5E.2A — including as DEVIDAS
 *      (due_at <= now()) — e NUNCA percentual calculado no banco;
 *   5. autoriza DENTRO do banco pela regra canônica (has_role_in_workspace
 *      'admin', o gate do /painel) e valida unidade/turno do MESMO
 *      workspace — fail-closed, SECURITY DEFINER com search_path fixo;
 *   6. não mistura domínios: nada de task_executions, analytics de tarefas,
 *      visitor_id, profiles/settings ou avatares.
 *
 * Comentários e corpos dollar-quoted são removidos antes das asserções para
 * que prosa SQL nunca satisfaça uma verificação.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260918120000_6b2j_checklist_execution_metrics.sql";
const MIGRATIONS_DIR = "supabase/migrations";
const RPC = "list_workspace_checklist_execution_metrics";

const source = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

function stripSqlNoise(sqlText: string): string {
  return sqlText
    .replace(/\$[a-z_]*\$[\s\S]*?\$[a-z_]*\$/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

const sql = stripSqlNoise(source);

/** Corpo da função (dentro do dollar-quote), com comentários de linha removidos. */
function functionBody(name: string): string {
  const signature = source.indexOf(`FUNCTION public.${name}`);
  expect(signature, `função ${name} não encontrada`).toBeGreaterThan(-1);
  const asIdx = source.indexOf("AS $", signature);
  const open = source.indexOf("$", asIdx);
  const tagEnd = source.indexOf("$", open + 1);
  const tag = source.slice(open, tagEnd + 1);
  const bodyStart = tagEnd + 1;
  const bodyEnd = source.indexOf(tag, bodyStart);
  return source.slice(bodyStart, bodyEnd).replace(/--[^\n]*/g, " ");
}

const rpcSql = sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION public.${RPC}`));
const rpcBody = functionBody(RPC);

describe("6B.2J migration — arquivo e escopo", () => {
  it("existe e é posterior a todas as migrations de que depende", () => {
    const files = readdirSync(resolve(process.cwd(), MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const idx = files.indexOf("20260918120000_6b2j_checklist_execution_metrics.sql");
    expect(idx).toBeGreaterThan(-1);
    for (const dependency of [
      "20260815065226_03516198-fe99-4d95-aea9-9969a93f4b80.sql", // has_role_in_workspace (4A)
      "20260910120000_5e2a_execution_schedules_occurrences.sql", // domínio de occurrences
      "20260914160000_6b2d_occurrence_dashboard.sql", // semântica de recorte do painel
    ]) {
      const depIdx = files.indexOf(dependency);
      expect(depIdx, `${dependency} deve existir e preceder a 6B.2J`).toBeGreaterThanOrEqual(0);
      expect(depIdx).toBeLessThan(idx);
    }
  });

  it("não altera tabela, coluna, RLS, policy, trigger, índice, cron ou dado", () => {
    const ddl = sql.match(
      /\b(CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|POLICY|TRIGGER|INDEX|SCHEMA|TYPE|SEQUENCE|VIEW)|ALTER\s+TABLE|DROP\s+(?:TABLE|POLICY|TRIGGER|INDEX|VIEW)|ROW\s+LEVEL\s+SECURITY|ENABLE\s+RLS|DISABLE\s+RLS|pg_cron|INSERT\s+INTO|DELETE\s+FROM|TRUNCATE|UPDATE\s+public)\b/gi,
    );
    expect(ddl ?? []).toEqual([]);
  });

  it("declara apenas a RPC e os grants correspondentes", () => {
    const statements = sql
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^(CREATE|DROP|ALTER|GRANT|REVOKE)\b/i.test(l));
    expect(statements.filter((l) => /^CREATE OR REPLACE FUNCTION/i.test(l))).toHaveLength(1);
    expect(statements.filter((l) => /^(GRANT EXECUTE|REVOKE ALL)/i.test(l))).toHaveLength(2);
    expect(statements.filter((l) => /^GRANT (SELECT|INSERT|UPDATE|DELETE)/i.test(l))).toHaveLength(0);
  });

  it("é um contrato NOVO — não redefine a 6B.2D nem a 6B.2E", () => {
    const files = readdirSync(resolve(process.cwd(), MIGRATIONS_DIR)).filter((f) =>
      f.endsWith(".sql"),
    );
    const definers = (name: string) =>
      files.filter((f) =>
        readFileSync(resolve(process.cwd(), MIGRATIONS_DIR, f), "utf8").includes(
          `FUNCTION public.${name}`,
        ),
      );
    expect(definers(RPC)).toEqual(["20260918120000_6b2j_checklist_execution_metrics.sql"]);
    expect(definers("list_workspace_execution_occurrences")).toEqual([
      "20260914160000_6b2d_occurrence_dashboard.sql",
    ]);
    expect(definers("list_workspace_recent_checklist_executions")).toEqual([
      "20260917120000_6b2e_recent_checklist_executions.sql",
    ]);
  });
});

describe("6B.2J RPC — assinatura e superfície de privilégio", () => {
  it("assina workspace + período + unidade/turno opcionais (sem limite: é agregação)", () => {
    expect(rpcSql).toMatch(
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${RPC}\\(\\s*` +
          `p_workspace_id uuid,\\s*` +
          `p_start_date date,\\s*` +
          `p_end_date date,\\s*` +
          `p_unit_id uuid DEFAULT NULL,\\s*` +
          `p_shift_id uuid DEFAULT NULL\\s*\\)`,
      ),
    );
    // Agregação do período inteiro: NÃO existe p_limit.
    expect(rpcSql).not.toMatch(/p_limit/);
  });

  it("devolve contadores por checklist — e NUNCA percentual", () => {
    for (const column of [
      "checklist_id uuid",
      "checklist_title text",
      "unit_id uuid",
      "unit_name text",
      "shift_id uuid",
      "shift_name text",
      "total_occurrences bigint",
      "completed_occurrences bigint",
      "completed_on_time bigint",
      "completed_late bigint",
      "overdue_open_occurrences bigint",
      "pending_open_occurrences bigint",
      "due_occurrences bigint",
      "due_completed_occurrences bigint",
    ]) {
      expect(rpcSql).toContain(column);
    }
    expect(rpcSql).not.toMatch(/rate|percentage|percent|ROUND\s*\(|\*\s*100\b/i);
  });

  it("é SECURITY DEFINER com search_path fixo", () => {
    expect(rpcSql).toMatch(
      /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public, pg_temp/,
    );
  });

  it("revoga de PUBLIC/anon/authenticated e concede só a authenticated + service_role", () => {
    expect(sql).toMatch(
      new RegExp(
        `REVOKE ALL ON FUNCTION\\s+public\\.${RPC}\\(\\s*uuid, date, date, uuid, uuid\\s*\\)\\s*FROM PUBLIC, anon, authenticated;`,
      ),
    );
    expect(sql).toMatch(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION\\s+public\\.${RPC}\\(\\s*uuid, date, date, uuid, uuid\\s*\\)\\s*TO authenticated, service_role;`,
      ),
    );
    expect(sql).not.toMatch(new RegExp(`${RPC}\\([^)]*\\)\\s*TO[^;]*\\banon\\b`));
  });
});

describe("6B.2J RPC — segurança (fail-closed)", () => {
  it("exige ator, escopo e período válidos", () => {
    expect(rpcBody).toMatch(/v_user_id := auth\.uid\(\)/);
    expect(rpcBody).toMatch(/IF v_user_id IS NULL THEN/);
    expect(rpcBody).toMatch(/IF p_workspace_id IS NULL THEN/);
    expect(rpcBody).toMatch(
      /IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN/,
    );
  });

  it("exige o gate do PRÓPRIO /painel pela regra canônica (owner|admin)", () => {
    expect(rpcBody).toMatch(
      /public\.has_role_in_workspace\(v_user_id, p_workspace_id, 'admin'\)/,
    );
    // Nenhum conceito novo de autorização, e nada de confiar no workspace
    // enviado pelo browser.
    expect(rpcBody).not.toMatch(/is_workspace_admin|is_org_admin|app_metadata|raw_user_meta_data/);
  });

  it("exige que unidade e turno pertençam ao workspace pedido", () => {
    expect(rpcBody).toMatch(
      /FROM public\.units u\s+WHERE u\.id = p_unit_id\s+AND u\.workspace_id = p_workspace_id/,
    );
    expect(rpcBody).toMatch(
      /FROM public\.shifts sh\s+WHERE sh\.id = p_shift_id\s+AND sh\.workspace_id = p_workspace_id/,
    );
    expect(rpcBody).toMatch(/checklist_metrics_unit_forbidden/);
    expect(rpcBody).toMatch(/checklist_metrics_shift_forbidden/);
  });
});

describe("6B.2J RPC — cadeia, recorte e agrupamento", () => {
  it("usa a cadeia occurrence -> schedule -> checklist", () => {
    expect(rpcBody).toMatch(
      /FROM public\.checklist_execution_occurrences o\s+JOIN public\.checklist_execution_schedules s ON s\.id = o\.schedule_id\s+JOIN public\.checklists c ON c\.id = s\.checklist_id/,
    );
  });

  it("filtra o período por occurrence_date, nunca reconvertendo para UTC", () => {
    expect(rpcBody).toMatch(/o\.occurrence_date >= p_start_date/);
    expect(rpcBody).toMatch(/o\.occurrence_date <= p_end_date/);
    expect(rpcBody).not.toMatch(/AT TIME ZONE|date_trunc|due_at::date/i);
  });

  it("aplica unidade e turno apenas quando informados", () => {
    expect(rpcBody).toMatch(/\(p_unit_id IS NULL OR c\.unit_id = p_unit_id\)/);
    expect(rpcBody).toMatch(/\(p_shift_id IS NULL OR c\.shift_id = p_shift_id\)/);
  });

  it("agrupa por checklist_id (identidade), não por título — e não deduplica", () => {
    expect(rpcBody).toMatch(/GROUP BY c\.id,/);
    expect(rpcBody).not.toMatch(/DISTINCT ON/i);
    expect(rpcBody).not.toMatch(/GROUP BY c\.title(?!,)/);
  });

  it("ordena por título com desempate determinístico pelo id (sem ranking)", () => {
    expect(rpcBody).toMatch(/ORDER BY c\.title, c\.id/);
  });
});

describe("6B.2J RPC — contadores do lifecycle e das devidas", () => {
  it("total é COUNT(*) puro — toda occurrence do recorte entra uma única vez", () => {
    expect(rpcBody).toMatch(/COUNT\(\*\),/);
  });

  it("decompõe completed em on_time/late pelo prazo", () => {
    expect(rpcBody).toMatch(
      /COUNT\(\*\) FILTER \(WHERE o\.completed_at IS NOT NULL AND o\.completed_at <= o\.due_at\)/,
    );
    expect(rpcBody).toMatch(
      /COUNT\(\*\) FILTER \(WHERE o\.completed_at IS NOT NULL AND o\.completed_at > o\.due_at\)/,
    );
  });

  it("separa abertas em atraso de ainda pendentes", () => {
    expect(rpcBody).toMatch(/WHERE o\.completed_at IS NULL AND o\.due_at < now\(\)/);
    expect(rpcBody).toMatch(/WHERE o\.completed_at IS NULL AND o\.due_at >= now\(\)/);
  });

  it("devidas usam due_at <= now() — ocorrência futura nunca entra no denominador", () => {
    expect(rpcBody).toMatch(/COUNT\(\*\) FILTER \(WHERE o\.due_at <= now\(\)\)/);
    expect(rpcBody).toMatch(
      /COUNT\(\*\) FILTER \(WHERE o\.due_at <= now\(\) AND o\.completed_at IS NOT NULL\)/,
    );
    // São exatamente os SETE contadores com FILTER (total é COUNT(*) puro).
    expect(rpcBody.match(/COUNT\(\*\) FILTER/g)).toHaveLength(7);
  });

  it("traz abertas também: NÃO herda o filtro 'só concluídas' da 6B.2E", () => {
    expect(rpcBody).not.toMatch(/response_id/);
    expect(rpcBody).not.toMatch(/AND o\.completed_at IS NOT NULL\s+AND o\.response_id/);
  });
});

describe("6B.2J — fronteiras de domínio", () => {
  it("não mistura com o domínio de TAREFAS nem com respostas avulsas", () => {
    expect(sql).not.toMatch(/task_executions|analytics_unit_daily/);
    expect(sql).not.toMatch(/visitor_id/);
  });

  it("não devolve identidade pessoal, settings ou avatar (contrato é estatístico)", () => {
    expect(rpcBody).not.toMatch(/profiles|avatar|settings|workspace_members/);
  });
});

describe("6B.2J — toda coluna referenciada existe no schema gerado", () => {
  const TYPES_SRC = readFileSync(
    resolve(process.cwd(), "src/integrations/supabase/types.ts"),
    "utf8",
  );

  /** Colunas de `public.<table>` segundo os tipos gerados (bloco Row). */
  function generatedColumns(table: string): string[] {
    const marker = `      ${table}: {`;
    const start = TYPES_SRC.indexOf(marker);
    if (start < 0) return [];
    const rowStart = TYPES_SRC.indexOf("Row: {", start);
    const rowEnd = TYPES_SRC.indexOf("\n        }", rowStart);
    return TYPES_SRC.slice(rowStart, rowEnd)
      .split("\n")
      .map((line) => line.trim().split(":")[0]?.trim() ?? "")
      .filter((name) => /^[a-z_][a-z0-9_]*$/.test(name));
  }

  /** alias -> tabela, a partir de FROM/JOIN public.<tabela> <alias>. */
  function tableAliases(body: string): Record<string, string> {
    const map: Record<string, string> = {};
    const re = /(?:FROM|JOIN)\s+public\.([a-z_]+)\s+(?:AS\s+)?([a-z_]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(body)) !== null) {
      map[match[2]] = match[1];
    }
    return map;
  }

  /** Colunas qualificadas usadas (alias.coluna), ignorando o resto. */
  function qualifiedColumns(body: string, aliases: Record<string, string>): string[] {
    const found: string[] = [];
    const re = /\b([a-z_]+)\.([a-z_]+)\b/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(body)) !== null) {
      if (aliases[match[1]]) found.push(`${match[1]}.${match[2]}`);
    }
    return [...new Set(found)];
  }

  const aliases = tableAliases(rpcBody);

  it("mapeia os aliases para as tabelas certas", () => {
    expect(aliases).toMatchObject({
      o: "checklist_execution_occurrences",
      s: "checklist_execution_schedules",
      c: "checklists",
      u: "units",
      sh: "shifts",
    });
  });

  it("todas as colunas qualificadas existem no schema gerado (tabelas cobertas)", () => {
    const wrong: string[] = [];
    const covered = new Set<string>();
    for (const reference of qualifiedColumns(rpcBody, aliases)) {
      const [alias, column] = reference.split(".");
      const table = aliases[alias];
      const columns = generatedColumns(table);
      // Tabelas novas da 5E não estão em types.ts (contrato local estreito) —
      // verificadas no bloco seguinte.
      if (columns.length === 0) continue;
      covered.add(table);
      if (!columns.includes(column)) wrong.push(`${reference} (${table})`);
    }
    expect(wrong).toEqual([]);
    expect([...covered].sort()).toEqual(["checklists", "shifts", "units"]);
  });

  it("as colunas das tabelas de occurrence batem com o contrato local canônico", () => {
    const dashboard = readFileSync(resolve(process.cwd(), "src/lib/occurrence-dashboard.ts"), "utf8");
    const occurrenceContract = dashboard.slice(
      dashboard.indexOf("export type WorkspaceExecutionOccurrenceRow"),
      dashboard.indexOf("/**\n * Local, narrow database contract"),
    );
    for (const column of ["schedule_id", "checklist_id", "occurrence_date", "due_at", "completed_at"]) {
      expect(occurrenceContract).toContain(column);
    }
    for (const reference of qualifiedColumns(rpcBody, aliases)) {
      const [alias, column] = reference.split(".");
      const table = aliases[alias];
      if (table === "checklist_execution_occurrences") {
        expect(["schedule_id", "occurrence_date", "due_at", "completed_at"]).toContain(column);
      }
      if (table === "checklist_execution_schedules") {
        expect(["id", "checklist_id"]).toContain(column);
      }
    }
  });

  it("o verificador realmente pega uma coluna inexistente (controle negativo)", () => {
    const broken = "SELECT wm.email FROM public.workspace_members wm";
    const brokenAliases = tableAliases(broken);
    const references = qualifiedColumns(broken, brokenAliases);
    expect(references).toContain("wm.email");
    const columns = generatedColumns(brokenAliases["wm"]);
    expect(columns).not.toContain("email");
    expect(columns).toContain("email_normalized");
  });
});
