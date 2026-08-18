import { useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mapAuthError } from "@/utils/auth-errors";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ArrowRight, Mail, ArrowLeft, Eye, EyeOff, User, Lock } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import logoUrl from "../assets/local/logo-tieck.webp";

type Props = {
  mode: "login" | "signup";
  redirect?: string;
};

export function AuthPage({ mode, redirect }: Props) {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const isSignUp = mode === "signup";

  const safeRedirect = (() => {
    if (typeof redirect !== "string") return null;
    const clean = redirect.trim();
    // Rejeitar caminhos maliciosos: deve começar com /, não pode ter // nem ser URL externa
    if (clean.startsWith("/") && !clean.startsWith("//") && !clean.includes("\\")) {
      // Nunca permitir que o token do convite seja registrado no histórico de navegação
      // Mas aqui validamos apenas o caminho.
      return clean;
    }
    return null;
  })();

  const goAfterAuth = () => {
    // Redirecionamento cirúrgico pós-autenticação/confirmação
    if (safeRedirect) {
      // Se for um fluxo de convite (/convite/...), garantir navegação completa
      // para recarregar o estado do workspace/sessão se necessário
      if (safeRedirect.startsWith("/convite/")) {
        window.location.assign(safeRedirect);
      } else {
        navigate({ to: safeRedirect as any });
      }
    } else {
      navigate({ to: "/inicio" });
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [otp, setOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  // Guards against double-submission
  const verifyingRef = useRef<string | null>(null);
  const completingRef = useRef<boolean>(false);

  useEffect(() => {
    // Se o usuário estiver autenticado e não estivermos no meio da verificação OTP, redirecionar
    if (user && session && !otpVerified && signupStep === 1) {
      goAfterAuth();
    }
    // Se acabamos de verificar o OTP com sucesso
    if (otpVerified && user && session) {
      goAfterAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, session, otpVerified, signupStep]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const normalizedEmail = () => email.trim().toLowerCase();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail(),
        password,
      });
      if (error) throw error;
      goAfterAuth();
    } catch (err: any) {
      console.error("Login error:", err);
      toast.error(mapAuthError(err.message));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (isSignUp) {
      if (!name.trim()) return toast.error("Informe seu nome");
      if (password.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres");
      if (password !== confirmPassword) return toast.error("As senhas não conferem");
    }

    setAlreadyRegistered(false);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('signup-request-otp', {
        body: { email: normalizedEmail() }
      });
      
      if (error) throw error;
      if (data?.ok === false && data?.code === 'already_registered') {
        setAlreadyRegistered(true);
        setIsLoading(false);
        return;
      }
      if (data?.error) throw new Error(data.error);
      
      toast.success("Código enviado! Verifique seu e-mail.");
      setSignupStep(2);
      setResendCountdown(60);
    } catch (err: any) {
      console.error("Send OTP error:", err);
      toast.error(mapAuthError(err.message));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e?: React.FormEvent, codeOverride?: string) => {
    e?.preventDefault();
    const token = (codeOverride ?? otp).replace(/\D/g, "");
    if (isLoading || token.length !== 6) return;
    if (verifyingRef.current === token) return;
    verifyingRef.current = token;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('signup-verify-otp', {
        body: { email: normalizedEmail(), code: token }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setVerificationToken(data.verificationToken);
      setOtpVerified(true);
      toast.success("E-mail verificado!");
    } catch (err: any) {
      console.error("Verify OTP error:", err);
      toast.error(mapAuthError(err.message));
      setOtp("");
      verifyingRef.current = null;
    } finally {
      setIsLoading(false);
    }
  };

  const completeSignup = async () => {
    if (completingRef.current || !verificationToken) return;
    completingRef.current = true;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('signup-complete', {
        body: { 
          email: normalizedEmail(), 
          verificationToken,
          password,
          displayName: name.trim()
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Auto login
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: normalizedEmail(),
        password,
      });

      if (loginErr) throw loginErr;

      // Clear sensitive data
      setPassword("");
      setConfirmPassword("");
      setVerificationToken("");
      setOtp("");
      
      toast.success("Conta criada com sucesso!");
      goAfterAuth();
    } catch (err: any) {
      console.error("Complete signup error:", err);
      toast.error(mapAuthError(err.message));
      completingRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (otpVerified && verificationToken && !isLoading) {
      completeSignup();
    }
  }, [otpVerified, verificationToken]);

  const handleResendCode = async () => {
    if (isLoading || !email || resendCountdown > 0) return;
    setOtp("");
    setOtpVerified(false);
    setVerificationToken("");
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('signup-request-otp', {
        body: { email: normalizedEmail() }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Novo código enviado! Verifique seu e-mail.");
      setResendCountdown(60);
    } catch (err: any) {
      console.error("Resend OTP error:", err);
      toast.error(mapAuthError(err.message));
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- UI ----------
  const heading = isSignUp
    ? signupStep === 1
      ? "Crie sua conta"
      : "Verifique seu e-mail"
    : "Bem-vindo de volta";

  const subheading = isSignUp
    ? signupStep === 1
      ? "Comece informando seu melhor e-mail"
      : `Enviamos um código de 6 dígitos para ${email}`
    : "Acesse sua conta para continuar";

  const inputClass =
    "w-full bg-white border border-neutral-200 text-neutral-900 placeholder:text-neutral-400 px-4 py-3.5 rounded-xl focus:outline-none focus:border-[#FF007F] focus:ring-1 focus:ring-[#FF007F] transition-all";

  const primaryBtn =
    "w-full bg-[#FF007F] hover:bg-[#E60072] text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-[#FF007F]/30 active:scale-[0.98] font-display disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2";

  const ghostBtn =
    "w-full bg-transparent border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:border-neutral-400 font-medium py-3 rounded-xl transition-all text-sm cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60";

  return (
    <div className="min-h-screen flex items-center justify-center bg-white font-body p-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 w-[480px] h-[480px] bg-[#FF007F] opacity-[0.06] blur-[120px] rounded-full" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[480px] h-[480px] bg-[#FF007F] opacity-[0.05] blur-[120px] rounded-full" />

      <div className="w-full max-w-[440px] bg-white border border-neutral-100 rounded-3xl p-8 md:p-10 shadow-xl shadow-neutral-200/60 relative overflow-hidden backdrop-blur-sm">
        <div className="pointer-events-none absolute -top-24 -right-24 w-48 h-48 bg-[#FF007F] opacity-5 blur-[80px]" />

        <div className="text-center mb-8 relative">
          <img src={logoUrl} alt="Tieck" className="mx-auto h-12 md:h-14 w-auto mb-4" />
          <h2 className="mt-4 text-xl font-semibold text-neutral-900 font-display">{heading}</h2>
          <p className="text-neutral-500 mt-1.5 text-sm">{subheading}</p>
        </div>

        {isSignUp && (
          <div className="flex items-center justify-center gap-2 mb-7">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`h-1 rounded-full transition-all duration-300 ${
                  s === signupStep ? "w-8 bg-[#FF007F]" : "w-4 bg-neutral-200"
                }`}
              />
            ))}
          </div>
        )}

        {(!isSignUp || signupStep === 1) && (
          <div className="space-y-4 mb-6 relative">
            <button
              type="button"
              onClick={handleGoogle}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-neutral-200 rounded-xl bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700 transition-all disabled:opacity-60"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {isSignUp ? "Cadastrar com Google" : "Entrar com Google"}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-neutral-400 uppercase tracking-widest">ou</span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-5 relative">
          {signupStep === 1 && (
            <form onSubmit={handleSendCode} className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="seu@email.com"
                  autoFocus
                />
              </div>

              {!isSignUp && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700 flex items-start gap-3">
                  <Mail className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">Login via código seguro</p>
                    <p className="mt-1 text-xs text-blue-600/80 leading-relaxed">
                      Enviaremos um código de acesso temporário para seu e-mail.
                    </p>
                  </div>
                </div>
              )}

              {alreadyRegistered && isSignUp && (
                <div className="rounded-xl border border-[#FF007F]/30 bg-[#FF007F]/10 p-3 text-sm text-[#FFB3D9] flex items-start gap-2">
                  <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">E-mail já cadastrado</p>
                    <Link to="/login" className="mt-1 inline-block text-xs font-semibold text-white hover:underline">
                      Ir para o login →
                    </Link>
                  </div>
                </div>
              )}

              <button type="submit" disabled={isLoading} className={primaryBtn}>
                {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : (
                  <>
                    {isSignUp ? "Enviar código" : "Receber código de acesso"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {signupStep === 2 && (
            <form onSubmit={handleVerifyCode} className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex justify-center">
                <InputOTP 
                  maxLength={6} 
                  value={otp} 
                  onChange={(val) => {
                    // Filter non-numeric characters and handle copy-paste normalization
                    const filtered = val.replace(/\D/g, "");
                    setOtp(filtered);
                  }} 
                  disabled={isLoading} 
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                >
                  <InputOTPGroup className="gap-2 sm:gap-3">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="h-12 w-12 text-xl font-bold rounded-xl bg-white border-neutral-200 text-neutral-900 data-[active=true]:border-[#FF007F] data-[active=true]:ring-1 data-[active=true]:ring-[#FF007F]"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <div className="flex items-center justify-center min-h-[24px] text-sm text-neutral-500">
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="animate-spin h-4 w-4" /> Verificando…
                  </span>
                ) : (
                  <span>O código é verificado automaticamente</span>
                )}
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={isLoading || resendCountdown > 0}
                  className={ghostBtn}
                >
                  {resendCountdown > 0
                    ? `Reenviar em ${resendCountdown}s`
                    : (<><ArrowLeft className="h-4 w-4" /> Reenviar e-mail</>)}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="text-center pt-6 mt-6 border-t border-neutral-200 relative">
          {isSignUp ? (
            <p className="text-neutral-500 text-sm">
              Já tem uma conta?{" "}
              <Link to="/login" className="text-[#FF007F] hover:underline font-semibold">Fazer login</Link>
            </p>
          ) : (
            <p className="text-neutral-500 text-sm">
              Ainda não tem conta?{" "}
              <Link to="/cadastro" className="text-[#FF007F] hover:underline font-semibold">Cadastre-se</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
