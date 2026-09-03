import { describe, expect, it } from "vitest";
import { hashQuestion } from "../hashing";
import { isCameraPolicyReady } from "../policy-ready";

const policyFor = async (title: string, description: string) => ({
  version: 1 as const,
  verifiability: "visual" as const,
  target: "local",
  condition: "correto",
  targetDescription: "local",
  conditionDescription: "correto",
  requiredVisibleEvidence: [],
  rejectionSignals: [],
  notObservableSignals: [],
  summary: "Resumo",
  source: "generated" as const,
  questionHash: await hashQuestion(title, description),
});

describe("Camera AI 5C.3.3 policy ready barrier", () => {
  it("libera policy válida com hash atual", async () => {
    const policy = await policyFor("Pergunta", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição", policy })).toBe(true);
  });

  it("bloqueia policy stale", async () => {
    const policy = await policyFor("Pergunta antiga", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta atual", description: "Descrição", policy })).toBe(false);
  });

  it("bloqueia durante compile em andamento", async () => {
    const policy = await policyFor("Pergunta", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição", policy, isCompiling: true })).toBe(false);
  });

  it("bloqueia quando precisa de revalidação ou não existe policy", async () => {
    const policy = await policyFor("Pergunta", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição", policy, needsRevalidation: true })).toBe(false);
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição" })).toBe(false);
  });
});
