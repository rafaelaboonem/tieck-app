import { renderHook, waitFor } from "@testing-library/react";
import { useWorkspaceRBAC } from "./useWorkspaceRBAC";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Mock das dependências
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(),
          })),
        })),
      })),
    })),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe("useWorkspaceRBAC Performance and Cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it("should not set loading=true when background refetch happens", async () => {
    const mockUser = { id: "user-123" };
    const mockWorkspace = { id: "ws-123", owner_id: "user-123" };

    (useAuth as any).mockReturnValue({ user: mockUser });
    (useWorkspace as any).mockReturnValue({ workspaces: [mockWorkspace] });

    const { result, rerender } = renderHook(() => useWorkspaceRBAC("ws-123"), { wrapper });

    // Initial load
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("owner");

    // Simular mudança de referência no array de workspaces (o que causava o bug)
    // No código original, isso disparava o useEffect que definia loading=true.
    // Agora, o TanStack Query deve manter o cache.
    (useWorkspace as any).mockReturnValue({ workspaces: [{ ...mockWorkspace }] }); // Nova referência
    
    rerender();

    // Verificamos que o loading continua false
    expect(result.current.loading).toBe(false);
    expect(result.current.role).toBe("owner");
    
    // Mesmo forçando uma revalidação via queryClient
    await queryClient.refetchQueries({ queryKey: ["workspace-role", "user-123", "ws-123", "user-123"] });
    
    expect(result.current.loading).toBe(false);
    expect(result.current.role).toBe("owner");

  it("should return neutral state (loading=true, role=null) when switching workspace without cache", async () => {
    const mockUser = { id: "user-123" };
    const mockWorkspace1 = { id: "ws-1", owner_id: "user-123" };
    const mockWorkspace2 = { id: "ws-2", owner_id: "other-user" };

    (useAuth as any).mockReturnValue({ user: mockUser });
    (useWorkspace as any).mockReturnValue({ workspaces: [mockWorkspace1, mockWorkspace2] });

    const { result, rerender } = renderHook(({ wsId }) => useWorkspaceRBAC(wsId), { 
      wrapper,
      initialProps: { wsId: "ws-1" }
    });

    // Load first workspace
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("owner");

    // Switch to second workspace (which has no cache yet)
    rerender({ wsId: "ws-2" });

    // With placeholderData removed, it should NOT inherit "owner"
    // It should go back to loading state for the new key
    expect(result.current.role).toBe(null);
    expect(result.current.loading).toBe(true);
  });
});
