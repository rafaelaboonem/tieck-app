import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveChecklistManagementAccess, resolveWorkspaceRbacScope } from '../checklist-management-access';

const AUTH_USER = 'user-1';
const OTHER_USER = 'user-2';

interface CtxOverrides {
  authUserId?: string | null;
  checklistOwnerId?: string | null;
  checklistWorkspaceId?: string | null;
  newChecklistWorkspaceId?: string | null;
  workspaceCanManage?: boolean;
  metadataLoading?: boolean;
  isExistingChecklist?: boolean;
}

const access = (o: CtxOverrides = {}) =>
  resolveChecklistManagementAccess({
    authUserId: AUTH_USER,
    checklistOwnerId: null,
    checklistWorkspaceId: null,
    newChecklistWorkspaceId: null,
    workspaceCanManage: false,
    metadataLoading: false,
    isExistingChecklist: false,
    ...o,
  }).canManageChecklist;

describe('Execution 5E.0C.1 — resolveChecklistManagementAccess', () => {
  it('A) checklist pessoal existente do próprio usuário → canManageChecklist = true', () => {
    expect(
      access({
        checklistOwnerId: AUTH_USER,
        checklistWorkspaceId: null,
        isExistingChecklist: true,
      })
    ).toBe(true);
  });

  it('B) checklist pessoal de outro usuário → false (fail-closed mesmo se o guard normalmente bloqueasse)', () => {
    expect(
      access({
        checklistOwnerId: OTHER_USER,
        checklistWorkspaceId: null,
        isExistingChecklist: true,
      })
    ).toBe(false);
  });

  it('C) usuário Viewer em workspace + checklist PESSOAL próprio → true (O BUG REAL)', () => {
    expect(
      access({
        authUserId: AUTH_USER,
        checklistOwnerId: AUTH_USER,
        checklistWorkspaceId: null,
        isExistingChecklist: true,
        workspaceCanManage: false, // Viewer no workspace visual
      })
    ).toBe(true);
  });

  it('D) checklist de workspace + canManageWorkspace=true → true', () => {
    expect(
      access({
        checklistOwnerId: OTHER_USER,
        checklistWorkspaceId: 'ws-1',
        isExistingChecklist: true,
        workspaceCanManage: true,
      })
    ).toBe(true);
  });

  it('E) checklist de workspace + canManageWorkspace=false → false', () => {
    expect(
      access({
        checklistOwnerId: OTHER_USER,
        checklistWorkspaceId: 'ws-1',
        isExistingChecklist: true,
        workspaceCanManage: false,
      })
    ).toBe(false);
  });

  it('F) novo checklist pessoal autenticado (workspace efetivo = null) → true', () => {
    expect(
      access({
        newChecklistWorkspaceId: null,
        isExistingChecklist: false,
      })
    ).toBe(true);
  });

  it('F2) novo checklist pessoal SEM usuário autenticado → false', () => {
    expect(
      access({
        authUserId: null,
        newChecklistWorkspaceId: null,
        isExistingChecklist: false,
      })
    ).toBe(false);
  });

  it('G) novo checklist em workspace → segue workspaceCanManage', () => {
    expect(
      access({
        newChecklistWorkspaceId: 'ws-1',
        isExistingChecklist: false,
        workspaceCanManage: true,
      })
    ).toBe(true);
    expect(
      access({
        newChecklistWorkspaceId: 'ws-1',
        isExistingChecklist: false,
        workspaceCanManage: false,
      })
    ).toBe(false);
  });

  it('H) metadata de checklist existente ainda carregando → fail-closed false', () => {
    expect(
      access({
        isExistingChecklist: true,
        metadataLoading: true,
        checklistOwnerId: AUTH_USER,
        checklistWorkspaceId: null,
      })
    ).toBe(false);
  });

  it('I) checklist existente sem metadata válida (fetch falhou) → fail-closed false', () => {
    expect(
      access({
        isExistingChecklist: true,
        metadataLoading: false,
        checklistOwnerId: null,
        checklistWorkspaceId: null,
      })
    ).toBe(false);
  });

  it('workspace checklist ignora owner: permissão vem só do RBAC do workspace real', () => {
    expect(
      access({
        checklistOwnerId: AUTH_USER,
        checklistWorkspaceId: 'ws-9',
        isExistingChecklist: true,
        workspaceCanManage: false,
      })
    ).toBe(false);
  });
});

