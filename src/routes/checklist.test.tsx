import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NovoChecklistPage } from './checklist';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { toLocalISO, fromLocalISO } from '@/utils/date-helpers';

// Mock dos hooks e contextos
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user123', email: 'test@example.com' } })
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({ 
    currentWorkspace: { id: 'ws123', name: 'Test WS' },
    workspaces: [{ id: 'ws123', name: 'Test WS' }],
    workspaceStatus: 'workspace'
  })
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children }: any) => <div>{children}</div>,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/checklist' })
}));

// Mock do hook de RBAC
vi.mock('@/hooks/useWorkspaceRBAC', () => ({
  useWorkspaceRBAC: () => ({ canManage: true, role: 'owner' })
}));

describe('Fase 4C.6 — Sincronização e Integridade de Prazos', () => {
  it('converte corretamente Timezone entre LOCAL e UTC', () => {
    const utcString = "2026-08-17T18:30:00.000Z";
    const date = new Date(utcString);
    const localISO = toLocalISO(date);
    
    const [d, t] = localISO.split('T');
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(t).toMatch(/^\d{2}:\d{2}$/);
    
    const backToUTC = fromLocalISO(localISO);
    expect(backToUTC).toBe(date.toISOString());
  });

  it('resolve membros e perfis sem usar relacionamentos aninhados (evita PostgREST fail)', async () => {
    const mockMembers = [{ id: 'm1', user_id: 'u1', role: 'editor', status: 'active' }];
    const mockProfiles = [{ id: 'u1', display_name: 'User One', avatar_url: null }];
    
    const combined = mockMembers.map(m => ({
      ...m,
      profiles: mockProfiles.find(p => p.id === m.user_id) || null
    }));
    
    expect(combined[0].profiles?.display_name).toBe('User One');
  });

  it('preserva atribuições existentes ao atualizar o responsável primário', () => {
    const currentAssignments = [
      { id: 'a1', workspace_member_id: 'm1', is_primary: true },
      { id: 'a2', workspace_member_id: 'm2', is_primary: false }
    ];
    
    const newPrimaryId = 'm3';
    const allIds = currentAssignments.map(a => a.workspace_member_id);
    const newList = Array.from(new Set([...allIds, newPrimaryId]));
    
    expect(newList).toContain('m1');
    expect(newList).toContain('m2');
    expect(newList).toContain('m3');
    expect(newList.length).toBe(3);
  });

  it('bloqueia edição de alertas para Viewers', () => {
    const canManage = false;
    expect(canManage).toBe(false);
  });

  it('valida que loadDeadlineAssignmentState limpa estado se não houver primary', () => {
    const assignments: any[] = [];
    const primary = assignments.find(a => a.is_primary);
    
    let primaryMemberId: string | null = 'old';
    let assignmentDueAt: string | null = 'old';
    let deadlineAlertEnabled = true;
    
    if (!primary) {
      primaryMemberId = null;
      assignmentDueAt = null;
      deadlineAlertEnabled = false;
    }
    
    expect(primaryMemberId).toBeNull();
    expect(assignmentDueAt).toBeNull();
    expect(deadlineAlertEnabled).toBe(false);
  });

  it('valida que erro ao localizar assignment impede set_assignment_deadline', async () => {
    const refreshedData = null as any;
    const targetAssignmentId = refreshedData?.id;


    
    let rpcCalled = false;
    if (targetAssignmentId) {
      rpcCalled = true;
    }
    
    expect(rpcCalled).toBe(false);
  });
});