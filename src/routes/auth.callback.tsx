import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "../assets/tieck-logo.png?url";

const sanitizeRedirect = (value?: string) => {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/inicio";
};

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: AuthCallbackRoute,
});

function AuthCallbackRoute() {
  const { redirect } = Route.useSearch();
  const destination = useMemo(() => sanitizeRedirect(redirect), [redirect]);
  const [message, setMessage] = useState("Finalizando login com Google…");

  useEffect(() => {
    let cancelled = false;

    const finishAuth = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const searchParams = new URLSearchParams(window.location.search);

        const accessToken = hashParams.get("access_token") ?? searchParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token") ?? searchParams.get("refresh_token");
        const code = searchParams.get("code");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setMessage("Aguardando confirmação da sessão…");
          await new Promise<void>((resolve) => {
            const timeout = window.setTimeout(resolve, 2500);
            const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
              if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
                window.clearTimeout(timeout);
                listener.subscription.unsubscribe();
                resolve();
              }
            });
          });
        }

        if (!cancelled) {
          window.location.replace(destination);
        }
      } catch (error) {
        console.error("Google callback error:", error);
        if (!cancelled) {
          setMessage("Não foi possível finalizar o login. Voltando para a tela de acesso…");
          window.setTimeout(() => window.location.replace("/login"), 1200);
        }
      }
    };

    finishAuth();
    return () => {
      cancelled = true;
    };
  }, [destination]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white font-body p-4">
      <div className="w-full max-w-[420px] text-center">
        <img src={logoUrl} alt="Tieck" className="mx-auto h-20 w-auto mb-8" />
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#FF007F]" />
        <p className="mt-5 text-sm font-medium text-neutral-600">{message}</p>
      </div>
    </div>
  );
}