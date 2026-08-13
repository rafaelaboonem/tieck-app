import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PublicCameraBlock } from '@/components/PublicCameraBlock';
import * as uploadModule from '@/components/camera-ai/upload';
import * as compressModule from '@/lib/compress-image';
import React from 'react';

// Mock Lucide icons to avoid rendering complexity
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
vi.mock('@/components/TieckCamera', () => ({
  TieckCamera: ({ open, onCapture, onClose }: any) => {
    return (
      <div data-testid="tieck-camera" style={{ display: open ? 'block' : 'none' }}>
        <button data-testid="capture-btn" onClick={() => onCapture(new File([''], 'test.jpg', { type: 'image/jpeg' }))}>Capture</button>
        <button data-testid="close-camera-btn" onClick={onClose}>Close</button>
      </div>
    );
  }

}));

describe('PublicCameraBlock UI', () => {
  const mockBlock = {
    id: 'block-1',
    type: 'camera' as const,
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
    
    // Default env for each test
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    vi.stubEnv('VITE_CAMERA_AI_ENABLED', 'true');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('1. VITE_CAMERA_AI_ENABLED=false: neutro upload', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'false');
    vi.stubEnv('VITE_CAMERA_AI_ENABLED', 'false');
    render(<PublicCameraBlock {...mockProps} />);

    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => {
      expect(screen.getByText('Foto recebida')).toBeInTheDocument();
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(uploadModule.uploadCameraEvidence).toHaveBeenCalled();
    expect(mockProps.onAnswer).toHaveBeenCalledWith('block-1', 'http://mock-url.com/img.jpg');
  });

  it('2. approved: AI approved flow', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', evidence: 'Perfect photo', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => {
      expect(screen.getByText('Foto aprovada')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(uploadModule.uploadCameraEvidence).toHaveBeenCalled();
    expect(mockProps.onAnswer).toHaveBeenCalledWith('block-1', 'http://mock-url.com/img.jpg');
    expect(screen.getByText('Perfect photo')).toBeInTheDocument();
  });

  it('3. retake: AI retake decision', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'retake', message: 'Too blurry', evidence: 'Blurry', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => {
      expect(screen.getByText('Tire outra foto')).toBeInTheDocument();
    });

    expect(uploadModule.uploadCameraEvidence).not.toHaveBeenCalled();
    expect(screen.getByText('Too blurry')).toBeInTheDocument();
  });

  it('4. not_observable: AI not observable', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'not_observable', message: 'Obstruction', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => {
      expect(screen.getByText('Não foi possível confirmar')).toBeInTheDocument();
    });
  });

  it('5. resposta HTTP 429: rate limited', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: false, code: 'rate_limited' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => {
      expect(screen.getByText(/Muitas tentativas/)).toBeInTheDocument();
    });
  });

  it('6. HTTP 503 camera_ai_disabled: config indisponível', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: false, code: 'camera_ai_disabled' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => {
      expect(screen.getByText(/temporariamente indisponível/)).toBeInTheDocument();
    });
  });

  it('7. resposta HTML: technical failure without showing HTML', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/html']]),
      text: async () => '<html>Error</html>',
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => {
      expect(screen.getByText(/falha técnica no servidor/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/<html>/)).not.toBeInTheDocument();
  });

  it('8. duplo clique/captura: sequence protection', async () => {
    let calls = 0;
    (global.fetch as any).mockImplementation(() => {
      calls++;
      return new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
      }), 50));
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    
    // Trigger capture once
    fireEvent.click(screen.getByTestId('capture-btn'));
    // Trigger immediately again - handleCapture clears inFlightRef if called again
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => {
      expect(screen.getByText('Foto aprovada')).toBeInTheDocument();
    });

    expect(calls).toBeGreaterThanOrEqual(1);
  });

  it('9. resposta antiga: request sequence protection', async () => {
    let resolveFirst: (v: any) => void = () => {};
    const firstPromise = new Promise(r => { resolveFirst = r; });
    
    (global.fetch as any).mockImplementationOnce(() => firstPromise);
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'retake', evidence: 'LATEST', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    
    fireEvent.click(screen.getByTestId('capture-btn'));
    await waitFor(() => expect(screen.getByText(/Verificando a foto/)).toBeInTheDocument());
    
    fireEvent.click(screen.getByTestId('capture-btn'));
    
    resolveFirst({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', evidence: 'STALE', code: 'ok' }),
    });

    await waitFor(() => {
      expect(screen.getByText('LATEST')).toBeInTheDocument();
    });
    expect(screen.queryByText('STALE')).not.toBeInTheDocument();
  }, 10000);

  it('10. timeout: technical failure with retry', async () => {
    vi.useFakeTimers();
    (global.fetch as any).mockImplementation(() => new Promise(() => {})); 

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    vi.advanceTimersByTime(40000);

    await waitFor(() => {
      expect(screen.getByText(/demorou mais que o esperado/)).toBeInTheDocument();
    }, { timeout: 8000 });
  }, 10000);

  it('11. troca de foto: invalidates previous approved', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText('Foto aprovada')).toBeInTheDocument(), { timeout: 8000 });
    
    mockProps.onAnswer.mockClear();
    fireEvent.click(screen.getByText('Trocar foto'));
    fireEvent.click(screen.getByTestId('capture-btn'));
    
    expect(mockProps.onAnswer).toHaveBeenCalledWith('block-1', '');
  }, 10000);


  it('12. retry após falha de rede: same key', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText(/Falha de conexão/)).toBeInTheDocument(), { timeout: 8000 });
    
    const firstKey = (global.fetch as any).mock.calls[0][1].body.get('idempotencyKey');
    fireEvent.click(screen.getByText('Tentar novamente'));
    
    await waitFor(() => expect(screen.getByText('Foto aprovada')).toBeInTheDocument(), { timeout: 8000 });
    
    const secondKey = (global.fetch as any).mock.calls[1][1].body.get('idempotencyKey');
    expect(firstKey).toBe(secondKey);
  }, 10000);

  it('13. retry após resposta 500: new key', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: false, code: 'error' }),
    });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText(/O servidor encontrou um erro/)).toBeInTheDocument(), { timeout: 8000 });
    
    const firstKey = (global.fetch as any).mock.calls[0][1].body.get('idempotencyKey');
    fireEvent.click(screen.getByText('Tentar novamente'));
    
    await waitFor(() => expect(screen.getByText('Foto aprovada')).toBeInTheDocument(), { timeout: 8000 });
    
    const secondKey = (global.fetch as any).mock.calls[1][1].body.get('idempotencyKey');
    expect(firstKey).not.toBe(secondKey);
  }, 10000);

  it('14. upload falha após approved: no onAnswer URL', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
    });
    vi.spyOn(uploadModule, 'uploadCameraEvidence').mockRejectedValue(new Error('Upload failed'));

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText(/falha ao salvar no servidor/)).toBeInTheDocument(), { timeout: 8000 });
    expect(mockProps.onAnswer).toHaveBeenCalledWith('block-1', '');
  }, 10000);

  it('15. approved display protection', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'retake', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText('Tire outra foto')).toBeInTheDocument(), { timeout: 8000 });
    expect(screen.queryByText('Foto aprovada')).not.toBeInTheDocument();
  }, 10000);
});

