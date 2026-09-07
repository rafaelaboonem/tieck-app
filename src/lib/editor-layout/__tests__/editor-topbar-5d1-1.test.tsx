import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { topbarActionPlacement, type TopbarActionId } from '@/lib/editor-layout';
import { EditorTopbarOverflowMenu } from '@/components/editor/EditorTopbarOverflowMenu';

const ALL_ACTIONS: TopbarActionId[] = [
  'integrations',
  'history',
  'settings',
  'customize',
  'preview',
  'publish',
];

describe('Editor Mobile 5D.1.1 — placement das ações (A/B/C/D/F)', () => {
  it('A) mobile: Publicar fica diretamente acessível', () => {
    expect(topbarActionPlacement(true, 'publish')).toBe('direct');
  });

  it('B) mobile: Preview fica diretamente acessível', () => {
    expect(topbarActionPlacement(true, 'preview')).toBe('direct');
  });

  it('C) mobile: ações secundárias vão para o overflow menu', () => {
    for (const action of ['integrations', 'history', 'settings', 'customize'] as TopbarActionId[]) {
      expect(topbarActionPlacement(true, action)).toBe('overflow');
    }
  });

  it('D) desktop e primeiro render (SSR) mantêm todas as ações separadas', () => {
    for (const action of ALL_ACTIONS) {
      expect(topbarActionPlacement(false, action)).toBe('direct');
      expect(topbarActionPlacement(undefined, action)).toBe('direct');
    }
  });

  it('F) nenhuma ação é escondida — e Publicar nunca é overflow no mobile', () => {
    for (const action of ALL_ACTIONS) {
      const placement = topbarActionPlacement(true, action);
      expect(['direct', 'overflow']).toContain(placement);
    }
    expect(topbarActionPlacement(true, 'publish')).not.toBe('overflow');
  });
});

describe('Editor Mobile 5D.1.1 — menu overflow real (C/E)', () => {
  const makeActions = () => [
    { key: 'history', label: 'Histórico', icon: <span>🕘</span>, onClick: vi.fn() },
    { key: 'settings', label: 'Configuração', icon: <span>⚙️</span>, onClick: vi.fn() },
    { key: 'customize', label: 'Personalizar', icon: <span>🎨</span>, onClick: vi.fn() },
  ];

  it('renderiza o trigger com alvo de toque mobile (~36px) e aria-label', () => {
    render(<EditorTopbarOverflowMenu actions={makeActions()} triggerClassName="p-2.5 -m-2.5" />);
    const trigger = screen.getByRole('button', { name: 'Mais ações' });
    expect(trigger).toBeInTheDocument();
    expect(trigger.className).toContain('p-2.5');
  });

  it('menu fechado por padrão — ações não visíveis até tocar no trigger', () => {
    render(<EditorTopbarOverflowMenu actions={makeActions()} />);
    expect(screen.queryByText('Histórico')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
    expect(screen.getByRole('menuitem', { name: /Histórico/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Configuração/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Personalizar/ })).toBeInTheDocument();
  });

  it('E) escolher uma ação executa o handler e fecha o menu', () => {
    const actions = makeActions();
    render(<EditorTopbarOverflowMenu actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Configuração/ }));
    expect(actions[1].onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(screen.queryByText('Histórico')).not.toBeInTheDocument();
  });

  it('E2) tocar fora (overlay) fecha o menu sem executar nenhuma ação', () => {
    const actions = makeActions();
    render(<EditorTopbarOverflowMenu actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(document.querySelector('div.fixed.inset-0') as HTMLElement);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(actions[0].onClick).not.toHaveBeenCalled();
  });

  it('sem ações o menu não renderiza nada (viewer sem extras)', () => {
    const { container } = render(<EditorTopbarOverflowMenu actions={[]} />);
    expect(container.firstChild).toBeNull();
  });
});