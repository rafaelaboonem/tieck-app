import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkspacePage } from '../../routes/organizar';
import { Dashboard } from '../../routes/inicio';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';

// Mocks
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({}),
  useNavigate: () => vi.fn(),
  useSearch: () => ({ id: 'ws-123' }),
  Link: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
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

describe('Workspace Context Isolation (Fase 4B.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should filter checklists by workspace_id in Organizar page', async () => {
    const mockWs = { id: 'ws-123', name: 'Work Team', owner_id: 'owner-456' };
    (useWorkspace as any).mockReturnValue({
      currentWorkspace: mockWs,
      workspaces: [mockWs],
      isLoading: false,
    });
    (useAuth as any).mockReturnValue({ user: { id: 'user-123' }, loading: false });

    render(<WorkspacePage />);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('checklists');
      expect(supabase.eq).toHaveBeenCalledWith('workspace_id', 'ws-123');
    });
  });

  it('should isolate personal checklists in Inicio page (workspace_id IS NULL)', async () => {
    (useWorkspace as any).mockReturnValue({ currentWorkspace: null, workspaces: [], isLoading: false });
    (useAuth as any).mockReturnValue({ user: { id: 'user-123' }, loading: false });

    render(<Dashboard />);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('checklists');
      expect(supabase.is).toHaveBeenCalledWith('workspace_id', null);
    });
  });
});
