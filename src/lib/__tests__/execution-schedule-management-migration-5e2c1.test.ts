/**
 * Execution 5E.2C.1 — structural assertions over the schedule management
 * RPCs migration. Content-based (no line numbers), CRLF-safe.
 *
 * Dollar-quoted bodies are extracted explicitly ($integrity$,
 * $create_schedule$, $update_schedule$, $deactivate_schedule$) and comments
 * are stripped before scope guards so prose never trips them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { resolve } from "path";

const MIGRATION_PATH =
  "supabase/migrations/20260913120000_5e2c1_schedule_management_rpcs.sql";

const APPLIED: Array<[string, string]> = [
  [
    "supabase/migrations/20260910120000_5e2a_execution_schedules_occurrences.sql",
    "dfb5e133bbc9c42f062727e859d811d5697ac3f11690cf2c3c45c1fd13b3def4",
  ],
  [
    "supabase/migrations/20260911120000_5e2a6_restrict_integrity_function_execute.sql",
    "51a4520c0c8292fab866eb9bc4c64710de9d7bb075ce962549123f5ce03cdd10",
  ],
  [
    "supabase/migrations/20260912120000_5e2b_occurrence_materializer.sql",
    "bdc8cc7b617d35fa9e4304e27cea1feb3330e9506ce9ea3ae03b598b1344089b",
  ],
];

const migration = readFileSync(resolve(process.cwd(), MIGRATION_PATH), "utf8");

function extractBody(delim: string): string {
  const first = migration.indexOf(delim);
  const second = migration.indexOf(delim, first + delim.length);
  return migration.slice(first + delim.length, second);
}

function headBefore(delim: string): string {
  return migration.slice(0, migration.indexOf(delim));
}

// Everything with comments stripped (bodies + top level) for scope guards.
const code = migration.replace(/^\s*--.*$/gm, "");

const integrityBody = extractBody("$integrity$").replace(/^\s*--.*$/gm, "");
const createBody = extractBody("$create_schedule$").replace(/^\s*--.*$/gm, "");
const updateBody = extractBody("$update_schedule$").replace(/^\s*--.*$/gm, "");
const deactivateBody = extractBody("$deactivate_schedule$").replace(
  /^\s*--.*$/gm,
  "",
);

// Top-level statements with the four function bodies replaced by markers.
const topLevelCode = migration
  .replace(/\$integrity\$[\s\S]*?\$integrity\$/, "__B1__")
  .replace(/\$create_schedule\$[\s\S]*?\$create_schedule\$/, "__B2__")
  .replace(/\$update_schedule\$[\s\S]*?\$update_schedule\$/, "__B3__")
  .replace(/\$deactivate_schedule\$[\s\S]*?\$deactivate_schedule\$/, "__B4__")
  .replace(/^\s*--.*$/gm, "");

const topStatements = topLevelCode
  .split(";")
  .map((s) => s.replace(/\s+/g, " ").trim())
  .filter(Boolean);
const fnDefs = topStatements.filter((s) => s.includes("__B"));
const otherStatements = topStatements.filter((s) => !s.includes("__B"));
const revokes = otherStatements.filter((s) => s.startsWith("REVOKE"));
const grants = otherStatements.filter((s) => s.startsWith("GRANT"));

const CREATE_SIG =
  "public.create_checklist_execution_schedule(uuid, uuid, text, smallint[], time without time zone, text, date, date)";
const UPDATE_SIG =
  "public.update_checklist_execution_schedule(uuid, text, smallint[], time without time zone, text, date, date)";
const DEACTIVATE_SIG =
  "public.deactivate_checklist_execution_schedule(uuid)";

describe("5E.2C.1 — RPC signatures and attributes", () => {
  it("defines the three exact signatures", () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.create_checklist_execution_schedule\(\s*p_checklist_id uuid\s*,\s*p_workspace_member_id uuid\s*,\s*p_frequency text\s*,\s*p_weekdays smallint\[\]\s*,\s*p_due_local_time time without time zone\s*,\s*p_timezone text\s*,\s*p_starts_on date\s*,\s*p_ends_on date\s*\)\s*RETURNS uuid/,
    );
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.update_checklist_execution_schedule\(\s*p_schedule_id uuid\s*,\s*p_frequency text\s*,\s*p_weekdays smallint\[\]\s*,\s*p_due_local_time time without time zone\s*,\s*p_timezone text\s*,\s*p_starts_on date\s*,\s*p_ends_on date\s*\)\s*RETURNS boolean/,
    );
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.deactivate_checklist_execution_schedule\(\s*p_schedule_id uuid\s*\)\s*RETURNS boolean/,
    );
  });

  it("every function is LANGUAGE plpgsql, SECURITY DEFINER, search_path = public, pg_temp", () => {
    for (const delim of [
      "$integrity$",
      "$create_schedule$",
      "$update_schedule$",
      "$deactivate_schedule$",
    ]) {
      const head = headBefore(delim);
      expect(head).toMatch(/LANGUAGE plpgsql/);
      expect(head).toMatch(/SECURITY DEFINER/);
      expect(head).toMatch(/SET search_path = public, pg_temp/);
    }
  });

  it("uses auth.uid() as the only actor source in all three RPCs", () => {
    for (const body of [createBody, updateBody, deactivateBody]) {
      expect(body).toMatch(/v_user_id := auth\.uid\(\)/);
    }
    expect(migration).not.toMatch(/p_actor_id|p_user_id|p_workspace_id/);
  });

  it("fails closed when auth.uid() is NULL", () => {
    for (const body of [createBody, updateBody, deactivateBody]) {
      expect(body).toMatch(/schedule_actor_required/);
    }
  });

  it("never uses SET ROLE, dynamic SQL or the service-role key", () => {
    expect(code).not.toMatch(/SET\s+ROLE/i);
    // Dynamic SQL would be EXECUTE followed by a statement/variable — the
    // legitimate GRANT EXECUTE ON FUNCTION privilege syntax is exempt.
    expect(code).not.toMatch(/EXECUTE\s+(?!ON\b)/i);
    expect(code).not.toMatch(/FORMAT\(/i);
  });

  it("contains no materializer invocation and no cron/seed/backfill/push", () => {
    expect(code).not.toMatch(/materialize/i);
    expect(code).not.toMatch(/\bcron\b/i);
    expect(code).not.toMatch(/\bseed\b/i);
    expect(code).not.toMatch(/backfill/i);
    expect(code).not.toMatch(/\bdb\s+push\b/i);
    expect(code).not.toMatch(/migration\s+repair/i);
  });

  it("contains no DELETE or TRUNCATE anywhere", () => {
    expect(code).not.toMatch(/\bDELETE\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("never touches occurrences (no reference in any statement)", () => {
    expect(code).not.toMatch(/checklist_execution_occurrences/i);
  });
});

describe("5E.2C.1 — trigger correction (pure-deactivation exception)", () => {
  it("keeps every original validation error code", () => {
    for (const err of [
      "schedule_checklist_not_found",
      "schedule_member_required",
      "schedule_workspace_mismatch",
      "schedule_member_inactive",
      "schedule_timezone_required",
      "schedule_timezone_invalid",
    ]) {
      expect(integrityBody).toContain(err);
    }
  });

  it("adds the pure-deactivation exception only for UPDATE with is_active -> false", () => {
    expect(integrityBody).toMatch(/TG_OP = 'UPDATE'/);
    expect(integrityBody).toMatch(/NEW\.is_active = false/);
    for (const field of [
      "checklist_id",
      "workspace_member_id",
      "frequency",
      "weekdays",
      "due_local_time",
      "timezone",
      "starts_on",
      "ends_on",
    ]) {
      expect(integrityBody).toMatch(
        new RegExp(`OLD\\.${field} IS NOT DISTINCT FROM NEW\\.${field}`),
      );
    }
  });

  it("still blocks inactive members on every non-deactivation path", () => {
    expect(integrityBody).toMatch(
      /v_member_status <> 'active'::public\.member_status\s+AND NOT v_pure_deactivation/,
    );
    // Reactivation (false -> true) can never match the exception.
    expect(integrityBody).toMatch(/NEW\.is_active = false/);
    expect(integrityBody).not.toMatch(/NEW\.is_active = true/);
  });

  it("keeps workspace and existence checks before the exception benefit", () => {
    expect(integrityBody).toMatch(
      /SELECT wm\.status INTO v_member_status\s+FROM public\.workspace_members wm\s+WHERE wm\.id = NEW\.workspace_member_id\s+AND wm\.workspace_id = v_workspace_id/,
    );
    expect(integrityBody).toMatch(/schedule_workspace_mismatch/);
  });

  it("re-asserts hardened privileges for the integrity function", () => {
    expect(revokes).toContain(
      "REVOKE ALL ON FUNCTION public.checklist_execution_schedule_integrity() FROM PUBLIC, anon, authenticated",
    );
    expect(grants).toContain(
      "GRANT EXECUTE ON FUNCTION public.checklist_execution_schedule_integrity() TO service_role",
    );
  });
});

describe("5E.2C.1 — create RPC", () => {
  it("resolves the workspace from the real checklist and fails on personal/missing", () => {
    expect(createBody).toMatch(
      /SELECT c\.workspace_id INTO v_workspace_id\s+FROM public\.checklists c\s+WHERE c\.id = p_checklist_id/,
    );
    expect(createBody).toMatch(/schedule_checklist_not_found/);
  });

  it("authorizes only through has_role_in_workspace(..., 'editor')", () => {
    for (const body of [createBody, updateBody, deactivateBody]) {
      expect(body).toMatch(
        /public\.has_role_in_workspace\(\s*v_user_id, v_workspace_id, 'editor'::public\.app_role\s*\)/,
      );
      expect(body).toMatch(/schedule_management_denied/);
    }
  });

  it("inserts is_active = true and created_by = auth.uid()", () => {
    expect(createBody).toMatch(
      /INSERT INTO public\.checklist_execution_schedules\s+\(checklist_id, workspace_member_id, frequency, weekdays,\s+due_local_time, timezone, starts_on, ends_on, is_active, created_by\)/,
    );
    expect(createBody).toMatch(/true, v_user_id\)/);
    expect(createBody).toMatch(/RETURNING id INTO v_new_id/);
    expect(createBody).toMatch(/RETURN v_new_id/);
  });

  it("does not duplicate the business CHECK constraints in SQL", () => {
    expect(code).not.toMatch(/ADD CONSTRAINT/i);
    expect(code).not.toMatch(/CREATE TABLE/i);
  });
});

describe("5E.2C.1 — update RPC", () => {
  it("locks the schedule row with FOR UPDATE and derives workspace via checklist", () => {
    expect(updateBody).toMatch(/FROM public\.checklist_execution_schedules s\s+WHERE s\.id = p_schedule_id\s+FOR UPDATE/);
    expect(updateBody).toMatch(/schedule_not_found/);
    expect(updateBody).toMatch(
      /SELECT c\.workspace_id INTO v_workspace_id\s+FROM public\.checklists c\s+WHERE c\.id = v_checklist_id/,
    );
  });

  it("fails when the schedule is inactive", () => {
    expect(updateBody).toMatch(/schedule_inactive/);
  });

  it("updates only the six business fields — never member, checklist, creator or is_active", () => {
    expect(updateBody).toMatch(
      /UPDATE public\.checklist_execution_schedules\s+SET frequency = p_frequency,\s+weekdays = p_weekdays,\s+due_local_time = p_due_local_time,\s+timezone = p_timezone,\s+starts_on = p_starts_on,\s+ends_on = p_ends_on\s+WHERE id = p_schedule_id/,
    );
    expect(updateBody).not.toMatch(/workspace_member_id\s*=/);
    expect(updateBody).not.toMatch(/created_by\s*=/);
    expect(updateBody).not.toMatch(/(?<!v_)is_active\s*=/);
    expect(updateBody).not.toMatch(/checklist_id\s*=/);
  });
});

describe("5E.2C.1 — deactivate RPC", () => {
  it("is idempotent: returns true without a new UPDATE when already inactive", () => {
    expect(deactivateBody).toMatch(
      /IF v_is_active = false THEN\s+RETURN true;\s+END IF;/,
    );
  });

  it("updates ONLY is_active to false", () => {
    expect(deactivateBody).toMatch(
      /UPDATE public\.checklist_execution_schedules\s+SET is_active = false\s+WHERE id = p_schedule_id/,
    );
  });

  it("locks the schedule and resolves workspace via the real checklist", () => {
    expect(deactivateBody).toMatch(/FOR UPDATE/);
    expect(deactivateBody).toMatch(/schedule_not_found/);
    expect(deactivateBody).toMatch(
      /SELECT c\.workspace_id INTO v_workspace_id\s+FROM public\.checklists c\s+WHERE c\.id = v_checklist_id/,
    );
  });
});

describe("5E.2C.1 — privileges of the three RPCs", () => {
  it("revokes ALL from PUBLIC, anon and authenticated for each exact signature", () => {
    for (const sig of [CREATE_SIG, UPDATE_SIG, DEACTIVATE_SIG]) {
      expect(revokes).toContain(
        `REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated`,
      );
    }
    expect(revokes).toHaveLength(4); // 3 RPCs + integrity function
  });

  it("grants EXECUTE only to authenticated and service_role for each RPC", () => {
    for (const sig of [CREATE_SIG, UPDATE_SIG, DEACTIVATE_SIG]) {
      expect(grants).toContain(
        `GRANT EXECUTE ON FUNCTION ${sig} TO authenticated, service_role`,
      );
    }
    expect(grants).toHaveLength(4); // 3 RPCs + integrity function
    for (const grant of grants.filter((g) => g.includes("create_checklist_execution_schedule") || g.includes("update_checklist_execution_schedule") || g.includes("deactivate_checklist_execution_schedule"))) {
      expect(grant).not.toMatch(/TO\s+(PUBLIC|anon)\b/i);
    }
  });

  it("top level contains exactly the four function definitions plus privilege statements", () => {
    expect(fnDefs).toHaveLength(4);
    expect(otherStatements).toHaveLength(8);
    for (const s of otherStatements) {
      expect(s).toMatch(/^(REVOKE|GRANT)/);
    }
  });

  it("creates no tables, indexes, policies or triggers at top level", () => {
    expect(topLevelCode).not.toMatch(/CREATE\s+(TABLE|TEMP\s+TABLE)/i);
    expect(topLevelCode).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
    expect(topLevelCode).not.toMatch(/CREATE\s+POLICY/i);
    expect(topLevelCode).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i);
    expect(topLevelCode).not.toMatch(/ALTER\s+TABLE/i);
    expect(topLevelCode).not.toMatch(/DROP\s+TABLE/i);
  });

  it("performs no top-level DML and does not call the new RPCs", () => {
    expect(topLevelCode).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(topLevelCode).not.toMatch(/\bUPDATE\s+public\./i);
    expect(topLevelCode).not.toMatch(
      /SELECT\s+public\.(create|update|deactivate)_checklist_execution_schedule/i,
    );
    expect(topLevelCode).not.toMatch(/\bPERFORM\b/i);
    expect(topLevelCode).not.toMatch(/\bCALL\b/i);
  });
});

describe("5E.2C.1 — applied migrations remain immutable", () => {
  for (const [path, hash] of APPLIED) {
    it(`leaves ${path.split("/").pop()} byte-identical (SHA-256 unchanged)`, () => {
      const applied = readFileSync(resolve(process.cwd(), path));
      expect(createHash("sha256").update(applied).digest("hex")).toBe(hash);
    });
  }
});
