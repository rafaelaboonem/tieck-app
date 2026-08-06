import { useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mapAuthError } from "@/utils/auth-errors";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff, Loader2, ArrowRight, Mail, KeyRound, CheckCircle2, ArrowLeft } from "lucide-react";
import { lovable } from "@/integrations/lovable";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import logoUrl from "../assets/local/logo-tieck.webp";

type Props = {
  mode: "login" | "signup";
  redirect?: string;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const SIGNUP_FUNCTIONS_URL = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1` : "";
const SIGNUP_FUNCTIONS_KEY = SUPABASE_PUBLISHABLE_KEY ?? "";

export function AuthPage({ mode, redirect }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSignUp = mode === "signup";

  async function invokeSignupFn<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
    if (!SIGNUP_FUNCTIONS_URL || !SIGNUP_FUNCTIONS_KEY) {
      throw new Error("O serviço de cadastro não está configurado neste ambiente.");
    }
    const url = `${SIGNUP_FUNCTIONS_URL}/${name}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          apikey: SIGNUP_FUNCTIONS_KEY,
          Authorization: `Bearer ${SIGNUP_FUNCTIONS_KEY}`,
          "x-client-info": "tieck-web-signup/1.0",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.error("Signup function network error", { name, url, error });
      throw new Error("O serviço de cadastro está indisponível no momento. Tente novamente em instantes.");
    }

    const responseText = await response.text();
    let data: unknown;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      data = responseText;
    }

    const errorCode =
      data && typeof data === "object" && "code" in data ? String((data as { code: unknown }).code) : undefined;

    if (!response.ok) {
      console.error("Signup function HTTP error", {
        name,
        url,
        status: response.status,
        statusText: response.statusText,
        response: data,
      });
      const message =
        data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : `Falha no serviço de cadastro (${response.status}). Tente novamente.`;
      const err = new Error(message) as Error & { code?: string };
      err.code = errorCode;
      throw err;
    }
    if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
      console.error("Signup function response error", { name, url, status: response.status, response: data });
      const err = new Error(String((data as { error: unknown }).error)) as Error & { code?: string };
      err.code = errorCode;
      throw err;
    }
    return data as T;
  }

  const safeRedirect = (() => {
    if (typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//")) return redirect;
    return null;
  })();
  const goAfterAuth = () => {
    if (user && !user.email_confirmed_at) {
      navigate({ to: "/confirmar-email" });
      return;
    }
    if (safeRedirect) {
      window.location.assign(safeRedirect);
    } else {
      navigate({ to: "/inicio" });
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [signupStep, setSignupStep] = useState<1 | 2 | 3>(1);
  const [otp, setOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);

  // Guards against double-submission of the same OTP (auto-submit + Enter/form).
  const verifyingRef = useRef<string | null>(null);

  useEffect(() => {
    if (user && !(isSignUp && signupStep > 1)) goAfterAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSignUp, signupStep]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const resetSignup = () => {
    setSignupStep(1);
    setOtp("");
    setPassword("");
    setDisplayName("");
    setOtpVerified(false);
    setAlreadyRegistered(false);
    setVerificationToken("");
    setResendCountdown(0);
  };

  const normalizedEmail = () => email.trim().toLowerCase();

  /** Volta para a etapa do código permitindo pedir um novo, em vez de reiniciar tudo. */
  const backToCodeStep = (message: string) => {
    setOtp("");
    setOtpVerified(false);
    setVerificationToken("");
    setResendCountdown(0);
    setSignupStep(2);
    toast.error(message);
  };

  const handleGoogle = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("redirect", safeRedirect ?? "/inicio");

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: callbackUrl.toString(),
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      goAfterAuth();
    } catch (err: any) {
      console.error("Google auth error:", err);
      toast.error(mapAuthError(err.message || "Erro ao entrar com Google"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setAlreadyRegistered(false);
    setIsLoading(true);
    try {
      const result = await invokeSignupFn<{ ok: boolean; code?: string }>(
        "signup-request-otp",
        { email: normalizedEmail() },
      );
      if (!result.ok) {
        setAlreadyRegistered(true);
        toast.error("Este e-mail já está cadastrado.");
        return;
      }
      toast.success("Código enviado! Verifique seu e-mail.");
      setSignupStep(2);
      setResendCountdown(30);
    } catch (err: any) {
      console.error("Send OTP error:", err, JSON.stringify(err));
      const raw = err?.message || "Não foi possível enviar o código. Tente novamente.";
      toast.error(raw);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e?: React.FormEvent, codeOverride?: string) => {
    e?.preventDefault();
    const code = codeOverride ?? otp;
    if (isLoading || code.length !== 6) return;
    // Prevent the same 6-digit code from being submitted twice concurrently.
    if (verifyingRef.current === code) return;
    verifyingRef.current = code;
    setIsLoading(true);
    try {
      const result = await invokeSignupFn<{ ok: boolean; verificationToken: string }>(
        "signup-verify-otp",
        { email: normalizedEmail(), code },
      );
      setVerificationToken(result.verificationToken);
      setOtpVerified(true);
      toast.success("E-mail verificado!");
      setSignupStep(3);
    } catch (err: any) {
      console.error("Verify OTP error:", err);
      const raw = String(err?.message || "Código inválido");
      // Server-side messages we want to show as-is (already in Portuguese, user-friendly).
      const passthrough = /código|expirado|tentativas|sessão/i.test(raw);
      toast.error(passthrough ? raw : mapAuthError(raw));
      setOtp("");
    } finally {
      verifyingRef.current = null;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (signupStep === 2 && otp.length === 6 && !isLoading && !otpVerified) {
      handleVerifyCode(undefined, otp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, signupStep]);

  const handleResendCode = async () => {
    if (isLoading || !email || resendCountdown > 0) return;
    setOtp("");
    setOtpVerified(false);
    setAlreadyRegistered(false);
    setVerificationToken("");
    setIsLoading(true);
    try {
      const result = await invokeSignupFn<{ ok: boolean; code?: string }>(
        "signup-request-otp",
        { email: normalizedEmail() },
      );
      if (!result.ok) {
        setAlreadyRegistered(true);
        toast.error("Este e-mail já está cadastrado.");
        setSignupStep(1);
        return;
      }
      toast.success("Novo código enviado! Verifique seu e-mail.");
      setSignupStep(2);
      setResendCountdown(30);
    } catch (err: any) {
      console.error("Resend OTP error:", err, JSON.stringify(err));
      const raw = err?.message || "Não foi possível reenviar o código. Tente novamente.";
      toast.error(raw);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (displayName.trim().length < 2) {
      toast.error("Informe seu nome.");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (!otpVerified || !verificationToken) {
      backToCodeStep("Sua verificação expirou. Solicite um novo código.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await invokeSignupFn<{ ok: boolean; code?: string }>(
        "signup-complete",
        { email: normalizedEmail(), verificationToken, password, displayName: displayName.trim() },
      );
      if (!result.ok) {
        if (result.code === "account_recovered_login_required") {
          toast.info(
            "Sua conta já existia e foi restaurada. Entre com sua senha ou use “Esqueci minha senha”.",
          );
          navigate({ to: "/login" });
          return;
        }
        toast.error("Este e-mail já está cadastrado.");
        resetSignup();
        return;
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: normalizedEmail(),
        password,
      });
      if (signInErr) throw signInErr;
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Não foi possível iniciar a sessão. Tente entrar novamente.");
      }
      toast.success("Conta criada com sucesso!");
      goAfterAuth();
    } catch (err: any) {
      console.error("Set password error:", err);
      if (err?.code === "session_invalid" || err?.code === "session_expired") {
        backToCodeStep("Sua verificação expirou. Enviamos você de volta para solicitar um novo código.");
        return;
      }
      toast.error(mapAuthError(err.message || "Erro ao finalizar cadastro"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Bloqueio de acesso: e-mail ainda não confirmado.
      if (data.user && !data.user.email_confirmed_at) {
        toast.info("Confirme seu e-mail para acessar a plataforma.");
        navigate({ to: "/confirmar-email" });
        return;
      }
      toast.success("Bem-vindo de volta!");
      goAfterAuth();
    } catch (err: any) {
      console.error("Auth error:", err);
      toast.error(mapAuthError(err.message));
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- UI ----------
  const heading = isSignUp
    ? signupStep === 1
      ? "Crie sua conta"
      : signupStep === 2
      ? "Verifique seu e-mail"
      : "Defina sua senha"
    : "Bem-vindo de volta";

  const subheading = isSignUp
    ? signupStep === 1
      ? "Comece informando seu melhor e-mail"
      : signupStep === 2
      ? `Enviamos um código de 6 dígitos para ${email}`
      : "Escolha uma senha forte para finalizar"
    : "Acesse sua conta para continuar";

  const inputClass =
    "w-full bg-white border border-neutral-200 text-neutral-900 placeholder:text-neutral-400 px-4 py-3.5 rounded-xl focus:outline-none focus:border-[#FF007F] focus:ring-1 focus:ring-[#FF007F] transition-all";

  const primaryBtn =
    "w-full bg-[#FF007F] hover:bg-[#E60072] text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-[#FF007F]/30 active:scale-[0.98] font-display disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2";

  const ghostBtn =
    "w-full bg-transparent border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:border-neutral-400 font-medium py-3 rounded-xl transition-all text-sm cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60";

  return (
    <div className="min-h-screen flex items-center justify-center bg-white font-body p-4 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[480px] h-[480px] bg-[#FF007F] opacity-[0.06] blur-[120px] rounded-full" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[480px] h-[480px] bg-[#FF007F] opacity-[0.05] blur-[120px] rounded-full" />

      <div className="w-full max-w-[440px] bg-white border border-neutral-100 rounded-3xl p-8 md:p-10 shadow-xl shadow-neutral-200/60 relative overflow-hidden backdrop-blur-sm">
        {/* Card inner glow */}
        <div className="pointer-events-none absolute -top-24 -right-24 w-48 h-48 bg-[#FF007F] opacity-5 blur-[80px]" />

        {/* Brand */}
        <div className="text-center mb-8 relative">
          <img
            src={logoUrl}
            alt="Tieck"
            className="mx-auto h-12 md:h-14 w-auto mb-4"
          />
          <h2 className="mt-4 text-xl font-semibold text-neutral-900 font-display">{heading}</h2>
          <p className="text-neutral-500 mt-1.5 text-sm">{subheading}</p>
        </div>

        {/* Step indicator for signup */}
        {isSignUp && (
          <div className="flex items-center justify-center gap-2 mb-7">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 rounded-full transition-all duration-300 ${
                  s === signupStep
                    ? "w-8 bg-[#FF007F]"
                    : s < signupStep
                    ? "w-4 bg-[#FF007F]/60"
                    : "w-4 bg-neutral-200"
                }`}
              />
            ))}
          </div>
        )}

        {/* Google + divider (only on step 1 of signup, or login) */}
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

        {/* ============ LOGIN ============ */}
        {!isSignUp && (
          <form className="space-y-5 relative" onSubmit={handleLogin}>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Senha</label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-12`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400 hover:text-neutral-900 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className={primaryBtn}>
              {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : (<>Entrar <ArrowRight className="h-4 w-4" /></>)}
            </button>
          </form>
        )}

        {/* ============ SIGNUP ============ */}
        {isSignUp && (
          <div className="space-y-5 relative">
            {/* Step 1 — email */}
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

                {alreadyRegistered && (
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
                  {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : (<>Enviar código <ArrowRight className="h-4 w-4" /></>)}
                </button>
              </form>
            )}

            {/* Step 2 — OTP */}
            {signupStep === 2 && (
              <form onSubmit={handleVerifyCode} className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={isLoading} autoFocus>
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

            {/* Step 3 — password */}
            {signupStep === 3 && (
              <form onSubmit={handleSetPassword} className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Seu nome</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    minLength={2}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={inputClass}
                    placeholder="Como podemos te chamar?"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Crie sua senha</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputClass} pr-12`}
                      placeholder="Mínimo 6 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400 hover:text-neutral-900 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={isLoading} className={primaryBtn}>
                  {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : (<><KeyRound className="h-5 w-5" />Finalizar cadastro</>)}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Footer link */}
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