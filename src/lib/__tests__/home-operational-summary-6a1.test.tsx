import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import {
  resolveChecklistOperationalStatus,
  buildHomeOperationalSummary,
  getHomeAttentionMessage,
} from '../home-operational-summary';
import { HomeOperationalSummary } from '../../components/home/HomeOperationalSummary';

const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

const assignment = (over: Partial<{ id: string; due_at: string | null; completed_at: string | null }> = {}) => ({
  id: 'a1',
  due_at: null,
  completed_at: null,
  ...over,
});

describe('Home 6A.1 — resolveChecklistOperationalStatus', () => {
  it('A) checklist com assignment concluído → concluido', () => {
    const checklist = { id: 'c1', checklist_assignments: [assignment({ completed_at: past })] };
    expect(resolveChecklistOperationalStatus(checklist)).toBe('concluido');
  });

  it('B) checklist com assignment pendente → pendente', () => {
    const checklist = { id: 'c1', checklist_assignments: [assignment({ due_at: future })] };
    expect(resolveChecklistOperationalStatus(checklist)).toBe('pendente');
  });

  it('C) checklist com assignment atrasado → atrasado', () => {
    const checklist = { id: 'c1', checklist_assignments: [assignment({ due_at: past })] };
    expect(resolveChecklistOperationalStatus(checklist)).toBe('atrasado');
  });

  it('D) concluído + atrasado → atrasado (prioridade)', () => {
    const checklist = {
      id: 'c1',
      checklist_assignments: [
        assignment({ completed_at: past }),
        assignment({ id: 'a2', due_at: past }),
      ],
    };
    expect(resolveChecklistOperationalStatus(checklist)).toBe('atrasado');
  });

  it('E) concluído + pendente → pendente (prioridade)', () => {
    const checklist = {
      id: 'c1',
      checklist_assignments: [
        assignment({ completed_at: past }),
        assignment({ id: 'a2', due_at: future }),
      ],
    };
    expect(resolveChecklistOperationalStatus(checklist)).toBe('pendente');
  });

  it('F) checklist sem assignment → sem_status', () => {
    expect(resolveChecklistOperationalStatus({ id: 'c1' })).toBe('sem_status');
    expect(resolveChecklistOperationalStatus({ id: 'c1', checklist_assignments: [] })).toBe('sem_status');
    expect(resolveChecklistOperationalStatus(null)).toBe('sem_status');
  });

  it('F2) assignments sem prazo (sem_prazo) → sem_status', () => {
    const checklist = { id: 'c1', checklist_assignments: [assignment()] };
    expect(resolveChecklistOperationalStatus(checklist)).toBe('sem_status');
  });
});

describe('Home 6A.1 — buildHomeOperationalSummary (contagem)', () => {
  it('G) 4 checklists: 2 concluídos + 1 pendente + 1 atrasado', () => {
    const checklists = [
      { id: 'c1', checklist_assignments: [assignment({ completed_at: past })] },
      { id: 'c2', checklist_assignments: [assignment({ completed_at: past })] },
      { id: 'c3', checklist_assignments: [assignment({ due_at: future })] },
      { id: 'c4', checklist_assignments: [assignment({ due_at: past })] },
    ];
    expect(buildHomeOperationalSummary(checklists)).toEqual({
      total: 4,
      concluidos: 2,
      pendentes: 1,
      atrasados: 1,
    });
  });

  it('H) múltiplos assignments no mesmo checklist não contam duas vezes', () => {
    const checklists = [
      {
        id: 'c1',
        checklist_assignments: [
          assignment({ completed_at: past }),
          assignment({ id: 'a2', completed_at: past }),
        ],
      },
      {
        id: 'c2',
        checklist_assignments: [assignment({ due_at: future })],
      },
    ];
    expect(buildHomeOperationalSummary(checklists)).toEqual({
      total: 2,
      concluidos: 1,
      pendentes: 1,
      atrasados: 0,
    });
  });

  it('H2) sem_status nunca entra nos buckets', () => {
    const checklists = [
      { id: 'c1' },
      { id: 'c2', checklist_assignments: [assignment()] },
      { id: 'c3', checklist_assignments: [assignment({ due_at: past })] },
    ];
    const summary = buildHomeOperationalSummary(checklists);
    expect(summary.total).toBe(3);
    expect(summary.concluidos + summary.pendentes + summary.atrasados).toBe(1);
  });
});

