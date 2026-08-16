import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWorkspaceInvitationEmail, EmailDeliveryError } from './invitation-email.server';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
  },
}));

global.fetch = vi.fn();

describe('Invitation Email Diagnostic Logic', () => {
  const defaultEnv = {
    RESEND_API_KEY: 're_test_key_12345',
    PUBLIC_URL: 'https://tieck.com.br',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...defaultEnv };
  });

  it('classifies config validation failure before fetch', async () => {
    process.env.RESEND_API_KEY = 'invalid_format';
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    try {
      await sendWorkspaceInvitationEmail({ invitationId: '123', workspaceId: '456', token: 'tok' });
    } catch (err: any) {
      expect(err).toBeInstanceOf(EmailDeliveryError);
      expect(err.diagnostic.stage).toBe('config_validation');
      expect(err.diagnostic.code).toBe('configuration_invalid');
    }
    
    expect(consoleSpy).toHaveBeenCalledWith('[Resend] Diagnostic', expect.objectContaining({
      stage: 'config_validation',
      code: 'configuration_invalid'
    }));
  });

  it('classifies token hash mismatch correctly', async () => {
    const mockInvite = {
      email_normalized: 'test@example.com',
      role: 'admin',
      token_hash: 'wrong_hash',
      expires_at: new Date(Date.now() + 100000).toISOString(),
      status: 'pending',
      workspaces: { name: 'Test' }
    };
    (supabaseAdmin.from as any)().select().eq().eq().single.mockResolvedValue({ data: mockInvite, error: null });
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await sendWorkspaceInvitationEmail({ invitationId: '123', workspaceId: '456', token: 'tok' });
    } catch (err: any) {
      expect(err.diagnostic.stage).toBe('token_comparison');
      expect(err.diagnostic.code).toBe('token_hash_mismatch');
      expect(err.diagnostic.type).toBe('security');
    }
  });

  it('differentiates network fetch failure', async () => {
    const mockInvite = {
      email_normalized: 'test@example.com',
      role: 'admin',
      token_hash: '1a7674eb4ee78df7e1ac439a93c3fa8e3c945784d4dec9fd8e3011738b2f1d62',
      expires_at: new Date(Date.now() + 100000).toISOString(),
      status: 'pending',
      workspaces: { name: 'Test' }
    };
    (supabaseAdmin.from as any)().select().eq().eq().single.mockResolvedValue({ data: mockInvite, error: null });
    (global.fetch as any).mockRejectedValue(new TypeError('Failed to fetch'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await sendWorkspaceInvitationEmail({ invitationId: '123', workspaceId: '456', token: 'tok' });
    } catch (err: any) {
      expect(err.diagnostic.stage).toBe('fetch_started');
      expect(err.diagnostic.code).toBe('fetch_failed');
    }
  });

  it('differentiates timeout/abort error', async () => {
    const mockInvite = {
      email_normalized: 'test@example.com',
      role: 'admin',
      token_hash: '1a7674eb4ee78df7e1ac439a93c3fa8e3c945784d4dec9fd8e3011738b2f1d62',
      expires_at: new Date(Date.now() + 100000).toISOString(),
      status: 'pending',
      workspaces: { name: 'Test' }
    };
    (supabaseAdmin.from as any)().select().eq().eq().single.mockResolvedValue({ data: mockInvite, error: null });
    
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    (global.fetch as any).mockRejectedValue(abortErr);

    try {
      await sendWorkspaceInvitationEmail({ invitationId: '123', workspaceId: '456', token: 'tok' });
    } catch (err: any) {
      expect(err.diagnostic.code).toBe('abort_error');
    }
  });

  it('preserves status and requestId on non-2xx', async () => {
    const mockInvite = {
      email_normalized: 'test@example.com',
      role: 'admin',
      token_hash: '1a7674eb4ee78df7e1ac439a93c3fa8e3c945784d4dec9fd8e3011738b2f1d62',
      expires_at: new Date(Date.now() + 100000).toISOString(),
      status: 'pending',
      workspaces: { name: 'Test' }
    };
    (supabaseAdmin.from as any)().select().eq().eq().single.mockResolvedValue({ data: mockInvite, error: null });
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Map([['x-request-id', 'req_123']])
    });

    try {
      await sendWorkspaceInvitationEmail({ invitationId: '123', workspaceId: '456', token: 'tok' });
    } catch (err: any) {
      expect(err.diagnostic.code).toBe('resend_non_2xx');
      expect(err.diagnostic.providerStatus).toBe(401);
      expect(err.diagnostic.requestId).toBe('req_123');
    }
  });

  it('ensures no sensitive data in logs', async () => {
    process.env.RESEND_API_KEY = 're_SECRET';
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await sendWorkspaceInvitationEmail({ invitationId: '123', workspaceId: '456', token: 'tok' });
    } catch {}

    const logCall = consoleSpy.mock.calls[0][1];
    const logStr = JSON.stringify(logCall);
    expect(logStr).not.toContain('re_SECRET');
    expect(logStr).not.toContain('message');
    expect(logStr).not.toContain('stack');
  });
});