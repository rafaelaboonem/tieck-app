import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getChecklistSeo } from "@/lib/checklist_seo.functions";
import { t } from "@/lib/checklist-i18n";
import { ExecutionEngine } from "@/components/ExecutionEngine";
import logoUrl from "../assets/local/logo-k.webp";
const tieckLogo = logoUrl;

export const Route = createFileRoute("/c/$id")({
  loader: async ({ params }) => {
    try {
      return await getChecklistSeo({ data: { id: params.id } });
    } catch (e) {
      return {
        found: false,
        isPro: false,
        showBranding: true,
        title: "Checklist — Tieck",
        description: "Preencha este checklist criado na Tieck.",
        ogImage: null,
        favicon: null,
      } as const;
    }
  },
  head: ({ loaderData, params }) => {
    const seo = loaderData as Awaited<ReturnType<typeof getChecklistSeo>> | undefined;
    const title = seo?.title || "Checklist — Tieck";
    const description = seo?.description || "Preencha este checklist criado na Tieck.";
    const ogImage = seo?.ogImage || "/og-image.webp";
    const favicon = seo?.favicon || "/favicon.png";
    const publicBase = (typeof process !== "undefined" && process.env?.PUBLIC_URL) || "";
    const url = publicBase ? `${publicBase.replace(/\/+$/, "")}/c/${params.id}` : `/c/${params.id}`;

    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: ogImage ? "summary_large_image" : "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];
    if (ogImage) {
      meta.push({ property: "og:image", content: ogImage });
      meta.push({ name: "twitter:image", content: ogImage });
    }

    const links: Array<Record<string, string>> = [
      { rel: "canonical", href: url },
    ];
    if (favicon) {
      links.push({ rel: "icon", href: favicon });
      links.push({ rel: "apple-touch-icon", href: favicon });
    }

    return { meta, links };
  },
  component: PublicChecklistPage,
});

function PublicChecklistPage() {
  const { id } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const [checklist, setChecklist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const heartbeatInterval = useRef<any>(null);

  useEffect(() => {
    const fetchChecklist = async () => {
      const { data: rows, error } = await supabase.rpc(
        "get_public_checklist",
        { p_public_id: id },
      );
      const row: any = Array.isArray(rows) ? rows[0] : rows;
      if (error || !row) {
        setLoading(false);
        return;
      }

      const data: any = {
        id: row.id,
        title: row.title,
        description: row.description,
        blocks: row.blocks ?? [],
        settings: row.settings ?? {},
        short_slug: row.short_slug,
        custom_slug: row.custom_slug,
        is_published: true,
      };
      setChecklist(data);
      setLoading(false);
      startTracking(data.id);
    };

    fetchChecklist();
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });

    return () => {
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
    };
  }, [id]);

  const startTracking = async (checklistId: string) => {
    let visitorId = localStorage.getItem("tieck_visitor_id") || crypto.randomUUID();
    localStorage.setItem("tieck_visitor_id", visitorId);

    const analyticsRowId = crypto.randomUUID();
    const { error } = await supabase
      .from("checklist_analytics")
      .insert([{
        id: analyticsRowId,
        checklist_id: checklistId,
        visitor_id: visitorId,
        session_id: crypto.randomUUID(),
        metadata: { userAgent: navigator.userAgent, language: navigator.language },
      }]);

    if (!error) {
      setAnalyticsId(analyticsRowId);
      heartbeatInterval.current = setInterval(async () => {
        await supabase
          .from("checklist_analytics")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", analyticsRowId);
      }, 30000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF007F]"></div>
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Checklist não encontrado</h1>
          <p className="text-neutral-500">O link pode estar incorreto ou o checklist foi removido.</p>
        </div>
      </div>
    );
  }

  const settings = checklist.settings || {};
  const isDark = settings.theme === "Escuro";

  if (submitted) {
    return (
      <div 
        className="min-h-screen flex flex-col items-center text-center pt-32 px-6"
        style={{ backgroundColor: isDark ? "#1a1a1a" : settings.bgColor, color: isDark ? "#ffffff" : settings.textColor }}
      >
        <div className="w-20 h-20 rounded-full bg-pink-100 flex items-center justify-center mb-8">
           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-[#FF007F]">
             <polyline points="20 6 9 17 4 12" />
           </svg>
        </div>
        <h1 className="text-3xl font-bold mb-4">{settings.thankYouTitle || t(settings.language, "thankYouTitle")}</h1>
        <p className="opacity-70 mb-8">{settings.thankYouDescription || t(settings.language, "thankYouDesc")}</p>
        <Link to="/" className="text-pink-500 font-semibold hover:underline">{t(settings.language, "createOwn")}</Link>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen overflow-y-auto"
      style={{ backgroundColor: isDark ? "#1a1a1a" : settings.bgColor, color: isDark ? "#ffffff" : settings.textColor, fontFamily: settings.font }}
    >
      <main className="pb-32 pt-12">
        <ExecutionEngine 
          checklist={checklist} 
          onSubmitted={() => setSubmitted(true)}
          analyticsId={analyticsId}
        />
      </main>

      {loaderData.showBranding && (
        <div className="fixed bottom-6 right-8 z-[100] flex items-center gap-3">
          <span className="text-sm text-neutral-400">Feito com</span>
          <img src={tieckLogo} alt="Tieck" className="h-20 grayscale opacity-60" />
        </div>
      )}
    </div>
  );
}
