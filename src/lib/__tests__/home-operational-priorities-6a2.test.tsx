import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';
import {
  buildHomeOperationalPriorities,
  formatDueDateShort,
  resolveChecklistOperationalStatus,
} from '../home-operational-summary';
import { HomeOperationalPriorities } from '../../components/home/HomeOperationalPriorities';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString();

const assignment = (over: Partial<{ id: string; due_at: string | null; completed_at: string | null }> = {}) => ({
  id: 'a1',
  due_at: null,
  completed_at: null,
  ...over,
});

describe('Home 6A.2 — buildHomeOperationalPriorities', () => {
  it('A) 1 checklist atrasado → entra em prioridades', () => {
    const checklists = [{ id: 'c1', title: 'Casa 2', checklist_assignments: [assignment({ due_at: daysAgo(3) })] }];
    const { items, remaining } = buildHomeOperationalPriorities(checklists);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ checklistId: 'c1', title: 'Casa 2', status: 'atrasado' });
    expect(remaining).toBe(0);
  });

  it('B) 1 checklist pendente → entra em prioridades', () => {
    const checklists = [{ id: 'c1', title: 'Abertura da loja', checklist_assignments: [assignment({ due_at: daysFromNow(2) })] }];
    const { items } = buildHomeOperationalPriorities(checklists);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ checklistId: 'c1', status: 'pendente' });
  });

  it('C) concluído → não entra', () => {
    const checklists = [{ id: 'c1', title: 'Pronto', checklist_assignments: [assignment({ completed_at: daysAgo(1) })] }];
    const { items } = buildHomeOperationalPriorities(checklists);
    expect(items).toHaveLength(0);
  });

  it('D) sem_status → não entra', () => {
    const checklists = [
      { id: 'c1', title: 'Sem assignment', checklist_assignments: [] },
      { id: 'c2', title: 'Sem prazo', checklist_assignments: [assignment()] },
    ];
    const { items } = buildHomeOperationalPriorities(checklists);
    expect(items).toHaveLength(0);
  });

  it('E) atrasado + pendente → atrasado aparece primeiro', () => {
    const checklists = [
      { id: 'p1', title: 'Pendente', checklist_assignments: [assignment({ id: 'x', due_at: daysFromNow(1) })] },
      { id: 'a1', title: 'Atrasado', checklist_assignments: [assignment({ id: 'y', due_at: daysAgo(1) })] },
    ];
    const { items } = buildHomeOperationalPriorities(checklists);
    expect(items.map((i) => i.status)).toEqual(['atrasado', 'pendente']);
  });

  it('F) 2 atrasados → prazo mais antigo primeiro', () => {
    const checklists = [
      { id: 'newer', title: 'Novo', checklist_assignments: [assignment({ due_at: daysAgo(1) })] },
      { id: 'older', title: 'Velho', checklist_assignments: [assignment({ due_at: daysAgo(9) })] },
    ];
    const { items } = buildHomeOperationalPriorities(checklists);
    expect(items.map((i) => i.checklistId)).toEqual(['older', 'newer']);
  });

  it('G) 2 pendentes → prazo mais próximo primeiro', () => {
    const checklists = [
      { id: 'far', title: 'Longe', checklist_assignments: [assignment({ due_at: daysFromNow(9) })] },
      { id: 'near', title: 'Perto', checklist_assignments: [assignment({ due_at: daysFromNow(1) })] },
    ];
    const { items } = buildHomeOperationalPriorities(checklists);
    expect(items.map((i) => i.checklistId)).toEqual(['near', 'far']);
  });

  it('H) múltiplos assignments (concluído + atrasado) → prazo do atrasado relevante', () => {
    const overdue = daysAgo(5);
    const checklists = [
      {
        id: 'c1',
        title: 'Casa 2',
        checklist_assignments: [
          assignment({ id: 'a1', completed_at: daysAgo(1) }),
          assignment({ id: 'a2', due_at: overdue }),
        ],
      },
    ];
    expect(resolveChecklistOperationalStatus(checklists[0])).toBe('atrasado');
    const { items } = buildHomeOperationalPriorities(checklists);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('atrasado');
    expect(items[0].dueAt).toBe(overdue);
  });

  it('H2) múltiplos pendentes → prazo mais próximo do assignment pendente', () => {
    const soon = daysFromNow(2);
    const later = daysFromNow(8);
    const checklists = [
      {
        id: 'c1',
        title: 'Abertura',
        checklist_assignments: [
          assignment({ id: 'a1', due_at: later }),
          assignment({ id: 'a2', due_at: soon }),
        ],
      },
    ];
    const { items } = buildHomeOperationalPriorities(checklists);
    expect(items[0].status).toBe('pendente');
    expect(items[0].dueAt).toBe(soon);
  });

  it('I) mais de 3 prioridades → apenas 3 itens + remaining', () => {
    const checklists = [1, 2, 3, 4, 5].map((n) => ({
      id: `c${n}`,
      title: `Atrasado ${n}`,
      checklist_assignments: [assignment({ due_at: daysAgo(n) })],
    }));
    const { items, remaining } = buildHomeOperationalPriorities(checklists);
    expect(items).toHaveLength(3);
    expect(remaining).toBe(2);
  });

  it('I2) remaining = 1 → singular', () => {
    const checklists = [1, 2, 3, 4].map((n) => ({
      id: `c${n}`,
      title: `Pendente ${n}`,
      checklist_assignments: [assignment({ due_at: daysFromNow(n) })],
    }));
    const { items, remaining } = buildHomeOperationalPriorities(checklists);
    expect(items).toHaveLength(3);
    expect(remaining).toBe(1);
  });

  it('limite customizável respeita o parâmetro', () => {
    const checklists = [1, 2, 3, 4].map((n) => ({
      id: `c${n}`,
      title: `Atrasado ${n}`,
      checklist_assignments: [assignment({ due_at: daysAgo(n) })],
    }));
    const { items, remaining } = buildHomeOperationalPriorities(checklists, 2);
    expect(items).toHaveLength(2);
    expect(remaining).toBe(2);
  });
});

