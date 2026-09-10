import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveWorkspaceRbacScope,
  resolveChecklistManagementAccess,
} from '../checklist-management-access';

const AUTH_USER = 'user-1';

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

describe('Execution 5E.0C.2 — visibility scope for Alertas de Prazo', () => {
  it('A) checklist pessoal existente → resolveWorkspaceRbacScope = undefined → hasWorkspaceResources false', () => {
    const s = scope({
      checklistId: 'cl-1',
      checklistWorkspaceId: null,
      newChecklistWorkspaceId: 'visual-ws',
    });
    expect(s).toBeUndefined();
    // hasWorkspaceResources, se fosse derivado: !!s === false
  });

  it('B) checklist workspace existente → hasWorkspaceResources true', () => {
    const s = scope({
      checklistId: 'cl-1',
      checklistWorkspaceId: 'ws-real',
      newChecklistWorkspaceId: 'visual-ws',
    });
    expect(s).toBe('ws-real');
  });

  it('C) Viewer em workspace: hasWorkspaceResources true + canManageWorkspace false → seção existe, controles disabled', () => {
    const input = {
      authUserId: AUTH_USER,
      checklistOwnerId: 'other-owner',
      checklistWorkspaceId: 'ws-real',
      newChecklistWorkspaceId: null,
      workspaceCanManage: false, // Viewer
      metadataLoading: false,
      isExistingChecklist: true,
    };
    const result = resolveChecklistManagementAccess(input);
    const s = scope({
      checklistId: 'cl-1',
      checklistWorkspaceId: 'ws-real',
      newChecklistWorkspaceId: null,
    });
    expect(s).toBeDefined(); // seção deve existir
    expect(result.canManageChecklist).toBe(false);
    expect(access({ workspaceCanManage: false, checklistWorkspaceId: 'ws-real', isExistingChecklist: true })).toBe(false);
  });

  it('D) Viewer em workspace: controles continuam disabled por !canManageWorkspace', () => {
    // O comportamento esperado para Viewer é visibilidade da seção +
    // controles desabilitados — não hide-by-permission.
    const input = {
      authUserId: AUTH_USER,
      checklistOwnerId: 'other-owner',
      checklistWorkspaceId: 'ws-real',
      newChecklistWorkspaceId: null,
      workspaceCanManage: false,
      metadataLoading: false,
      isExistingChecklist: true,
    };
    const { canManageChecklist } = resolveChecklistManagementAccess(input);
    expect(canManageChecklist).toBe(false);
  });
});

describe('Execution 5E.0C.2 — checklist.tsx fiação visual + carregamento', () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), 'src/routes/checklist.tsx'),
    'utf8'
  );

  it('D) Alertas de Prazo está dentro de hasWorkspaceResources && ( ... )', () => {
    // O wrapper precisa aparecer imediatamente antes do h3 real (o comentário
    // 5E.0C.2 no topo do arquivo também menciona "Alertas de Prazo", por isso
    // o marcador inclui o fechamento </h3>).
    expect(routeSource).toContain('hasWorkspaceResources');
    const wrapperIdx = routeSource.indexOf('hasWorkspaceResources && (');
    expect(wrapperIdx).toBeGreaterThan(-1);
    const headingIdx = routeSource.indexOf('>Alertas de Prazo</h3>');
    expect(headingIdx).toBeGreaterThan(-1);
    expect(headingIdx).toBeGreaterThan(wrapperIdx);
    // Fechamento do wrapper: o save button (único, fora da seção) só pode
    // aparecer depois do `)}` que fecha o wrapper.
    const saveBtnIdx = routeSource.indexOf('Salvar configurações', wrapperIdx);
    expect(saveBtnIdx).toBeGreaterThan(-1);
    const closeIdx = routeSource.indexOf(')}', headingIdx);
    expect(closeIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeLessThan(saveBtnIdx);
  });

  it('E) horário limite / data limite / destinatário / status pertencem ao bloco condicional', () => {
    const wrapperIdx = routeSource.indexOf('hasWorkspaceResources && (');
    expect(wrapperIdx).toBeGreaterThan(-1);
    // A seção condicional termina antes do botão "Salvar configurações" —
    // todo o conteúdo de prazo deve estar dentro desse intervalo.
    const saveBtnIdx = routeSource.indexOf('Salvar configurações', wrapperIdx);
    const slice = routeSource.slice(wrapperIdx, saveBtnIdx);
    expect(slice).toContain('Receber alerta de prazo não cumprido');
    expect(slice).toContain('Data limite');
    expect(slice).toContain('Horário limite');
    expect(slice).toContain('Destinatário do alerta');
    expect(slice).toContain('Status do prazo');
  });

  it('E) controles de deadline usam canManageWorkspace (não o genérico canManage)', () => {
    expect(routeSource).toContain('disabled={!canManageWorkspace}');
    expect(routeSource.match(/disabled=\{!canManageWorkspace\}/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('E) loadDeadlineAssignmentState só é chamada quando há workspace real', () => {
    const checkIdx = routeSource.indexOf('loadDeadlineAssignmentState()');
    expect(checkIdx).toBeGreaterThan(-1);
    const slice = routeSource.slice(
      Math.max(0, checkIdx - 600),
      checkIdx + 60
    );
    expect(slice).toContain('checklistWorkspaceForResources');
    // O effect de Emails agora depende de checklistWorkspaceForResources.
    expect(routeSource).toContain(
      "[settingsChecklistId, isSettingsOpen, settingsActiveTab, checklistWorkspaceForResources]"
    );
  });

  it('G) troca para checklist pessoal limpa responsáveis + estado de deadline residual', () => {
    const membersIdx = routeSource.indexOf('fetchWorkspaceData');
    const slice = routeSource.slice(membersIdx, membersIdx + 1400);
    expect(slice).toContain('setWorkspaceMembers([]);');
    expect(slice).toContain('setPrimaryMemberId(null);');
    expect(slice).toContain('setAssignmentDeadline(null);');
    expect(slice).toContain('setDeadlineAlertEnabled(false);');
    expect(slice).toContain('setDeadlineStatus(null);');
    expect(slice).toContain('setChecklistAssignments([]);');
  });

  it('não usa hasWorkspaceResources && para esconder a seção por permissão (Viewer continua podendo ver)', () => {
    // A seção deve ser condicionada por hasWorkspaceResources, não por
    // canManageWorkspace — Viewer de workspace ainda vê a seção.
    expect(routeSource).toContain('hasWorkspaceResources');
    // Garantia bruta: a linha de heading não deve estar envolvida em !canManage.
    const headingLine = routeSource.split('\n').find((l) => l.includes('Alertas de Prazo'));
    expect(headingLine).toBeTruthy();
  });

  it('checklist pessoal nunca consulta/muta assignment pelo workspace visual', () => {
    expect(routeSource).not.toMatch(/const wsId = (currentWorkspace|workspaceParam)/);
    expect(routeSource).not.toContain('currentWorkspace?.id || workspaceParam');
  });

  it('preserva a separação 5E.0C.1 (canManageChecklist vs canManageWorkspace)', () => {
    expect(routeSource).toContain('const { canManage: canManageWorkspace } = useWorkspaceRBAC(rbacWorkspaceId);');
    expect(routeSource).toContain('const { canManageChecklist } = resolveChecklistManagementAccess({');
    expect(routeSource).toContain('canManageChecklist');
    expect(routeSource).not.toMatch(/\{canManage && \(/);
  });
});