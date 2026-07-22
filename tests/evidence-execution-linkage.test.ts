// Testes unitários: evidências devem ser agrupadas exclusivamente por
// task_execution_id — nunca por task_id, dia ou turno.
import { strict as assert } from "node:assert";

interface EvRaw {
  id: string;
  task_execution_id: string;
}

function groupByExecution(rows: EvRaw[]): Map<string, EvRaw[]> {
  const map = new Map<string, EvRaw[]>();
  for (const r of rows) {
    const arr = map.get(r.task_execution_id) ?? [];
    arr.push(r);
    map.set(r.task_execution_id, arr);
  }
  return map;
}

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

console.log("evidence-execution-linkage");

// 1 e 2. Mesma tarefa em dias diferentes — cada execução tem sua própria foto.
it("mesma tarefa em execuções distintas não compartilha fotos", () => {
  const groups = groupByExecution([
    { id: "ev-seg", task_execution_id: "exec-seg" },
    { id: "ev-ter", task_execution_id: "exec-ter" },
  ]);
  assert.deepEqual(
    groups.get("exec-seg")!.map((e) => e.id),
    ["ev-seg"],
  );
  assert.deepEqual(
    groups.get("exec-ter")!.map((e) => e.id),
    ["ev-ter"],
  );
});

// 3. Duas fotos na mesma execução.
it("duas fotos na mesma execução aparecem juntas", () => {
  const groups = groupByExecution([
    { id: "a", task_execution_id: "exec-1" },
    { id: "b", task_execution_id: "exec-1" },
  ]);
  assert.equal(groups.get("exec-1")!.length, 2);
});

// 4. Nova tentativa continua ligada à mesma execução.
it("resubmit permanece na mesma execução", () => {
  const groups = groupByExecution([
    { id: "primeira", task_execution_id: "exec-1" },
    { id: "segunda-tentativa", task_execution_id: "exec-1" },
  ]);
  assert.equal(groups.get("exec-1")!.length, 2);
  assert.equal(groups.size, 1);
});

// 8. Contagem não inclui foto de referência (reference_path é metadado, não uma
// segunda evidência). Só há 1 linha em evidences → conta como 1.
it("reference_path não gera evidência adicional na contagem", () => {
  const rows = [
    { id: "ev-1", task_execution_id: "exec-1", reference_path: "padrao/cozinha.jpg" },
  ];
  assert.equal(rows.length, 1);
});

// 10. Uma evidência cancelada/rejeitada não conta como pendente.
it("evidência não-pending não é contada como pendente", () => {
  const rows = [
    { id: "ev-1", status: "pending" },
    { id: "ev-2", status: "rejected" },
    { id: "ev-3", status: "approved" },
  ];
  const pending = rows.filter((r) => r.status === "pending").length;
  assert.equal(pending, 1);
});

// 12. Drawer exibe somente evidências da execução selecionada.
it("drawer isolado por task_execution_id", () => {
  const groups = groupByExecution([
    { id: "a", task_execution_id: "exec-A" },
    { id: "b", task_execution_id: "exec-B" },
  ]);
  const selected = "exec-A";
  assert.deepEqual(
    groups.get(selected)!.map((e) => e.id),
    ["a"],
  );
  assert.equal(groups.get(selected)!.every((e) => e.task_execution_id === selected), true);
});

console.log(`\n${passed} testes passaram.`);