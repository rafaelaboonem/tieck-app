import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';
import {
  pickLatestResponsePerChecklist,
  selectLatestAttemptPerGroup,
  isActionableCameraNonApproval,
  buildHomeCameraAttention,
  formatNonApprovedVerificationLabel,
  canLoadHomeCameraAttention,
  loadHomeCameraAttention,
  toHomeCameraAttentionMap,
  type HomeCameraAttempt,
  type HomeCameraResponse,
} from '../home-camera-attention';
import { buildHomeOperationalPriorities } from '../home-operational-summary';
import { HomeOperationalPriorities } from '../../components/home/HomeOperationalPriorities';

const OLD = '2026-08-01T00:00:00Z';
const NEW = '2026-08-02T00:00:00Z';
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

const attempt = (over: Partial<HomeCameraAttempt> & { id: string; response_id: string }): HomeCameraAttempt => ({
  block_id: 'blk-1',
  status: 'completed',
  decision: 'rejected',
  completed_at: NEW,
  updated_at: NEW,
  created_at: NEW,
  ...over,
});

const response = (over: Partial<HomeCameraResponse> & { id: string; checklist_id: string }): HomeCameraResponse => ({
  submitted_at: NEW,
  created_at: NEW,
  ...over,
});

describe('Home 6A.3 — pickLatestResponsePerChecklist', () => {
  it('escolhe a submissão completa mais recente por checklist', () => {
    const responses = [
      response({ id: 'r-old', checklist_id: 'c1', submitted_at: OLD }),
      response({ id: 'r-new', checklist_id: 'c1', submitted_at: NEW }),
      response({ id: 'r2', checklist_id: 'c2', submitted_at: OLD }),
    ];
    const latest = pickLatestResponsePerChecklist(responses);
    expect(latest.map((r) => r.id).sort()).toEqual(['r-new', 'r2']);
    expect(latest.find((r) => r.checklist_id === 'c1')?.id).toBe('r-new');
  });

  it('ignora respostas sem submitted_at (parciais)', () => {
    const responses = [
      response({ id: 'r1', checklist_id: 'c1', submitted_at: null }),
      response({ id: 'r2', checklist_id: 'c2', submitted_at: NEW }),
    ];
    expect(pickLatestResponsePerChecklist(responses).map((r) => r.id)).toEqual(['r2']);
  });
});

describe('Home 6A.3 — selectLatestAttemptPerGroup / isActionableCameraNonApproval', () => {
  it('C) mesma evidência: rejected antiga + approved nova → final não é rejected', () => {
    const attempts = [
      attempt({ id: 'a-old', response_id: 'r1', evidence_id: 'e1', decision: 'rejected', completed_at: OLD }),
      attempt({ id: 'a-new', response_id: 'r1', evidence_id: 'e1', decision: 'approved', completed_at: NEW }),
    ];
    const finals = selectLatestAttemptPerGroup(attempts);
    expect(finals).toHaveLength(1);
    expect(isActionableCameraNonApproval(finals[0])).toBe(false);
  });

  it('D) mesma evidência: approved antiga + rejected nova → final rejected', () => {
    const attempts = [
      attempt({ id: 'a-old', response_id: 'r1', evidence_id: 'e1', decision: 'approved', completed_at: OLD }),
      attempt({ id: 'a-new', response_id: 'r1', evidence_id: 'e1', decision: 'rejected', completed_at: NEW }),
    ];
    const finals = selectLatestAttemptPerGroup(attempts);
    expect(finals).toHaveLength(1);
    expect(isActionableCameraNonApproval(finals[0])).toBe(true);
  });

  it('fallback sem evidence_id agrupa por response_id + block_id', () => {
    const attempts = [
      attempt({ id: 'a1', response_id: 'r1', evidence_id: null, block_id: 'b1', decision: 'rejected', completed_at: OLD }),
      attempt({ id: 'a2', response_id: 'r1', evidence_id: null, block_id: 'b1', decision: 'approved', completed_at: NEW }),
      attempt({ id: 'a3', response_id: 'r1', evidence_id: null, block_id: 'b2', decision: 'rejected', completed_at: NEW }),
    ];
    const finals = selectLatestAttemptPerGroup(attempts);
    expect(finals).toHaveLength(2);
    const byId = new Map(finals.map((a) => [a.id, a]));
    expect(isActionableCameraNonApproval(byId.get('a2'))).toBe(false);
    expect(isActionableCameraNonApproval(byId.get('a3'))).toBe(true);
  });
});

