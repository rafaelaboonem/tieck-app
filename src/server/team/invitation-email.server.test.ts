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

describe('Phase 4B Invitation Flow', () => {
  const defaultEnv = {
    LOVABLE_API_KEY: 'test_lovable_key',
    RESEND_API_KEY: 'test_resend_key',
    PUBLIC_URL: 'https://tieck.com.br',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...defaultEnv };
  });

  // Existing helper tests (maintained)
  it('fails if PUBLIC_URL is missing', async () => {
    delete process.env.PUBLIC_URL;
    await expect(sendWorkspaceInvitationEmail({
      invitationId: '123',
      workspaceId: '456',
      token: 'tok'
    })).rejects.toThrow('Email service unavailable: missing configuration');
  });

  it('fails if PUBLIC_URL is not HTTPS', async () => {
    process.env.PUBLIC_URL = 'http://tieck.com.br';
    await expect(sendWorkspaceInvitationEmail({
      invitationId: '123',
      workspaceId: '456',
      token: 'tok'
    })).rejects.toThrow('Internal Configuration Error');
  });

  it('fails if PUBLIC_URL contains query params', async () => {
    process.env.PUBLIC_URL = 'https://tieck.com.br?q=1';
    await expect(sendWorkspaceInvitationEmail({
      invitationId: '123',
      workspaceId: '456',
      token: 'tok'
    })).rejects.toThrow('Internal Configuration Error');
  });

  it('sanitizes logs when Resend fails', async () => {
    const mockInvite = {
      email_normalized: 'test@example.com',
      role: 'admin',
      token_hash: '1a7674eb4ee78df7e1ac439a93c3fa8e3c945784d4dec9fd8e3011738b2f1d62',
      expires_at: new Date(Date.now() + 100000).toISOString(),
      status: 'pending',
      workspaces: { name: 'Test Workspace' }
    };
    (supabaseAdmin.from as any)().select().eq().single.mockResolvedValue({ data: mockInvite, error: null });

    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Map([['x-request-id', 'req123']]),
      text: () => Promise.resolve('Sensitive Error Body That Should Not Be Logged')
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendWorkspaceInvitationEmail({
      invitationId: '123',
      workspaceId: '456',
      token: 'tok'
    })).rejects.toThrow('Failed to send email via Resend');

    expect(consoleSpy).toHaveBeenCalledWith('[Resend] API Error:', {
      status: 500,
      requestId: 'req123'
    });
    
    const loggedArgs = consoleSpy.mock.calls.flat().join(' ');
    expect(loggedArgs).not.toContain('Sensitive Error Body');
    expect(loggedArgs).not.toContain('test@example.com');
  });

  // New Phase 4B Stabilization Tests
  describe('API and UI logic (Conceptual coverage)', () => {
    it('verifies success response does not contain token or link', async () => {
      // This would normally test the create/resend handlers directly,
      // but we verify the sendWorkspaceInvitationEmail doesn't return them.
      const mockInvite = {
        email_normalized: 'test@example.com',
        role: 'admin',
        token_hash: '1a7674eb4ee78df7e1ac439a93c3fa8e3c945784d4dec9fd8e3011738b2f1d62',
        expires_at: new Date(Date.now() + 100000).toISOString(),
        status: 'pending',
        workspaces: { name: 'Test Workspace' }
      };
      (supabaseAdmin.from as any)().select().eq().single.mockResolvedValue({ data: mockInvite, error: null });
      (global.fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      const result = await sendWorkspaceInvitationEmail({
        invitationId: '123',
        workspaceId: '456',
        token: 'tok'
      });
      
      expect(result).toBeUndefined(); // Returns nothing, token stays in local scope of handler
    });
  });
});
