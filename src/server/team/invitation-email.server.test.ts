import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWorkspaceInvitationEmail } from './invitation-email.server';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

// Mock supabaseAdmin
vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  },
}));

// Mock global fetch
global.fetch = vi.fn();

describe('Phase 4B Invitation Flow (Direct Resend API)', () => {
  const defaultEnv = {
    RESEND_API_KEY: 're_test_key_12345',
    PUBLIC_URL: 'https://tieck.com.br',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...defaultEnv };
  });

  it('fails if RESEND_API_KEY is missing or invalid format', async () => {
    process.env.RESEND_API_KEY = 'invalid_key';
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(sendWorkspaceInvitationEmail({
      invitationId: '123',
      workspaceId: '456',
      token: 'tok'
    })).rejects.toThrow('Email service unavailable: missing configuration');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('calls the official Resend API with correct headers', async () => {
    const mockInvite = {
      email_normalized: 'test@example.com',
      role: 'admin',
      token_hash: '1a7674eb4ee78df7e1ac439a93c3fa8e3c945784d4dec9fd8e3011738b2f1d62', // sha256 of 'tok'
      expires_at: new Date(Date.now() + 100000).toISOString(),
      status: 'pending',
      workspaces: { name: 'Test Workspace' }
    };
    (supabaseAdmin.from as any)().select().eq().single.mockResolvedValue({ data: mockInvite, error: null });
    (global.fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await sendWorkspaceInvitationEmail({
      invitationId: '123',
      workspaceId: '456',
      token: 'tok'
    });

    const [url, options] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer re_test_key_12345',
      'User-Agent': 'Tieck/1.0',
    });
    expect(options.headers).toHaveProperty('Idempotency-Key');
    expect(options.headers['Idempotency-Key']).toContain('tieck-invite-123-1a7674eb4ee78df7');
  });

  it('strictly sanitizes logs and emits exactly one resend_non_2xx on 401', async () => {
    const mockInvite = {
      email_normalized: 'secret-invitee@example.com',
      role: 'admin',
      token_hash: '1a7674eb4ee78df7e1ac439a93c3fa8e3c945784d4dec9fd8e3011738b2f1d62',
      expires_at: new Date(Date.now() + 100000).toISOString(),
      status: 'pending',
      workspaces: { name: 'Secret Workspace' }
    };
    (supabaseAdmin.from as any)().select().eq().single.mockResolvedValue({ data: mockInvite, error: null });

    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Map([['x-request-id', 'resend-req-123']])
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendWorkspaceInvitationEmail({
      invitationId: '123',
      workspaceId: '456',
      token: 'tok'
    })).rejects.toThrow('Failed to send email via Resend: 401');

    const logOutput = JSON.stringify(consoleSpy.mock.calls);
    
    // Check for secrets
    expect(logOutput).not.toContain('secret-invitee');
    expect(logOutput).not.toContain('re_test_key_12345');
    expect(logOutput).not.toContain('tok');
    // Check for banned fields
    expect(logOutput).not.toContain('message');
    expect(logOutput).not.toContain('stack');
    
    // Check for correct codes
    expect(logOutput).toContain('resend_non_2xx');
    expect(logOutput).toContain('"status":401');
    expect(logOutput).toContain('resend-req-123');
    
    // Verify NOT fetch_failed
    expect(logOutput).not.toContain('fetch_failed');
    
    // Exactly one diagnostic call for this error
    const diagnosticCalls = consoleSpy.mock.calls.filter(call => call[0] === '[Resend] Diagnostic');
    expect(diagnosticCalls.length).toBe(1);
  });

  it('logs exactly one fetch_failed on network error', async () => {
    const mockInvite = {
      email_normalized: 'test@example.com',
      role: 'admin',
      token_hash: '1a7674eb4ee78df7e1ac439a93c3fa8e3c945784d4dec9fd8e3011738b2f1d62',
      expires_at: new Date(Date.now() + 100000).toISOString(),
      status: 'pending',
      workspaces: { name: 'Test' }
    };
    (supabaseAdmin.from as any)().select().eq().single.mockResolvedValue({ data: mockInvite, error: null });
    
    const networkError = new TypeError('Failed to fetch');
    (global.fetch as any).mockRejectedValue(networkError);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendWorkspaceInvitationEmail({
      invitationId: '123',
      workspaceId: '456',
      token: 'tok'
    })).rejects.toThrow('Failed to fetch');

    const logOutput = JSON.stringify(consoleSpy.mock.calls);
    expect(logOutput).toContain('fetch_failed');
    expect(logOutput).toContain('TypeError');
    expect(logOutput).not.toContain('resend_non_2xx');
    
    const diagnosticCalls = consoleSpy.mock.calls.filter(call => call[0] === '[Resend] Diagnostic');
    expect(diagnosticCalls.length).toBe(1);
  });

  it('logs exactly one abort_controller_failed on timeout', async () => {
    const mockInvite = {
      email_normalized: 'test@example.com',
      role: 'admin',
      token_hash: '1a7674eb4ee78df7e1ac439a93c3fa8e3c945784d4dec9fd8e3011738b2f1d62',
      expires_at: new Date(Date.now() + 100000).toISOString(),
      status: 'pending',
      workspaces: { name: 'Test' }
    };
    (supabaseAdmin.from as any)().select().eq().single.mockResolvedValue({ data: mockInvite, error: null });
    
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';
    (global.fetch as any).mockRejectedValue(abortError);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendWorkspaceInvitationEmail({
      invitationId: '123',
      workspaceId: '456',
      token: 'tok'
    })).rejects.toThrow('The user aborted a request.');

    const logOutput = JSON.stringify(consoleSpy.mock.calls);
    expect(logOutput).toContain('abort_controller_failed');
    expect(logOutput).toContain('AbortError');
    expect(logOutput).not.toContain('fetch_failed');
    
    const diagnosticCalls = consoleSpy.mock.calls.filter(call => call[0] === '[Resend] Diagnostic');
    expect(diagnosticCalls.length).toBe(1);
  });
});