describe('Home 6A.3 — buildHomeCameraAttention', () => {
  it('A) submissão mais recente com rejected → atenção IA', () => {
    const responses = [response({ id: 'r1', checklist_id: 'c1' })];
    const attempts = [attempt({ id: 'a1', response_id: 'r1', evidence_id: 'e1', decision: 'rejected' })];
    const attention = buildHomeCameraAttention(['c1'], responses, attempts);
    expect(attention).toEqual([{ checklistId: 'c1', rejectedCount: 1, latestSubmittedAt: NEW }]);
  });

  it('B) rejected antiga + approved mais nova → sem atenção', () => {
    const responses = [
      response({ id: 'r-old', checklist_id: 'c1', submitted_at: OLD }),
      response({ id: 'r-new', checklist_id: 'c1', submitted_at: NEW }),
    ];
    const attempts = [
      attempt({ id: 'a-old', response_id: 'r-old', evidence_id: 'e1', decision: 'rejected', completed_at: OLD }),
      attempt({ id: 'a-new', response_id: 'r-new', evidence_id: 'e1', decision: 'approved', completed_at: NEW }),
    ];
    expect(buildHomeCameraAttention(['c1'], responses, attempts)).toEqual([]);
  });

  it('E) 2 blocos Camera com rejected final → rejectedCount = 2 (agrupamento POR BLOCO desde 6A.4)', () => {
    const responses = [response({ id: 'r1', checklist_id: 'c1' })];
    const attempts = [
      attempt({ id: 'a1', response_id: 'r1', evidence_id: 'e1', block_id: 'b1', decision: 'rejected' }),
      attempt({ id: 'a2', response_id: 'r1', evidence_id: 'e2', block_id: 'b2', decision: 'rejected' }),
      attempt({ id: 'a3', response_id: 'r1', evidence_id: 'e3', block_id: 'b3', decision: 'approved' }),
    ];
    expect(buildHomeCameraAttention(['c1'], responses, attempts)).toEqual([
      { checklistId: 'c1', rejectedCount: 2, latestSubmittedAt: NEW },
    ]);
  });

  it('E2) retakes do MESMO bloco com evidence_ids diferentes contam UMA vez (latest vence)', () => {
    const responses = [response({ id: 'r1', checklist_id: 'c1' })];
    const attempts = [
      attempt({ id: 'a-old', response_id: 'r1', evidence_id: 'e-old', block_id: 'b1', decision: 'rejected', completed_at: OLD }),
      attempt({ id: 'a-new', response_id: 'r1', evidence_id: 'e-new', block_id: 'b1', decision: 'rejected', completed_at: NEW }),
    ];
    expect(buildHomeCameraAttention(['c1'], responses, attempts)).toEqual([
      { checklistId: 'c1', rejectedCount: 1, latestSubmittedAt: NEW },
    ]);
  });

  it('F) not_observable final → não conta como rejected', () => {
    const responses = [response({ id: 'r1', checklist_id: 'c1' })];
    const attempts = [attempt({ id: 'a1', response_id: 'r1', evidence_id: 'e1', decision: 'not_observable' })];
    expect(buildHomeCameraAttention(['c1'], responses, attempts)).toEqual([]);
  });

  it('G) error/failed → não conta como rejected', () => {
    const responses = [response({ id: 'r1', checklist_id: 'c1' })];
    const attempts = [
      attempt({ id: 'a1', response_id: 'r1', evidence_id: 'e1', decision: 'error', status: 'completed' }),
      attempt({ id: 'a2', response_id: 'r1', evidence_id: 'e2', decision: null, status: 'failed' }),
      attempt({ id: 'a3', response_id: 'r1', evidence_id: 'e3', decision: 'rejected', status: 'processing' }),
    ];
    expect(buildHomeCameraAttention(['c1'], responses, attempts)).toEqual([]);
  });

  it('escala por checklist e nunca ultrapassa os visíveis', () => {
    const responses = [
      response({ id: 'r1', checklist_id: 'c1' }),
      response({ id: 'r2', checklist_id: 'c2' }),
      response({ id: 'r3', checklist_id: 'c3' }),
    ];
    const attempts = [
      attempt({ id: 'a1', response_id: 'r1', evidence_id: 'e1', decision: 'rejected' }),
      attempt({ id: 'a2', response_id: 'r2', evidence_id: 'e1', decision: 'rejected' }),
    ];
    const attention = buildHomeCameraAttention(['c1'], responses, attempts);
    expect(attention.map((a) => a.checklistId)).toEqual(['c1']);
  });
});

