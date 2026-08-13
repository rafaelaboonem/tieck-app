import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PublicCameraBlock } from '@/components/PublicCameraBlock';
import * as uploadModule from '@/components/camera-ai/upload';
import * as compressModule from '@/lib/compress-image';
import React from 'react';
import type { PublicCameraBlockData } from '@/components/camera-ai/types';

// Mock Lucide icons
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    Camera: () => <div data-testid="icon-camera" />,
    RefreshCw: () => <div data-testid="icon-refresh" />,
    AlertCircle: () => <div data-testid="icon-alert" />,
    CheckCircle2: () => <div data-testid="icon-check" />,
    Loader2: () => <div data-testid="icon-loader" />,
    CameraIcon: () => <div data-testid="icon-camera-icon" />,
    RotateCcw: () => <div data-testid="icon-rotate" />,
    AlertTriangle: () => <div data-testid="icon-warning" />,
  };
});

// Mock TieckCamera
let lastOnCapture: ((f: File) => void) | null = null;
vi.mock('@/components/TieckCamera', () => ({
  TieckCamera: ({ open, onCapture, onClose, title }: { open: boolean; onCapture: (f: File) => void; onClose: () => void; title: string }) => {
    lastOnCapture = onCapture;
    return (
      <div data-testid="tieck-camera" style={{ border: open ? '1px solid red' : 'none' }}>
        <div data-testid="camera-title">{title}</div>
        <button data-testid="capture-btn" onClick={() => {
          onCapture(new File([''], 'test.jpg', { type: 'image/jpeg' }));
        }}>Capture</button>
        <button data-testid="close-camera-btn" onClick={onClose}>Close</button>
      </div>
    );
  }
}));

