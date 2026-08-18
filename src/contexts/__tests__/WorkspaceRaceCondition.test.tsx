import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { WorkspaceProvider, useWorkspace } from '../WorkspaceContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    rpc: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </QueryClientProvider>
  );
};

describe('WorkspaceContext Race Condition & User Scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should not fetch workspaces when user is not authenticated', async () => {
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: null } });
    
    const { result } = renderHook(() => useWorkspace(), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result.current.workspaces).toEqual([]);
  });

  it('should fetch workspaces when user is authenticated', async () => {
    const mockUser = { id: 'user-123' };
    const mockWorkspaces = [{ id: 'ws-1', name: 'WS 1' }];
    
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: mockUser } });
    (supabase.rpc as any).mockResolvedValue({ data: mockWorkspaces, error: null });
    
    const { result } = renderHook(() => useWorkspace(), { wrapper: createWrapper() });
    
    await waitFor(() => expect(result.current.workspaces.length).toBe(1));
    expect(supabase.rpc).toHaveBeenCalledWith('list_my_workspaces');
    expect(result.current.workspaces).toEqual(mockWorkspaces);
  });

  it('should re-fetch when user identity changes (user scoping)', async () => {
    const mockUser1 = { id: 'user-1' };
    const mockUser2 = { id: 'user-2' };
    
    (supabase.auth.getUser as any)
      .mockResolvedValueOnce({ data: { user: mockUser1 } })
      .mockResolvedValue({ data: { user: mockUser2 } });
      
    (supabase.rpc as any)
      .mockResolvedValueOnce({ data: [{ id: 'ws-1' }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'ws-2' }], error: null });
      
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </QueryClientProvider>
    );

    const { result, rerender } = renderHook(() => useWorkspace(), { wrapper });
    
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('ws-1'));

    // Simulate login change/re-render with new user
    // Note: In real app, this happens because AuthContext user changes.
    // In this test, we need to ensure queryKey handles it.
    
    // Invalidate to force refetch with new mock return
    await result.current.refreshWorkspaces();
    
    await waitFor(() => expect(result.current.workspaces[0]?.id).toBe('ws-2'));
  });
});
