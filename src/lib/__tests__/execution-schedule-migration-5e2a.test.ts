/**
 * Execution 5E.2A — structural assertions over the migration file (§24).
 * Content-based (no line numbers), CRLF-safe (needles never span EOLs).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const MIGRATION_PATH =
  "supabase/migrations/20260910120000_5e2a_execution_schedules_occurrences.sql";

const migration = readFileSync(resolve(process.cwd(), MIGRATION_PATH), "utf8");

// Statements only — strip SQL line comments so scope guards check real
// statements, not prose (a comment explaining "no cron" must not fail).
const code = migration.replace(/^\s*--.*$/gm, "");

describe("5E.2A migration — tables", () => {
  it("creates checklist_execution_schedules", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.checklist_execution_schedules");
  });

  it("creates checklist_execution_occurrences", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.checklist_execution_occurrences");
  });

  it("schedules carry frequency / timezone / starts_on / ends_on / is_active", () => {
    expect(migration).toContain("frequency text NOT NULL");
    expect(migration).toContain("due_local_time time without time zone NOT NULL");
    expect(migration).toContain("timezone text NOT NULL");
    expect(migration).toContain("starts_on date NOT NULL");
    expect(migration).toContain("ends_on date NULL");
    expect(migration).toContain("is_active boolean NOT NULL DEFAULT true");
  });

  it("occurrences carry occurrence_date / due_at / started_at / completed_at / response_id", () => {
    expect(migration).toContain("occurrence_date date NOT NULL");
    expect(migration).toContain("due_at timestamptz NOT NULL");
    expect(migration).toContain("started_at timestamptz NULL");
    expect(migration).toContain("completed_at timestamptz NULL");
    expect(migration).toContain(
      "response_id uuid NULL REFERENCES public.checklist_responses(id) ON DELETE SET NULL",
    );
    expect(migration).toContain("overdue_notified_at timestamptz NULL");
  });
});

describe("5E.2A migration — identity and integrity", () => {
  it("enforces UNIQUE(schedule_id, occurrence_date)", () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_occurrences_schedule_date",
    );
    expect(migration).toContain(
      "ON public.checklist_execution_occurrences (schedule_id, occurrence_date)",
    );
  });

  it("keeps a response bound to at most one occurrence (UNIQUE(response_id))", () => {
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_occurrences_response",
    );
    expect(migration).toContain(
      "ON public.checklist_execution_occurrences (response_id)",
    );
  });

  it("integrity trigger validates checklist ↔ workspace_member (same workspace)", () => {
    expect(migration).toContain("public.checklist_execution_schedule_integrity");
    expect(migration).toContain("BEFORE INSERT OR UPDATE ON public.checklist_execution_schedules");
    expect(migration).toContain("schedule_checklist_not_found");
    expect(migration).toContain("schedule_member_required");
    expect(migration).toContain("schedule_workspace_mismatch");
    // member must belong to the checklist's real workspace:
    expect(migration).toMatch(/wm\.id = NEW\.workspace_member_id/);
    expect(migration).toMatch(/wm\.workspace_id = v_workspace_id/);
  });

  it("validates timezone via pg_timezone_names (no hardcode, no default)", () => {
    expect(migration).toContain("schedule_timezone_required");
    expect(migration).toContain("schedule_timezone_invalid");
    expect(migration).toMatch(/pg_timezone_names WHERE name = NEW\.timezone/);
    // no hardcoded zone, no DEFAULT on the timezone column
    expect(migration).not.toContain("America/Sao_Paulo");
    expect(migration).not.toMatch(/timezone text NOT NULL DEFAULT/);
  });
});

describe("5E.2A migration — RLS", () => {
  it("enables RLS on both tables", () => {
    expect(migration).toContain(
      "ALTER TABLE public.checklist_execution_schedules ENABLE ROW LEVEL SECURITY",
    );
    expect(migration).toContain(
      "ALTER TABLE public.checklist_execution_occurrences ENABLE ROW LEVEL SECURITY",
    );
  });

  it("authenticated SELECT uses executor membership OR manager access", () => {
    expect(migration).toContain("FOR SELECT TO authenticated");
    expect(migration).toMatch(/wm\.user_id = auth\.uid\(\)/);
    expect(migration).toMatch(/public\.has_role_in_workspace\(auth\.uid\(\), c\.workspace_id, 'editor'\)/);
  });

  it("creates no authenticated write policies (INSERT/UPDATE/DELETE)", () => {
    expect(migration).not.toMatch(
      /CREATE POLICY[\s\S]*?(FOR INSERT|FOR UPDATE|FOR DELETE)/,
    );
    expect(migration).not.toContain("FOR ALL TO authenticated");
  });

  it("anon gets no grants at all", () => {
    expect(migration).toContain(
      "REVOKE ALL ON public.checklist_execution_schedules FROM anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON public.checklist_execution_occurrences FROM anon, authenticated",
    );
    // only SELECT is granted back to authenticated
    expect(migration).toMatch(
      /GRANT SELECT ON public\.checklist_execution_schedules TO authenticated/,
    );
    expect(migration).toMatch(
      /GRANT SELECT ON public\.checklist_execution_occurrences TO authenticated/,
    );
    expect(migration).not.toMatch(
      /GRANT (INSERT|UPDATE|DELETE|ALL) ON public\.checklist_execution_(schedules|occurrences) TO (anon|authenticated)/,
    );
  });

  it("service_role stays fully functional", () => {
    expect(migration).toMatch(
      /GRANT ALL ON public\.checklist_execution_schedules TO service_role/,
    );
    expect(migration).toMatch(
      /GRANT ALL ON public\.checklist_execution_occurrences TO service_role/,
    );
  });
});

describe("5E.2A migration — scope guards", () => {
  it("does not mutate existing data (no UPDATE/DELETE statements at all)", () => {
    expect(code).not.toMatch(/^\s*(UPDATE|DELETE)\s/im);
    expect(code).not.toContain("INSERT INTO public.checklists");
    expect(code).not.toContain("INSERT INTO public.checklist_execution_");
  });

  it("does not alter checklist_assignments or the legacy assignment RPCs", () => {
    expect(code).not.toContain("ALTER TABLE public.checklist_assignments");
    expect(code).not.toContain("update_checklist_assignments");
    expect(code).not.toContain("set_assignment_deadline");
    expect(code).not.toContain("complete_assignment");
  });

  it("creates no cron jobs and no occurrence generation", () => {
    expect(code).not.toContain("cron");
    expect(code).not.toContain("generate_occurrences");
    expect(code).not.toContain("generate");
  });
});

describe("5E.2A migration — updated_at triggers", () => {
  it("reuses the canonical handle_updated_at trigger on both tables", () => {
    expect(migration).toContain(
      "EXECUTE FUNCTION public.handle_updated_at()",
    );
    expect(migration).toContain(
      "BEFORE UPDATE ON public.checklist_execution_schedules",
    );
    expect(migration).toContain(
      "BEFORE UPDATE ON public.checklist_execution_occurrences",
    );
  });
});

// =============================================================
// Execution 5E.2A.1 — block INACTIVE members from schedule access.
// Block-scoped assertions: the integrity function, the schedules
// policy and the occurrences policy are each extracted and validated
// separately (no fragile global occurrence counting).
// =============================================================

/**
 * Extract a single SQL block by its opening line. Dollar-quoted bodies
 * (plpgsql functions, AS $$ … $$;) end at the closing `$$;`; everything
 * else ends at balanced parentheses from the first `(`.
 */
