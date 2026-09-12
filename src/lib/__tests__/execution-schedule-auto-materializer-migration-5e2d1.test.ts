/**
 * Execution 5E.2D.1 — structural tests for the auto-materialization migration.
 *
 * Each dollar-quoted function body is extracted INDIVIDUALLY (no fragile
 * global word counts): top-level statements are analyzed with bodies removed,
 * and comments are stripped before any statement-level guard so SQL prose
 * can never satisfy or break an assertion.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260914120000_5e2d1_auto_materialization.sql";
const migrationSource = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

const NARROW_FN = "materialize_checklist_execution_occurrence_for_schedule";
const OPERATIONAL_FN = "materialize_current_checklist_execution_occurrences";
const CREATE_FN = "create_checklist_execution_schedule";
const UPDATE_FN = "update_checklist_execution_schedule";

const DOLLAR_TAGS: Record<string, string> = {
  [NARROW_FN]: "$materialize_one$",
  [OPERATIONAL_FN]: "$materialize_current$",
  [CREATE_FN]: "$create_schedule$",
  [UPDATE_FN]: "$update_schedule$",
};

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** Splits the migration into (top-level statements) + (per-function bodies). */
function splitMigration(sql: string): { topLevel: string; bodies: Record<string, string> } {
  const bodies: Record<string, string> = {};
  let topLevel = "";
  let rest = sql;
  for (const tag of Object.values(DOLLAR_TAGS)) {
    const start = rest.indexOf(tag);
    const end = rest.indexOf(tag, start + tag.length);
    if (start === -1 || end === -1) throw new Error(`Unpaired dollar-quote tag ${tag}`);
    bodies[tag] = rest.slice(start + tag.length, end);
    topLevel += rest.slice(0, start) + " ";
    rest = rest.slice(end + tag.length);
  }
  topLevel += rest;
  return { topLevel, bodies };
}

const { topLevel, bodies } = splitMigration(migrationSource);
const strippedTopLevel = stripSqlComments(topLevel);
const bodyOne = stripSqlComments(bodies[DOLLAR_TAGS[NARROW_FN]]);
const bodyCurrent = stripSqlComments(bodies[DOLLAR_TAGS[OPERATIONAL_FN]]);
const bodyCreate = stripSqlComments(bodies[DOLLAR_TAGS[CREATE_FN]]);
const bodyUpdate = stripSqlComments(bodies[DOLLAR_TAGS[UPDATE_FN]]);

const indexOfOrThrow = (haystack: string, needle: string): number => {
  const idx = haystack.indexOf(needle);
  expect(idx, `expected to find: ${needle}`).toBeGreaterThan(-1);
  return idx;
};

// ───────────────────────── applied-migration hashes (§4) ────────────────────

describe("5E.2D.1 applied migrations remain byte-identical", () => {
  const sha = (rel: string): string =>
    createHash("sha256").update(readFileSync(resolve(process.cwd(), rel))).digest("hex");

  it("20260910120000 (5E.2A) keeps its certified SHA-256", () => {
    expect(sha("supabase/migrations/20260910120000_5e2a_execution_schedules_occurrences.sql")).toBe(
      "dfb5e133bbc9c42f062727e859d811d5697ac3f11690cf2c3c45c1fd13b3def4"
    );
  });

  it("20260911120000 (5E.2A.6) keeps its certified SHA-256", () => {
    expect(sha("supabase/migrations/20260911120000_5e2a6_restrict_integrity_function_execute.sql")).toBe(
      "51a4520c0c8292fab866eb9bc4c64710de9d7bb075ce962549123f5ce03cdd10"
    );
  });

  it("20260912120000 (5E.2B) keeps its certified SHA-256", () => {
    expect(sha("supabase/migrations/20260912120000_5e2b_occurrence_materializer.sql")).toBe(
      "bdc8cc7b617d35fa9e4304e27cea1feb3330e9506ce9ea3ae03b598b1344089b"
    );
  });

  it("20260913120000 (5E.2C.1) keeps its certified SHA-256", () => {
    expect(sha("supabase/migrations/20260913120000_5e2c1_schedule_management_rpcs.sql")).toBe(
      "03309b3365efac69060b60c6ba37d738156382dd100da3eb62eb7f3793fca65d"
    );
  });
});

