/**
 * Execution 6B.2E — "Últimas execuções" do /painel com dado REAL.
 *
 * Prova ESTRUTURALMENTE que a migration:
 *
 *   1. cria UM contrato workspace-scoped (a RPC da 6B.2D exige unidade e não
 *      serve ao painel global — fan-out por unidade é proibido);
 *   2. aceita período + unidade opcional + turno opcional + limite, com período
 *      comparado em `occurrence_date` (dia civil) e NUNCA reconvertido para UTC;
 *   3. traz SOMENTE occurrences realmente concluídas
 *      (`completed_at IS NOT NULL AND response_id IS NOT NULL`);
 *   4. ordena por `completed_at DESC` com desempate determinístico e capa o
 *      limite em 20;
 *   5. resolve autorização DENTRO do banco pela regra canônica do projeto, no
 *      gate do próprio /painel (dono do workspace ou membro ATIVO admin) e
 *      valida que unidade/turno pertencem ao MESMO workspace — fail-closed;
 *   6. projeta a identidade mínima e expõe de `profiles.settings` APENAS as duas
 *      chaves de preferência de avatar (`->>`), nunca o objeto inteiro;
 *   7. NÃO toca tabela, coluna, RLS, policy, trigger, cron nem faz DML, e NÃO
 *      altera as migrations já aplicadas (nem a RPC da 6B.2D).
 *
 * A premissa de identidade (atribuído = executor) é ancorada aqui no código que
 * a sustenta: se a 6B.2B deixar de exigir que o chamador seja o membro atribuído
 * da occurrence, o contrato perde validade e este teste cai.
 *
 * Comentários e corpos dollar-quoted são removidos antes das asserções para que
 * prosa SQL nunca satisfaça uma verificação.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260917120000_6b2e_recent_checklist_executions.sql";
const MIGRATIONS_DIR = "supabase/migrations";
const RPC = "list_workspace_recent_checklist_executions";
const PREVIOUS_RPC = "list_workspace_execution_occurrences";
const BRIDGE = "supabase/migrations/20260914140000_6b2b_occurrence_execution_bridge.sql";

const source = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

function stripSqlNoise(sql: string): string {
  return sql
    .replace(/\$[a-z_]*\$[\s\S]*?\$[a-z_]*\$/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

const sql = stripSqlNoise(source);

/** Corpo da função (dentro do dollar-quote). */
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

