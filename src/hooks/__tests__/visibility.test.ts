import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWorkspaceRBAC } from '../useWorkspaceRBAC';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useQuery } from '@tanstack/react-query';

vi.mock('@/contexts/AuthContext');
vi.mock('@/contexts/WorkspaceContext');
vi.mock('@tanstack/react-query');
vi.mock('@/integrations/supabase/client', () => ({
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

describe('useWorkspaceRBAC - Fail-Closed Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return loading=true when role is still being fetched', async () => {
    (useAuth as any).mockReturnValue({ user: { id: 'user-1' } });
    (useWorkspace as any).mockReturnValue({ workspaces: [] });
    (useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
    });

    const { result } = renderHook(() => useWorkspaceRBAC('ws-1'));

    expect(result.current.loading).toBe(true);
    expect(result.current.isViewer).toBe(false);
    expect(result.current.canManage).toBe(false);
  });

  it('should resolve to viewer role and loading=false', async () => {
    (useAuth as any).mockReturnValue({ user: { id: 'user-1' } });
    (useWorkspace as any).mockReturnValue({ workspaces: [] });
    (useQuery as any).mockReturnValue({
      data: 'viewer',
      isLoading: false,
      isFetching: false,
    });

    const { result } = renderHook(() => useWorkspaceRBAC('ws-1'));

    expect(result.current.loading).toBe(false);
    expect(result.current.isViewer).toBe(true);
    expect(result.current.role).toBe('viewer');
  });

  it('should resolve to owner role and loading=false', async () => {
    (useAuth as any).mockReturnValue({ user: { id: 'owner-id' } });
    (useWorkspace as any).mockReturnValue({ 
      workspaces: [{ id: 'ws-1', owner_id: 'owner-id' }] 
    });
    (useQuery as any).mockReturnValue({
      data: 'owner',
      isLoading: false,
      isFetching: false,
    });

    const { result } = renderHook(() => useWorkspaceRBAC('ws-1'));

    expect(result.current.loading).toBe(false);
    expect(result.current.canManage).toBe(true);
    expect(result.current.role).toBe('owner');
  });
});