describe('Home 6A.2 — formatDueDateShort', () => {
  it('formata ISO como dd/MM', () => {
    expect(formatDueDateShort(new Date(2026, 7, 17, 12, 0, 0).toISOString())).toBe('17/08');
    expect(formatDueDateShort(new Date(2026, 8, 7, 12, 0, 0).toISOString())).toBe('07/09');
  });

  it('null/undefined/inválido → null', () => {
    expect(formatDueDateShort(null)).toBeNull();
    expect(formatDueDateShort(undefined)).toBeNull();
    expect(formatDueDateShort('not-a-date')).toBeNull();
  });
});

describe('Home 6A.2 — componente HomeOperationalPriorities', () => {
  it('renderiza título, status, prazo dd/MM e CTA Abrir', () => {
    const checklists = [
      { id: 'c1', title: 'Casa 2', checklist_assignments: [assignment({ due_at: new Date(2026, 7, 17, 12).toISOString() })] },
      { id: 'c2', title: 'Abertura da loja', checklist_assignments: [assignment({ due_at: new Date(2026, 8, 30, 12).toISOString() })] },
    ];
    render(<HomeOperationalPriorities checklists={checklists} onOpen={() => {}} />);
    expect(screen.getByText('Prioridades')).toBeInTheDocument();
    const casaBtn = screen.getByRole('button', { name: /Casa 2/ });
    expect(casaBtn).toHaveTextContent('Atrasado');
    expect(casaBtn).toHaveTextContent('prazo 17/08');
    const lojaBtn = screen.getByRole('button', { name: /Abertura da loja/ });
    expect(lojaBtn).toHaveTextContent('Pendente');
    expect(lojaBtn).toHaveTextContent('prazo 30/09');
    expect(screen.getAllByText('Abrir')).toHaveLength(2);
  });

  it('J) nenhuma prioridade → seção não aparece', () => {
    const { container } = render(
      <HomeOperationalPriorities
        checklists={[
          { id: 'c1', title: 'Pronto', checklist_assignments: [assignment({ completed_at: daysAgo(1) })] },
          { id: 'c2', title: 'Sem prazo', checklist_assignments: [assignment()] },
        ]}
        onOpen={() => {}}
      />
    );
    expect(container.innerHTML).toBe('');
    expect(screen.queryByText('Prioridades')).toBeNull();
  });

  it('mais de 3 prioridades → mostra quantidade restante', () => {
    const checklists = [1, 2, 3, 4, 5].map((n) => ({
      id: `c${n}`,
      title: `Atrasado ${n}`,
      checklist_assignments: [assignment({ due_at: daysAgo(n) })],
    }));
    render(<HomeOperationalPriorities checklists={checklists} onOpen={() => {}} />);
    expect(screen.getAllByText('Abrir')).toHaveLength(3);
    expect(screen.getByText('+ 2 outras prioridades')).toBeInTheDocument();
  });

  it('clicar na linha chama onOpen com o checklistId', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const checklists = [
      { id: 'c1', title: 'Casa 2', checklist_assignments: [assignment({ due_at: daysAgo(1) })] },
    ];
    render(<HomeOperationalPriorities checklists={checklists} onOpen={onOpen} />);
    await user.click(screen.getByText('Casa 2'));
    expect(onOpen).toHaveBeenCalledWith('c1');
  });
});

