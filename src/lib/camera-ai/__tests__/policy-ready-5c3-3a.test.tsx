import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { CameraBlockEditor } from '../../../routes/checklist';
import { CameraSettingsPanel } from '@/components/camera-ai/CameraSettingsPanel';
import { hashQuestion } from '../hashing';
import type { CameraVerificationPolicyV1 } from '../schema.functions';

// --- Mocks shared by both layers (the real CameraSettingsPanel is used everywhere) ---

vi.mock('@/components/camera-ai/CameraBlockCard', () => ({
  CameraBlockCard: ({ onSelect, isActive }: any) => (
    <div data-testid="camera-card" onClick={onSelect} data-active={isActive}>
      Camera Card
    </div>
  ),
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
  SheetDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/accordion', () => ({
  Accordion: ({ children }: any) => <div>{children}</div>,
  AccordionItem: ({ children }: any) => <div>{children}</div>,
  AccordionTrigger: ({ children }: any) => <button>{children}</button>,
  AccordionContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/camera-ai/CameraVerificationTestDialog', () => ({
  CameraVerificationTestDialog: () => null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
    },
  },
}));

// NOTE: hashing is intentionally NOT mocked — readiness must use the same
// canonical hashQuestion(title, description) the backend uses.

async function makePolicy(title: string, description: string): Promise<CameraVerificationPolicyV1> {
  return {
    version: 1,
    verifiability: 'visual',
    target: 'bancada',
    condition: 'limpa',
    targetDescription: '',
    conditionDescription: '',
    requiredVisibleEvidence: ['bancada visível'],
    rejectionSignals: ['sujeira visível'],
    notObservableSignals: [],
    summary: 'Verifica se a bancada está limpa.',
    questionHash: await hashQuestion(title, description),
    source: 'generated',
  };
}

const testButton = () => screen.getByRole('button', { name: /testar verificação/i });
const updatingHint = () => screen.queryByText(/atualizando a verificação da câmera/i);
const saveHint = () => screen.queryByText(/salve as alterações antes de testar/i);

describe('CameraSettingsPanel — botão "Testar verificação" (5C.3.3-A)', () => {
  const baseBlock = {
    id: 'b1',
    title: 'Pia limpa?',
    description: 'Foto da pia',
    required: true,
    mode: 'auto',
  };

  const baseProps = {
    block: baseBlock as any,
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    isCompiling: false,
    isCameraPolicyReady: true,
    cameraAiNeedsRevalidation: false,
    syncFailed: false,
    checklistId: 'c1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A: policy válida + hash atual → Testar habilitado, sem avisos', () => {
    render(<CameraSettingsPanel {...baseProps} />);
    expect(testButton()).not.toBeDisabled();
    expect(updatingHint()).toBeNull();
    expect(saveHint()).toBeNull();
  });

  it('B: revalidação pendente (cameraAiNeedsRevalidation) → Testar desabilitado + aviso', () => {
    render(
      <CameraSettingsPanel
        {...baseProps}
        isCameraPolicyReady={false}
        cameraAiNeedsRevalidation={true}
      />
    );
    expect(testButton()).toBeDisabled();
    expect(updatingHint()).not.toBeNull();
  });

  it('C: hash da policy não corresponde (description mudou) → Testar desabilitado + aviso', () => {
    // O painel recebe isCameraPolicyReady=false quando o hash diverge (calculado no editor).
    render(
      <CameraSettingsPanel
        {...baseProps}
        isCameraPolicyReady={false}
        cameraAiNeedsRevalidation={false}
      />
    );
    expect(testButton()).toBeDisabled();
    expect(updatingHint()).not.toBeNull();
  });

  it('D: compilação em andamento → Testar desabilitado + aviso', () => {
    render(<CameraSettingsPanel {...baseProps} isCompiling={true} />);
    expect(testButton()).toBeDisabled();
    expect(updatingHint()).not.toBeNull();
  });

  it('E: policy ausente → Testar desabilitado + aviso', () => {
    render(
      <CameraSettingsPanel
        {...baseProps}
        block={{ id: 'b1', title: 'Pia limpa?', description: 'Foto da pia' } as any}
        isCameraPolicyReady={false}
      />
    );
    expect(testButton()).toBeDisabled();
    expect(updatingHint()).not.toBeNull();
  });

  it('alterações não salvas no draft → Testar desabilitado + aviso de salvar', () => {
    render(<CameraSettingsPanel {...baseProps} />);
    fireEvent.change(screen.getByDisplayValue('Pia limpa?'), { target: { value: 'Outra pergunta' } });
    expect(testButton()).toBeDisabled();
    expect(saveHint()).not.toBeNull();
  });

  it('5C.3.3-C.1: policy válida + hash atual + revalidation false + isCompiling false + syncFailed true → Testar DESABILITADO + mensagem de falha', () => {
    // A barreira NÃO pode depender de revalidation: todos os sinais de "pronto"
    // estão verdes — apenas syncFailed=true mantém o fail-closed.
    render(<CameraSettingsPanel {...baseProps} syncFailed={true} />);
    expect(testButton()).toBeDisabled();
    expect(screen.queryByText(/não foi possível atualizar a verificação/i)).not.toBeNull();
    expect(updatingHint()).toBeNull();
  });

  it('5C.3.3-C.1: syncFailed=true tem precedência sobre o aviso de atualização', () => {
    render(
      <CameraSettingsPanel
        {...baseProps}
        isCameraPolicyReady={false}
        cameraAiNeedsRevalidation={true}
        syncFailed={true}
      />
    );
    expect(testButton()).toBeDisabled();
    expect(screen.queryByText(/não foi possível atualizar a verificação/i)).not.toBeNull();
    expect(updatingHint()).toBeNull();
  });
});

