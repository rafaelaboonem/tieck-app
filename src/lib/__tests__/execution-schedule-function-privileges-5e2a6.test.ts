/**
 * Execution 5E.2A.6 — structural assertions over the privilege-hardening
 * migration. Content-based (no line numbers), CRLF-safe, and scope guards
 * run over statements only (SQL line comments stripped) to avoid false
 * positives from explanatory prose.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { resolve } from "path";

const MIGRATION_PATH =
  "supabase/migrations/20260911120000_5e2a6_restrict_integrity_function_execute.sql";

const APPLIED_MIGRATION_PATH =
  "supabase/migrations/20260910120000_5e2a_execution_schedules_occurrences.sql";

const APPLIED_MIGRATION_SHA256 =
  "dfb5e133bbc9c42f062727e859d811d5697ac3f11690cf2c3c45c1fd13b3def4";

const FUNCTION_NAME = "public.checklist_execution_schedule_integrity()";

const migration = readFileSync(resolve(process.cwd(), MIGRATION_PATH), "utf8");

// Statements only — strip SQL line comments so scope guards check real
// statements, not prose (a comment mentioning "seed" must not fail).
const code = migration.replace(/^\s*--.*$/gm, "");

// Normalize whitespace so multi-line statements compare predictably.
const statements = code
  .split(";")
  .map((s) => s.replace(/\s+/g, " ").trim())
  .filter(Boolean);

describe("5E.2A.6 migration — privilege hardening", () => {
  it("targets exactly the integrity trigger function", () => {
    for (const statement of statements) {
      expect(statement).toContain(FUNCTION_NAME);
    }
  });

  it("revokes ALL from PUBLIC, anon and authenticated", () => {
    const revokes = statements.filter((s) => s.startsWith("REVOKE"));
    expect(revokes).toHaveLength(1);
    expect(revokes[0].replace(/\s+/g, " ")).toBe(
      "REVOKE ALL ON FUNCTION public.checklist_execution_schedule_integrity() FROM PUBLIC, anon, authenticated",
    );
  });

  it("grants EXECUTE to service_role only", () => {
    const grants = statements.filter((s) => s.startsWith("GRANT"));
    expect(grants).toHaveLength(1);
    expect(grants[0].replace(/\s+/g, " ")).toBe(
      "GRANT EXECUTE ON FUNCTION public.checklist_execution_schedule_integrity() TO service_role",
    );
  });

  it("contains no other statements beyond the single REVOKE and GRANT", () => {
    expect(statements).toHaveLength(2);
  });

  it("grants nothing to PUBLIC, anon or authenticated", () => {
    const forbiddenTargets = /TO\s+(PUBLIC|anon|authenticated)\b/i;
    for (const statement of statements.filter((s) => s.startsWith("GRANT"))) {
      expect(forbiddenTargets.test(statement)).toBe(false);
    }
  });
});

describe("5E.2A.6 migration — scope guards (statements only)", () => {
  it("does not create, alter or drop tables", () => {
    expect(code).not.toMatch(/CREATE\s+(TABLE|TEMP\s+TABLE)/i);
    expect(code).not.toMatch(/ALTER\s+TABLE/i);
    expect(code).not.toMatch(/DROP\s+TABLE/i);
  });

  it("does not recreate or alter the function body", () => {
    expect(code).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
    expect(code).not.toMatch(/ALTER\s+FUNCTION/i);
    expect(code).not.toMatch(/\$\$/); // no dollar-quoted function body
  });

  it("does not create, alter or drop triggers or policies", () => {
    expect(code).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i);
    expect(code).not.toMatch(/DROP\s+TRIGGER/i);
    expect(code).not.toMatch(/ALTER\s+TRIGGER/i);
    expect(code).not.toMatch(/CREATE\s+POLICY/i);
    expect(code).not.toMatch(/DROP\s+POLICY/i);
    expect(code).not.toMatch(/ALTER\s+POLICY/i);
  });

  it("contains no DML against data", () => {
    expect(code).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(code).not.toMatch(/\bUPDATE\s+\S+\s+SET\b/i);
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(code).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("contains no deployment, repair, seed, cron or remote-SQL statements", () => {
    expect(code).not.toMatch(/\bdb\s+push\b/i);
    expect(code).not.toMatch(/migration\s+repair/i);
    expect(code).not.toMatch(/\bseed\b/i);
    expect(code).not.toMatch(/\bcron\b/i);
    expect(code).not.toMatch(/\bdblink\b/i);
    expect(code).not.toMatch(/\bpg_catalog\.pg_ls_dir\b/i);
  });
});

describe("5E.2A.6 — immutability of the applied migration", () => {
  it("leaves 20260910120000 byte-identical (SHA-256 unchanged)", () => {
    const applied = readFileSync(resolve(process.cwd(), APPLIED_MIGRATION_PATH));
    expect(createHash("sha256").update(applied).digest("hex")).toBe(
      APPLIED_MIGRATION_SHA256,
    );
  });
});
