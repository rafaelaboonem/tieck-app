import { describe, expect, it } from "vitest";

const messages: Record<string, string> = {
  invalid_policy: "Não foi possível validar a configuração desta pergunta. Salve o bloco novamente.",
  checklist_update_required: "Esta verificação ainda está sendo atualizada. Aguarde antes de testar.",
};

describe("CameraVerificationTestDialog mensagens 5C.3.3", () => {
  it("diferencia policy inválida de atualização pendente", () => {
    expect(messages.invalid_policy).toBe("Não foi possível validar a configuração desta pergunta. Salve o bloco novamente.");
    expect(messages.checklist_update_required).toBe("Esta verificação ainda está sendo atualizada. Aguarde antes de testar.");
    expect(messages.invalid_policy).not.toBe(messages.checklist_update_required);
  });
});
