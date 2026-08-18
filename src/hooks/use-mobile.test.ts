import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsMobile } from './use-mobile';

describe('useIsMobile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return mobile status based on window.innerWidth', () => {
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    
    // Mock matchMedia
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useIsMobile());
    // In jsdom/vitest, useLayoutEffect runs immediately during renderHook
    expect(result.current).toBe(true);
  });

  it('should return false for desktop viewports', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