describe('Home 6A.3 — integração com buildHomeOperationalPriorities', () => {
  const attentionFor = (checklistId: string, rejectedCount: number) => ({
    [checklistId]: { checklistId, rejectedCount, latestSubmittedAt: NEW },
  });

  it('H) atrasado + rejected → UMA prioridade combinada', () => {
    const checklists = [
      {
        id: 'c1',
        title: 'Casa 2',
        checklist_assignments: [
          { id: 'x', due_at: daysAgo(2), completed_at: null },
        ],
      },
    ];
    const { items } = buildHomeOperationalPriorities(checklists, {
      attention: attentionFor('c1', 2),
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      checklistId: 'c1',
      status: 'atrasado',
      rejectedCount: 2,
    });
  });

  it('I) atrasado+IA → atrasado → IA only → pendente', () => {
    const checklists = [
      { id: 'c-pend', title: 'Pendente', checklist_assignments: [{ id: 'p', due_at: daysAgo(-1), completed_at: null }] },
      { id: 'c-ia', title: 'Só IA', checklist_assignments: [] },
      { id: 'c-atr', title: 'Atrasado', checklist_assignments: [{ id: 'a', due_at: daysAgo(3), completed_at: null }] },
      { id: 'c-atr-ia', title: 'Atrasado IA', checklist_assignments: [{ id: 'b', due_at: daysAgo(4), completed_at: null }] },
    ];
    const { items } = buildHomeOperationalPriorities(checklists, {
      attention: {
        ...attentionFor('c-ia', 1),
        ...attentionFor('c-atr-ia', 2),
      },
      limit: 4,
    });
    expect(items.map((i) => i.checklistId)).toEqual(['c-atr-ia', 'c-atr', 'c-ia', 'c-pend']);
    expect(items.map((i) => i.status)).toEqual(['atrasado', 'atrasado', null, 'pendente']);
    expect(items.map((i) => i.rejectedCount)).toEqual([2, 0, 1, 0]);
  });

  it('J) limite de 3 continua respeitado com sinais IA', () => {
    const checklists = ['a', 'b', 'c', 'd'].map((k) => ({ id: `c-${k}`, title: `IA ${k}`, checklist_assignments: [] }));
    const attention: Record<string, any> = {};
    checklists.forEach((c, i) => {
      attention[c.id] = { checklistId: c.id, rejectedCount: 1, latestSubmittedAt: NEW };
    });
    const { items, remaining } = buildHomeOperationalPriorities(checklists, { attention });
    expect(items).toHaveLength(3);
    expect(remaining).toBe(1);
  });
});