describe('Home 6A.2 — estrutura da rota /inicio (L, M, N)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/inicio.tsx'), 'utf8');

  it('Prioridades fica entre o resumo e o título "Checklists"', () => {
    const summaryIdx = source.indexOf('<HomeOperationalSummary checklists={checklists} />');
    const prioritiesIdx = source.indexOf('<HomeOperationalPriorities');
    const headingIdx = source.indexOf('{isSelectionMode ? `${selectedIds.length} selecionado(s)` : "Checklists"}');
    expect(summaryIdx).toBeGreaterThan(-1);
    expect(prioritiesIdx).toBeGreaterThan(summaryIdx);
    expect(headingIdx).toBeGreaterThan(prioritiesIdx);
  });

  it('L) Viewer → callback navega para /executar/$id', () => {
    const prioritiesSection = source.slice(
      source.indexOf('<HomeOperationalPriorities'),
      source.indexOf('<div className="flex items-center justify-between">')
    );
    expect(prioritiesSection).toContain(`to: "/executar/$id"`);
    expect(prioritiesSection).toContain(`params: { id: checklistId }`);
    expect(prioritiesSection).toContain('isViewer');
  });

  it('M) demais roles → callback navega para /checklist?id=...', () => {
    const prioritiesSection = source.slice(
      source.indexOf('<HomeOperationalPriorities'),
      source.indexOf('<div className="flex items-center justify-between">')
    );
    expect(prioritiesSection).toContain(`to: "/checklist"`);
    expect(prioritiesSection).toContain(`search: { id: checklistId }`);
  });

  it('N) nenhuma query Supabase nova na seção de prioridades', () => {
    const prioritiesSection = source.slice(
      source.indexOf('<HomeOperationalPriorities'),
      source.indexOf('<div className="flex items-center justify-between">')
    );
    expect(prioritiesSection).not.toContain('supabase');
    const componentSource = readFileSync(
      resolve(process.cwd(), 'src/components/home/HomeOperationalPriorities.tsx'),
      'utf8'
    );
    expect(componentSource).not.toContain('supabase');
  });
});

describe('Home 6A.2 — remoção da mensagem genérica (K)', () => {
  it('HomeOperationalSummary não renderiza mais a frase de atenção', () => {
    const summarySource = readFileSync(
      resolve(process.cwd(), 'src/components/home/HomeOperationalSummary.tsx'),
      'utf8'
    );
    expect(summarySource).not.toContain('getHomeAttentionMessage');
    expect(summarySource).not.toContain('está atrasado');
    expect(summarySource).not.toContain('estão atrasados');
  });

  it('getHomeAttentionMessage foi removida do helper', () => {
    const helperSource = readFileSync(
      resolve(process.cwd(), 'src/lib/home-operational-summary.ts'),
      'utf8'
    );
    expect(helperSource).not.toContain('getHomeAttentionMessage');
  });
});