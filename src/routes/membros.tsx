import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  X,
  Pencil,
  Users,
  Sliders,
  Code2,
  Mail,
  ImageIcon,
  Upload,
  TrendingDown,
  Sparkles,
  Globe,
  FileText,
  AtSign,
  FolderKanban,
  BarChart3,
  Shield,
  CheckCircle2,
  History,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/membros")({
  head: () => ({
    meta: [{ title: "Planos e Assinatura — ChecklistApp" }],
  }),
  component: PlanosPage,
});

type Feature = { icon: React.ElementType; title: string; desc: string };

const proFeatures: Feature[] = [
  { icon: Pencil, title: "Remover marca", desc: "Oculte toda a marca e deixe seus checklists com a sua identidade." },
  { icon: Globe, title: "Domínios próprios.", desc: "Hospede seus checklists em um subdomínio próprio para criar links de marca." },
  { icon: Users, title: "Colaboração.", desc: "Convide membros ilimitados para workspaces compartilhados." },
  { icon: FileText, title: "Envios parciais.", desc: "Capture respostas incompletas antes que sejam enviadas." },
  { icon: Sliders, title: "Personalização avançada.", desc: "Personalize seus checklists com opções de design integradas." },
  { icon: Code2, title: "CSS personalizado.", desc: "Injete CSS para controlar totalmente o design do checklist." },
  { icon: Mail, title: "Notificações por e-mail.", desc: "Envie e-mails personalizados para você e respondentes." },
  { icon: AtSign, title: "Domínio de e-mail.", desc: "Envie notificações a partir do seu domínio personalizado." },
  { icon: ImageIcon, title: "Pré-visualização de link.", desc: "Personalize a imagem OG, favicon, título e descrição." },
  { icon: FolderKanban, title: "Workspaces.", desc: "Agrupe checklists e gerencie permissões dos membros." },
  { icon: Upload, title: "Uploads ilimitados.", desc: "Remova o limite de 10MB por arquivo nos uploads." },
  { icon: BarChart3, title: "Análises de visitas.", desc: "Dados históricos de visitas, duração e fontes de tráfego." },
  { icon: TrendingDown, title: "Análise de abandono.", desc: "Identifique onde os respondentes desistem do checklist." },
  { icon: History, title: "Histórico de versões.", desc: "Restaure checklists para versões de até 90 dias atrás." },
  { icon: Sparkles, title: "Integrações premium.", desc: "Analise tráfego com Google Analytics e otimize com Meta Pixel." },
  { icon: Shield, title: "Retenção de dados.", desc: "Apague envios automaticamente após um período definido para conformidade." },
  { icon: CheckCircle2, title: "Verificar e-mails.", desc: "Confirme endereços de e-mail dos respondentes e capture leads de qualidade." },
];

function FeatureItem({ icon: Icon, title, desc }: Feature) {
  return (
    <div className="flex gap-3">
      <Icon className="w-5 h-5 text-pink-500 shrink-0 mt-0.5" />
      <p className="text-sm text-neutral-900 leading-relaxed">
        <span className="font-semibold">{title}</span>{" "}
        <span className="text-neutral-600">{desc}</span>
      </p>
    </div>
  );
}

function PlanosPage() {
  const [yearly, setYearly] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const isPro = profile?.plan_type === "pro";

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      
      if (prof) {
        setProfile(prof);
      }
      setIsLoading(false);
    };

    fetchData();
  }, []);

  if (isLoading) {
    return <div className="min-h-screen bg-white flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="h-10 px-4 flex items-center justify-between border-b border-neutral-100">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => navigate({ to: "/inicio" })}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-950 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar
          </button>
          <span className="text-xs font-medium text-neutral-900">Planos e Assinatura</span>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/inicio" })}
          className="w-5 h-5 rounded-full bg-neutral-100 text-neutral-500 hover:text-neutral-950 hover:bg-neutral-200 flex items-center justify-center transition-colors"
          aria-label="Fechar"
        >
          <X className="w-3 h-3" />
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-start justify-between gap-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Faça mais com o <span className="underline decoration-pink-400 decoration-2 underline-offset-4">Tieck</span>
              </h1>
              <p className="mt-2 text-sm text-neutral-600 max-w-md">
                Faça upgrade para acessar recursos avançados criados para times e criadores em crescimento.
              </p>

              <div className="mt-5 flex items-center gap-3 text-sm">
                <span className={!yearly ? "font-medium" : "text-neutral-500"}>Mensal</span>
                <button
                  type="button"
                  onClick={() => setYearly((v) => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${yearly ? "bg-pink-500" : "bg-neutral-300"}`}
                  aria-label="Alternar pagamento"
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${yearly ? "translate-x-5" : ""}`}
                  />
                </button>
                <span className={yearly ? "font-medium" : "text-neutral-500"}>Anual</span>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">2 meses grátis</span>
              </div>
            </div>

            <div className="hidden md:block text-pink-400 text-4xl pt-2">✶ ✦ ✺</div>
          </div>

          <div className="mt-10 grid md:grid-cols-1 max-w-xl mx-auto gap-6">
            {/* Pro */}
            <div className={`border rounded-xl p-6 relative transition-all ${isPro ? "border-pink-500 ring-2 ring-pink-50 bg-pink-50/10" : "border-neutral-200"}`}>
              {isPro && (
                <div className="absolute -top-3 left-6 bg-pink-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                  Seu plano atual
                </div>
              )}
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-bold">Pro</h2>
                <div className="text-right">
                  <p className="text-3xl font-bold">R${yearly ? "24" : "29"}</p>
                  <p className="text-xs text-neutral-500">por mês</p>
                </div>
              </div>
              <button 
                disabled={isPro}
                className={`w-full mt-5 py-2.5 rounded-md text-sm font-bold transition-all ${isPro ? "bg-neutral-100 text-neutral-400 cursor-default" : "bg-pink-500 hover:bg-pink-600 text-white shadow-lg shadow-pink-100"}`}
              >
                {isPro ? "Plano ativo" : "Fazer upgrade para Pro"}
              </button>
              <p className="text-center text-xs text-neutral-500 mt-2">
                Pague R${yearly ? "24" : "29"} {yearly ? "por mês (anual)" : "por mês"}
              </p>

              <div className="mt-8 space-y-6">
                {proFeatures.map((f) => (
                  <FeatureItem key={f.title} {...f} />
                ))}
              </div>
            </div>

          </div>

          <p className="text-center text-xs text-neutral-500 mt-12 pb-10">
            Os planos do Tieck estão sujeitos à nossa{" "}
            <a href="#" className="underline hover:text-neutral-900 transition-colors">Política de Uso</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
