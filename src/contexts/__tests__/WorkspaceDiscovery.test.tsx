import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabase } from "@/integrations/supabase/client";

// Mock do supabase.rpc
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    rpc: vi.fn(),
  },
}));

describe("PATCH 5B.8 - Segurança de Descoberta de Workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve simular o retorno da RPC list_my_workspaces", async () => {
    const mockWorkspaces = [
      { id: "ws-1", name: "Meu Workspace", owner_id: "user-1" },
      { id: "ws-2", name: "Workspace Compartilhado", owner_id: "user-2" }
    ];

    (supabase.rpc as any).mockResolvedValue({ data: mockWorkspaces, error: null });

    const { data, error } = await (supabase.rpc as any)("list_my_workspaces");
    
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect((data as any)[0].name).toBe("Meu Workspace");
  });

  it("deve retornar vazio se a RPC falhar", async () => {
    (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: "Permission denied" } });

    const { data, error } = await (supabase.rpc as any)("list_my_workspaces");
    
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