function extractBlock(openingNeedle: string): string {
  const open = migration.indexOf(openingNeedle);
  expect(open).toBeGreaterThan(-1);
  const dollarEnd = migration.indexOf("$$;", open);
  if (dollarEnd > -1 && migration.slice(open, dollarEnd).includes("AS $$")) {
    return migration.slice(open, dollarEnd + 3);
  }
  const bodyStart = migration.indexOf("(", open);
  let depth = 0;
  let end = -1;
  for (let i = bodyStart; i < migration.length; i++) {
    const ch = migration[i];
    if (ch === "(") depth++;
    if (ch === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  expect(end).toBeGreaterThan(-1);
  return migration.slice(open, end + 1);
}

const integrityFn = extractBlock(
  "CREATE OR REPLACE FUNCTION public.checklist_execution_schedule_integrity",
);
const schedulesPolicy = extractBlock(
  'CREATE POLICY "Executors and managers can view schedules"',
);
const occurrencesPolicy = extractBlock(
  'CREATE POLICY "Executors and managers can view occurrences"',
);

describe("5E.2A.1 — inactive members blocked from schedule access", () => {
  it("A) integrity trigger requires an ACTIVE workspace member", () => {
    // member must be looked up within the checklist's real workspace…
    expect(integrityFn).toMatch(/wm\.id = NEW\.workspace_member_id/);
    expect(integrityFn).toMatch(/wm\.workspace_id = v_workspace_id/);
    expect(integrityFn).toMatch(/SELECT wm\.status INTO v_member_status/);
    // …and the status check must FAIL CLOSED…
    expect(integrityFn).toMatch(/v_member_status IS NULL/);
    expect(integrityFn).toContain("schedule_workspace_mismatch");
    expect(integrityFn).toMatch(/v_member_status <> 'active'/);
    expect(integrityFn).toContain("schedule_member_inactive");
  });

  it("B) schedules policy requires the executor member to be active", () => {
    const executorPath = schedulesPolicy.slice(
      0,
      schedulesPolicy.indexOf("OR EXISTS"),
    );
    expect(executorPath).toMatch(
      /wm\.id = checklist_execution_schedules\.workspace_member_id/,
    );
    expect(executorPath).toMatch(/wm\.user_id = auth\.uid\(\)/);
    expect(executorPath).toMatch(/wm\.status = 'active'/);
  });

  it("C) occurrences policy requires the executor member to be active", () => {
    const executorPath = occurrencesPolicy.slice(
      0,
      occurrencesPolicy.indexOf("OR EXISTS"),
    );
    expect(executorPath).toMatch(/JOIN public\.workspace_members wm ON wm\.id = s\.workspace_member_id/);
    expect(executorPath).toMatch(/wm\.user_id = auth\.uid\(\)/);
    expect(executorPath).toMatch(/wm\.status = 'active'/);
  });

  it("D) manager path unchanged: real checklist + has_role_in_workspace editor", () => {
    for (const policy of [schedulesPolicy, occurrencesPolicy]) {
      const managerPath = policy.slice(policy.indexOf("OR EXISTS"));
      // schedules: FROM public.checklists c · occurrences: JOIN public.checklists c
      expect(managerPath).toMatch(/public\.checklists c/);
      expect(managerPath).toMatch(/public\.has_role_in_workspace\(auth\.uid\(\), c\.workspace_id, 'editor'\)/);
      // NOT conditioned on the assignee's current member status:
      expect(managerPath).not.toMatch(/wm\.status = 'active'/);
    }
  });

  it("E) still no authenticated write policies", () => {
    expect(migration).not.toMatch(
      /CREATE POLICY[\s\S]*?(FOR INSERT|FOR UPDATE|FOR DELETE)/,
    );
    expect(migration).not.toContain("FOR ALL TO authenticated");
  });

  it("F) anon still has zero access (revoke-only, SELECT grant to authenticated)", () => {
    expect(migration).toContain(
      "REVOKE ALL ON public.checklist_execution_schedules FROM anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON public.checklist_execution_occurrences FROM anon, authenticated",
    );
  });

  it("G) no application statements — repo file only, nothing pushed to Supabase", () => {
    // A migration file cannot contain the CLI/application entrypoints;
    // guard them for regression if anyone pastes them in.
    expect(code).not.toContain("supabase db push");
    expect(code).not.toContain("migration up");
    expect(code).not.toContain("db reset");
  });

  it("H) FKs untouched by this micro-patch (CASCADE/SET NULL strategy preserved)", () => {
    expect(migration).toContain(
      "checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE",
    );
    expect(migration).toContain(
      "workspace_member_id uuid NOT NULL REFERENCES public.workspace_members(id) ON DELETE CASCADE",
    );
    expect(migration).toContain(
      "schedule_id uuid NOT NULL REFERENCES public.checklist_execution_schedules(id) ON DELETE CASCADE",
    );
    expect(migration).toContain(
      "response_id uuid NULL REFERENCES public.checklist_responses(id) ON DELETE SET NULL",
    );
    // no FK behavior overrides introduced:
    expect(code).not.toContain("ON DELETE RESTRICT");
    expect(code).not.toContain("ON DELETE NO ACTION");
  });
});
