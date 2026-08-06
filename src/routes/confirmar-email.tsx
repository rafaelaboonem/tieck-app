import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, MailCheck, ArrowRight, LogOut } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import logoAsset from "@/assets/logo-tieck.webp.asset.json";
const logoUrl = logoAsset.url;

export const Route = createFileRoute("/confirmar-email")({
  head: () => ({
    meta: [
      { title: "Confirme seu e-mail | Tieck" },
      {
        name: "description",
        content:
          "Confirme seu endereço de e-mail com o código enviado pela Tieck para liberar o acesso à plataforma.",
      },
      { property: "og:title", content: "Confirme seu e-mail | Tieck" },
      {
        property: "og:description",
        content: "Digite o código de 6 dígitos enviado para o seu e-mail e libere o acesso à Tieck.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfirmarEmailPage,
});

async function invokeFn<T = any>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
  if (error) {
    let message = error.message || "Erro ao contatar o servidor";
    const ctx: any = (error as any).context;
    try {
      const res = ctx?.response ?? ctx;
      if (res && typeof res.json === "function") {
        const parsed = await res.json();
        if (parsed?.error) message = parsed.error;
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (data && typeof data === "object" && "error" in (data as any) && (data as any).error) {
    throw new Error(String((data as any).error));
  }
  return data as T;
}

function ConfirmarEmailPage() {
  const navigate = useNavigate();
  const { user, loading, needsEmailConfirmation, refreshUser, signOut } = useAuth();

  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const autoSentRef = useRef(false);
  const verifyingRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!needsEmailConfirmation) navigate({ to: "/inicio" });
  }, [loading, user, needsEmailConfirmation, navigate]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const sendCode = async () => {
    if (sending || countdown > 0) return;
    setSending(true);
    try {
      const res = await invokeFn<{ ok: boolean; alreadyConfirmed?: boolean }>(
        "confirm-email-request",
      );
      if (res?.alreadyConfirmed) {
        await refreshUser();
        navigate({ to: "/inicio" });
        return;
      }
      setSentOnce(true);
      setCountdown(30);
      toast.success("Código enviado! Verifique seu e-mail.");
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível enviar o código.");
    } finally {
      setSending(false);
    }
  };

  // Envia automaticamente o primeiro código ao abrir a página.
  useEffect(() => {
    if (loading || !user || !needsEmailConfirmation || autoSentRef.current) return;
    autoSentRef.current = true;
    sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, needsEmailConfirmation]);

  const verifyCode = async (code: string) => {
    if (verifying || code.length !== 6 || verifyingRef.current === code) return;
    verifyingRef.current = code;
    setVerifying(true);
    try {
      await invokeFn("confirm-email-verify", { code });
      await supabase.auth.refreshSession();
      await refreshUser();
      toast.success("E-mail confirmado com sucesso!");
      navigate({ to: "/inicio" });
    } catch (err: any) {
      toast.error(err?.message || "Código inválido.");
      setOtp("");
    } finally {
      verifyingRef.current = null;
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (otp.length === 6) verifyCode(otp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF007F]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white font-body p-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 w-[480px] h-[480px] bg-[#FF007F] opacity-[0.06] blur-[120px] rounded-full" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[480px] h-[480px] bg-[#FF007F] opacity-[0.05] blur-[120px] rounded-full" />

      <div className="w-full max-w-[440px] bg-white border border-neutral-100 rounded-3xl p-8 md:p-10 shadow-xl shadow-neutral-200/60 relative">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="Tieck" className="mx-auto h-12 md:h-14 w-auto mb-4" />
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#FF007F]/10">
            <MailCheck className="h-6 w-6 text-[#FF007F]" />
          </div>
          <h2 className="text-xl font-semibold text-neutral-900 font-display">
            Confirme seu e-mail
          </h2>
          <p className="text-neutral-500 mt-1.5 text-sm">
            Enviamos um código de 6 dígitos para{" "}
            <span className="font-medium text-neutral-800">{user.email}</span>
          </p>
        </div>

        <div className="flex justify-center mb-6">
          <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={verifying} autoFocus>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {verifying && (
          <div className="flex items-center justify-center gap-2 text-sm text-neutral-500 mb-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando código...
          </div>
        )}

        <button
          type="button"
          onClick={() => verifyCode(otp)}
          disabled={verifying || otp.length !== 6}
          className="w-full bg-[#FF007F] hover:bg-[#E60072] text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-[#FF007F]/30 active:scale-[0.98] font-display disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Confirmar e-mail <ArrowRight className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={sendCode}
          disabled={sending || countdown > 0}
          className="mt-3 w-full bg-transparent border border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:border-neutral-400 font-medium py-3 rounded-xl transition-all text-sm disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : countdown > 0 ? (
            `Reenviar código em ${countdown}s`
          ) : sentOnce ? (
            "Reenviar código"
          ) : (
            "Enviar código"
          )}
        </button>

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-5 w-full text-xs text-neutral-400 hover:text-neutral-700 transition-colors flex items-center justify-center gap-1.5"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair e usar outra conta
        </button>
      </div>
    </div>
  );
}
