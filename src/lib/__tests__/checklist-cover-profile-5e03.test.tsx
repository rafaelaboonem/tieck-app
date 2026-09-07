import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { ChecklistCoverProfile } from '../../components/ChecklistCoverProfile';

const baseSettings = {
  logoWidth: '100px',
  logoHeight: '100px',
  logoRadius: '50%',
};

describe('Execution 5E.0.3 — ChecklistCoverProfile (header compartilhado)', () => {
  it('A) renderiza capa + perfil quando ambos existem', () => {
    const blocks = [
      { type: 'image', variant: 'cover', src: '/cover.jpg', position: { x: 0, y: 0, zoom: 1 } },
      { type: 'image', variant: 'profile', src: '/profile.jpg', position: { x: 0, y: 0, zoom: 1 } },
      { type: 'text', value: 'Corpo' },
    ];
    render(<ChecklistCoverProfile blocks={blocks} settings={baseSettings} />);
    expect(screen.getByAltText('Cover')).toBeInTheDocument();
    expect(screen.getByAltText('Profile')).toBeInTheDocument();
  });

  it('B) perfil sobrepõe a capa com posicionamento absoluto centralizado', () => {
    const blocks = [
      { type: 'image', variant: 'cover', src: '/cover.jpg' },
      { type: 'image', variant: 'profile', src: '/profile.jpg' },
    ];
    const { container } = render(<ChecklistCoverProfile blocks={blocks} settings={baseSettings} />);
    const profileWrap = container.querySelector('div.absolute.left-1\\/2');
    expect(profileWrap).not.toBeNull();
    expect(profileWrap?.className).toContain('-translate-x-1/2');
    expect(profileWrap?.className).toContain('translate-y-1/2');
  });

  it('C) perfil sem capa fica centralizado no fluxo normal', () => {
    const blocks = [{ type: 'image', variant: 'profile', src: '/profile.jpg' }];
    const { container } = render(<ChecklistCoverProfile blocks={blocks} settings={baseSettings} />);
    expect(container.querySelector('div.flex.justify-center')).not.toBeNull();
  });

  it('D) sem capa/perfil mantém o espaçamento base (mb-10) como no preview', () => {
    const { container } = render(<ChecklistCoverProfile blocks={[]} settings={baseSettings} />);
    const wrap = container.firstChild as HTMLElement;
    expect(wrap.className).toContain('mb-10');
    expect(wrap.className).not.toContain('mb-20');
  });

  it('E) capa + perfil usam espaçamento maior (mb-20)', () => {
    const blocks = [
      { type: 'image', variant: 'cover', src: '/cover.jpg' },
      { type: 'image', variant: 'profile', src: '/profile.jpg' },
    ];
    const { container } = render(<ChecklistCoverProfile blocks={blocks} settings={baseSettings} />);
    expect((container.firstChild as HTMLElement).className).toContain('mb-20');
  });

  it('F) aplica logoWidth/logoHeight/logoRadius do settings no perfil', () => {
    const blocks = [{ type: 'image', variant: 'profile', src: '/profile.jpg' }];
    const { container } = render(
      <ChecklistCoverProfile blocks={blocks} settings={{ logoWidth: '80px', logoHeight: '64px', logoRadius: '12px' }} />
    );
    const logo = container.querySelector('[style*="80px"]') as HTMLElement;
    expect(logo).not.toBeNull();
    expect(logo.style.height).toBe('64px');
    expect(logo.style.borderRadius).toBe('12px');
  });

  it('G) ignora blocos de imagem comuns (sem variante) no header', () => {
    const blocks = [{ type: 'image', src: '/plain.jpg' }];
    render(<ChecklistCoverProfile blocks={blocks} settings={baseSettings} />);
    expect(screen.queryByAltText('Cover')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Profile')).not.toBeInTheDocument();
  });
});