import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React, { useState } from 'react';
import { CameraBlockEditor } from '../../../routes/checklist';
import { hashQuestion } from '../hashing';
import type { CameraVerificationPolicyV1 } from '../schema.functions';

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
const updatingHint = () => screen.getByText(/atualizando a verificação da câmera/i);

function SyncHarness({
  initialBlock,
  syncImpl,
}: {
  initialBlock: any;
  syncImpl: (id: string, nextBlock: any, apply: (patch: any) => void) => Promise<boolean>;
}) {
  const [block, setBlock] = useState(initialBlock);
  return (
    <CameraBlockEditor
      block={block}
      isActive={false}
      currentChecklistId="c1"
      updateBlock={(id, patch) => setBlock((b: any) => ({ ...b, ...patch }))}
      removeBlock={vi.fn()}
      setActiveBlockId={vi.fn()}
      textColor="#000"
      textareaRefs={{ current: {} } as any}
      onSyncCameraPolicy={async (id, nb) => {
        // 5C.3.3-B: o caminho de auto-recovery chama sem nextBlock — nada a sincronizar aqui.
        if (!nb) return true;
        return syncImpl(id, nb, (patch) => setBlock((b: any) => ({ ...b, ...patch })));
      }}
    />
  );
}

describe('CameraBlockEditor — wiring do save autoritativo (5C.3.3-B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('salvar com pergunta divergente → updateBlock com revalidation true e sync chamado', async () => {
    const oldPolicy = await makePolicy('Pergunta antiga', 'Desc');
    const updateBlock = vi.fn();
    const onSync = vi.fn(async () => true);

    render(
      <CameraBlockEditor
        block={{ id: 'b1', type: 'camera', title: 'Pergunta antiga', description: 'Desc', cameraAiPolicy: oldPolicy }}
        isActive={false}
        currentChecklistId="c1"
        updateBlock={updateBlock}
        removeBlock={vi.fn()}
        setActiveBlockId={vi.fn()}
        textColor="#000"
        textareaRefs={{ current: {} } as any}
        onSyncCameraPolicy={onSync}
      />
    );

    fireEvent.click(screen.getByTestId('camera-card'));
    fireEvent.change(screen.getByDisplayValue('Pergunta antiga'), { target: { value: 'Pergunta nova' } });
    fireEvent.click(screen.getByText('Salvar bloco'));

    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(1));
    expect(onSync).toHaveBeenCalledWith('b1', expect.objectContaining({
      cameraAiNeedsRevalidation: true,
      title: 'Pergunta nova',
    }));
    expect(updateBlock).toHaveBeenCalledWith('b1', expect.objectContaining({
      cameraAiNeedsRevalidation: true,
      title: 'Pergunta nova',
    }));
  });

  it('salvar com pergunta igual → sync chamado com revalidation false', async () => {
    const policy = await makePolicy('Pia limpa?', 'Foto da pia');
    const onSync = vi.fn(async () => true);

    render(
      <CameraBlockEditor
        block={{ id: 'b1', type: 'camera', title: 'Pia limpa?', description: 'Foto da pia', cameraAiPolicy: policy }}
        isActive={false}
        currentChecklistId="c1"
        updateBlock={vi.fn()}
        removeBlock={vi.fn()}
        setActiveBlockId={vi.fn()}
        textColor="#000"
        textareaRefs={{ current: {} } as any}
        onSyncCameraPolicy={onSync}
      />
    );

    fireEvent.click(screen.getByTestId('camera-card'));
    fireEvent.click(screen.getByRole('switch')); // muda só `required`, pergunta intacta
    fireEvent.click(screen.getByText('Salvar bloco'));

    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(1));
    expect(onSync).toHaveBeenCalledWith('b1', expect.objectContaining({
      cameraAiNeedsRevalidation: false,
      title: 'Pia limpa?',
    }));
  });

  it('H: botão só habilita após o fluxo autoritativo completo', async () => {
    const oldPolicy = await makePolicy('Pergunta antiga', 'Desc');
    // policy pré-computada: nenhuma operação assíncrona (crypto) no caminho pós-resolve
    const freshPolicy = await makePolicy('Pergunta nova', 'Desc');
    let resolveSync: (v: boolean) => void = () => {};
    let appliedPolicy: CameraVerificationPolicyV1 | null = null;

    render(
      <SyncHarness
        initialBlock={{ id: 'b1', type: 'camera', title: 'Pergunta antiga', description: 'Desc', cameraAiPolicy: oldPolicy }}
        syncImpl={async (_id, _nextBlock, apply) => {
          await new Promise<boolean>((r) => { resolveSync = r; });
          appliedPolicy = freshPolicy;
          apply({ cameraAiPolicy: freshPolicy, cameraAiNeedsRevalidation: false });
          return true;
        }}
      />
    );

    fireEvent.click(screen.getByTestId('camera-card'));
    fireEvent.change(screen.getByDisplayValue('Pergunta antiga'), { target: { value: 'Pergunta nova' } });
    fireEvent.click(screen.getByText('Salvar bloco'));

    // enquanto a sincronização está pendente, o botão permanece bloqueado (fail-closed)
    await waitFor(() => expect(testButton()).toBeDisabled());
    expect(updatingHint()).toBeDefined();
    expect(appliedPolicy).toBeNull();

    // somente após a policy ser persistida (simulada) o teste é liberado
    resolveSync(true);
    await waitFor(() => expect(testButton()).not.toBeDisabled(), { timeout: 5000 });
    expect(screen.queryByText(/atualizando a verificação da câmera/i)).toBeNull();
    expect(appliedPolicy).not.toBeNull();
  });

  it('5C.3.3-B.1: revalidation preexistente + policy com hash igual → flag NÃO é limpa no save', async () => {
    const policy = await makePolicy('Pia limpa?', 'Foto da pia');
    const updateBlock = vi.fn();
    const onSync = vi.fn(async () => true);

    render(
      <CameraBlockEditor
        block={{
          id: 'b1',
          type: 'camera',
          title: 'Pia limpa?',
          description: 'Foto da pia',
          cameraAiPolicy: policy,
          cameraAiNeedsRevalidation: true,
        }}
        isActive={false}
        currentChecklistId="c1"
        updateBlock={updateBlock}
        removeBlock={vi.fn()}
        setActiveBlockId={vi.fn()}
        textColor="#000"
        textareaRefs={{ current: {} } as any}
        onSyncCameraPolicy={onSync}
      />
    );

    fireEvent.click(screen.getByTestId('camera-card'));
    fireEvent.click(screen.getByRole('switch')); // mudança não-camera, pergunta intacta
    fireEvent.click(screen.getByText('Salvar bloco'));

    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(1));
    // fail-closed: o flag pendente é PRESERVADO até a conclusão autoritativa
    expect(updateBlock).toHaveBeenCalledWith('b1', expect.objectContaining({ cameraAiNeedsRevalidation: true }));
    expect(onSync).toHaveBeenCalledWith('b1', expect.objectContaining({ cameraAiNeedsRevalidation: true }));
  });

  it('5C.3.3-B.1: falha da sync → flag continua true e Testar bloqueado', async () => {
    const oldPolicy = await makePolicy('Pergunta antiga', 'Desc');

    render(
      <SyncHarness
        initialBlock={{
          id: 'b1',
          type: 'camera',
          title: 'Pergunta antiga',
          description: 'Desc',
          cameraAiPolicy: oldPolicy,
          cameraAiNeedsRevalidation: true,
        }}
        syncImpl={async () => false}
      />
    );

    fireEvent.click(screen.getByTestId('camera-card'));
    fireEvent.change(screen.getByDisplayValue('Pergunta antiga'), { target: { value: 'Pergunta nova' } });
    fireEvent.click(screen.getByText('Salvar bloco'));

    // mesmo após a falha, a revalidação pendente mantém o teste bloqueado e o
    // painel mostra o erro fail-closed (5C.3.3-C) em vez do estado de atualização
    await waitFor(() => expect(testButton()).toBeDisabled());
    expect(screen.queryByText(/não foi possível atualizar a verificação/i)).not.toBeNull();
  });

  it('5C.3.3-C.1: alteração NÃO-pergunta (mode) com policy válida + persistência falha → syncFailed bloqueia Testar sem depender de revalidation', async () => {
    const validPolicy = await makePolicy('Pergunta atual', 'Desc');

    render(
      <SyncHarness
        initialBlock={{
          id: 'b1',
          type: 'camera',
          title: 'Pergunta atual',
          description: 'Desc',
          cameraAiPolicy: validPolicy,
          cameraAiNeedsRevalidation: false,
          mode: 'auto',
        }}
        syncImpl={async () => false} // persistência falha
      />
    );

    fireEvent.click(screen.getByTestId('camera-card'));
    // alteração que NÃO muda a pergunta: mode auto → reference
    fireEvent.click(screen.getByText('Comparar com referência'));
    fireEvent.click(screen.getByText('Salvar bloco'));

    // mensagem de falha aparece depois que a sync termina (isCompiling=false);
    // nesse ponto policy continua válida + hash atual + revalidation=false —
    // SÓ syncFailed mantém Testar bloqueado (5C.3.3-C.1)
    await waitFor(() =>
      expect(screen.queryByText(/não foi possível atualizar a verificação/i)).not.toBeNull()
    );
    expect(testButton()).toBeDisabled();
  });
});