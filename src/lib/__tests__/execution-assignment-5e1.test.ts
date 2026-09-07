import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAssignmentsForWorkspaceMember } from '../execution-assignment';

const USER_ID = 'auth-user-1';
const MEMBER_ID = 'member-123';

const makeAssignment = (id: string, workspaceMemberId: string | null) => ({
  id,
  workspace_member_id: workspaceMemberId,
  due_at: '2026-09-01T10:00:00Z',
  completed_at: null,
});

describe('Execution 5E.1 — getAssignmentsForWorkspaceMember', () => {
  it('A) auth user id ≠ member id: assignment do member correto é selecionada', () => {
    const assignments = [makeAssignment('a1', MEMBER_ID)];
    const result = getAssignmentsForWorkspaceMember(assignments, MEMBER_ID);
    expect(result.map((a) => a.id)).toEqual(['a1']);
    // user.id nunca é usado como identidade
    expect(MEMBER_ID).not.toBe(USER_ID);
  });

  it('B) assignment com workspace_member_id === user.id (≠ member id) NÃO é selecionada', () => {
    // Regressão do bug atual: antes o filtro comparava com user?.id
    const assignments = [makeAssignment('a1', USER_ID)];
    const result = getAssignmentsForWorkspaceMember(assignments, MEMBER_ID);
    expect(result).toEqual([]);
  });

  it('C) duas atribuições de membros diferentes: só a do membro atual retorna', () => {
    const assignments = [
      makeAssignment('a1', MEMBER_ID),
      makeAssignment('a2', 'member-999'),
    ];
    const result = getAssignmentsForWorkspaceMember(assignments, MEMBER_ID);
    expect(result.map((a) => a.id)).toEqual(['a1']);
  });

  it('D) workspaceMemberId null/undefined → nenhuma atribuição (fail-closed)', () => {
    const assignments = [makeAssignment('a1', MEMBER_ID)];
    expect(getAssignmentsForWorkspaceMember(assignments, null)).toEqual([]);
    expect(getAssignmentsForWorkspaceMember(assignments, undefined)).toEqual([]);
  });

  it('E) array vazio → nenhuma atribuição', () => {
    expect(getAssignmentsForWorkspaceMember([], MEMBER_ID)).toEqual([]);
  });

  it('F) múltiplas atribuições legítimas do mesmo membro são preservadas', () => {
    const assignments = [
      makeAssignment('a1', MEMBER_ID),
      makeAssignment('a2', MEMBER_ID),
      makeAssignment('a3', 'member-999'),
    ];
    const result = getAssignmentsForWorkspaceMember(assignments, MEMBER_ID);
    expect(result.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('assignments null/undefined → nenhuma atribuição', () => {
    expect(getAssignmentsForWorkspaceMember(null, MEMBER_ID)).toEqual([]);
    expect(getAssignmentsForWorkspaceMember(undefined, MEMBER_ID)).toEqual([]);
  });
});

describe('Execution 5E.1 — rota /executar/$id usa workspaceMemberId (G)', () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), 'src/routes/executar.$id.tsx'),
    'utf8'
  );

  it('destrutura workspaceMemberId de useWorkspaceRBAC', () => {
    expect(routeSource).toContain('workspaceMemberId');
    expect(routeSource).toMatch(/useWorkspaceRBAC\(checklist\?\.workspace_id\)/);
  });

  it('resolve atribuições via helper getAssignmentsForWorkspaceMember', () => {
    expect(routeSource).toContain('getAssignmentsForWorkspaceMember(checklist.checklist_assignments, workspaceMemberId)');
  });

  it('NÃO compara mais workspace_member_id com user?.id (regressão do bug)', () => {
    expect(routeSource).not.toContain('workspace_member_id === user');
    expect(routeSource).not.toMatch(/workspace_member_id\s*===\s*user\?\.id/);
  });
});