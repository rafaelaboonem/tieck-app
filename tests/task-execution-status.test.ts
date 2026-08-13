// Testes puros da derivação de status das execuções.
// Executar com: bun tests/task-execution-status.test.ts
import { strict as assert } from "node:assert";
import {
  deriveTaskStatus,
  delayMinutes,
  isCriticalFailure,
} from "../src/lib/task-execution-status";

const now = new Date("2026-07-12T14:00:00Z");
let passed = 0;
function it(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}\n    ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

console.log("task-execution-status");

it("pending futura → programada", () => {
  assert.equal(
    deriveTaskStatus({ status: "pending", scheduledAt: "2026-07-12T18:00:00Z", now }),
    "programada",
  );
});
it("pending vencida → atrasada", () => {
  assert.equal(
    deriveTaskStatus({ status: "pending", scheduledAt: "2026-07-12T10:00:00Z", now }),
    "atrasada",
  );
});
it("done no prazo", () => {
  assert.equal(
    deriveTaskStatus({
      status: "done",
      scheduledAt: "2026-07-12T10:00:00Z",
      executedAt: "2026-07-12T09:55:00Z",
      now,
    }),
    "concluida_no_prazo",
  );
});
it("done com atraso", () => {
  assert.equal(
    deriveTaskStatus({
      status: "done",
      scheduledAt: "2026-07-12T10:00:00Z",
      executedAt: "2026-07-12T10:30:00Z",
      now,
    }),
    "concluida_com_atraso",
  );
});
it("crítica vencida → falha crítica", () => {
  const s = deriveTaskStatus({ status: "pending", scheduledAt: "2026-07-12T10:00:00Z", now });
  assert.equal(isCriticalFailure("critica", s), true);
});
it("crítica futura NÃO é falha", () => {
  const s = deriveTaskStatus({ status: "pending", scheduledAt: "2026-07-12T18:00:00Z", now });
  assert.equal(isCriticalFailure("critica", s), false);
});
it("cancelled → cancelada e fora de falha crítica", () => {
  const s = deriveTaskStatus({ status: "cancelled", scheduledAt: "2026-07-12T10:00:00Z", now });
  assert.equal(s, "cancelada");
  assert.equal(isCriticalFailure("critica", s), false);
});
it("delayMinutes calcula corretamente", () => {
  assert.equal(delayMinutes("2026-07-12T10:00:00Z", "2026-07-12T10:30:00Z"), 30);
  assert.equal(delayMinutes("2026-07-12T10:00:00Z", "2026-07-12T09:55:00Z"), null);
  assert.equal(delayMinutes("2026-07-12T10:00:00Z", null), null);
});

console.log(`\n${passed} testes passaram.`);