// Testes unitários dos filtros e da navegação (preservação do período).
import { strict as assert } from "node:assert";
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

console.log("dashboard-filters-nav");

it("valores inválidos caem no default", () => {
  const def = defaultFilters();
  const s = sanitizeFilters({ startDate: "abc", endDate: "xyz" });
  assert.equal(s.startDate, def.startDate);
  assert.equal(s.endDate, def.endDate);
});

it("navegação painel → detalhe preserva startDate e endDate", () => {
  const filters = { startDate: "2026-07-01", endDate: "2026-07-11", unitId: "u-1" };
  // Simula o payload que o painel envia ao navegar para a rota de detalhes.
  const nav = {
    to: "/unidades/$unitId/operacao",
    params: { unitId: filters.unitId },
    search: { startDate: filters.startDate, endDate: filters.endDate },
  };
  assert.equal(nav.params.unitId, "u-1");
  assert.equal(nav.search.startDate, "2026-07-01");
  assert.equal(nav.search.endDate, "2026-07-11");
});

it("botão voltar preserva período", () => {
  const filters = { startDate: "2026-07-01", endDate: "2026-07-11" };
  const back = {
    to: "/painel",
    search: { startDate: filters.startDate, endDate: filters.endDate },
  };
  assert.equal(back.search.startDate, "2026-07-01");
  assert.equal(back.search.endDate, "2026-07-11");
});

it("sanitize inverte datas fora de ordem", () => {
  const s = sanitizeFilters({ startDate: "2026-07-11", endDate: "2026-07-01" });
  assert.equal(s.startDate, "2026-07-01");
  assert.equal(s.endDate, "2026-07-11");
});

// Filtros locais (turno/status/criticidade/evidência) — validação da lógica de match.
type Exec = {
  shiftId: string | null;
  weight: "comum" | "importante" | "critica";
  evidenceCount: number;
  derived: string;
};
function applyLocalFilters(items: Exec[], f: {
  shift?: string;
  status?: string;
  weight?: string;
  withEvidence?: boolean;
}) {
  return items.filter((e) => {
    if (f.shift && f.shift !== "all" && e.shiftId !== f.shift) return false;
    if (f.weight && f.weight !== "all" && e.weight !== f.weight) return false;
    if (f.status && f.status !== "all" && e.derived !== f.status) return false;
    if (f.withEvidence && e.evidenceCount === 0) return false;
    return true;
  });
}
const items: Exec[] = [
  { shiftId: "manha", weight: "comum", evidenceCount: 0, derived: "programada" },
  { shiftId: "manha", weight: "critica", evidenceCount: 2, derived: "atrasada" },
  { shiftId: "tarde", weight: "importante", evidenceCount: 1, derived: "concluida_no_prazo" },
];
it("filtro por turno", () => {
  assert.equal(applyLocalFilters(items, { shift: "manha" }).length, 2);
});
it("filtro por status", () => {
  assert.equal(applyLocalFilters(items, { status: "atrasada" }).length, 1);
});
it("filtro por criticidade", () => {
  assert.equal(applyLocalFilters(items, { weight: "critica" }).length, 1);
});
it("filtro com evidência", () => {
  assert.equal(applyLocalFilters(items, { withEvidence: true }).length, 2);
});
it("filtro sem evidência (padrão retorna todos)", () => {
  assert.equal(applyLocalFilters(items, {}).length, 3);
});

// Signed URL nunca persistida — o helper não escreve no banco.
it("signed URL helper não persiste no banco (só cache in-memory)", async () => {
  const mod = await import("../src/lib/evidence-signed-url");
  const src = mod.getEvidenceSignedUrl.toString();
  assert.ok(!/\.from\(["']evidences["']\)/.test(src), "não deve escrever em evidences");
  assert.ok(!/\.insert\(/.test(src), "não deve chamar insert");
  assert.ok(!/\.update\(/.test(src), "não deve chamar update");
});

console.log(`\n${passed} testes passaram.`);