import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import {
  resolveChecklistManagementAccess,
  resolveWorkspaceRbacScope,
} from '../checklist-management-access';

const AUTH_USER = 'user-1';

describe('Execution 5E.0.2.1 — resolveWorkspaceRbacScope', () => {
  it('A) checklist existente PESSOAL (workspaceId null) → undefined, nunca o workspace visual', () => {
    expect(
      resolveWorkspaceRbacScope({
        checklistId: 'cl-1',
        checklistWorkspaceId: null,
        newChecklistWorkspaceId: 'ws-admin', // currentWorkspace visual
      })
    ).toBeUndefined();
  });

  it('A2) checklist pessoal: canManageChecklist continua true por ownership com workspaceCanManage=false', () => {
    const access = resolveChecklistManagementAccess({
      authUserId: AUTH_USER,
      checklistOwnerId: AUTH_USER,
      checklistWorkspaceId: null,
      newChecklistWorkspaceId: 'ws-admin',
      workspaceCanManage: false, // RBAC nunca resolve para o visual ws-admin
      metadataLoading: false,
      isExistingChecklist: true,
    });
    expect(access.canManageChecklist).toBe(true);
  });

  it('B) checklist existente de workspace ws-1 → RBAC usa SOMENTE ws-1', () => {
    expect(
      resolveWorkspaceRbacScope({
        checklistId: 'cl-1',
        checklistWorkspaceId: 'ws-1',
        newChecklistWorkspaceId: 'ws-admin',
      })
    ).toBe('ws-1');
  });

  it('B2) checklist existente com metadata ainda não carregada → undefined (fail-closed)', () => {
    expect(
      resolveWorkspaceRbacScope({
        checklistId: 'cl-1',
        checklistWorkspaceId: null,
        newChecklistWorkspaceId: 'ws-admin',
      })
    ).toBeUndefined();
  });

  it('C) novo checklist em workspace → usa workspace efetivo (workspaceParam/currentWorkspace)', () => {
    expect(
      resolveWorkspaceRbacScope({
        checklistId: undefined,
        checklistWorkspaceId: null,
        newChecklistWorkspaceId: 'ws-2',
      })
    ).toBe('ws-2');
  });

  it('D) novo checklist pessoal → nenhum RBAC de workspace (undefined)', () => {
    expect(
      resolveWorkspaceRbacScope({
        checklistId: undefined,
        checklistWorkspaceId: null,
        newChecklistWorkspaceId: null,
      })
    ).toBeUndefined();
  });
});

describe('Execution 5E.0.2.1 — checklist.tsx fiação (E/F)', () => {
  const routeSource = readFileSync(
    pathResolve(process.cwd(), 'src/routes/checklist.tsx'),
    'utf8'
  );

  it('E) saveDeadlineConfig usa o workspace do checklist real, não currentWorkspace', () => {
    const saveDeadlineBlock = routeSource.slice(
      routeSource.indexOf('const saveDeadlineConfig'),
      routeSource.indexOf('const saveDeadlineConfig') + 900
    );
    expect(saveDeadlineBlock).toContain('const wsId = checklistWorkspaceForResources;');
    expect(saveDeadlineBlock).toContain('!settingsChecklistId || !wsId || !canManageWorkspace');
    // Nunca recai em currentWorkspace/workspaceParam dentro do saveDeadlineConfig.
    expect(saveDeadlineBlock).not.toContain('currentWorkspace?.id || workspaceParam');
    expect(saveDeadlineBlock).not.toContain('currentWorkspace?.id');
  });

  it('F) fetch de workspace members usa o workspace real do checklist', () => {
    const fetchBlock = routeSource.slice(
      routeSource.indexOf('const fetchWorkspaceData'),
      routeSource.indexOf('const fetchWorkspaceData') + 700
    );
    expect(fetchBlock).toContain('const wsId = checklistWorkspaceForResources;');
    // Deps reagem ao checklist carregado.
    expect(routeSource).toContain(
      '}, [user, checklistId, checklistMeta, currentWorkspace?.id, workspaceParam]);'
    );
  });

  it('nenhum fallback `currentWorkspace?.id || workspaceParam` restou no arquivo', () => {
    expect(routeSource).not.toContain('currentWorkspace?.id || workspaceParam');
  });

  it('rbacWorkspaceId vem de resolveWorkspaceRbacScope', () => {
    expect(routeSource).toContain('const checklistWorkspaceForResources = resolveWorkspaceRbacScope({');
    expect(routeSource).toContain('const rbacWorkspaceId = checklistWorkspaceForResources;');
  });
});