describe('CameraBlockEditor — derivação isCameraPolicyReady (5C.3.3-A)', () => {
  const defaultProps = {
    block: {} as any,
    isActive: false,
    currentChecklistId: 'c1',
    updateBlock: vi.fn(),
    removeBlock: vi.fn(),
    setActiveBlockId: vi.fn(),
    textColor: '#000',
    textareaRefs: { current: {} } as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const openPanel = () => fireEvent.click(screen.getByTestId('camera-card'));

  it('A: policy válida + hash atual → Testar habilitado', async () => {
    const title = 'Pia limpa?';
    const description = 'Foto da pia';
    const policy = await makePolicy(title, description);

    render(
      <CameraBlockEditor
        {...defaultProps}
        block={{ id: 'b1', type: 'camera', title, description, cameraAiPolicy: policy } as any}
      />
    );
    openPanel();

    await waitFor(() => {
      expect(testButton()).not.toBeDisabled();
    });
    expect(updatingHint()).toBeNull();
  });

  it('B: título muda → hash diverge → Testar desabilitado + revalidação marcada', async () => {
    const stalePolicy = await makePolicy('Pergunta antiga', 'Desc');

    render(
      <CameraBlockEditor
        {...defaultProps}
        block={{ id: 'b1', type: 'camera', title: 'Pergunta nova', description: 'Desc', cameraAiPolicy: stalePolicy } as any}
      />
    );
    openPanel();

    await waitFor(() => {
      expect(testButton()).toBeDisabled();
    });
    expect(updatingHint()).not.toBeNull();

    // O efeito existente marca o bloco para revalidação quando o hash diverge.
    await waitFor(() => {
      expect(defaultProps.updateBlock).toHaveBeenCalledWith('b1', { cameraAiNeedsRevalidation: true });
    });
  });

  it('C: description muda → hash diverge → Testar desabilitado', async () => {
    const stalePolicy = await makePolicy('Pia limpa?', 'Instrução antiga');

    render(
      <CameraBlockEditor
        {...defaultProps}
        block={{ id: 'b1', type: 'camera', title: 'Pia limpa?', description: 'Instrução nova', cameraAiPolicy: stalePolicy } as any}
      />
    );
    openPanel();

    await waitFor(() => {
      expect(testButton()).toBeDisabled();
    });
    expect(updatingHint()).not.toBeNull();
  });

  it('E: policy ausente → Testar desabilitado', async () => {
    render(
      <CameraBlockEditor
        {...defaultProps}
        block={{ id: 'b1', type: 'camera', title: 'Pia limpa?', description: 'Foto da pia' } as any}
      />
    );
    openPanel();

    await waitFor(() => {
      expect(testButton()).toBeDisabled();
    });
    expect(updatingHint()).not.toBeNull();
  });
});