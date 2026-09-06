import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { CameraVerificationTestDialog } from '@/components/camera-ai/CameraVerificationTestDialog';
import { toast } from 'sonner';

// getSession devolve um token válido — o foco é a resposta do servidor.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
    },
  },
}));

// Dialog do shadcn — wrapper simples controlado por `open` (mesmo padrão dos
// mocks de sheet/accordion usados nos testes de painel).
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
}));

function jsonResponse(code: string): Response {
  return new Response(JSON.stringify({ ok: false, code, requestId: 'req-test' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('CameraVerificationTestDialog — códigos do servidor tratados separadamente (5C.3.3-D)', () => {
  const fetchMock = vi.fn();
  let toastErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    toastErrorSpy = vi.spyOn(toast, 'error').mockImplementation(() => '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    toastErrorSpy.mockRestore();
  });

  // Sobe a imagem (step preview) e executa o teste — caminho real do dialog.
  const uploadAndRun = (container: HTMLElement) => {
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByText('Executar teste'));
  };

  it('invalid_policy → mensagem específica (código preservado, não colapsado)', async () => {
    fetchMock.mockResolvedValue(jsonResponse('invalid_policy'));
    const { container } = render(
      <CameraVerificationTestDialog isOpen={true} onClose={vi.fn()} blockId="b1" checklistId="c1" />
    );

    uploadAndRun(container);

    await waitFor(() =>
      expect(toastErrorSpy).toHaveBeenCalledWith(
        'Não foi possível validar a configuração desta pergunta. Salve o bloco novamente.'
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/camera-ai/test-verification',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('checklist_update_required → mensagem específica (código preservado, não colapsado)', async () => {
    fetchMock.mockResolvedValue(jsonResponse('checklist_update_required'));
    const { container } = render(
      <CameraVerificationTestDialog isOpen={true} onClose={vi.fn()} blockId="b1" checklistId="c1" />
    );

    uploadAndRun(container);

    await waitFor(() =>
      expect(toastErrorSpy).toHaveBeenCalledWith(
        'Esta verificação foi alterada e ainda não terminou de atualizar. Aguarde a atualização antes de testar.'
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/camera-ai/test-verification',
      expect.objectContaining({ method: 'POST' })
    );
  });
});