import { describe, it, expect, vi } from 'vitest';
import { sendWorkspaceInvitationEmail } from './invitation-email.server';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

// Mock supabaseAdmin
vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  },
}));

// Mock global fetch
global.fetch = vi.fn();

describe('sendWorkspaceInvitationEmail', () => {
  const defaultEnv = {
    LOVABLE_API_KEY: 'test_lovable_key',
    RESEND_API_KEY: 'test_resend_key',
    PUBLIC_URL: 'https://tieck.com.br',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...defaultEnv };
  });

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
    // Mock successful DB fetch
    const mockInvite = {
      email_normalized: 'test@example.com',
      role: 'admin',
      token_hash: '21c2105e49ad0803565f42c4a93593f0b24ed283d699317537b88edeb3768d71', // sha256 of 'tok'
      expires_at: new Date(Date.now() + 100000).toISOString(),
      status: 'pending',
      workspaces: { name: 'Test Workspace' }
    };
    (supabaseAdmin.single as any).mockResolvedValue({ data: mockInvite, error: null });

    // Mock Resend error
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
    
    // Ensure sensitive data wasn't logged
    const loggedArgs = consoleSpy.mock.calls.flat().join(' ');
    expect(loggedArgs).not.toContain('Sensitive Error Body');
    expect(loggedArgs).not.toContain('test@example.com');
  });
});
