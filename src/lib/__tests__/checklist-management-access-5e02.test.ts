import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveChecklistManagementAccess } from '../checklist-management-access';

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

describe('Execution 5E.0.2 — resolveChecklistManagementAccess', () => {
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
        workspaceCanManage: false, // Viewer no workspace
      })
    ).toBe(true);
  });

  it('D) checklist de workspace + workspaceCanManage=true → true', () => {
    expect(
      access({
        checklistOwnerId: OTHER_USER,
        checklistWorkspaceId: 'ws-1',
        isExistingChecklist: true,
        workspaceCanManage: true,
      })
    ).toBe(true);
  });

  it('E) checklist de workspace + workspaceCanManage=false → false', () => {
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

  it('H2) checklist existente cujo fetch falhou (sem metadata) → fail-closed false', () => {
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
    // Mesmo sendo dono do workspace nunca é usado como owner do checklist aqui;
    // o que decide é workspaceCanManage do checklist REAL.
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

describe('Execution 5E.0.2 — checklist.tsx fiação (I/J)', () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), 'src/routes/checklist.tsx'),
    'utf8'
  );

  it('I) Configuração/Personalizar/Publicar usam canManageChecklist', () => {
    // Os dois blocos `{canManageChecklist && (` do topbar: o fragmento
    // Configuração+Personalizar e o botão Publicar.
    expect(routeSource.match(/\{canManageChecklist && \(/g)?.length).toBe(2);
    // O gate antigo de workspace não existe mais no topbar.
    expect(routeSource).not.toMatch(/\{canManage && \(/);
  });

  it('I2) resolveChecklistManagementAccess é importado e usado com authUser', () => {
    expect(routeSource).toContain(
      "import { resolveChecklistManagementAccess, resolveWorkspaceRbacScope } from \"@/lib/checklist-management-access\";"
    );
    expect(routeSource).toMatch(/resolveChecklistManagementAccess\(\{/);
    expect(routeSource).toContain('authUserId: authUser?.id,');
  });

  it('J) recursos de prazo/assignment e saveDeadlineConfig usam canManageWorkspace', () => {
    // Guard do saveDeadlineConfig.
    expect(routeSource).toContain('!settingsChecklistId || !wsId || !canManageWorkspace');
    // 4 controles de deadline (switch alerta, select responsável, date, time).
    expect(routeSource.match(/disabled=\{!canManageWorkspace\}/g)?.length).toBe(4);
    // Nenhum `!canManage` sem sufixo sobrou.
    expect(routeSource.match(/!canManage[^W]/g)).toBeNull();
  });

  it('RBAC é resolvido contra o workspace REAL do checklist, não só o contexto visual', () => {
    expect(routeSource).toContain('const checklistWorkspaceForResources = resolveWorkspaceRbacScope({');
    expect(routeSource).toContain('const rbacWorkspaceId = checklistWorkspaceForResources;');
  });
});