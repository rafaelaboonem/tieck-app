import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthPage } from '../../components/AuthPage';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Mocking DOM globals
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

if (typeof document !== 'undefined') {
  document.elementFromPoint = () => null;
}

const mockNavigate = vi.fn();

// Mocking external modules
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

let mockUser: any = null;
let mockSession: any = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ 
    user: mockUser, 
    session: mockSession,
    loading: false,
    emailConfirmed: true,
    needsEmailConfirmation: false,
    refreshUser: vi.fn(),
    signOut: vi.fn()
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../assets/local/logo-tieck.webp', () => ({
  default: 'logo-url',
}));

describe('AuthPage Phase 4B.2 (Redirect Integrity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockSession = null;
    vi.stubGlobal('location', {
      ...window.location,
      assign: vi.fn(),
      origin: 'http://localhost:3000',
    });
  });

  it('should redirect to safe redirect after OTP success', async () => {
    (supabase.auth.signInWithOtp as any).mockResolvedValue({ data: {}, error: null });
    (supabase.auth.verifyOtp as any).mockResolvedValue({ data: { user: { id: '1' } }, error: null });
    
    const redirect = '/convite/abc-123';
    const { rerender } = render(<AuthPage mode="signup" redirect={redirect} />);

    // Step 1: Send OTP
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar código/i }));

    // Step 2: Simulate successful verification
    mockUser = { id: '1', email_confirmed_at: '2023-01-01' };
    mockSession = { access_token: 'tok' };
    
    // Rerender to trigger useEffect with new user/session state
    rerender(<AuthPage mode="signup" redirect={redirect} />);

    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith(redirect);
    });
  });

  it('should reject malicious external redirects and fallback to /inicio', async () => {
    const maliciousRedirect = 'https://malicious.com';
    mockUser = { id: '1', email_confirmed_at: '2023-01-01' };
    mockSession = { access_token: 'tok' };

    render(<AuthPage mode="signup" redirect={maliciousRedirect} />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/inicio' });
      expect(window.location.assign).not.toHaveBeenCalled();
    });
  });

  it('should reject protocol-relative redirects (//evil.com)', async () => {
    const maliciousRedirect = '//evil.com';
    mockUser = { id: '1' };
    mockSession = { access_token: 'tok' };

    render(<AuthPage mode="signup" redirect={maliciousRedirect} />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/inicio' });
    });
  });

  it('should prevent duplicate navigation/verification for the same token', async () => {
    (supabase.auth.verifyOtp as any).mockResolvedValue({ data: { user: { id: '1' } }, error: null });
    
    render(<AuthPage mode="signup" />);
    
    // Move to step 2
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar código/i }));

    await waitFor(() => {
      expect(screen.getByText(/O código é verificado automaticamente/i)).toBeDefined();
    });

    const otpInput = Array.from(document.querySelectorAll('input')).find(i => i.getAttribute('inputmode') === 'numeric');
    if (otpInput) {
      fireEvent.change(otpInput, { target: { value: '111111' } });
      fireEvent.change(otpInput, { target: { value: '111111' } });
    }

    await waitFor(() => {
      expect(supabase.auth.verifyOtp).toHaveBeenCalledTimes(1);
    });
  });
});