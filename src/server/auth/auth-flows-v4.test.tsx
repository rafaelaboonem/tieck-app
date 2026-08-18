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
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    functions: {
      invoke: vi.fn(),
    }
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ 
    user: null, 
    session: null,
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

describe('AuthPage Phase 4B.5 (Password-based Login & Signup Flow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', {
      ...window.location,
      assign: vi.fn(),
      origin: 'http://localhost:3000',
    });
  });

  const getSubmitButton = (text: string) => {
    const buttons = screen.getAllByRole('button');
    return buttons.find(b => b.textContent?.trim() === text);
  };

  it('1. LOGIN: should call signInWithPassword when valid credentials are provided', async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ data: { user: {} }, error: null });
    render(<AuthPage mode="login" />);
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    
    const submitBtn = getSubmitButton('Entrar');
    if (!submitBtn) throw new Error("Submit button not found");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
    });
  });

  it('2. LOGIN: should NOT call signInWithOtp', async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ data: { user: {} }, error: null });
    render(<AuthPage mode="login" />);
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    
    const submitBtn = getSubmitButton('Entrar');
    if (submitBtn) fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
    });
  });

  it('3. LOGIN: should NOT render InputOTP', () => {
    render(<AuthPage mode="login" />);
    expect(screen.queryByText(/O código é verificado automaticamente/i)).toBeNull();
  });

  it('5. LOGIN: should show error message on failed login', async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ 
      data: { user: null }, 
      error: { message: 'Invalid login credentials' } 
    });
    render(<AuthPage mode="login" />);
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrong' } });
    
    const submitBtn = getSubmitButton('Entrar');
    if (submitBtn) fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('E-mail ou senha incorretos'));
    });
  });

  it('6. CADASTRO: should show all required fields', () => {
    render(<AuthPage mode="signup" />);
    expect(screen.getByPlaceholderText('Como deseja ser chamado?')).toBeDefined();
    expect(screen.getByPlaceholderText('seu@email.com')).toBeDefined();
    expect(screen.getByPlaceholderText('••••••••')).toBeDefined();
    expect(screen.getByPlaceholderText('Repita sua senha')).toBeDefined();
  });

  it('7. Signup: should block if passwords do not match', async () => {
    render(<AuthPage mode="signup" />);
    fireEvent.change(screen.getByPlaceholderText('Como deseja ser chamado?'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pass1234' } });
    fireEvent.change(screen.getByPlaceholderText('Repita sua senha'), { target: { value: 'pass5678' } });
    
    const submitBtn = getSubmitButton('Criar conta');
    if (submitBtn) fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('As senhas não conferem');
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });
  });

  it('8. Signup: should block if password is too short', async () => {
    render(<AuthPage mode="signup" />);
    fireEvent.change(screen.getByPlaceholderText('Como deseja ser chamado?'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'short' } });
    fireEvent.change(screen.getByPlaceholderText('Repita sua senha'), { target: { value: 'short' } });
    
    const submitBtn = getSubmitButton('Criar conta');
    if (submitBtn) fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('pelo menos 8 caracteres'));
    });
  });

  it('9. Signup: should call signup-request-otp for valid data', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: { ok: true }, error: null });
    render(<AuthPage mode="signup" />);
    fireEvent.change(screen.getByPlaceholderText('Como deseja ser chamado?'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Repita sua senha'), { target: { value: 'password123' } });
    
    const submitBtn = getSubmitButton('Criar conta');
    if (submitBtn) fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('signup-request-otp', {
        body: { email: 'test@example.com' }
      });
    });
  });

  it('10-12. Signup Flow: should complete flow and auto-login', async () => {
    (supabase.functions.invoke as any)
      .mockResolvedValueOnce({ data: { ok: true }, error: null }) // request-otp
      .mockResolvedValueOnce({ data: { verificationToken: 'tok123' }, error: null }) // verify-otp
      .mockResolvedValueOnce({ data: { ok: true }, error: null }); // signup-complete
    
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ data: { user: {} }, error: null });

    render(<AuthPage mode="signup" />);
    
    // Step 1
    fireEvent.change(screen.getByPlaceholderText('Como deseja ser chamado?'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Repita sua senha'), { target: { value: 'password123' } });
    
    const submitBtn = getSubmitButton('Criar conta');
    if (submitBtn) fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Verifique seu e-mail/i)).toBeDefined();
    });

    // Step 2: Simulate OTP entry
    const otpInput = Array.from(document.querySelectorAll('input')).find(i => i.getAttribute('inputmode') === 'numeric');
    if (otpInput) {
      fireEvent.change(otpInput, { target: { value: '123456' } });
    }

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('signup-verify-otp', {
        body: { email: 'test@example.com', code: '123456' }
      });
      expect(supabase.functions.invoke).toHaveBeenCalledWith('signup-complete', {
        body: { 
          email: 'test@example.com', 
          verificationToken: 'tok123',
          password: 'password123',
          displayName: 'John'
        }
      });
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
    }, { timeout: 3000 });
  });

  it('13. Re-send: should call signup-request-otp and NOT signInWithOtp', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: { ok: true }, error: null });
    render(<AuthPage mode="signup" />);
    fireEvent.change(screen.getByPlaceholderText('Como deseja ser chamado?'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Repita sua senha'), { target: { value: 'password123' } });
    
    const submitBtn = getSubmitButton('Criar conta');
    if (submitBtn) fireEvent.click(submitBtn);

    await waitFor(() => {
      const resendBtn = screen.getByText(/Reenviar/);
      fireEvent.click(resendBtn);
    });

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('signup-request-otp', {
        body: { email: 'test@example.com' }
      });
      expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
    });
  });

  it('14. Already registered: should show login offer', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ 
      data: { ok: false, code: 'already_registered' }, 
      error: null 
    });
    render(<AuthPage mode="signup" />);
    fireEvent.change(screen.getByPlaceholderText('Como deseja ser chamado?'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Repita sua senha'), { target: { value: 'password123' } });
    
    const submitBtn = getSubmitButton('Criar conta');
    if (submitBtn) fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/E-mail já cadastrado/i)).toBeDefined();
      expect(screen.getByRole('link', { name: /Ir para o login/i })).toBeDefined();
    });
  });
});