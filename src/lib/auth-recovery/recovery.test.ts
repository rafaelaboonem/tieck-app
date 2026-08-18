import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestPasswordReset, verifyPasswordReset, completePasswordReset } from './recovery.server';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

// Note: In this environment, we mock the database layer for testing the logic.
// Real e2e would require a live Supabase instance with service_role.

vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      match: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
    })),
    auth: {
      admin: {
        updateUserById: vi.fn(),
      }
    }
  }
}));

// We need to mock the environment variables
process.env.RESEND_API_KEY = 're_test_key';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_key';

describe('Auth Recovery Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cooldown server-side of 60s should prevent double sending', async () => {
    // Mock user exists
    (supabaseAdmin.rpc as any).mockResolvedValue({ data: 'user-id', error: null });
    
    // Mock recent code exists within 60s
    const mockFrom = (supabaseAdmin.from as any);
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { last_sent_at: new Date().toISOString() }, error: null }),
    });

    const result = await requestPasswordReset('test@example.com');
    expect(result.ok).toBe(true);
    // Should NOT call insert or fetch (email)
    expect(supabaseAdmin.from).toHaveBeenCalledTimes(1); 
  });

  it('email inexistente should return ok true (no reveal)', async () => {
    (supabaseAdmin.rpc as any).mockResolvedValue({ data: null, error: null });
    const result = await requestPasswordReset('notfound@example.com');
    expect(result.ok).toBe(true);
  });
});