describe('Execution 5E.0C.1 — resolveWorkspaceRbacScope', () => {
  const scope = (o: {
    checklistId?: string | null;
    checklistWorkspaceId?: string | null;
    newChecklistWorkspaceId?: string | null;
  }) =>
    resolveWorkspaceRbacScope({
      checklistId: o.checklistId ?? null,
      checklistWorkspaceId: o.checklistWorkspaceId ?? null,
      newChecklistWorkspaceId: o.newChecklistWorkspaceId ?? null,
    });

  it('A) checklist pessoal existente + contexto visual de workspace disponível → undefined (sem fallback)', () => {
    expect(
      scope({
        checklistId: 'cl-1',
        checklistWorkspaceId: null,
        newChecklistWorkspaceId: 'visual-ws', // currentWorkspace/workspaceParam disponível
      })
    ).toBeUndefined();
  });

  it('B) checklist existente do workspace A + contexto visual workspace B → somente A', () => {
    expect(
      scope({
        checklistId: 'cl-1',
        checklistWorkspaceId: 'ws-A',
        newChecklistWorkspaceId: 'ws-B',
      })
    ).toBe('ws-A');
  });

  it('C) novo checklist em workspace → usa o workspace efetivo', () => {
    expect(
      scope({
        checklistId: null,
        checklistWorkspaceId: null,
        newChecklistWorkspaceId: 'ws-eff',
      })
    ).toBe('ws-eff');
  });

  it('D) novo checklist pessoal → undefined', () => {
    expect(
      scope({
        checklistId: null,
        checklistWorkspaceId: null,
        newChecklistWorkspaceId: null,
      })
    ).toBeUndefined();
  });
});

describe('Execution 5E.0C.1 — checklist.tsx fiação', () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), 'src/routes/checklist.tsx'),
    'utf8'
  );

  it('importa os helpers e resolve com authUser', () => {
    expect(routeSource).toContain(
      'import { resolveChecklistManagementAccess, resolveWorkspaceRbacScope } from "@/lib/checklist-management-access";'
    );
    expect(routeSource).toMatch(/resolveChecklistManagementAccess\(\{/);
    expect(routeSource).toContain('authUserId: authUser?.id,');
  });

  it('Configuração/Personalizar/Publicar usam canManageChecklist', () => {
    // Os dois blocos `{canManageChecklist && (` do topbar: o fragmento
    // Configuração+Personalizar e o botão Publicar.
    expect(routeSource.match(/\{canManageChecklist && \(/g)?.length).toBe(2);
    // O gate antigo de workspace não existe mais no topbar.
    expect(routeSource).not.toMatch(/\{canManage && \(/);
  });

  it('RBAC é resolvido contra o workspace REAL do checklist, não só o contexto visual', () => {
    expect(routeSource).toContain('const checklistWorkspaceForResources = resolveWorkspaceRbacScope({');
    expect(routeSource).toContain('const rbacWorkspaceId = checklistWorkspaceForResources;');
    expect(routeSource).toContain('const { canManage: canManageWorkspace } = useWorkspaceRBAC(rbacWorkspaceId);');
  });

  it('metadata do checklist existente é capturada (ownerId + workspaceId) com reset fail-closed', () => {
    expect(routeSource).toContain('setChecklistMeta({');
    expect(routeSource).toContain('ownerId: data.user_id ?? null,');
    expect(routeSource).toContain('workspaceId: data.workspace_id ?? null,');
    expect(routeSource).toContain('setChecklistMeta(null);');
    expect(routeSource).toContain('setChecklistMetaLoading(!!checklistId);');
    expect(routeSource).toContain('setChecklistMetaLoading(false);');
  });

  it('members fetch usa o workspace scope real e limpa estado residual', () => {
    expect(routeSource).toContain('const wsId = checklistWorkspaceForResources;');
    // Dentro do fetchWorkspaceData, quando não há workspace real → limpa members.
    const membersIdx = routeSource.indexOf('fetchWorkspaceData');
    const slice = routeSource.slice(membersIdx, membersIdx + 1200);
    expect(slice).toContain('setWorkspaceMembers([]);');
    // Nunca usa o fallback visual para members.
    expect(slice).not.toContain('currentWorkspace?.id || workspaceParam');
  });

  it('saveDeadlineConfig é fail-closed no workspace real (canManageWorkspace)', () => {
    expect(routeSource).toContain('if (!settingsChecklistId || !wsId || !canManageWorkspace) return;');
    // 4 controles de deadline (switch alerta, select responsável, date, time).
    expect(routeSource.match(/disabled=\{!canManageWorkspace\}/g)?.length).toBe(4);
    // Nenhum `!canManage` sem sufixo sobrou.
    expect(routeSource.match(/!canManage[^W]/g)).toBeNull();
  });

  it('nenhum fallback currentWorkspace?.id || workspaceParam permanece nos fluxos do checklist', () => {
    expect(routeSource).not.toContain('currentWorkspace?.id || workspaceParam');
  });

  it('checklist pessoal existente nunca consulta/muta assignment pelo workspace visual', () => {
    // O scope resolvido para pessoal existente é undefined → members limpos e
    // saveDeadlineConfig retorna antes de qualquer RPC. Estruturalmente, não
    // existe nenhum uso de currentWorkspace/workspaceParam como wsId.
    expect(routeSource).not.toMatch(/const wsId = (currentWorkspace|workspaceParam)/);
  });
});