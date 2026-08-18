import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkspaceRBAC } from './useWorkspaceRBAC';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useQuery } from '@tanstack/react-query';

// Mock contexts and hooks
vi.mock('@/contexts/AuthContext');
vi.mock('@/contexts/WorkspaceContext');
vi.mock('@tanstack/react-query');
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn()
          }))
        }))
      }))
    }))
  }
}));

describe('useWorkspaceRBAC Navigation logic', () => {
  const mockUser = { id: 'user-123' };
  const mockWorkspace = { id: 'ws-123', owner_id: 'owner-456' };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({ user: mockUser });
    (useWorkspace as any).mockReturnValue({ workspaces: [mockWorkspace] });
  });

  it('identifies OWNER role correctly', () => {
    (useAuth as any).mockReturnValue({ user: { id: 'owner-456' } });
    (useQuery as any).mockReturnValue({ data: 'owner', isLoading: false });

    const { result } = renderHook(() => useWorkspaceRBAC('ws-123'));

    expect(result.current.role).toBe('owner');
    expect(result.current.canManage).toBe(true);
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isViewer).toBe(false);
  });

  it('identifies ADMIN role correctly', () => {
    (useQuery as any).mockReturnValue({ data: 'admin', isLoading: false });

    const { result } = renderHook(() => useWorkspaceRBAC('ws-123'));

    expect(result.current.role).toBe('admin');
    expect(result.current.canManage).toBe(true);
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isViewer).toBe(false);
  });

  it('identifies EDITOR role correctly', () => {
    (useQuery as any).mockReturnValue({ data: 'editor', isLoading: false });

    const { result } = renderHook(() => useWorkspaceRBAC('ws-123'));

    expect(result.current.role).toBe('editor');
    expect(result.current.canManage).toBe(true);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isViewer).toBe(false);
  });

  it('identifies VIEWER role correctly', () => {
    (useQuery as any).mockReturnValue({ data: 'viewer', isLoading: false });

    const { result } = renderHook(() => useWorkspaceRBAC('ws-123'));

    expect(result.current.role).toBe('viewer');
    expect(result.current.canManage).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isViewer).toBe(true);
  });
});
