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

  // 1. LOGIN: email + senha corretos -> signInWithPassword chamado.
  it('1. LOGIN: should call signInWithPassword when valid credentials are provided', async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ data: { user: {} }, error: null });
    
    render(<AuthPage mode="login" />);
    
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/ }).closest('form')!.querySelector('button[type="submit"]')!);

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
    });
  });

  // 2. LOGIN: NÃO chama signInWithOtp.
  it('2. LOGIN: should NOT call signInWithOtp', async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ data: { user: {} }, error: null });
    render(<AuthPage mode="login" />);
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/ }).closest('form')!.querySelector('button[type="submit"]')!);

    await waitFor(() => {
      expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
    });
  });

  // 3. LOGIN: NÃO renderiza InputOTP.
  it('3. LOGIN: should NOT render InputOTP', () => {
    render(<AuthPage mode="login" />);
    expect(screen.queryByText(/O código é verificado automaticamente/i)).toBeNull();
  });

  // 4. LOGIN: NÃO envia e-mail/código (automaticamente coberto por 2).

  // 5. LOGIN: senha errada -> erro amigável -> permanece na tela.
  it('5. LOGIN: should show error message on failed login', async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({ 
      data: { user: null }, 
      error: { message: 'Invalid login credentials' } 
    });
    
    render(<AuthPage mode="login" />);
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar/ }).closest('form')!.querySelector('button[type="submit"]')!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('E-mail ou senha incorretos'));
    });
  });

  // 6. CADASTRO: Nome + Email + Senha + Confirmar senha.
  it('6. CADASTRO: should show all required fields', () => {
    render(<AuthPage mode="signup" />);
    expect(screen.getByPlaceholderText('Como deseja ser chamado?')).toBeDefined();
    expect(screen.getByPlaceholderText('seu@email.com')).toBeDefined();
    expect(screen.getByPlaceholderText('••••••••')).toBeDefined();
    expect(screen.getByPlaceholderText('Repita sua senha')).toBeDefined();
  });

  // 7. Senhas diferentes: -> bloqueia.
  it('7. Signup: should block if passwords do not match', async () => {
    render(<AuthPage mode="signup" />);
    fireEvent.change(screen.getByPlaceholderText('Como deseja ser chamado?'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pass1234' } });
    fireEvent.change(screen.getByPlaceholderText('Repita sua senha'), { target: { value: 'pass5678' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar conta/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('As senhas não conferem');
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });
  });

  // 8. Senha < 8: -> bloqueia.
  it('8. Signup: should block if password is too short', async () => {
    render(<AuthPage mode="signup" />);
    fireEvent.change(screen.getByPlaceholderText('Como deseja ser chamado?'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'short' } });
    fireEvent.change(screen.getByPlaceholderText('Repita sua senha'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar conta/ }).closest('form')!.querySelector('button[type="submit"]')!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('pelo menos 8 caracteres'));
    });
  });

  // 9. Cadastro válido: -> signup-request-otp.
  it('9. Signup: should call signup-request-otp for valid data', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: { ok: true }, error: null });
    
    render(<AuthPage mode="signup" />);
    fireEvent.change(screen.getByPlaceholderText('Como deseja ser chamado?'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Repita sua senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar conta/ }).closest('form')!.querySelector('button[type="submit"]')!);

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('signup-request-otp', {
        body: { email: 'test@example.com' }
      });
    });
  });

  // 10. Código correto: -> signup-verify-otp.
  // 11. Código confirmado: -> signup-complete.
  // 12. signup-complete ok: -> signInWithPassword automaticamente.
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
    fireEvent.click(screen.getByRole('button', { name: /Criar conta/ }).closest('form')!.querySelector('button[type="submit"]')!);

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
    });
  });

  // 13. Reenvio: -> signup-request-otp -> nunca signInWithOtp.
  it('13. Re-send: should call signup-request-otp and NOT signInWithOtp', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: { ok: true }, error: null });
    
    render(<AuthPage mode="signup" />);
    // Get to step 2
    fireEvent.change(screen.getByPlaceholderText('Como deseja ser chamado?'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('seu@email.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Repita sua senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar conta/ }).closest('form')!.querySelector('button[type="submit"]')!);

    await waitFor(() => {
      const resendBtn = screen.getByRole('button', { name: /Reenviar e-mail/i });
      fireEvent.click(resendBtn);
    });

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('signup-request-otp', {
        body: { email: 'test@example.com' }
      });
      expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
    });
  });

  // 14. E-mail já cadastrado: -> não altera conta -> oferece login.
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
    fireEvent.click(screen.getByRole('button', { name: /Criar conta/ }).closest('form')!.querySelector('button[type="submit"]')!);

    await waitFor(() => {
      expect(screen.getByText(/E-mail já cadastrado/i)).toBeDefined();
      expect(screen.getByRole('link', { name: /Ir para o login/i })).toBeDefined();
    });
  });
});