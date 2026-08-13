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
    if (!open) return null;
    return (
      <div data-testid="tieck-camera">
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
  });

  afterEach(() => {
    cleanup();
  });

  it('1. VITE_CAMERA_AI_ENABLED=false: neutro upload', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'false');
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
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    (global.fetch as any).mockResolvedValue({
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
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    (global.fetch as any).mockResolvedValue({
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
    expect(screen.getByText(/"Blurry"/)).toBeInTheDocument();
  });

  it('4. not_observable: AI not observable', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    (global.fetch as any).mockResolvedValue({
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

    expect(uploadModule.uploadCameraEvidence).not.toHaveBeenCalled();
  });

  it('5. resposta HTTP 429: rate limited', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    (global.fetch as any).mockResolvedValue({
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

    expect(uploadModule.uploadCameraEvidence).not.toHaveBeenCalled();
  });

  it('6. HTTP 503 camera_ai_disabled: config indisponível', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    (global.fetch as any).mockResolvedValue({
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
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    (global.fetch as any).mockResolvedValue({
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
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    let calls = 0;
    (global.fetch as any).mockImplementation(() => {
      calls++;
      return new Promise(resolve => setTimeout(() => resolve({
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
      }), 50));
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    
    // Simulate multiple rapid captures
    fireEvent.click(screen.getByTestId('capture-btn'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => {
      expect(screen.getByText('Foto aprovada')).toBeInTheDocument();
    });

    // Each capture increments sequence and aborts previous, but processVerification checks inFlightRef
    // In PublicCameraBlock, processVerification has: if (inFlightRef.current) return;
    expect(calls).toBe(1);
  });

  it('9. resposta antiga: request sequence protection', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    
    let resolveFirst: any;
    const firstPromise = new Promise(r => { resolveFirst = r; });
    
    (global.fetch as any).mockImplementationOnce(() => firstPromise);
    (global.fetch as any).mockResolvedValue({
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'retake', message: 'LATEST', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    
    // First capture
    fireEvent.click(screen.getByTestId('capture-btn'));
    
    // Second capture (simulated by re-opening and capturing since processVerification guards with inFlightRef)
    // Actually handleCapture increments sequence and aborts previous.
    // To bypass inFlightRef for test, we need first one to be analyzing
    await waitFor(() => expect(screen.getByText(/Verificando a foto/)).toBeInTheDocument());
    
    // Trigger second capture via close and open to reset inFlightRef if needed or just handleCapture
    // handleCapture resets sequence and aborts.
    fireEvent.click(screen.getByTestId('capture-btn'));
    
    // Resolve first request with "approved" (stale)
    resolveFirst({
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', evidence: 'STALE', code: 'ok' }),
    });

    await waitFor(() => {
      expect(screen.getByText('LATEST')).toBeInTheDocument();
    });
    expect(screen.queryByText('STALE')).not.toBeInTheDocument();
    
    expect(screen.queryByText('Foto aprovada')).not.toBeInTheDocument();
  });

  it('10. timeout: technical failure with retry', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    vi.useFakeTimers();
    
    (global.fetch as any).mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    vi.advanceTimersByTime(40000);

    await waitFor(() => {
      expect(screen.getByText(/demorou mais que o esperado/)).toBeInTheDocument();
      expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
    });
    
    vi.useRealTimers();
  });

  it('11. troca de foto: invalidates previous approved', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    (global.fetch as any).mockResolvedValue({
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText('Foto aprovada')).toBeInTheDocument());
    
    mockProps.onAnswer.mockClear();
    
    // New capture
    fireEvent.click(screen.getByTestId('capture-btn'));
    
    expect(mockProps.onAnswer).toHaveBeenCalledWith('block-1', '');
  });

  it('12. retry após falha de rede: same key', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
    (global.fetch as any).mockResolvedValue({
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText(/Falha de conexão/)).toBeInTheDocument());
    
    const firstCallKey = (global.fetch as any).mock.calls[0][1].body.get('idempotencyKey');
    
    fireEvent.click(screen.getByText('Tentar novamente'));
    
    await waitFor(() => expect(screen.getByText('Foto aprovada')).toBeInTheDocument());
    
    const secondCallKey = (global.fetch as any).mock.calls[1][1].body.get('idempotencyKey');
    expect(firstCallKey).toBe(secondCallKey);
  });

  it('13. retry após resposta 500: new key', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    (global.fetch as any).mockResolvedValueOnce({
      status: 500,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: false, code: 'error' }),
    });
    (global.fetch as any).mockResolvedValue({
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText(/O servidor encontrou um erro/)).toBeInTheDocument());
    
    const firstCallKey = (global.fetch as any).mock.calls[0][1].body.get('idempotencyKey');
    
    fireEvent.click(screen.getByText('Tentar novamente'));
    
    await waitFor(() => expect(screen.getByText('Foto aprovada')).toBeInTheDocument());
    
    const secondCallKey = (global.fetch as any).mock.calls[1][1].body.get('idempotencyKey');
    expect(firstCallKey).not.toBe(secondCallKey);
  });

  it('14. upload falha após approved: no onAnswer URL', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    (global.fetch as any).mockResolvedValue({
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok' }),
    });
    vi.spyOn(uploadModule, 'uploadCameraEvidence').mockRejectedValue(new Error('Upload failed'));

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText(/falha ao salvar no servidor/)).toBeInTheDocument());
    
    expect(mockProps.onAnswer).not.toHaveBeenCalledWith(expect.any(String), expect.stringContaining('http'));
    // Rule says it should clear if failed after approved
    expect(mockProps.onAnswer).toHaveBeenCalledWith('block-1', '');
  });

  it('15. approved display protection', async () => {
    vi.stubEnv('VITE_CAMERA_AI_ENABLED_FORCE', 'true');
    (global.fetch as any).mockResolvedValue({
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'retake', code: 'ok' }),
    });

    render(<PublicCameraBlock {...mockProps} />);
    fireEvent.click(screen.getByText('Test Camera'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText('Tire outra foto')).toBeInTheDocument());
    expect(screen.queryByText('Foto aprovada')).not.toBeInTheDocument();
  });
});
