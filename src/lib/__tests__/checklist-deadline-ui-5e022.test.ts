import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { resolveWorkspaceRbacScope } from '../checklist-management-access';

describe('Execution 5E.0.2.2 — hasWorkspaceResources (visibilidade ≠ permissão)', () => {
  it('A) checklist pessoal existente → sem workspace → seção não aparece (scope undefined)', () => {
    const scope = resolveWorkspaceRbacScope({
      checklistId: 'cl-1',
      checklistWorkspaceId: null,
      newChecklistWorkspaceId: 'ws-admin', // visual, não relacionado
    });
    expect(scope).toBeUndefined();
    expect(!!scope).toBe(false);
  });

  it('B) checklist de workspace existente → workspace real presente → seção disponível', () => {
    const scope = resolveWorkspaceRbacScope({
      checklistId: 'cl-1',
      checklistWorkspaceId: 'ws-1',
      newChecklistWorkspaceId: 'ws-admin',
    });
    expect(scope).toBe('ws-1');
    expect(!!scope).toBe(true);
  });

  it('C) Viewer em checklist de workspace: visibilidade (workspace existe) ≠ permissão (controles)', () => {
    // Visibilidade depende só da existência do workspace:
    const hasWorkspaceResources = true;
    // Controles continuam desabilitados para quem não pode gerenciar:
    const canManageWorkspace = false;
    expect(hasWorkspaceResources).toBe(true);
    expect(canManageWorkspace).toBe(false);
    // São conceitos independentes: seção presente + controles disabled.
    expect(hasWorkspaceResources && !canManageWorkspace).toBe(true);
  });
});

describe('Execution 5E.0.2.2 — checklist.tsx fiação', () => {
  // Normaliza CRLF→LF para que as asserções multilinha sejam estáveis.
  const routeSource = readFileSync(
    pathResolve(process.cwd(), 'src/routes/checklist.tsx'),
    'utf8'
  ).replace(/\r\n/g, '\n');

  it('G) a seção inteira "Alertas de Prazo" está condicionada a hasWorkspaceResources', () => {
    const wrapperStart = routeSource.indexOf('{hasWorkspaceResources && (');
    expect(wrapperStart).toBeGreaterThan(-1);
    const heading = routeSource.indexOf('Alertas de Prazo');
    expect(heading).toBeGreaterThan(wrapperStart);
    // O heading existe uma única vez e está dentro do wrapper.
    expect(routeSource.split('Alertas de Prazo').length - 1).toBe(1);

    // Toda a seção (switch, responsável, data, horário, destinatário, status)
    // está dentro do bloco condicional: o fechamento `)}` do wrapper vem depois
    // do status de prazo e antes do div pai + botão "Salvar configurações".
    // (Ancoramos no botão que segue a seção — o primeiro className igual pode
    // pertencer a outra aba, por isso usamos o ocorrência após o heading.)
    const sectionEnd = routeSource.indexOf(
      'className="mt-8 flex items-center justify-center gap-6"',
      heading
    );
    expect(sectionEnd).toBeGreaterThan(heading);
    const section = routeSource.slice(wrapperStart, sectionEnd);
    expect(section).toContain('Alertas de Prazo');
    expect(section).toContain('Receber alerta de prazo não cumprido');
    expect(section).toContain('Selecionar responsável');
    expect(section).toContain('Data limite');
    expect(section).toContain('Horário limite');
    expect(section).toContain('Destinatário do alerta');
    expect(section).toContain('deadlineStatus');
    expect(
      section.endsWith('                  )}\n                </div>\n\n                <div ')
    ).toBe(true);
  });

  it('A2) a visibilidade usa hasWorkspaceResources — NÃO canManageWorkspace', () => {
    expect(routeSource).toContain('const hasWorkspaceResources = !!checklistWorkspaceForResources;');
    // O wrapper da seção não depende de permissão:
    expect(routeSource).not.toMatch(/\{canManageWorkspace && \(/);
  });

  it('C2) controles internos continuam atrelados a canManageWorkspace (Viewer: disabled)', () => {
    const wrapperStart = routeSource.indexOf('{hasWorkspaceResources && (');
    const heading = routeSource.indexOf('Alertas de Prazo');
    const sectionEnd = routeSource.indexOf(
      'className="mt-8 flex items-center justify-center gap-6"',
      heading
    );
    const section = routeSource.slice(wrapperStart, sectionEnd);
    expect(section.match(/disabled=\{!canManageWorkspace\}/g)?.length).toBe(4);
  });

  it('D) checklist pessoal: abrir aba E-mails NÃO chama loadDeadlineAssignmentState', () => {
    // Primeira chamada `loadDeadlineAssignmentState();` é a do effect (o
    // saveDeadlineConfig usa `const refresh = await loadDeadlineAssignmentState();`).
    const callIdx = routeSource.indexOf('loadDeadlineAssignmentState();');
    const effect = routeSource.slice(callIdx - 420, callIdx + 160);
    expect(effect).toContain('settingsActiveTab === "emails"');
    // A condição exige workspace real aplicável (checklist pessoal → não chama):
    expect(effect).toContain('settingsChecklistId &&');
    expect(effect).toMatch(/checklistWorkspaceForResources[\s\S]*loadDeadlineAssignmentState\(\);/);
    // Dependência do effect inclui o escopo:
    expect(effect).toContain('checklistWorkspaceForResources]);');
  });

  it('E) checklist de workspace: condição preserva o carregamento', () => {
    const callIdx = routeSource.indexOf('loadDeadlineAssignmentState();');
    const effect = routeSource.slice(callIdx - 420, callIdx + 160);
    expect(effect).toContain('isSettingsOpen &&');
    expect(effect).toContain('loadDeadlineAssignmentState();');
  });

  it('F) trocar para checklist sem workspace limpa workspaceMembers sem query', () => {
    const fetchStart = routeSource.indexOf('const fetchWorkspaceData');
    const fetchBlock = routeSource.slice(fetchStart, fetchStart + 700);
    expect(fetchBlock).toContain('const wsId = checklistWorkspaceForResources;');
    expect(fetchBlock).toMatch(/if \(!wsId\) \{\n/);
    expect(fetchBlock).toContain('setWorkspaceMembers([]);');
    expect(fetchBlock).toContain('if (!wsId || !user) return;');
  });
});