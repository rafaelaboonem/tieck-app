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
  it("bloqueia imediatamente quando título ou descrição muda", async () => {
    const policy = await policyFor("Pergunta", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta nova", description: "Descrição", policy, isPersisted: true })).toBe(false);
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição nova", policy, isPersisted: true })).toBe(false);
  });

  it("não libera entre salvar e compilar", async () => {
    const policy = await policyFor("Pergunta", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição", policy, needsRevalidation: true, isPersisted: true })).toBe(false);
  });

  it("bloqueia durante compile e após falha", async () => {
    const policy = await policyFor("Pergunta", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição", policy, isCompiling: true, isPersisted: true })).toBe(false);
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição", policy, needsRevalidation: true, isPersisted: true })).toBe(false);
  });

  it("descarta resultado stale por hash diferente", async () => {
    const stalePolicy = await policyFor("Pergunta antiga", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta atual", description: "Descrição", policy: stalePolicy, isPersisted: true })).toBe(false);
  });

  it("libera somente com policy persistida e hash correto", async () => {
    const policy = await policyFor("Pergunta", "Descrição");
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição", policy, isPersisted: false })).toBe(false);
    expect(await isCameraPolicyReady({ title: "Pergunta", description: "Descrição", policy, isPersisted: true })).toBe(true);
  });
});
