import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, XCircle, Shield, ArrowRight } from "lucide-react";
import type { Session } from "@supabase/supabase-js";

export const Route = createFileRoute("/convite/$token")({
  head: () => ({
    meta: [{ title: "Convite de Equipe — Tieck" }],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = useParams({ from: "/convite/$token" });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invite, setInvite] = useState<{
    email: string;
    role: string;
    workspaceName: string;
    status: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      setLoading(false);
    };

    checkAuth();
  }, [token, navigate]);

  useEffect(() => {
    fetchInvite();
  }, [token]);

  const fetchInvite = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/public/invitations/inspect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token })
      });

      const result = await response.json();

      if (!result.ok) {
        if (result.code === 'not_found') setError("convite_inexistente");
        else if (result.code === 'already_processed') setError("convite_ja_aceito");
        else if (result.code === 'expired') setError("convite_expirado");
        else setError("convite_invalido");
        return;
      }

      setInvite(result.invitation);
    } catch (err) {
      console.error("Erro ao buscar convite:", err);
      setError("erro_carregamento");
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!session) {
      navigate({ 
        to: '/login',
        search: { redirect: `/convite/${token}` }
      });
      return;
    }

    setAccepting(true);
    try {
      const response = await fetch('/api/public/invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ token })
      });

      const result = await response.json();

      if (!result.ok) {
        if (result.code === 'email_mismatch') {
          setError('email_mismatch');
        } else {
          toast.error("Não foi possível aceitar o convite.");
        }
        return;
      }

      toast.success("Convite aceito com sucesso!");
      navigate({ to: '/inicio' });
    } catch (err) {
      console.error("Erro ao aceitar convite:", err);
      toast.error("Erro de conexão ao aceitar convite.");
    } finally {
      setAccepting(false);
    }
  };

  const handleSignOutAndRetry = async () => {
    await supabase.auth.signOut();
    navigate({ 
      to: '/login',
      search: { redirect: `/convite/${token}` }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Loader2 className="w-6 h-6 text-pink-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-neutral-100 shadow-sm text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-neutral-900">
            {error === 'convite_inexistente' && "Convite não encontrado"}
            {error === 'convite_ja_aceito' && "Convite já utilizado"}
            {error === 'convite_expirado' && "Convite expirado"}
            {error === 'convite_invalido' && "Convite inválido"}
            {error === 'erro_carregamento' && "Erro ao carregar convite"}
            {error === 'email_mismatch' && "E-mail não correspondente"}
          </h2>
          <p className="text-sm text-neutral-500 mt-2">
            {error === 'email_mismatch' 
              ? "Você está logado com uma conta diferente da destinatária deste convite."
              : "Este link pode estar quebrado ou já ter expirado após 7 dias."}
          </p>
          {error === 'email_mismatch' ? (
            <div className="space-y-3 mt-6">
              <Button className="w-full bg-pink-500 hover:bg-pink-600 text-white" onClick={handleSignOutAndRetry}>
                Sair e entrar com outra conta
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate({ to: '/inicio' })}>
                Ir para o Painel
              </Button>
            </div>
          ) : (
            <Button 
              variant="outline" 
              className="mt-6 w-full"
              onClick={() => navigate({ to: '/inicio' })}
            >
              Voltar ao Início
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="max-w-md w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-xl shadow-pink-500/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-pink-500" />
          
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-pink-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-pink-100">
              <Shield className="w-8 h-8 text-pink-500" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Convite de Equipe</h1>
            <p className="text-sm text-neutral-500 mt-2">
              Você foi convidado para colaborar no workspace
            </p>
          </div>

          <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-100 mb-8">
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-neutral-200/50">
              <div className="w-10 h-10 bg-neutral-200 rounded-lg flex items-center justify-center text-neutral-500 font-bold">
                {invite?.workspaceName?.[0] || 'W'}
              </div>
              <div>
                <div className="text-sm font-bold text-neutral-900">{invite?.workspaceName}</div>
                <div className="text-xs text-neutral-500">Workspace de Checklists</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500 uppercase font-bold tracking-wider">Papel</span>
                <span className="text-xs font-bold px-2.5 py-1 bg-pink-100 text-pink-600 rounded-full capitalize">
                  {invite?.role === 'admin' ? 'Administrador' : invite?.role === 'editor' ? 'Editor' : 'Visualizador'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500 uppercase font-bold tracking-wider">Para</span>
                <span className="text-xs font-mono text-neutral-700">{invite?.email}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {!session ? (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Button 
                  variant="outline"
                  className="h-12 font-bold"
                  onClick={() => navigate({ 
                    to: '/login',
                    search: { redirect: `/convite/${token}` }
                  })}
                >
                  Entrar
                </Button>
                <Button 
                  variant="outline"
                  className="h-12 font-bold"
                  onClick={() => navigate({ 
                    to: '/cadastro',
                    search: { redirect: `/convite/${token}` }
                  })}
                >
                  Criar conta
                </Button>
              </div>
            ) : (
              <Button 
                className="w-full bg-pink-500 hover:bg-pink-600 text-white shadow-lg shadow-pink-100 h-12 text-base font-bold gap-2"
                onClick={handleAccept}
                disabled={accepting}
              >
                {accepting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Aceitar Convite
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </Button>
            )}
            <p className="text-[10px] text-center text-neutral-400">
              Ao aceitar, você concorda com os termos e privacidade do Tieck.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
