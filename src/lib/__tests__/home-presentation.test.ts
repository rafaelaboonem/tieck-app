import { describe, expect, it } from "vitest";
import {
  buildHomeGreeting,
  canCreateWorkspace,
  resolveFirstName,
} from "../home-presentation";

/**
 * Home 6B.2L — helpers PUROS de apresentação.
 * Provam: nome real (nunca e-mail, nunca inventado), saudação com fallback
 * neutro e o gate de criação de workspace idêntico ao do shell.
 */
describe("home-presentation (6B.2L)", () => {
  it("usa o primeiro nome da fonte mais confiável, na ordem perfil → metadata", () => {
    expect(resolveFirstName("Rafaela Boonem", "Outro Nome")).toBe("Rafaela");
    expect(resolveFirstName(null, "Rafaela Boonem")).toBe("Rafaela");
    expect(resolveFirstName(undefined, undefined, "rafaela")).toBe("Rafaela");
    expect(resolveFirstName("  Rafaela  ")).toBe("Rafaela");
  });

  it("não inventa nome quando não há fonte confiável", () => {
    expect(resolveFirstName()).toBeNull();
    expect(resolveFirstName(null, undefined, "", "   ")).toBeNull();
    expect(resolveFirstName(123 as unknown as string)).toBeNull();
  });

  it("saudação: nome real quando existe, fallback neutro quando não existe", () => {
    expect(buildHomeGreeting("Rafaela")).toEqual({
      title: "Bom dia, Rafaela.",
      subtitle: "Vamos organizar o que precisa da sua atenção hoje.",
    });
    expect(buildHomeGreeting(null)).toEqual({
      title: "Bom dia.",
      subtitle: "Vamos organizar o que precisa da sua atenção hoje.",
    });
  });

  it("gate de criação de workspace = mesma regra do shell", () => {
    expect(canCreateWorkspace({ isAdmin: true, workspaceCount: 3 })).toBe(true);
    expect(canCreateWorkspace({ isAdmin: false, workspaceCount: 0 })).toBe(true);
    expect(canCreateWorkspace({ isAdmin: undefined, workspaceCount: 0 })).toBe(true);
    expect(canCreateWorkspace({ isAdmin: false, workspaceCount: 2 })).toBe(false);
    expect(canCreateWorkspace({ isAdmin: null, workspaceCount: 1 })).toBe(false);
  });
});
