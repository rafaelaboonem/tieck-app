import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnitCompliance } from '../useUnitCompliance';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        gte: vi.fn(() => ({
          lte: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
            then: vi.fn((cb) => cb({ data: [], error: null }))
          }))
        }))
      })),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis()
      })),
      removeChannel: vi.fn()
    }))
  }
}));

describe('useUnitCompliance with enabled flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not query supabase when enabled is false', async () => {
    const { result } = renderHook(() => useUnitCompliance({
      startDate: '2026-01-01',
      endDate: '2026-01-01',
      enabled: false
    }));

    expect(supabase.from).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);
  });

  it('should query supabase when enabled is true', async () => {
    renderHook(() => useUnitCompliance({
      startDate: '2026-01-01',
      endDate: '2026-01-01',
      enabled: true
    }));

    expect(supabase.from).toHaveBeenCalledWith('analytics_unit_daily_compliance');
  });

  it('should not open realtime channel when enabled is false', () => {
    renderHook(() => useUnitCompliance({
      startDate: '2026-01-01',
      endDate: '2026-12-31', // Future date to trigger realtime logic
      enabled: false
    }));

    expect(supabase.channel).not.toHaveBeenCalled();
  });
});
