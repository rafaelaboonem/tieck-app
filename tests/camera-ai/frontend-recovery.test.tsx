import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { PublicCameraBlock } from '@/components/PublicCameraBlock';
import React from 'react';
import type { PublicCameraBlockData } from '@/components/camera-ai/types';

// Mock imports
vi.mock('lucide-react', async () => {
  return {
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

let lastOnCapture: ((f: File) => void) | null = null;
vi.mock('@/components/TieckCamera', () => ({
  TieckCamera: ({ onCapture, title }: { onCapture: (f: File) => void; title: string }) => {
    lastOnCapture = onCapture;
    return (
      <div data-testid="tieck-camera">
        <button data-testid="capture-btn" onClick={() => onCapture(new File([''], 'test.jpg', { type: 'image/jpeg' }))}>
          Capture
        </button>
      </div>
    );
  }
}));

vi.mock('@/components/camera-ai/upload', () => ({
  uploadCameraEvidence: vi.fn().mockResolvedValue('http://mock-url.com/img.jpg')
}));

vi.mock('@/lib/compress-image', () => ({
  compressImage: vi.fn().mockImplementation(async (f) => f)
}));

describe('PublicCameraBlock Recovery Logic', () => {
  const mockBlock: PublicCameraBlockData = { id: 'block-1', type: 'camera', title: 'Test' };
  
  const createProps = () => ({
    block: mockBlock,
    checklistId: 'check-1',
    onAnswer: vi.fn(),
    ensureResponseSession: vi.fn().mockResolvedValue({ 
      responseId: 'res-1', 
      responseToken: 'tok-1', 
      checklistId: 'check-1', 
      createdAt: Date.now() 
    }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.stubEnv('VITE_CAMERA_AI_ENABLED', 'true');
  });

  afterEach(() => {
    cleanup();
  });

  it('should recover from 401 using a new session token', async () => {
    const props = createProps();
    
    // First call returns 401
    (global.fetch as any).mockResolvedValueOnce({
      status: 401,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: false, code: 'unauthorized', message: 'Session expired', requestId: 'req-1' }),
    });
    
    // Second call (recovery) returns 200
    (global.fetch as any).mockResolvedValueOnce({
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: true, decision: 'approved', code: 'ok', evidence: 'recovered', requestId: 'req-2' }),
    });

    // Mock ensureResponseSession to return a DIFFERENT token on forceNew
    props.ensureResponseSession.mockImplementation(async (opts) => {
      if (opts?.forceNew) {
        return { responseId: 'res-new', responseToken: 'tok-new', checklistId: 'check-1', createdAt: Date.now() };
      }
      return { responseId: 'res-1', responseToken: 'tok-1', checklistId: 'check-1', createdAt: Date.now() };
    });

    render(<PublicCameraBlock {...props} />);
    
    fireEvent.click(screen.getByText('Test'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText('Foto aprovada')).toBeInTheDocument());

    expect(global.fetch).toHaveBeenCalledTimes(2);
    
    // Check first call token
    const firstCallForm = (global.fetch as any).mock.calls[0][1].body as FormData;
    expect(firstCallForm.get('responseToken')).toBe('tok-1');
    
    // Check second call token
    const secondCallForm = (global.fetch as any).mock.calls[1][1].body as FormData;
    expect(secondCallForm.get('responseToken')).toBe('tok-new');
    
    // Check idempotencyKey is the SAME
    expect(firstCallForm.get('idempotencyKey')).toBe(secondCallForm.get('idempotencyKey'));
    
    expect(props.ensureResponseSession).toHaveBeenCalledWith({ forceNew: true });
  });

  it('should stop after 2 consecutive 401s', async () => {
    const props = createProps();
    
    (global.fetch as any).mockResolvedValue({
      status: 401,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: false, code: 'unauthorized', message: 'Still unauthorized', requestId: 'req-fail' }),
    });

    render(<PublicCameraBlock {...props} />);
    
    fireEvent.click(screen.getByText('Test'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText(/Still unauthorized/)).toBeInTheDocument());
    
    // Support code should be visible
    expect(screen.getByText(/Código de suporte: req-fail/)).toBeInTheDocument();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should not retry for invalid_block', async () => {
    const props = createProps();
    
    (global.fetch as any).mockResolvedValue({
      status: 404,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ ok: false, code: 'invalid_block', message: 'Updated', requestId: 'req-404' }),
    });

    render(<PublicCameraBlock {...props} />);
    
    fireEvent.click(screen.getByText('Test'));
    fireEvent.click(screen.getByTestId('capture-btn'));

    await waitFor(() => expect(screen.getByText(/checklist foi atualizado/)).toBeInTheDocument());
    
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(props.ensureResponseSession).not.toHaveBeenCalledWith({ forceNew: true });
  });
});
