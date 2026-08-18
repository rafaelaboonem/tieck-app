import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkspaceRBAC } from '../useWorkspaceRBAC';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';

vi.mock('@/contexts/AuthContext');
vi.mock('@tanstack/react-query');
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('useWorkspaceRBAC - Canonical Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return loading=true when role is still being fetched', async () => {
    (useAuth as any).mockReturnValue({ user: { id: 'user-1' } });
    (useQuery as any).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
    });

    const { result } = renderHook(() => useWorkspaceRBAC('ws-1'));

    expect(result.current.loading).toBe(true);
    expect(result.current.hasAccess).toBe(false);
  });

  it('should resolve to viewer role via RPC', async () => {
    (useAuth as any).mockReturnValue({ user: { id: 'user-1' } });
    (useQuery as any).mockReturnValue({
      data: {
        role: 'viewer',
        workspaceMemberId: 'member-1',
        isOwner: false
      },
      isLoading: false,
      isFetching: false,
    });

    const { result } = renderHook(() => useWorkspaceRBAC('ws-1'));

    expect(result.current.loading).toBe(false);
    expect(result.current.isViewer).toBe(true);
    expect(result.current.role).toBe('viewer');
    expect(result.current.workspaceMemberId).toBe('member-1');
    expect(result.current.hasAccess).toBe(true);
  });
});