describe('Home 6A.3 — RBAC (K, L, M)', () => {
  it('K) Viewer de workspace → nunca habilita sinais administrativos', () => {
    expect(
      canLoadHomeCameraAttention({ isWorkspaceContext: true, isViewer: true, canManage: true, isAuthenticated: true })
    ).toBe(false);
  });

  it('L) contexto Pessoal autenticado → habilita', () => {
    expect(
      canLoadHomeCameraAttention({ isWorkspaceContext: false, isViewer: false, canManage: false, isAuthenticated: true })
    ).toBe(true);
  });

  it('M) workspace com gerenciamento (não viewer) → habilita', () => {
    expect(
      canLoadHomeCameraAttention({ isWorkspaceContext: true, isViewer: false, canManage: true, isAuthenticated: true })
    ).toBe(true);
  });

  it('workspace sem canManage → não habilita; não autenticado → nunca', () => {
    expect(
      canLoadHomeCameraAttention({ isWorkspaceContext: true, isViewer: false, canManage: false, isAuthenticated: true })
    ).toBe(false);
    expect(
      canLoadHomeCameraAttention({ isWorkspaceContext: false, isViewer: false, canManage: false, isAuthenticated: false })
    ).toBe(false);
  });
});

describe('Home 6A.3 — loader (N, O, P)', () => {
  it('O) nenhum checklist visível → nenhuma query', async () => {
    const fetchResponses = vi.fn();
    const fetchAttempts = vi.fn();
    const result = await loadHomeCameraAttention(
      { fetchResponses, fetchAttempts },
      []
    );
    expect(result).toEqual([]);
    expect(fetchResponses).not.toHaveBeenCalled();
    expect(fetchAttempts).not.toHaveBeenCalled();
  });

  it('N) queries sempre escopadas aos visibleChecklistIds', async () => {
    const fetchResponses = vi.fn(async () => ({
      data: [response({ id: 'r1', checklist_id: 'c1' })],
      error: null,
    }));
    const fetchAttempts = vi.fn(async () => ({ data: [], error: null }));
    await loadHomeCameraAttention({ fetchResponses, fetchAttempts }, ['c1', 'c2']);
    expect(fetchResponses).toHaveBeenCalledWith(['c1', 'c2']);
    expect(fetchAttempts).toHaveBeenCalledWith(['r1']);
  });

  it('P) falha na query → retorno vazio (fail-closed)', async () => {
    const fetchResponses = vi.fn(async () => ({ data: null, error: new Error('RLS') }));
    const fetchAttempts = vi.fn(async () => ({ data: null, error: null }));
    const result = await loadHomeCameraAttention({ fetchResponses, fetchAttempts }, ['c1']);
    expect(result).toEqual([]);
    expect(fetchAttempts).not.toHaveBeenCalled();
  });

  it('falha na query de tentativas → retorno vazio', async () => {
    const fetchResponses = vi.fn(async () => ({
      data: [response({ id: 'r1', checklist_id: 'c1' })],
      error: null,
    }));
    const fetchAttempts = vi.fn(async () => ({ data: null, error: new Error('boom') }));
    expect(await loadHomeCameraAttention({ fetchResponses, fetchAttempts }, ['c1'])).toEqual([]);
  });

  it('toHomeCameraAttentionMap indexa por checklistId', () => {
    const map = toHomeCameraAttentionMap([
      { checklistId: 'c1', rejectedCount: 2, latestSubmittedAt: NEW },
    ]);
    expect(map.c1).toEqual({ checklistId: 'c1', rejectedCount: 2, latestSubmittedAt: NEW });
  });

  it('formatNonApprovedVerificationLabel pluraliza corretamente', () => {
    expect(formatNonApprovedVerificationLabel(1)).toBe('IA não aprovou 1 verificação');
    expect(formatNonApprovedVerificationLabel(2)).toBe('IA não aprovou 2 verificações');
    expect(formatNonApprovedVerificationLabel(0)).toBe('');
  });
});

