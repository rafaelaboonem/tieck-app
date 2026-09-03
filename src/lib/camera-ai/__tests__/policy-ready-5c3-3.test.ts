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
  it("permite testar com policy válida e hash atual", async () => {
    const policy = await policyFor("Pergunta", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição", policy, isPersisted: true })).toBe(true);
  });

  it("bloqueia policy stale", async () => {
    const policy = await policyFor("Pergunta antiga", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta atual", description: "Descrição", policy, isPersisted: true })).toBe(false);
  });

  it("bloqueia durante compile", async () => {
    const policy = await policyFor("Pergunta", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição", policy, isCompiling: true, isPersisted: true })).toBe(false);
  });

  it("bloqueia quando precisa de revalidação ou não está persistida", async () => {
    const policy = await policyFor("Pergunta", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição", policy, needsRevalidation: true, isPersisted: true })).toBe(false);
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição", policy, isPersisted: false })).toBe(false);
  });
});
