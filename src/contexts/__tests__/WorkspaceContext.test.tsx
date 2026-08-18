import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WorkspaceProvider, useWorkspace } from '../WorkspaceContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => cb({ data: [{ id: 'ws-1', name: 'Workspace 1', owner_id: 'test-user' }], error: null })),
    }),
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
  <QueryClientProvider client={queryClient}>
    <WorkspaceProvider>{children}</WorkspaceProvider>
  </QueryClientProvider>
);

describe('WorkspaceContext Determinístico', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('deve iniciar no primeiro workspace se não houver preferência salva e houver workspaces', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    
    // Aguarda o loading
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    
    expect(result.current.workspaceStatus).toBe('workspace');
    expect(result.current.currentWorkspace?.id).toBe('ws-1');
  });

  it('deve manter Pessoal após escolha explícita', async () => {
    localStorage.setItem('currentWorkspaceId', 'personal');
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    
    expect(result.current.workspaceStatus).toBe('personal');
    expect(result.current.currentWorkspace).toBeNull();
  });

  it('deve persistir escolha de workspace', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setCurrentWorkspace({ id: 'ws-1', name: 'Workspace 1', owner_id: 'test-user', icon: null, icon_url: null });
    });

    expect(localStorage.getItem('currentWorkspaceId')).toBe('ws-1');
  });

  it('deve persistir escolha de Pessoal usando sentinel', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setCurrentWorkspace(null);
    });

    expect(localStorage.getItem('currentWorkspaceId')).toBe('personal');
    expect(result.current.workspaceStatus).toBe('personal');
  });
});