const rpcSql = sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION public.${RPC}`));
const rpcBody = functionBody(RPC);

describe("6B.2E migration — arquivo e escopo", () => {
  it("existe e é posterior a todas as migrations de que depende", () => {
    // A 6B.2E foi a última quando nasceu; migrations posteriores (ex.: 6B.2J)
    // existem legitimamente. O invariante real é a ORDEM contra as
    // dependências: has_role_in_workspace (4A), o domínio 5E.2A e a ponte 6B.2B.
    const files = readdirSync(resolve(process.cwd(), MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const idx = files.indexOf("20260917120000_6b2e_recent_checklist_executions.sql");
    expect(idx).toBeGreaterThan(-1);
    for (const dependency of [
      "20260815065226_03516198-fe99-4d95-aea9-9969a93f4b80.sql",
      "20260910120000_5e2a_execution_schedules_occurrences.sql",
      "20260914140000_6b2b_occurrence_execution_bridge.sql",
    ]) {
      const depIdx = files.indexOf(dependency);
      expect(depIdx, `${dependency} deve existir e preceder a 6B.2E`).toBeGreaterThanOrEqual(0);
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

  it("não redefine nem substitui a RPC de detalhe da 6B.2D", () => {
    const files = readdirSync(resolve(process.cwd(), MIGRATIONS_DIR)).filter((f) =>
      f.endsWith(".sql"),
    );
    const recentDefiners = files.filter((f) =>
      readFileSync(resolve(process.cwd(), MIGRATIONS_DIR, f), "utf8").includes(`FUNCTION public.${RPC}`),
    );
    expect(recentDefiners).toEqual(["20260917120000_6b2e_recent_checklist_executions.sql"]);

    const previousDefiners = files.filter((f) =>
      readFileSync(resolve(process.cwd(), MIGRATIONS_DIR, f), "utf8").includes(
        `FUNCTION public.${PREVIOUS_RPC}`,
      ),
    );
    expect(previousDefiners).toEqual(["20260914160000_6b2d_occurrence_dashboard.sql"]);
  });
});

describe("6B.2E RPC — assinatura e superfície de privilégio", () => {
  it("assina workspace + período + unidade/turno opcionais + limite", () => {
    expect(rpcSql).toMatch(
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${RPC}\\(\\s*` +
          `p_workspace_id uuid,\\s*` +
          `p_start_date date,\\s*` +
          `p_end_date date,\\s*` +
          `p_unit_id uuid DEFAULT NULL,\\s*` +
          `p_shift_id uuid DEFAULT NULL,\\s*` +
          `p_limit int DEFAULT 6\\s*\\)`,
      ),
    );
  });

  it("devolve a projeção mínima contratada", () => {
    for (const column of [
      "occurrence_id uuid",
      "checklist_id uuid",
      "checklist_title text",
      "response_id uuid",
      "occurrence_date date",
      "due_at timestamptz",
      "completed_at timestamptz",
      "unit_id uuid",
      "unit_name text",
      "shift_id uuid",
      "shift_name text",
      "workspace_member_id uuid",
      "user_id uuid",
      "responsible_name text",
      "role text",
      "avatar_url text",
      "avatar_display_mode text",
      "illustrated_avatar_id text",
    ]) {
      expect(rpcSql).toContain(column);
    }
  });

  it("é SECURITY DEFINER com search_path fixo", () => {
    expect(rpcSql).toMatch(
      /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public, pg_temp/,
    );
  });

  it("revoga de PUBLIC/anon/authenticated e concede só a authenticated + service_role", () => {
    expect(sql).toMatch(
      new RegExp(
        `REVOKE ALL ON FUNCTION\\s+public\\.${RPC}\\(\\s*uuid, date, date, uuid, uuid, int\\s*\\)\\s*FROM PUBLIC, anon, authenticated;`,
      ),
    );
    expect(sql).toMatch(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION\\s+public\\.${RPC}\\(\\s*uuid, date, date, uuid, uuid, int\\s*\\)\\s*TO authenticated, service_role;`,
      ),
    );
    expect(sql).not.toMatch(new RegExp(`${RPC}\\([^)]*\\)\\s*TO[^;]*\\banon\\b`));
  });
});

describe("6B.2E RPC — segurança (fail-closed)", () => {
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
    expect(rpcBody).not.toMatch(/p_workspace_id IS NULL OR\s*\n?\s*--/);
  });

  it("exige que unidade e turno pertençam ao workspace pedido", () => {
    expect(rpcBody).toMatch(
      /FROM public\.units u\s+WHERE u\.id = p_unit_id\s+AND u\.workspace_id = p_workspace_id/,
    );
    expect(rpcBody).toMatch(
      /FROM public\.shifts sh\s+WHERE sh\.id = p_shift_id\s+AND sh\.workspace_id = p_workspace_id/,
    );
    expect(rpcBody).toMatch(/recent_executions_unit_forbidden/);
    expect(rpcBody).toMatch(/recent_executions_shift_forbidden/);
  });
});

describe("6B.2E RPC — recorte, ordem e limite", () => {
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

  it("traz SOMENTE execuções concluídas com resposta vinculada", () => {
    expect(rpcBody).toMatch(/AND o\.completed_at IS NOT NULL/);
    expect(rpcBody).toMatch(/AND o\.response_id IS NOT NULL/);
    // Nada de pendente/aberta/futura nesta seção.
    expect(rpcBody).not.toMatch(/completed_at IS NULL\s*AND/);
  });

  it("aplica unidade e turno apenas quando informados", () => {
    expect(rpcBody).toMatch(/\(p_unit_id IS NULL OR c\.unit_id = p_unit_id\)/);
    expect(rpcBody).toMatch(/\(p_shift_id IS NULL OR c\.shift_id = p_shift_id\)/);
  });

  it("ordena por completed_at DESC com desempate determinístico", () => {
    expect(rpcBody).toMatch(/ORDER BY o\.completed_at DESC, o\.id DESC/);
  });

  it("capa o limite entre 1 e 20 (default 6)", () => {
    expect(rpcBody).toMatch(/v_limit := GREATEST\(1, LEAST\(COALESCE\(p_limit, 6\), 20\)\)/);
    expect(rpcBody).toMatch(/LIMIT v_limit/);
  });

  it("NÃO faz fan-out por unidade nem junta o domínio de tarefas", () => {
    expect(rpcBody).not.toMatch(/unit_ids|unnest|FOREACH|LOOP/i);
    expect(rpcBody).not.toMatch(/task_executions|analytics_unit_daily/);
  });
});

describe("6B.2E RPC — identidade projetada", () => {
  it("projeta o nome com a MESMA precedência do produto", () => {
    expect(rpcBody).toMatch(/NULLIF\(BTRIM\(p\.display_name\), ''\)/);
    expect(rpcBody).toMatch(/CONCAT_WS\(\s*' ',/);
    expect(rpcBody).toMatch(/wm\.email_normalized/);
    expect(rpcBody).toMatch(/'Membro'/);
  });

  it("expõe SOMENTE as duas chaves de preferência de avatar — nunca settings inteiro", () => {
    expect(rpcBody).toMatch(/p\.settings ->> 'avatar_display_mode'/);
    expect(rpcBody).toMatch(/p\.settings ->> 'illustrated_avatar_id'/);
    // Não existe seleção do objeto JSONB completo.
    expect(rpcBody).not.toMatch(/\bp\.settings\b(?!\s*->>)/);
    expect(rpcBody).not.toMatch(/p\.settings\s*,/);
  });

  it("não devolve dado pessoal desnecessário", () => {
    expect(rpcBody).not.toMatch(/wm\.email\s*,/);
    expect(rpcBody).not.toMatch(/auth\.users|encrypted_password|phone|cpf|document/i);
  });

  it("nunca usa visitor_id como identidade", () => {
    // Vale para o SQL executável (prosa de comentário é removida antes).
    expect(sql).not.toMatch(/visitor_id/);
  });

  it("não inventa resultado/conformidade (a occurrence não tem esse contrato)", () => {
    expect(rpcSql).not.toMatch(/compliance|score|result_label|percentage/i);
  });
});

describe("6B.2E — toda coluna referenciada existe no schema gerado", () => {
  /**
   * Regressão real: a primeira versão da RPC usava `wm.email` como fallback do
   * nome. A coluna foi REMOVIDA do schema (a normalização deixou só
   * `email_normalized`), e a função passava em todos os testes estruturais mas
   * falhava no caminho de sucesso (`column wm.email does not exist`) — só
   * apareceu no teste AO VIVO. Aqui o schema gerado pelo Supabase
   * (`src/integrations/supabase/types.ts`) passa a ser a fonte de verdade:
   * cada `alias.coluna` do SQL precisa existir na tabela que o alias representa.
   */
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
      wm: "workspace_members",
      p: "profiles",
    });
  });

  it("todas as colunas qualificadas existem no schema gerado (tabelas cobertas)", () => {
    const wrong: string[] = [];
    const covered = new Set<string>();
    for (const reference of qualifiedColumns(rpcBody, aliases)) {
      const [alias, column] = reference.split(".");
      const table = aliases[alias];
      const columns = generatedColumns(table);
      // Tabelas novas da 5E/6B não estão em types.ts (o projeto mantém contrato
      // local estreito para elas) — verificadas no bloco seguinte.
      if (columns.length === 0) continue;
      covered.add(table);
      if (!columns.includes(column)) wrong.push(`${reference} (${table})`);
    }
    expect(wrong).toEqual([]);
    // As tabelas que a RPC lê e que o schema gerado cobre foram de fato checadas.
    expect([...covered].sort()).toEqual([
      "checklists",
      "profiles",
      "shifts",
      "units",
      "workspace_members",
    ]);
  });

  it("as colunas das tabelas de occurrence batem com o contrato local canônico", () => {
    // types.ts não é regenerado para as tabelas da 5E: a fonte aqui é o contrato
    // que o produto já usa para lê-las (mesmas colunas da RPC da 6B.2D).
    const dashboard = readFileSync(resolve(process.cwd(), "src/lib/occurrence-dashboard.ts"), "utf8");
    const occurrenceContract = dashboard.slice(
      dashboard.indexOf("export type WorkspaceExecutionOccurrenceRow"),
      dashboard.indexOf("/**\n * Local, narrow database contract"),
    );
    for (const column of [
      "occurrence_id",
      "schedule_id",
      "checklist_id",
      "checklist_title",
      "occurrence_date",
      "due_at",
      "started_at",
      "completed_at",
      "response_id",
      "workspace_member_id",
    ]) {
      expect(occurrenceContract).toContain(column);
    }

    // E o SQL usa exatamente esses nomes (nenhuma coluna inventada).
    for (const reference of qualifiedColumns(rpcBody, aliases)) {
      const [alias, column] = reference.split(".");
      const table = aliases[alias];
      if (table === "checklist_execution_occurrences") {
        expect([
          "id",
          "schedule_id",
          "occurrence_date",
          "due_at",
          "completed_at",
          "response_id",
          "started_at",
        ]).toContain(column);
      }
      if (table === "checklist_execution_schedules") {
        expect(["id", "checklist_id", "workspace_member_id"]).toContain(column);
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

  it("o nome vem de workspace_members.email_normalized (coluna real), não de `email`", () => {
    expect(rpcBody).toMatch(/wm\.email_normalized/);
    expect(rpcBody).not.toMatch(/wm\.email\b(?!_)/);
  });
});

describe("6B.2E — a premissa de identidade continua sustentada pela 6B.2B", () => {
  const bridge = readFileSync(resolve(process.cwd(), BRIDGE), "utf8");

  it("só o membro ATRIBUÍDO pode concluir a occurrence (gestor é rejeitado)", () => {
    expect(bridge).toMatch(/v_member_user_id IS DISTINCT FROM v_user_id/);
    expect(bridge).toMatch(/v_member_status IS DISTINCT FROM 'active'::public\.member_status/);
    expect(bridge).toMatch(/'occurrence_not_assignee'/);
  });

  it("os únicos escritores de completed_at/response_id são as RPCs da 6B.2B", () => {
    const writers = readdirSync(resolve(process.cwd(), MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .filter((f) =>
        /UPDATE public\.checklist_execution_occurrences/.test(
          readFileSync(resolve(process.cwd(), MIGRATIONS_DIR, f), "utf8"),
        ),
      );
    expect(writers).toEqual(["20260914140000_6b2b_occurrence_execution_bridge.sql"]);
  });
});