describe('Home 6A.1 — getHomeAttentionMessage', () => {
  it('I) atrasado tem prioridade sobre pendente', () => {
    expect(getHomeAttentionMessage({ total: 4, concluidos: 1, pendentes: 3, atrasados: 1 })).toBe(
      '1 checklist está atrasado'
    );
  });

  it('I2) pluralização correta', () => {
    expect(getHomeAttentionMessage({ total: 3, concluidos: 0, pendentes: 0, atrasados: 2 })).toBe(
      '2 checklists estão atrasados'
    );
    expect(getHomeAttentionMessage({ total: 3, concluidos: 2, pendentes: 1, atrasados: 0 })).toBe(
      '1 checklist está pendente'
    );
    expect(getHomeAttentionMessage({ total: 5, concluidos: 2, pendentes: 3, atrasados: 0 })).toBe(
      '3 checklists estão pendentes'
    );
  });

  it('I3) sem atraso/pendência → sem alerta', () => {
    expect(getHomeAttentionMessage({ total: 2, concluidos: 2, pendentes: 0, atrasados: 0 })).toBeNull();
    expect(getHomeAttentionMessage({ total: 0, concluidos: 0, pendentes: 0, atrasados: 0 })).toBeNull();
  });
});

describe('Home 6A.1 — componente HomeOperationalSummary', () => {
  it('renderiza os 4 indicadores com os valores corretos', () => {
    const checklists = [
      { id: 'c1', checklist_assignments: [assignment({ completed_at: past })] },
      { id: 'c2', checklist_assignments: [assignment({ due_at: past })] },
    ];
    render(<HomeOperationalSummary checklists={checklists} />);
    expect(screen.getByText('Visão de hoje')).toBeInTheDocument();
    expect(screen.getByText('Checklists')).toBeInTheDocument();
    expect(screen.getByText('Concluídos')).toBeInTheDocument();
    expect(screen.getByText('Pendentes')).toBeInTheDocument();
    expect(screen.getByText('Atrasados')).toBeInTheDocument();
    expect(screen.getByText('1 checklist está atrasado')).toBeInTheDocument();
  });

  it('grid responsivo: 2 colunas no mobile, 4 no desktop', () => {
    const { container } = render(<HomeOperationalSummary checklists={[]} />);
    expect(container.querySelector('.grid.grid-cols-2.sm\\:grid-cols-4')).not.toBeNull();
  });

  it('sem atrasos nem pendências → nenhuma mensagem de atenção', () => {
    const checklists = [{ id: 'c1', checklist_assignments: [assignment({ completed_at: past })] }];
    render(<HomeOperationalSummary checklists={checklists} />);
    expect(screen.queryByText(/está atrasado/i)).toBeNull();
    expect(screen.queryByText(/estão atrasados/i)).toBeNull();
    expect(screen.queryByText(/está pendente/i)).toBeNull();
    expect(screen.queryByText(/estão pendentes/i)).toBeNull();
    expect(screen.getByText('Concluídos')).toBeInTheDocument();
  });
});

describe('Home 6A.1 — estrutura da rota /inicio (J)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/inicio.tsx'), 'utf8');

  it('J) resumo operacional vem ANTES do título/lista "Checklists"', () => {
    const summaryIdx = source.indexOf('<HomeOperationalSummary checklists={checklists} />');
    const headingIdx = source.indexOf('{isSelectionMode ? `${selectedIds.length} selecionado(s)` : "Checklists"}');
    expect(summaryIdx).toBeGreaterThan(-1);
    expect(headingIdx).toBeGreaterThan(summaryIdx);
  });

  it('J2) a lista/cards de checklists continua presente abaixo do resumo', () => {
    expect(source).toContain('{checklists.map((item) => (');
    const headingIdx = source.indexOf('"Checklists"}');
    const listIdx = source.indexOf('{checklists.map((item) => (');
    expect(listIdx).toBeGreaterThan(headingIdx);
  });

  it('J3) o resumo usa apenas os checklists já carregados (sem query nova)', () => {
    const summarySection = source.slice(
      source.indexOf('<HomeOperationalSummary checklists={checklists} />') - 400,
      source.indexOf('<HomeOperationalSummary checklists={checklists} />')
    );
    expect(summarySection).not.toContain('supabase');
  });
});