/**
 * Execution 5E.2B — structural assertions over the occurrence materializer
 * migration. Content-based (no line numbers), CRLF-safe.
 *
 * The dollar-quoted function body is extracted explicitly so that:
 *  - scope guards can separate legitimate statements INSIDE the function
 *    (the idempotent INSERT) from top-level migration statements;
 *  - counts are never global (comments, body and statements are distinct).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { resolve } from "path";

const MIGRATION_PATH =
  "supabase/migrations/20260912120000_5e2b_occurrence_materializer.sql";

const APPLIED_5E2A_PATH =
  "supabase/migrations/20260910120000_5e2a_execution_schedules_occurrences.sql";
const APPLIED_5E2A_SHA256 =
  "dfb5e133bbc9c42f062727e859d811d5697ac3f11690cf2c3c45c1fd13b3def4";

const APPLIED_5E2A6_PATH =
  "supabase/migrations/20260911120000_5e2a6_restrict_integrity_function_execute.sql";
const APPLIED_5E2A6_SHA256 =
  "51a4520c0c8292fab866eb9bc4c64710de9d7bb075ce962549123f5ce03cdd10";

const migration = readFileSync(resolve(process.cwd(), MIGRATION_PATH), "utf8");

// --- dollar-quoted body extraction ($materializer$ ... $materializer$) ---
const BODY_DELIM = "$materializer$";
const firstDelim = migration.indexOf(BODY_DELIM);
const secondDelim = migration.indexOf(BODY_DELIM, firstDelim + BODY_DELIM.length);
const fnBody = migration.slice(firstDelim + BODY_DELIM.length, secondDelim);
const fnHead = migration.slice(0, firstDelim); // CREATE ... AS

// Top-level migration text with the function body replaced by a marker.
const topLevel = migration.replace(
  /\$materializer\$[\s\S]*?\$materializer\$/,
  "__FN_BODY__",
);
// Comments stripped separately for body and top level (statements, not prose).
const bodyCode = fnBody.replace(/^\s*--.*$/gm, "");
const topCode = topLevel.replace(/^\s*--.*$/gm, "");
const topStatements = topCode
  .split(";")
  .map((s) => s.replace(/\s+/g, " ").trim())
  .filter(Boolean);
const fnDefinitionStatement = topStatements.find((s) => s.includes("__FN_BODY__")) ?? "";
const otherStatements = topStatements.filter((s) => !s.includes("__FN_BODY__"));
const privilegeStatements = otherStatements.filter(
  (s) => s.startsWith("REVOKE") || s.startsWith("GRANT"),
);

describe("5E.2B — function contract", () => {
  it("defines the exact signature with explicit, non-default parameters", () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.materialize_checklist_execution_occurrences\(\s*p_from_date date\s*,\s*p_through_date date\s*\)\s*RETURNS integer/,
    );
    expect(fnHead).toMatch(/LANGUAGE plpgsql/);
    expect(fnHead).not.toMatch(/DEFAULT/i); // no parameter defaults
  });

  it("is SECURITY DEFINER", () => {
    expect(fnHead).toMatch(/SECURITY DEFINER/);
  });

  it("pins search_path = public, pg_temp", () => {
    expect(fnHead).toMatch(/SET search_path = public, pg_temp/);
  });

  it("does not use auth.uid()", () => {
    expect(bodyCode).not.toMatch(/auth\.uid\(\)/);
  });
});

describe("5E.2B — range validation", () => {
  it("fails with occurrence_range_required on NULL dates", () => {
    expect(bodyCode).toMatch(/p_from_date IS NULL OR p_through_date IS NULL/);
    expect(bodyCode).toContain("occurrence_range_required");
  });

  it("fails with occurrence_range_invalid on non-finite or inverted ranges", () => {
    expect(bodyCode).toContain("'infinity'::date");
    expect(bodyCode).toContain("'-infinity'::date");
    expect(bodyCode).toContain("p_through_date < p_from_date");
    expect(bodyCode).toContain("occurrence_range_invalid");
  });

  it("caps the inclusive window at 366 days (diff <= 365) with occurrence_range_too_large", () => {
    expect(bodyCode).toMatch(/\(p_through_date - p_from_date\) > 365/);
    expect(bodyCode).toContain("occurrence_range_too_large");
  });
});

describe("5E.2B — candidate generation and eligibility", () => {
  it("generates dates via generate_series over integers cast back to date (no timestamptz series)", () => {
    expect(bodyCode).toMatch(/greatest\(p_from_date, s\.starts_on\)::integer/);
    expect(bodyCode).toMatch(
      /least\(p_through_date, COALESCE\(s\.ends_on, p_through_date\)\)::integer/,
    );
    expect(bodyCode).toMatch(/generate_series\(/);
    expect(bodyCode).not.toMatch(/generate_series\(\s*now/i);
    expect(bodyCode).not.toMatch(/generate_series\([^)]*timestamptz/i);
  });

  it("materializes only active schedules", () => {
    expect(bodyCode).toMatch(/s\.is_active = true/);
  });

  it("requires an active workspace member", () => {
    expect(bodyCode).toMatch(/JOIN public\.workspace_members wm/);
    expect(bodyCode).toMatch(/wm\.id = s\.workspace_member_id/);
    expect(bodyCode).toMatch(/wm\.status = 'active'/);
  });

  it("clips candidates to inclusive starts_on / ends_on bounds", () => {
    expect(bodyCode).toMatch(/greatest\(p_from_date, s\.starts_on\)/);
    expect(bodyCode).toMatch(/COALESCE\(s\.ends_on, p_through_date\)/);
  });

  it("'once' materializes only on starts_on", () => {
    expect(bodyCode).toMatch(
      /s\.frequency = 'once' AND \(gs\.d\)::date = s\.starts_on/,
    );
  });

  it("'daily' materializes every eligible day", () => {
    expect(bodyCode).toMatch(/OR s\.frequency = 'daily'/);
  });

  it("'weekly' is anchored on starts_on with a seven-day modulo (date difference)", () => {
    expect(bodyCode).toMatch(
      /\(s\.frequency = 'weekly' AND \(\(gs\.d\)::date - s\.starts_on\) % 7 = 0\)/,
    );
  });

  it("'specific_weekdays' uses ISODOW (1=Monday..7=Sunday) against s.weekdays", () => {
    expect(bodyCode).toMatch(/EXTRACT\(ISODOW FROM \(gs\.d\)::date\)/);
    expect(bodyCode).toMatch(/= ANY \(s\.weekdays\)/);
  });
});

describe("5E.2B — timezone conversion", () => {
  it("derives due_at from occurrence_date + due_local_time AT TIME ZONE s.timezone", () => {
    expect(bodyCode).toMatch(
      /\(\(\(gs\.d\)::date \+ s\.due_local_time\) AT TIME ZONE s\.timezone\)/,
    );
  });

  it("embeds no fixed timezone (no America/*, no UTC)", () => {
    expect(bodyCode).not.toMatch(/America\/[A-Za-z_]+/);
    expect(bodyCode).not.toMatch(/\bUTC\b/);
  });
});

describe("5E.2B — idempotency and historical truth", () => {
  it("inserts only schedule_id, occurrence_date and due_at", () => {
    expect(bodyCode).toMatch(
      /INSERT INTO public\.checklist_execution_occurrences\s*\(\s*schedule_id, occurrence_date, due_at\s*\)/,
    );
  });

  it("has exactly one INSERT, and only into the occurrences table", () => {
    expect((bodyCode.match(/INSERT INTO/gi) ?? []).length).toBe(1);
    expect(bodyCode).not.toMatch(/INSERT INTO(?! public\.checklist_execution_occurrences)/i);
  });

  it("uses ON CONFLICT (schedule_id, occurrence_date) DO NOTHING", () => {
    expect(bodyCode).toMatch(
      /ON CONFLICT \(schedule_id, occurrence_date\) DO NOTHING/,
    );
  });

  it("never updates or deletes occurrences (no UPDATE/DELETE statements at all)", () => {
    expect(bodyCode).not.toMatch(/\bUPDATE\b/i);
    expect(bodyCode).not.toMatch(/\bDELETE\b/i);
    expect(bodyCode).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("returns the number of rows actually inserted", () => {
    expect(bodyCode).toMatch(/RETURNING 1/);
    expect(bodyCode).toMatch(/SELECT COUNT\(\*\)::int INTO v_inserted/);
    expect(bodyCode).toMatch(/RETURN v_inserted/);
  });
});

describe("5E.2B — privileges", () => {
  it("revokes ALL exactly from PUBLIC, anon and authenticated", () => {
    expect(privilegeStatements).toContain(
      "REVOKE ALL ON FUNCTION public.materialize_checklist_execution_occurrences(date, date) FROM PUBLIC, anon, authenticated",
    );
  });

  it("grants EXECUTE only to service_role", () => {
    expect(privilegeStatements).toContain(
      "GRANT EXECUTE ON FUNCTION public.materialize_checklist_execution_occurrences(date, date) TO service_role",
    );
    const grants = privilegeStatements.filter((s) => s.startsWith("GRANT"));
    expect(grants).toHaveLength(1);
    expect(grants[0]).not.toMatch(/TO\s+(PUBLIC|anon|authenticated)\b/i);
  });

  it("contains exactly two top-level statements beyond the function definition", () => {
    expect(otherStatements).toHaveLength(2);
  });
});

describe("5E.2B — migration scope guards", () => {
  it("creates no tables, indexes, policies, triggers or views", () => {
    expect(topCode).not.toMatch(/CREATE\s+(TABLE|TEMP\s+TABLE)/i);
    expect(topCode).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
    expect(topCode).not.toMatch(/CREATE\s+POLICY/i);
    expect(topCode).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i);
    expect(topCode).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?VIEW/i);
    expect(topCode).not.toMatch(/ALTER\s+TABLE/i);
    expect(topCode).not.toMatch(/DROP\s+TABLE/i);
  });

  it("performs no automatic invocation of the materializer at top level", () => {
    // The only top-level references to the function are its definition and
    // its REVOKE/GRANT privilege statements — never an invocation.
    expect(topCode).not.toMatch(
      /PERFORM\s+public\.materialize_checklist_execution_occurrences/i,
    );
    expect(topCode).not.toMatch(
      /SELECT\s+public\.materialize_checklist_execution_occurrences/i,
    );
    expect(topCode).not.toMatch(
      /CALL\s+public\.materialize_checklist_execution_occurrences/i,
    );
    expect(topCode).not.toMatch(/\bPERFORM\b/i);
    expect(topCode).not.toMatch(/\bCALL\b/i);
  });

  it("contains no DML, seed, cron, db push or remote-SQL statements at top level", () => {
    expect(topCode).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(topCode).not.toMatch(/\bUPDATE\s+\S+\s+SET\b/i);
    expect(topCode).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(topCode).not.toMatch(/\bseed\b/i);
    expect(topCode).not.toMatch(/\bcron\b/i);
    expect(topCode).not.toMatch(/\bdb\s+push\b/i);
    expect(topCode).not.toMatch(/migration\s+repair/i);
    expect(topCode).not.toMatch(/\bdblink\b/i);
  });

  it("never references checklist_assignments or legacy task materialization", () => {
    expect(topCode).not.toMatch(/checklist_assignments/i);
    expect(bodyCode).not.toMatch(/checklist_assignments/i);
    expect(migration).not.toMatch(/materialize_task_executions/i);
    expect(migration).not.toMatch(/\btask_executions\b/i);
    expect(migration).not.toMatch(/complete_assignment/i);
  });
});

describe("5E.2B — applied migrations remain immutable", () => {
  it("leaves 20260910120000 byte-identical (SHA-256 unchanged)", () => {
    const applied = readFileSync(resolve(process.cwd(), APPLIED_5E2A_PATH));
    expect(createHash("sha256").update(applied).digest("hex")).toBe(
      APPLIED_5E2A_SHA256,
    );
  });

  it("leaves 20260911120000 byte-identical (SHA-256 unchanged)", () => {
    const applied = readFileSync(resolve(process.cwd(), APPLIED_5E2A6_PATH));
    expect(createHash("sha256").update(applied).digest("hex")).toBe(
      APPLIED_5E2A6_SHA256,
    );
  });
});
