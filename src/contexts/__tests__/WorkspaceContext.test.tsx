import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WorkspaceProvider, useWorkspace } from '../WorkspaceContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';

// Mock Supabase
const mockWorkspaces = [
  { id: 'ws-1', name: 'Workspace 1', owner_id: 'test-user', icon: null, icon_url: null },
  { id: 'ws-2', name: 'Workspace 2', owner_id: 'test-user', icon: null, icon_url: null }
];

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
      then: vi.fn().mockImplementation((cb) => cb({ data: mockWorkspaces, error: null })),
    }),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: 0,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <WorkspaceProvider>{children}</WorkspaceProvider>
  </QueryClientProvider>
);

describe('WorkspaceContext Determinístico (Patch 5B.5)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    queryClient.clear();
    
    // Mock window.location and history
    const loc = {
      search: '',
      pathname: '/inicio',
      href: 'http://localhost/inicio'
    };
    vi.stubGlobal('location', loc);
    vi.stubGlobal('history', {
      replaceState: vi.fn()
    });
  });

  it('deve priorizar URL sobre localStorage "personal"', async () => {
    localStorage.setItem('currentWorkspaceId', 'personal');
    // Simular ?workspace=ws-2
    vi.stubGlobal('location', {
      search: '?workspace=ws-2',
      pathname: '/inicio',
      href: 'http://localhost/inicio?workspace=ws-2'
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });
    
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    
    expect(result.current.workspaceStatus).toBe('workspace');
    expect(result.current.currentWorkspace?.id).toBe('ws-2');
  });

  it('deve restaurar preferência ws-1 válida', async () => {
    localStorage.setItem('currentWorkspaceId', 'ws-1');
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    
    expect(result.current.workspaceStatus).toBe('workspace');
    expect(result.current.currentWorkspace?.id).toBe('ws-1');
  });

  it('deve restaurar Pessoal se preferência for personal e URL vazia', async () => {
    localStorage.setItem('currentWorkspaceId', 'personal');
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    
    expect(result.current.workspaceStatus).toBe('personal');
    expect(result.current.currentWorkspace).toBeNull();
  });

  it('deve selecionar outro workspace se a preferência for para um inexistente', async () => {
    localStorage.setItem('currentWorkspaceId', 'ws-deleted');
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    
    // Deve cair no bootstrap (primeiro workspace)
    expect(result.current.workspaceStatus).toBe('workspace');
    expect(result.current.currentWorkspace?.id).toBe('ws-1');
  });

  it('deve usar fallback se a URL tiver workspace inexistente', async () => {
    vi.stubGlobal('location', {
      search: '?workspace=ws-invalid',
      pathname: '/inicio',
      href: 'http://localhost/inicio?workspace=ws-invalid'
    });
    
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    
    // URL inválida -> ignora e usa bootstrap/preferência
    expect(result.current.workspaceStatus).toBe('workspace');
    expect(result.current.currentWorkspace?.id).toBe('ws-1');
  });

  it('deve resultar em Pessoal se não houver workspaces', async () => {
    // Override do mock para retornar vazio
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => cb({ data: [], error: null })),
    } as any);

    const { result } = renderHook(() => useWorkspace(), { wrapper });
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));
    
    expect(result.current.workspaceStatus).toBe('personal');
    expect(result.current.currentWorkspace).toBeNull();
  });
});