describe('PublicCameraBlock UI', { timeout: 30000 }, () => {
  const mockBlock: PublicCameraBlockData = {
    id: 'block-1',
    type: 'camera',
    title: 'Test Camera',
  };

  const mockProps = {
    block: mockBlock,
    checklistId: 'check-1',
    onAnswer: vi.fn(),
    ensureResponseSession: vi.fn().mockResolvedValue({ responseId: 'res-1', responseToken: 'tok-1' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn();
    vi.spyOn(uploadModule, 'uploadCameraEvidence').mockResolvedValue('http://mock-url.com/img.jpg');
    vi.spyOn(compressModule, 'compressImage').mockImplementation(async (f) => f);
    vi.stubEnv('VITE_CAMERA_AI_ENABLED', 'true');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('1. VITE_CAMERA_AI_ENABLED=false: neutro upload', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED', 'false');
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText('Foto recebida')).toBeInTheDocument());
    expect(mockProps.onAnswer).toHaveBeenCalledWith('block-1', 'http://mock-url.com/img.jpg');
  });

  it('2. approved: AI approved flow', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', evidence: 'Perfect photo', code: 'ok' }),
    });
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText('Foto aprovada')).toBeInTheDocument());
    expect(screen.getByText('Perfect photo')).toBeInTheDocument();
  });

  it('3. retake: AI retake decision', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'retake', message: 'Too blurry', evidence: 'Blurry', code: 'ok' }),
    });
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText('Tire outra foto')).toBeInTheDocument());
    expect(screen.getByText('Too blurry')).toBeInTheDocument();
  });

  it('4. not_observable: AI not observable', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'not_observable', code: 'ok' }),
    });
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText('Não foi possível confirmar')).toBeInTheDocument());
  });

  it('5. resposta HTTP 429: rate limited', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 429, headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: false, code: 'rate_limited' }),
    });
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText(/Muitas tentativas/)).toBeInTheDocument());
  });

  it('6. HTTP 503 camera_ai_disabled: config indisponível', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 503, headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: false, code: 'camera_ai_disabled' }),
    });
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText(/temporariamente indisponível/)).toBeInTheDocument());
  });

  it('7. resposta HTML: technical failure without showing HTML', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, headers: new Map([['content-type', 'text/html']]),
      text: async () => '<html>Error</html>',
    });
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText(/falha técnica no servidor/)).toBeInTheDocument());
    expect(screen.queryByText(/<html>/)).not.toBeInTheDocument();
  });

  it('8. duplo clique/captura: sequence protection', async () => {
    let calls = 0;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      calls++;
      return new Promise(resolve => setTimeout(() => resolve({
        ok: true, status: 200, headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
      }), 50));
    });
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    
    // Simula capturas duplicadas via onCapture do componente mockado
    if (lastOnCapture) {
      lastOnCapture(new File([''], 'test.jpg', { type: 'image/jpeg' }));
      lastOnCapture(new File([''], 'test.jpg', { type: 'image/jpeg' }));
    }
    
    await waitFor(() => expect(screen.getByText('Foto aprovada')).toBeInTheDocument());
    expect(calls).toBe(1);
  });

  it('9. resposta antiga: request sequence protection', async () => {
    expect.hasAssertions();
    let resolveA: (v: any) => void = () => {};
    const promiseA = new Promise(resolve => { resolveA = resolve; });
    
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((_url, options) => {
      const form = options.body as FormData;
      const key = form.get('idempotencyKey');
      
      if (key === '00000000-0000-4000-8000-00000000000a') return promiseA;
      
      return Promise.resolve({
        ok: true, status: 200, headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ ok: true, decision: 'approved', evidence: 'LATEST', code: 'ok' }),
      });
    });

    render(<PublicCameraBlock {...mockProps} />);
    
    fireEvent.click(screen.getByText('Test Camera'));
    
    // Capture A
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('00000000-0000-4000-8000-00000000000a');
    fireEvent.click(screen.getByTestId('capture-btn'));
    
    await waitFor(() => expect(screen.getByText(/Verificando/)).toBeInTheDocument());

    // Capture B (triggers handleCapture again, which increments sequence and aborts previous)
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('00000000-0000-4000-8000-00000000000b');
    if (lastOnCapture) {
      lastOnCapture(new File([''], 'test-b.jpg', { type: 'image/jpeg' }));
    }

    await waitFor(() => expect(screen.getByText('LATEST')).toBeInTheDocument());

    // Resolve A (stale)
    resolveA({
      ok: true, status: 200, headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', evidence: 'OLD', code: 'ok' }),
    });

    await new Promise(r => setTimeout(r, 50));
    expect(screen.getByText('LATEST')).toBeInTheDocument();
    expect(screen.queryByText('OLD')).not.toBeInTheDocument();
  });

  it('10. timeout: technical failure', async () => {
    expect.hasAssertions();
    vi.useFakeTimers();
    let aborted = false;

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((_url, options) => {
      const p = new Promise((_, reject) => {
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }
      });
      return p;
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    
    await waitFor(() => expect(screen.getByText(/Verificando/)).toBeInTheDocument());
    
    React.act(() => {
      vi.advanceTimersByTime(36000);
    });

    await waitFor(() => {
      expect(screen.getByText(/demorou mais que o esperado/)).toBeInTheDocument();
      expect(aborted).toBe(true);
    });

    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
    
    vi.useRealTimers();
  });

  it('11. troca de foto: invalidates previous approved', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
    });
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText('Foto aprovada')).toBeInTheDocument());
    mockProps.onAnswer.mockClear();
    fireEvent.click(screen.getByText('Trocar foto'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    expect(mockProps.onAnswer).toHaveBeenCalledWith('block-1', '');
  });

  it('12. retry após falha de rede: same key', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
    });
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText(/Falha de conexão/)).toBeInTheDocument());
    
    const firstRequest = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const firstKey = (firstRequest[1].body as FormData).get('idempotencyKey') as string;
    
    fireEvent.click(screen.getByText('Tentar novamente'));
    await waitFor(() => expect(screen.getByText('Foto aprovada')).toBeInTheDocument());
    
    const secondRequest = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const secondKey = (secondRequest[1].body as FormData).get('idempotencyKey') as string;
    
    expect(firstKey).toBe(secondKey);
  });

  it('13. retry após resposta 500: new key', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 500, headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: false, code: 'error' }),
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
    });
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText(/O servidor encontrou um erro/)).toBeInTheDocument());
    
    const firstRequest = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const firstKey = (firstRequest[1].body as FormData).get('idempotencyKey') as string;
    
    fireEvent.click(screen.getByText('Tentar novamente'));
    await waitFor(() => expect(screen.getByText('Foto aprovada')).toBeInTheDocument());
    
    const secondRequest = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const secondKey = (secondRequest[1].body as FormData).get('idempotencyKey') as string;
    
    expect(firstKey).not.toBe(secondKey);
  });

  it('14. upload falha após approved: no onAnswer URL', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
    });
    vi.spyOn(uploadModule, 'uploadCameraEvidence').mockRejectedValue(new Error('Upload failed'));
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText(/falha ao salvar no servidor/)).toBeInTheDocument());
    expect(mockProps.onAnswer).toHaveBeenCalledWith('block-1', '');
  });

  it('15. approved display protection', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'retake', code: 'ok' }),
    });
    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText('Tire outra foto')).toBeInTheDocument());
    expect(screen.queryByText('Foto aprovada')).not.toBeInTheDocument();
  });
});