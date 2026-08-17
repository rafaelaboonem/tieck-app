import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WorkspacePage } from '../../routes/organizar';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import React from 'react';

// Mocks
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (path: string) => (opts: any) => ({
    useSearch: () => ({ id: 'ws-active' }),
    head: () => ({}),
    validateSearch: (s: any) => s,
  }),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/organizar', search: '?id=ws-active' }),
  useSearch: () => ({ id: 'ws-active' }),
  Link: ({ children }: any) => <div>{children}</div>,
}));

const mockQuery = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  single: vi.fn().mockResolvedValue({ data: null, error: null }),
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'viewer-123' } } }),
    },
    from: vi.fn(() => mockQuery),
  },
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/contexts/SidebarContext', () => ({
  useSidebar: () => ({ sidebarOpen: true }),
}));

describe('Workspace Full Route Audit (Fase 4B.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not crash if workspace_categories delete fails (Viewer RLS)', async () => {
    const mockWs = { id: 'ws-active', name: 'Team Workspace', owner_id: 'owner-789' };
    (useWorkspace as any).mockReturnValue({
      currentWorkspace: mockWs,
      workspaces: [mockWs],
      isLoading: false,
      refreshWorkspaces: vi.fn(),
      setCurrentWorkspace: vi.fn(),
    });
    (useAuth as any).mockReturnValue({ user: { id: 'viewer-123' }, loading: false });

    // Simulate RLS failure on delete (Viewers can't delete)
    mockQuery.delete.mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: { message: 'Permission denied', code: '42501' } })
    });

    // Mock successful fetch for checklists and other data
    mockQuery.select.mockImplementation((arg) => {
        if (typeof arg === 'string' && arg.includes('role')) {
            return { eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { role: 'viewer' } }) }) }) }) };
        }
        return mockQuery;
    });

    render(<WorkspacePage />);

    await waitFor(() => {
      // The page should still render and finish loading despite the delete error
      expect(screen.queryByText(/Erro de carregamento/i)).toBeNull();
    }, { timeout: 3000 });
  });
});