// ───────────────────────── narrow per-schedule function (§5) ────────────────

describe("5E.2D.1 narrow per-schedule materializer", () => {
  it("has the exact signature and required attributes", () => {
    // The dollar tag is consumed by the extractor, so the signature regex
    // ends at search_path; tag pairing is proven by the exactly-twice test.
    expect(strippedTopLevel).toMatch(
      /CREATE OR REPLACE FUNCTION public\.materialize_checklist_execution_occurrence_for_schedule\(\s*p_schedule_id uuid,\s*p_occurrence_date date\s*\)\s*RETURNS integer\s*LANGUAGE plpgsql\s*SECURITY DEFINER\s*SET search_path = public, pg_temp/
    );
  });

  it("pairs each dollar-quote tag exactly twice (open + close)", () => {
    for (const tag of Object.values(DOLLAR_TAGS)) {
      expect(migrationSource.split(tag).length - 1).toBe(2);
    }
  });

  it("has no parameter defaults", () => {
    expect(strippedTopLevel).toMatch(
      /materialize_checklist_execution_occurrence_for_schedule\(\s*p_schedule_id uuid,\s*p_occurrence_date date\s*\)\s*RETURNS/
    );
    expect(strippedTopLevel).not.toMatch(/p_schedule_id uuid\s*:=/);
    expect(strippedTopLevel).not.toMatch(/p_occurrence_date date\s*:=/);
  });

  it("validates parameters before any INSERT", () => {
    const firstInsert = bodyOne.indexOf("INSERT INTO");
    expect(bodyOne).toContain("p_schedule_id IS NULL");
    expect(bodyOne).toContain("p_occurrence_date IS NULL");
    expect(bodyOne).toContain("occurrence_schedule_required");
    expect(bodyOne).toContain("occurrence_date_required");
    expect(bodyOne).toContain("occurrence_date_invalid");
    expect(bodyOne).toContain("'infinity'::date");
    expect(bodyOne).toContain("'-infinity'::date");
    expect(firstInsert).toBeGreaterThan(bodyOne.indexOf("occurrence_date_invalid"));
  });

  it("locks schedule AND responsible member with FOR SHARE OF s, wm", () => {
    expect(bodyOne).toMatch(/FROM public\.checklist_execution_schedules s\s*JOIN public\.workspace_members wm\s*ON wm\.id = s\.workspace_member_id\s*WHERE s\.id = p_schedule_id\s*FOR SHARE OF s, wm/);
  });

  it("reads eligibility fields from the locked row", () => {
    for (const field of [
      "s.frequency", "s.weekdays", "s.due_local_time", "s.timezone",
      "s.starts_on", "s.ends_on", "s.is_active", "wm.status",
    ]) {
      expect(bodyOne).toContain(field);
    }
  });

  it("fails closed: missing schedule/member, inactive schedule, inactive member", () => {
    expect(bodyOne).toContain("IF v_id IS NULL THEN");
    expect(bodyOne).toContain("v_is_active <> true");
    expect(bodyOne).toContain("v_member_status <> 'active'::public.member_status");
    // Exactly three RETURN 0 guards for state, plus the two window guards.
    expect(bodyOne.match(/RETURN 0;/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("fails closed: date before starts_on and after ends_on", () => {
    expect(bodyOne).toContain("p_occurrence_date < v_starts_on");
    expect(bodyOne).toContain("v_ends_on IS NOT NULL AND p_occurrence_date > v_ends_on");
  });

  it("preserves the four canonical frequencies", () => {
    expect(bodyOne).toContain("v_frequency = 'once' AND p_occurrence_date = v_starts_on");
    expect(bodyOne).toContain("v_frequency = 'daily'");
    expect(bodyOne).toMatch(/v_frequency = 'weekly'[\s\S]*% 7\) = 0/);
    expect(bodyOne).toContain("EXTRACT(ISODOW FROM p_occurrence_date)");
    expect(bodyOne).toContain("= ANY (v_weekdays)");
  });

  it("derives due_at from the stored timezone with the canonical expression", () => {
    expect(bodyOne).toContain(
      "((p_occurrence_date + v_due_local_time) AT TIME ZONE v_timezone)"
    );
  });

  it("inserts only schedule_id, occurrence_date and due_at, at most once, idempotently", () => {
    expect(bodyOne.match(/INSERT INTO public\.checklist_execution_occurrences/g)?.length).toBe(1);
    expect(bodyOne).toContain("(schedule_id, occurrence_date, due_at)");
    expect(bodyOne).toContain("ON CONFLICT (schedule_id, occurrence_date) DO NOTHING");
    expect(bodyOne).toContain("RETURN v_inserted");
  });

  it("never updates or deletes and never uses auth.uid()", () => {
    expect(bodyOne).not.toMatch(/\bUPDATE\b/);
    expect(bodyOne).not.toMatch(/\bDELETE\b/);
    expect(bodyOne).not.toContain("auth.uid()");
  });
});

// ───────────────────────── operational function (§6) ────────────────────────

describe("5E.2D.1 operational per-schedule-local-date materializer", () => {
  it("has the exact signature with explicit p_as_of and required attributes", () => {
    expect(strippedTopLevel).toMatch(
      /CREATE OR REPLACE FUNCTION public\.materialize_current_checklist_execution_occurrences\(\s*p_as_of timestamptz\s*\)\s*RETURNS integer\s*LANGUAGE plpgsql\s*SECURITY DEFINER\s*SET search_path = public, pg_temp/
    );
  });

  it("rejects NULL and infinite instants", () => {
    expect(bodyCurrent).toContain("p_as_of IS NULL");
    expect(bodyCurrent).toContain("occurrence_as_of_required");
    expect(bodyCurrent).toContain("'infinity'::timestamptz");
    expect(bodyCurrent).toContain("'-infinity'::timestamptz");
    expect(bodyCurrent).toContain("occurrence_as_of_invalid");
  });

  it("visits schedules in deterministic ORDER BY s.id", () => {
    expect(bodyCurrent).toContain("ORDER BY s.id");
  });

  it("5E.2D.1.1: loop snapshot filters active schedules only (optimization, revalidated under lock)", () => {
    expect(bodyCurrent).toMatch(
      /SELECT s\.id\s+FROM public\.checklist_execution_schedules s\s+WHERE s\.is_active = true\s+ORDER BY s\.id/
    );
    // The narrow function still re-validates is_active + member under lock.
    expect(bodyOne).toContain("v_is_active <> true");
    expect(bodyOne).toContain("v_member_status <> 'active'::public.member_status");
  });

  it("5E.2D.1.1: skips a schedule removed between snapshot and lock (NOT FOUND → CONTINUE)", () => {
    // The locked timezone SELECT must be preceded by a defensive reset and
    // followed — before ANY local-date math or narrow call — by the guard.
    const resetIdx = bodyCurrent.indexOf("v_schedule_timezone := NULL;");
    const selIdx = indexOfOrThrow(bodyCurrent, "SELECT s.timezone INTO v_schedule_timezone");
    const notFoundIdx = indexOfOrThrow(bodyCurrent, "IF NOT FOUND THEN");
    const continueIdx = indexOfOrThrow(bodyCurrent, "CONTINUE;");
    const lockIdx = indexOfOrThrow(bodyCurrent, "FOR SHARE OF s;");
    const localTodayIdx = indexOfOrThrow(bodyCurrent, "(p_as_of AT TIME ZONE v_schedule_timezone)::date");
    const narrowFirstIdx = indexOfOrThrow(bodyCurrent, "materialize_checklist_execution_occurrence_for_schedule(");
    expect(resetIdx).toBeGreaterThan(-1);
    expect(resetIdx).toBeLessThan(selIdx);
    expect(lockIdx).toBeGreaterThan(selIdx);
    expect(notFoundIdx).toBeGreaterThan(lockIdx);
    expect(continueIdx).toBeGreaterThan(notFoundIdx);
    expect(continueIdx).toBeLessThan(localTodayIdx);
    expect(continueIdx).toBeLessThan(narrowFirstIdx);
    // Exactly one guard — placed before the local-date derivation.
    expect(bodyCurrent.match(/IF NOT FOUND THEN/g)?.length).toBe(1);
    expect(bodyCurrent.match(/CONTINUE;/g)?.length).toBe(1);
  });

  it("5E.2D.1.1: recovery continues after a concurrent removal (no retry, no error surface)", () => {
    // Only ONE loop over schedules; the removal path continues the loop,
    // so the remaining schedules still materialize in the same run. The
    // CONTINUE guard itself raises nothing — the only RAISEs in the body
    // are the p_as_of parameter validations.
    expect(bodyCurrent.match(/FOR v_schedule IN/g)?.length).toBe(1);
    const raiseCount = bodyCurrent.match(/RAISE EXCEPTION/g)?.length ?? 0;
    expect(raiseCount).toBe(2); // occurrence_as_of_required + occurrence_as_of_invalid
    expect(bodyCurrent).toContain("occurrence_as_of_required");
    expect(bodyCurrent).toContain("occurrence_as_of_invalid");
  });

  it("reads the timezone from a FOR SHARE-locked read, before deriving the local date", () => {
    // The timezone read IS the locked read: one statement holds FOR SHARE OF s
    // and selects s.timezone; the local date derivation follows it.
    const tzReadIdx = indexOfOrThrow(bodyCurrent, "SELECT s.timezone INTO v_schedule_timezone");
    const lockIdx = indexOfOrThrow(bodyCurrent, "FOR SHARE OF s;");
    expect(lockIdx).toBeGreaterThan(tzReadIdx);
    expect(lockIdx - tzReadIdx).toBeLessThan(200); // same statement
    const localTodayIdx = indexOfOrThrow(bodyCurrent, "(p_as_of AT TIME ZONE v_schedule_timezone)::date");
    expect(localTodayIdx).toBeGreaterThan(lockIdx);
  });

  it("derives each schedule's local date individually (never a global UTC today)", () => {
    expect(bodyCurrent).toContain("(p_as_of AT TIME ZONE v_schedule_timezone)::date");
    expect(bodyCurrent).not.toMatch(/\bnow\(\)/);
    expect(migrationSource).not.toMatch(/AT TIME ZONE\s+'/);
  });

  it("calls the narrow function exactly twice: yesterday FIRST, then today, never tomorrow", () => {
    expect(bodyCurrent.match(/materialize_checklist_execution_occurrence_for_schedule\(/g)?.length).toBe(2);
    const yesterdayIdx = indexOfOrThrow(bodyCurrent, "v_local_today - 1");
    const todayIdx = bodyCurrent.indexOf("v_local_today)", yesterdayIdx);
    expect(todayIdx).toBeGreaterThan(yesterdayIdx);
    expect(bodyCurrent).not.toMatch(/\+\s*1/);
  });

  it("sums only really-inserted rows and never mutates occurrences", () => {
    expect(bodyCurrent).toContain("v_inserted := v_inserted");
    expect(bodyCurrent).toContain("RETURN v_inserted");
    expect(bodyCurrent).not.toMatch(/\bUPDATE\b/);
    expect(bodyCurrent).not.toMatch(/\bDELETE\b/);
  });

  it("accepts no browser-controlled range (single timestamptz parameter only)", () => {
    expect(bodyCurrent).not.toMatch(/p_from_date|p_through_date|query/);
  });
});

// ───────────────────────── inline materialization (§7/§8) ───────────────────

describe("5E.2D.1 inline materialization in create/update RPCs", () => {
  it("recreates create with the exact original signature", () => {
    expect(strippedTopLevel).toMatch(
      /CREATE OR REPLACE FUNCTION public\.create_checklist_execution_schedule\(\s*p_checklist_id uuid,\s*p_workspace_member_id uuid,\s*p_frequency text,\s*p_weekdays smallint\[\],\s*p_due_local_time time without time zone,\s*p_timezone text,\s*p_starts_on date,\s*p_ends_on date\s*\)\s*RETURNS uuid/
    );
  });

  it("recreates update with the exact original signature", () => {
    expect(strippedTopLevel).toMatch(
      /CREATE OR REPLACE FUNCTION public\.update_checklist_execution_schedule\(\s*p_schedule_id uuid,\s*p_frequency text,\s*p_weekdays smallint\[\],\s*p_due_local_time time without time zone,\s*p_timezone text,\s*p_starts_on date,\s*p_ends_on date\s*\)\s*RETURNS boolean/
    );
  });

  it("create keeps the full original authorization contract", () => {
    expect(bodyCreate).toContain("v_user_id := auth.uid()");
    expect(bodyCreate).toContain("schedule_actor_required");
    expect(bodyCreate).toContain("schedule_checklist_required");
    expect(bodyCreate).toContain("schedule_checklist_not_found");
    expect(bodyCreate).toContain("schedule_management_denied");
    expect(bodyCreate).toMatch(/WHERE c\.id = p_checklist_id\s*FOR UPDATE/);
    expect(bodyCreate).toMatch(/has_role_in_workspace\(\s*v_user_id, v_workspace_id, 'editor'::public\.app_role\s*\)/);
    expect(bodyCreate).toContain("INSERT INTO public.checklist_execution_schedules");
    expect(bodyCreate).toContain("RETURNING id INTO v_new_id");
  });

  it("create materializes inline after the INSERT and before the return, local date only", () => {
    const insertIdx = indexOfOrThrow(bodyCreate, "RETURNING id INTO v_new_id");
    const materializeIdx = indexOfOrThrow(
      bodyCreate,
      "public.materialize_checklist_execution_occurrence_for_schedule("
    );
    const returnIdx = indexOfOrThrow(bodyCreate, "RETURN v_new_id");
    expect(materializeIdx).toBeGreaterThan(insertIdx);
    expect(returnIdx).toBeGreaterThan(materializeIdx);
    expect(bodyCreate).toContain("(statement_timestamp() AT TIME ZONE p_timezone)::date");
    expect(bodyCreate).not.toMatch(/greatest\(/i);
  });

  it("create with a future starts_on can never materialize early", () => {
    expect(bodyCreate).not.toContain("greatest(p_starts_on");
    expect(bodyOne).toContain("p_occurrence_date < v_starts_on");
  });

  it("update keeps the full original authorization contract and six editable fields", () => {
    expect(bodyUpdate).toContain("v_user_id := auth.uid()");
    expect(bodyUpdate).toContain("schedule_actor_required");
    expect(bodyUpdate).toContain("schedule_required");
    expect(bodyUpdate).toContain("schedule_not_found");
    expect(bodyUpdate).toContain("schedule_checklist_not_found");
    expect(bodyUpdate).toContain("schedule_management_denied");
    expect(bodyUpdate).toContain("schedule_inactive");
    expect(bodyUpdate).toMatch(/FOR UPDATE OF s, c/);
    expect(bodyUpdate).toMatch(/has_role_in_workspace\(\s*v_user_id, v_workspace_id, 'editor'::public\.app_role\s*\)/);
    const updateSet = indexOfOrThrow(bodyUpdate, "UPDATE public.checklist_execution_schedules");
    const whereIdx = indexOfOrThrow(bodyUpdate, "WHERE id = p_schedule_id");
    expect(whereIdx).toBeGreaterThan(updateSet);
    // Exactly the six editable fields inside the SET block — and nothing else.
    const setBlock = bodyUpdate.slice(updateSet, whereIdx);
    for (const assignment of [
      "frequency = p_frequency",
      "weekdays = p_weekdays",
      "due_local_time = p_due_local_time",
      "timezone = p_timezone",
      "starts_on = p_starts_on",
      "ends_on = p_ends_on",
    ]) {
      expect(setBlock).toContain(assignment);
    }
    expect(setBlock).not.toContain("workspace_member_id =");
    expect(setBlock).not.toContain("checklist_id =");
    expect(setBlock).not.toContain("is_active =");
    expect(bodyUpdate).toContain("RETURN true");
  });

  it("update materializes inline after the UPDATE and before the return, new timezone only", () => {
    const updateIdx = indexOfOrThrow(bodyUpdate, "WHERE id = p_schedule_id");
    const materializeIdx = indexOfOrThrow(
      bodyUpdate,
      "public.materialize_checklist_execution_occurrence_for_schedule("
    );
    const returnIdx = bodyUpdate.indexOf("RETURN true", materializeIdx);
    expect(returnIdx).toBeGreaterThan(materializeIdx);
    expect(materializeIdx).toBeGreaterThan(updateIdx);
    expect(bodyUpdate).toContain("(statement_timestamp() AT TIME ZONE p_timezone)::date");
  });

  it("update never changes an existing occurrence (idempotent insert only)", () => {
    expect(bodyOne).toContain("ON CONFLICT (schedule_id, occurrence_date) DO NOTHING");
    expect(bodyUpdate).not.toMatch(/UPDATE public\.checklist_execution_occurrences/);
  });

  it("deactivate is NOT recreated and never referenced outside comments", () => {
    expect(strippedTopLevel).not.toContain("deactivate_checklist_execution_schedule");
    expect(bodyCreate).not.toContain("deactivate_checklist_execution_schedule");
    // Exactly four functions are defined, and none of them is deactivate.
    const definedFns = strippedTopLevel.match(
      /CREATE OR REPLACE FUNCTION public\.\w+/g
    );
    expect(definedFns).toEqual([
      "CREATE OR REPLACE FUNCTION public.materialize_checklist_execution_occurrence_for_schedule",
      "CREATE OR REPLACE FUNCTION public.materialize_current_checklist_execution_occurrences",
      "CREATE OR REPLACE FUNCTION public.create_checklist_execution_schedule",
      "CREATE OR REPLACE FUNCTION public.update_checklist_execution_schedule",
    ]);
  });
});

// ───────────────────────── privileges and scope (§10/§11) ───────────────────

describe("5E.2D.1 privileges and migration scope", () => {
  it("new helpers are service_role-only (no EXECUTE for PUBLIC/anon/authenticated)", () => {
    expect(strippedTopLevel).toMatch(
      /REVOKE ALL ON FUNCTION\s+public\.materialize_checklist_execution_occurrence_for_schedule\(uuid, date\)\s*FROM PUBLIC, anon, authenticated/
    );
    expect(strippedTopLevel).toMatch(
      /REVOKE ALL ON FUNCTION\s+public\.materialize_current_checklist_execution_occurrences\(timestamptz\)\s*FROM PUBLIC, anon, authenticated/
    );
    expect(strippedTopLevel).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.materialize_checklist_execution_occurrence_for_schedule\(uuid, date\)\s*TO service_role/
    );
    expect(strippedTopLevel).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.materialize_current_checklist_execution_occurrences\(timestamptz\)\s*TO service_role/
    );
  });

  it("create/update keep EXECUTE for authenticated, service_role only", () => {
    expect(strippedTopLevel).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.create_checklist_execution_schedule\(uuid, uuid, text, smallint\[\], time without time zone, text, date, date\)\s*TO authenticated, service_role/
    );
    expect(strippedTopLevel).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+public\.update_checklist_execution_schedule\(uuid, text, smallint\[\], time without time zone, text, date, date\)\s*TO authenticated, service_role/
    );
    expect(strippedTopLevel).not.toMatch(/GRANT[^;]*\bTO\s+(anon|PUBLIC)\b/);
  });

  it("top level has zero DML outside function bodies", () => {
    expect(strippedTopLevel).not.toMatch(/\bINSERT\b/);
    expect(strippedTopLevel).not.toMatch(/\bUPDATE\b/);
    expect(strippedTopLevel).not.toMatch(/\bDELETE\b/);
    expect(strippedTopLevel).not.toMatch(/\bTRUNCATE\b/);
  });

  it("top level has zero schema, policy, trigger, index or cron changes", () => {
    expect(strippedTopLevel).not.toMatch(/\bALTER TABLE\b/);
    expect(strippedTopLevel).not.toMatch(/\bCREATE TABLE\b/);
    expect(strippedTopLevel).not.toMatch(/\bDROP TABLE\b/);
    expect(strippedTopLevel).not.toMatch(/\bCREATE POLICY\b/);
    expect(strippedTopLevel).not.toMatch(/\bCREATE TRIGGER\b/);
    expect(strippedTopLevel).not.toMatch(/\bCREATE INDEX\b/);
    expect(strippedTopLevel).not.toContain("pg_cron");
    expect(strippedTopLevel).not.toContain("cron.schedule");
  });

  it("nothing is invoked at the top level (no auto-execution, no backfill)", () => {
    expect(strippedTopLevel).not.toContain("PERFORM");
    expect(strippedTopLevel).not.toContain("SELECT materialize");
    expect(strippedTopLevel).not.toContain("public.materialize_checklist_execution_occurrences(");
  });

  it("no reference to the legacy assignment flow or deprecated paths", () => {
    expect(strippedTopLevel).not.toContain("checklist_assignments");
    expect(migrationSource).not.toMatch(/\bExecutionEngine\b/);
  });
});
