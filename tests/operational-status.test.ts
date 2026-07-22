// Testes puros do status operacional e da agregação ponderada.
// Executar com: bun tests/operational-status.test.ts
import { strict as assert } from "node:assert";
import { getOperationalStatus, aggregateWeighted } from "../src/lib/operational-status";
import { sanitizeFilters, defaultFilters } from "../src/lib/dashboard-filters";

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

console.log("operational-status");

it("sem atividade quando dueWeightTotal = 0", () => {
  assert.equal(
    getOperationalStatus({
      dueCompliancePercentage: null,
      dueWeightTotal: 0,
      criticalFailures: 0,
      overdueOpenTasks: 0,
      completedLate: 0,
    }),
    "sem_atividade",
  );
});

it("crítico por falha crítica prevalece sobre conformidade alta", () => {
  assert.equal(
    getOperationalStatus({
      dueCompliancePercentage: 95,
      dueWeightTotal: 10,
      criticalFailures: 1,
      overdueOpenTasks: 0,
      completedLate: 0,
    }),
    "critico",
  );
});

it("crítico quando due < 70%", () => {
  assert.equal(
    getOperationalStatus({
      dueCompliancePercentage: 55,
      dueWeightTotal: 10,
      criticalFailures: 0,
      overdueOpenTasks: 0,
      completedLate: 0,
    }),
    "critico",
  );
});

it("atenção quando due entre 70% e 90%", () => {
  assert.equal(
    getOperationalStatus({
      dueCompliancePercentage: 82,
      dueWeightTotal: 10,
      criticalFailures: 0,
      overdueOpenTasks: 0,
      completedLate: 0,
    }),
    "atencao",
  );
});

it("atenção por conclusão com atraso mesmo com 100%", () => {
  assert.equal(
    getOperationalStatus({
      dueCompliancePercentage: 100,
      dueWeightTotal: 10,
      criticalFailures: 0,
      overdueOpenTasks: 0,
      completedLate: 2,
    }),
    "atencao",
  );
});

it("atenção por tarefas abertas em atraso", () => {
  assert.equal(
    getOperationalStatus({
      dueCompliancePercentage: 100,
      dueWeightTotal: 10,
      criticalFailures: 0,
      overdueOpenTasks: 1,
      completedLate: 0,
    }),
    "atencao",
  );
});

it("no padrão quando due >= 90% e sem atrasos", () => {
  assert.equal(
    getOperationalStatus({
      dueCompliancePercentage: 93,
      dueWeightTotal: 10,
      criticalFailures: 0,
      overdueOpenTasks: 0,
      completedLate: 0,
    }),
    "padrao",
  );
});

it("unidade sem tarefas vencidas não é crítica por pct null", () => {
  assert.equal(
    getOperationalStatus({
      dueCompliancePercentage: null,
      dueWeightTotal: 0,
      criticalFailures: 0,
      overdueOpenTasks: 0,
      completedLate: 0,
    }),
    "sem_atividade",
  );
});

console.log("aggregateWeighted");

it("soma pesos antes do percentual (não é média simples)", () => {
  // Unidade A: 100% de 10; Unidade B: 0% de 90.
  // Média simples daria 50%. Ponderado correto: 10 / 100 = 10%.
  const v = aggregateWeighted([
    { weightDone: 10, weightTotal: 10 },
    { weightDone: 0, weightTotal: 90 },
  ]);
  assert.equal(v, 10);
});

it("retorna null quando total = 0", () => {
  assert.equal(aggregateWeighted([{ weightDone: 0, weightTotal: 0 }]), null);
});

it("agrega múltiplos dias corretamente", () => {
  const v = aggregateWeighted([
    { weightDone: 5, weightTotal: 10 }, // dia 1
    { weightDone: 8, weightTotal: 10 }, // dia 2
    { weightDone: 9, weightTotal: 10 }, // dia 3
  ]);
  assert.equal(v, 73.3);
});

console.log("sanitizeFilters");

it("preenche default de 7 dias quando ausente", () => {
  const f = sanitizeFilters({});
  const def = defaultFilters();
  assert.equal(f.startDate, def.startDate);
  assert.equal(f.endDate, def.endDate);
  assert.equal(f.unitId, undefined);
});

it("descarta datas inválidas e cai no default", () => {
  const f = sanitizeFilters({ startDate: "bogus", endDate: "2026-13-40" });
  const def = defaultFilters();
  assert.equal(f.startDate, def.startDate);
  assert.equal(f.endDate, def.endDate);
});

it("inverte start > end", () => {
  const f = sanitizeFilters({ startDate: "2026-07-11", endDate: "2026-07-01" });
  assert.equal(f.startDate, "2026-07-01");
  assert.equal(f.endDate, "2026-07-11");
});

it("aceita unitId string; remove vazio", () => {
  assert.equal(sanitizeFilters({ unitId: "abc" }).unitId, "abc");
  assert.equal(sanitizeFilters({ unitId: "" }).unitId, undefined);
});

console.log(`\n${passed} testes passaram.`);
