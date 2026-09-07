import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ChecklistCardQuickActions } from '@/components/checklists/ChecklistCardQuickActions';

function makeProps(overrides: Partial<Parameters<typeof ChecklistCardQuickActions>[0]> = {}) {
  return {
    isPublished: true,
    onEdit: vi.fn(),
    onCopyLink: vi.fn(),
    onOpenSubmissions: vi.fn(),
    onPublish: vi.fn(),
    ...overrides,
  };
}

describe('Execution 5E.0 — atalhos do card publicado (E)', () => {
  it('card publicado oferece Editar, Copiar link e Envios', () => {
    render(<ChecklistCardQuickActions {...makeProps()} />);
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envios' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
  });

  it('cliques disparam os handlers certos', () => {
    const props = makeProps();
    render(<ChecklistCardQuickActions {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Envios' }));
    expect(props.onEdit).toHaveBeenCalledTimes(1);
    expect(props.onCopyLink).toHaveBeenCalledTimes(1);
    expect(props.onOpenSubmissions).toHaveBeenCalledTimes(1);
  });
});

describe('Execution 5E.0 — card rascunho (F)', () => {
  it('rascunho NÃO oferece Copiar link público nem Envios', () => {
    render(<ChecklistCardQuickActions {...makeProps({ isPublished: false })} />);
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copiar link' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Envios' })).not.toBeInTheDocument();
  });

  it('Publicar no rascunho dispara onPublish', () => {
    const props = makeProps({ isPublished: false });
    render(<ChecklistCardQuickActions {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(props.onPublish).toHaveBeenCalledTimes(1);
  });
});

describe('Execution 5E.0 — estrutura da página (G/H)', () => {
  const organizarSource = readFileSync(resolve(process.cwd(), 'src/routes/organizar.tsx'), 'utf8');
  const checklistSource = readFileSync(resolve(process.cwd(), 'src/routes/checklist.tsx'), 'utf8');

  it('G) o menu "..." (MoreHorizontal) do card continua presente', () => {
    // O trigger do menu existe dentro do componente do card e o quick actions é adicionado, não substitutivo
    expect(organizarSource).toContain('ChecklistCardQuickActions');
    expect(organizarSource).toContain('<MoreHorizontal');
    // O item Copiar link do menu "..." existe somente para publicados
    expect(organizarSource).toContain('checklist.is_published === true && (');
  });

  it('G2) navegação Envios usa o contrato settings=envios', () => {
    expect(organizarSource).toContain('settings: "envios"');
  });

  it('H) aba envios monta SubmissionsTab', () => {
    const enviosSection = checklistSource.slice(checklistSource.indexOf('settingsActiveTab === "envios"'));
    expect(enviosSection).toContain('<SubmissionsTab');
  });
});