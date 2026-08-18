import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWorkspaceRBAC } from "../useWorkspaceRBAC";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe("Phase 5B.12 - Viewer Navigation & Global Search", () => {
  const mockUser = { id: "user-123", email: "viewer@example.com" };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({ user: mockUser });
  });

  it("should block checklist creation command for Viewer in workspace context", () => {
    // A lógica de UI no DashboardLayout.tsx usa: {!(workspaceStatus === "workspace" && isWsViewer) && ...}
    // Aqui validamos se o hook retorna isViewer corretamente para essa condição
    (useQuery as any).mockReturnValue({
      data: { role: 'viewer', workspaceMemberId: 'mem-1', isOwner: false },
      isLoading: false,
      isFetching: false,
    });

    const { result } = renderHook(() => useWorkspaceRBAC("ws-123"));
    
    expect(result.current.isViewer).toBe(true);
    expect(result.current.canManage).toBe(false);
    
    // Condição da UI: !(workspaceStatus === "workspace" && isWsViewer)
    const workspaceStatus = "workspace";
    const isWsViewer = result.current.isViewer;
    const shouldShowCreate = !(workspaceStatus === "workspace" && isWsViewer);
    
    expect(shouldShowCreate).toBe(false);
  });

  it("should allow checklist creation command for Viewer in personal context", () => {
    (useQuery as any).mockReturnValue({
      data: { role: 'viewer', workspaceMemberId: 'mem-1', isOwner: false },
      isLoading: false,
      isFetching: false,
    });

    const { result } = renderHook(() => useWorkspaceRBAC("ws-123"));
    
    // Condição da UI: !(workspaceStatus === "workspace" && isWsViewer)
    const workspaceStatus = "personal" as string; // Bypass TS overlap check
    const isWsViewer = result.current.isViewer;
    const shouldShowCreate = !(workspaceStatus === "workspace" && isWsViewer);
    
    expect(shouldShowCreate).toBe(true);
  });

  it("should allow checklist creation command for Admin in workspace context", () => {
    (useQuery as any).mockReturnValue({
      data: { role: 'admin', workspaceMemberId: 'mem-2', isOwner: false },
      isLoading: false,
      isFetching: false,
    });

    const { result } = renderHook(() => useWorkspaceRBAC("ws-123"));
    
    expect(result.current.isViewer).toBe(false);
    
    const workspaceStatus = "workspace";
    const isWsViewer = result.current.isViewer;
    const shouldShowCreate = !(workspaceStatus === "workspace" && isWsViewer);
    
    expect(shouldShowCreate).toBe(true);
  });

  it("should maintain fail-closed state when RBAC is loading", () => {
    (useQuery as any).mockReturnValue({
      data: null,
      isLoading: true,
      isFetching: true,
    });

    const { result } = renderHook(() => useWorkspaceRBAC("ws-123"));
    
    expect(result.current.loading).toBe(true);
    expect(result.current.hasAccess).toBe(false);
    expect(result.current.canManage).toBe(false);
    expect(result.current.isViewer).toBe(false);
  });
});
