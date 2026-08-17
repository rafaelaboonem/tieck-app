import { renderHook, waitFor, render, screen } from "@testing-library/react";
import { Dashboard } from "./inicio";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useWorkspaceRBAC } from "@/hooks/useWorkspaceRBAC";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { supabase } from "@/integrations/supabase/client";

// Mock dependencies
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: vi.fn(),
}));

vi.mock("@/hooks/useWorkspaceRBAC", () => ({
  useWorkspaceRBAC: vi.fn(),
}));

vi.mock("@/contexts/SidebarContext", () => ({
  useSidebar: vi.fn(() => ({ sidebarOpen: true })),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: vi.fn(() => () => ({})),
  useNavigate: vi.fn(() => vi.fn()),
  useLocation: vi.fn(() => ({ pathname: "/inicio" })),
  Link: ({ children }: any) => <a>{children}</a>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            is: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
        is: vi.fn(() => ({
          is: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe("Phase 4B.9 - Stability Tests (Flash Prevention)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it("Dashboard (/inicio) should not flicker loading when user identity is stable", async () => {
    const mockUser = { id: "user-123", email: "test@example.com" };
    (useAuth as any).mockReturnValue({ user: mockUser, loading: false, needsEmailConfirmation: false });
    (useWorkspace as any).mockReturnValue({ currentWorkspace: { id: "ws-1" }, workspaceStatus: "workspace" });
    (useWorkspaceRBAC as any).mockReturnValue({ canManage: true, loading: false });

    const { rerender } = render(<Dashboard />, { wrapper });

    // Initial load check - not showing skeleton
    expect(screen.queryByTestId("skeleton")).toBeNull();

    // Simulate TOKEN_REFRESHED where user object is new but ID is the same
    const sameUserNewRef = { ...mockUser };
    (useAuth as any).mockReturnValue({ user: sameUserNewRef, loading: false, needsEmailConfirmation: false });

    rerender(<Dashboard />);

    // Should NOT show loading/skeleton because user.id is stable
    expect(screen.queryByTestId("skeleton")).toBeNull();
  });
});