describe('Home 6A.3 — componente (Q, R)', () => {
  const attention = (rejectedCount: number) => ({
    rejectedCount,
    latestSubmittedAt: NEW,
  });

  it('prioridade IA → mostra linha e CTA "Ver envio", onOpen com kind camera', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const checklists = [{ id: 'c1', title: 'Casa 2', checklist_assignments: [] }];
    render(
      <HomeOperationalPriorities
        checklists={checklists}
        attentionByChecklist={{ c1: attention(2) }}
        onOpen={onOpen}
      />
    );
    expect(screen.getByText('IA não aprovou 2 verificações')).toBeInTheDocument();
    expect(screen.getByText('Ver envio')).toBeInTheDocument();
    expect(screen.queryByText('Abrir')).toBeNull();
    await user.click(screen.getByText('Casa 2'));
    expect(onOpen).toHaveBeenCalledWith('c1', 'camera');
  });

  it('atrasado + IA → linha de prazo e linha IA combinadas, CTA "Ver envio"', () => {
    const checklists = [
      {
        id: 'c1',
        title: 'Casa 2',
        checklist_assignments: [{ id: 'a', due_at: new Date(2026, 7, 17, 12).toISOString(), completed_at: null }],
      },
    ];
    render(
      <HomeOperationalPriorities
        checklists={checklists}
        attentionByChecklist={{ c1: attention(1) }}
        onOpen={() => {}}
      />
    );
    const row = screen.getByRole('button', { name: /Casa 2/ });
    expect(row).toHaveTextContent('Atrasado');
    expect(row).toHaveTextContent('prazo 17/08');
    expect(row).toHaveTextContent('IA não aprovou 1 verificação');
    expect(row).toHaveTextContent('Ver envio');
  });

  it('R) prioridade só de prazo → CTA "Abrir" e kind deadline', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const checklists = [
      {
        id: 'c1',
        title: 'Casa 2',
        checklist_assignments: [{ id: 'a', due_at: daysAgo(1), completed_at: null }],
      },
    ];
    render(<HomeOperationalPriorities checklists={checklists} onOpen={onOpen} />);
    expect(screen.getByText('Abrir')).toBeInTheDocument();
    expect(screen.queryByText('Ver envio')).toBeNull();
    await user.click(screen.getByText('Casa 2'));
    expect(onOpen).toHaveBeenCalledWith('c1', 'deadline');
  });
});

describe('Home 6A.3 — estrutura da rota /inicio', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/inicio.tsx'), 'utf8');
  const prioritiesSection = source.slice(
    source.indexOf('<HomeOperationalPriorities'),
    source.indexOf('<div className="flex items-center justify-between">')
  );

  it('hook é usado com gate RBAC explícito e atenção passa ao componente', () => {
    expect(source).toContain('useHomeCameraAttention({');
    expect(source).toContain('canLoadHomeCameraAttention({');
    expect(source).toContain('isWorkspaceContext: workspaceStatus === \'workspace\'');
    expect(source).toContain('isViewer,');
    expect(source).toContain('canManage,');
    expect(source).toContain('isAuthenticated: !!user?.id');
    expect(prioritiesSection).toContain('attentionByChecklist={cameraAttention}');
  });

  it('Q) prioridade IA navega para Configurações → aba Envios (settings + settingsTab)', () => {
    expect(prioritiesSection).toContain(`settings: true`);
    expect(prioritiesSection).toContain(`settingsTab: "envios"`);
    // O branch camera vem antes das navegações de prazo.
    expect(prioritiesSection.indexOf('kind === \'camera\'')).toBeGreaterThan(-1);
  });

  it('R) prioridade só de prazo mantém Viewer → /executar/$id e demais → /checklist', () => {
    expect(prioritiesSection).toContain(`to: "/executar/$id"`);
    expect(prioritiesSection).toContain(`to: "/checklist"`);
    expect(prioritiesSection).toContain('search: { id: checklistId }');
  });

  it('nenhuma query supabase dentro da seção de prioridades', () => {
    expect(prioritiesSection).not.toContain('supabase');
  });

  it('componente não importa supabase', () => {
    const componentSource = readFileSync(
      resolve(process.cwd(), 'src/components/home/HomeOperationalPriorities.tsx'),
      'utf8'
    );
    expect(componentSource).not.toContain('supabase');
  });
});