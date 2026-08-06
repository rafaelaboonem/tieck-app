import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Star, Camera, ArrowRight, ArrowUpRight, ArrowRightCircle, ArrowBigRight, MoveRight, Send, SendHorizontal, Check, CheckCircle, CheckCheck } from "lucide-react";
import logoUrl from "../assets/local/logo-k.webp";
const tieckLogo = logoUrl;
import { toast } from "sonner";
import { BlockRenderer } from "@/components/BlockRenderer";
import { PublicCameraBlock } from "@/components/PublicCameraBlock";
import { CameraSessionProvider } from "@/contexts/CameraSessionContext";
import { getChecklistSeo } from "@/lib/checklist_seo.functions";
import { t } from "@/lib/checklist-i18n";

// Mapa de `error` retornado pela Edge Function `analyze-checklist-evidence`
// → chave pública i18n. Nunca expor detalhes técnicos ao usuário final.
const SUBMIT_ERROR_KEY: Record<
  string,
  Parameters<typeof t>[1]
> = {
  analysis_in_progress: "submitAnalysisInProgress",
  resubmit_required: "submitResubmitRequired",
  analysis_blocks_submission: "submitBlockedByAnalysis",
  upload_pending_confirmation: "submitEvidencePending",
  required_evidence_missing: "requiredError",
  required_block_missing: "requiredError",
  invalid_response_token: "submitSessionExpired",
  checklist_mismatch: "submitSessionExpired",
  checklist_not_published: "submitChecklistUnavailable",
  rate_limited: "submitRateLimited",
};

/** Extrai o `error` do corpo JSON de uma FunctionsHttpError; retorna null se
 * o body não é JSON legível. Nunca lê `error.message` técnico. */
async function readInvokeErrorCode(err: unknown): Promise<string | null> {
  try {
    const anyErr = err as { context?: { response?: Response } } | undefined;
    const resp = anyErr?.context?.response;
    if (!resp || typeof resp.clone !== "function") return null;
    const body = await resp.clone().json().catch(() => null);
    const code = body && typeof body === "object" ? (body as any).error : null;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}


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

const BTN_ICON_MAP: Record<string, any> = {
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  "arrow-right-circle": ArrowRightCircle,
  "arrow-big-right": ArrowBigRight,
  "move-right": MoveRight,
  "send": Send,
  "send-horizontal": SendHorizontal,
  "check": Check,
  "check-circle": CheckCircle,
  "check-check": CheckCheck,
};
function renderBtnIcon(key: string | undefined) {
  const k = key || "arrow-right";
  if (k === "none") return null;
  const Icon = BTN_ICON_MAP[k];
  if (!Icon) return null;
  return <Icon className="w-4 h-4" aria-hidden />;
}

// Compress large images (esp. iPhone HEIC photos) via canvas → JPEG.
// Returns null on unsupported formats (caller falls back to original file).
async function compressImage(file: File, maxDim = 1920, quality = 0.82): Promise<File | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          const scale = Math.min(1, maxDim / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) { URL.revokeObjectURL(url); return resolve(null); }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(url);
              if (!blob) return resolve(null);
              const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
              resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
            },
            "image/jpeg",
            quality,
          );
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}


function PublicChecklistPage() {
  const { id } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const [checklist, setChecklist] = useState<any>(null);
  const [authorProfile, setAuthorProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const heartbeatInterval = useRef<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [submissionCount, setSubmissionCount] = useState<number>(0);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordOk, setPasswordOk] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Prevent accidental navigation/refresh while files are still uploading,
  // which would otherwise drop the user on a generic 500 page.
  useEffect(() => {
    if (!uploading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploading]);

  const [lastBlockId, setLastBlockId] = useState<string | null>(null);

  const setAnswer = (blockId: string, value: any) => {
    setAnswers((p) => ({ ...p, [blockId]: value }));
    setLastBlockId(blockId);
  };

  // -------- sessão da resposta pública (create-response idempotente) --------
  // Uma resposta é criada UMA ÚNICA VEZ por checklist/aba, no primeiro upload
  // ou no envio final (o que ocorrer antes). Persistida em sessionStorage,
  // então uploads seguintes e o submit reutilizam o mesmo responseId/token.
  const responseSessionKey = (): string => {
    const cid = checklist?.id || id;
    return `tieck_response_session_${cid}`;
  };
  const readResponseSession = (): { responseId: string; responseToken: string } | null => {
    try {
      const raw = sessionStorage.getItem(responseSessionKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.responseId && parsed?.responseToken) return parsed;
      return null;
    } catch { return null; }
  };
  const clearResponseSession = () => {
    try { sessionStorage.removeItem(responseSessionKey()); } catch { /* noop */ }
  };
  // Serializa criações concorrentes (dois uploads clicados quase juntos).
  const responseSessionPromise = useRef<Promise<{ responseId: string; responseToken: string } | null> | null>(null);
  const ensureResponseSession = async (): Promise<{ responseId: string; responseToken: string } | null> => {
    const existing = readResponseSession();
    if (existing) return existing;
    if (responseSessionPromise.current) return responseSessionPromise.current;
    const checklistUuid = checklist?.id || id;
    let visitorId = localStorage.getItem("tieck_visitor_id");
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem("tieck_visitor_id", visitorId);
    }
    responseSessionPromise.current = (async () => {
      const { data, error } = await supabase.functions.invoke(
        "analyze-checklist-evidence",
        { body: { action: "create-response", checklistId: checklistUuid, visitorId } },
      );
      if (error || !data?.responseId || !data?.responseToken) {
        console.error("Erro ao criar sessão de resposta:", error);
        return null;
      }
      const session = { responseId: data.responseId as string, responseToken: data.responseToken as string };
      try { sessionStorage.setItem(responseSessionKey(), JSON.stringify(session)); } catch { /* noop */ }
      return session;
    })();
    try {
      return await responseSessionPromise.current;
    } finally {
      responseSessionPromise.current = null;
    }
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    try {
      // Garante que a resposta exista antes do primeiro upload (idempotente).
      const session = await ensureResponseSession();
      if (!session) {
        toast.error(t((checklist?.settings as any)?.language, "sendError"));
        return null;
      }
      // Compress images client-side (iPhone HEIC/large photos hang mobile uploads)
      let fileToUpload: File = file;
      const isImage = (file.type || "").startsWith("image/") || /\.(heic|heif|jpg|jpeg|png|webp)$/i.test(file.name);
      // Always compress images (camera photos are huge even <1.5MB on modern phones)
      if (isImage && file.size > 400_000) {
        try {
          const compressed = await compressImage(file);
          if (compressed) fileToUpload = compressed;
        } catch (cErr) {
          console.warn("Falha ao comprimir imagem, enviando original:", cErr);
        }
      }

      const rawExt = (fileToUpload.name.includes(".") ? fileToUpload.name.split(".").pop() : "") || "";
      const ext = (rawExt || (fileToUpload.type.split("/")[1] ?? "bin"))
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 8) || "bin";
      const checklistUuid = checklist?.id || id;
      const path = `responses/${checklistUuid}/${crypto.randomUUID()}.${ext}`;
      console.log("[upload] start", { path, size: fileToUpload.size, type: fileToUpload.type });

      // Hard timeout so mobile doesn't hang forever
      const uploadPromise = supabase.storage
        .from("checklist-assets")
        .upload(path, fileToUpload, { upsert: false, contentType: fileToUpload.type || undefined });
      const timeoutPromise = new Promise<{ error: any }>((resolve) =>
        setTimeout(() => resolve({ error: { message: "Tempo esgotado no upload (45s). Verifique sua conexão." } }), 45000),
      );
      const { error } = (await Promise.race([uploadPromise, timeoutPromise])) as any;
      if (error) {
        console.error("Erro no upload:", error, { path, size: fileToUpload.size, type: fileToUpload.type });
        toast.error(`Falha ao enviar "${file.name}": ${error.message}`);
        return null;
      }
      console.log("[upload] success", path);
      const { data } = supabase.storage.from("checklist-assets").getPublicUrl(path);
      return data.publicUrl;
    } catch (err: any) {
      console.error("Exceção no upload:", err);
      toast.error(`${t((checklist?.settings as any)?.language, "fileError")}: ${err?.message || "—"}`);
      return null;
    }
  };

  useEffect(() => {
    const fetchChecklist = async () => {
      // Anonymous SELECT on public.checklists is not allowed. Load the
      // published checklist through the SECURITY DEFINER RPC, which never
      // exposes owner_id / workspace_id / user_id to the client.
      const { data: rows, error } = await (supabase.rpc as any)(
        "get_public_checklist",
        { p_public_id: id },
      );
      const row: any = Array.isArray(rows) ? rows[0] : rows;
      if (error || !row) {
        toast.error(t(undefined, "notFound"));
        setLoading(false);
        return;
      }

      // Shape into the object the rest of the page already consumes.
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
      // Author profile / submission count are only visible to authenticated
      // owners; the public page no longer needs them. Enforcement of any
      // submission cap runs server-side inside submit_public_response.
      setAuthorProfile(null);
      setSubmissionCount(0);

      setLoading(false);
      
      // Start analytics tracking
      startTracking(data.id);
    };

    fetchChecklist();
    
    // Check auth status
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    return () => {
      subscription.unsubscribe();
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
    };
  }, [id]);

  const startTracking = async (checklistId: string) => {
    // Get or create visitor ID
    let visitorId = localStorage.getItem("tieck_visitor_id");
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem("tieck_visitor_id", visitorId);
    }

    const analyticsRowId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();

    const { error } = await supabase
      .from("checklist_analytics")
      .insert([
        {
          id: analyticsRowId,
          checklist_id: checklistId,
          visitor_id: visitorId,
          session_id: sessionId,
          metadata: {
            userAgent: navigator.userAgent,
            language: navigator.language,
          },
        },
      ]);

    if (!error) {
      setAnalyticsId(analyticsRowId);
      
      // Start heartbeat every 30 seconds to track duration
      heartbeatInterval.current = setInterval(async () => {
        await supabase
          .from("checklist_analytics")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", analyticsRowId);
      }, 30000);
    } else {
      console.error("Error starting checklist analytics:", error);
    }
  };
  
  // Partial answers capture (PRO users + checklist setting enabled)
  useEffect(() => {
    const partialEnabled = (checklist?.settings as any)?.partialSubmissions === true;
    if (analyticsId && Object.keys(answers).length > 0 && authorProfile?.plan_type === 'pro' && partialEnabled) {
      const timer = setTimeout(async () => {
        // We only save basic values, not files directly here as they need upload
        const partialData = { ...answers };
        // Clean up files/blobs to avoid direct JSON storage issues
        Object.keys(partialData).forEach(key => {
          if (partialData[key] instanceof File || (Array.isArray(partialData[key]) && partialData[key][0] instanceof File)) {
            delete partialData[key];
          }
        });

        await supabase
          .from("checklist_analytics")
          .update({ 
            metadata: { 
              ...(checklist?.metadata || {}), 
              partial_answers: partialData,
              last_block_id: lastBlockId,
              last_updated_at: new Date().toISOString()
            } 
          })
          .eq("id", analyticsId);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [answers, analyticsId, authorProfile, checklist]);


  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (uploading) return;
    setUploading(true);

    try {
    // Validation: Check for required fields
    const blocks = checklist.blocks || [];
    const missingRequired = blocks.filter((b: any) => {
      const isInteractive = ["short-answer", "long-answer", "multiple-choice", "checkboxes", "dropdown", "multi-select", "number", "email", "phone", "link", "file-upload", "date", "time", "linear-scale", "matrix", "rating", "signature", "ranking", "image", "camera"].includes(b.type);
      if (!isInteractive || b.required === false) return false;
      // If it's a cover or profile image, skip requirement check if it's not explicitly required
      if (b.type === "image" && (b.variant === "profile" || b.variant === "cover")) return false;
      
      const answer = answers[b.id];
      if (answer === undefined || answer === null || answer === "") return true;
      if (Array.isArray(answer) && answer.length === 0) return true;
      return false;
    });

    if (missingRequired.length > 0) {
      toast.error(t((checklist?.settings as any)?.language, "requiredError"));
      setUploading(false);
      return;
    }

    // Bloqueia envio se alguma foto ainda está em análise ou terminou com
    // canContinue === false (por exemplo, revisão exigida pelo backend).
    const blockingCamera = blocks.find((b: any) => {
      if (b.type !== "camera") return false;
      const ans = answers[b.id];
      if (!ans || typeof ans !== "object") return false;
      if (!ans.analysisEnabled) return false;
      const a = ans.analysis;
      if (!a) return true; // ainda sem resultado — não deixa enviar
      return a.canContinue === false;
    });
    if (blockingCamera) {
      toast.error("Aguarde a análise das fotos ou envie uma nova foto para prosseguir.");
      setUploading(false);
      return;
    }

    // Use the real UUID from the loaded checklist (URL param may be a slug)
    const checklistUuid = checklist.id as string;

    // Get author profile for duplicate prevention settings
    const { data: profile } = await supabase
      .from("profiles")
      .select("settings")
      .eq("id", checklist.user_id)
      .single();

    const authorSettings = (profile?.settings as any) || {};
    const visitorId = localStorage.getItem("tieck_visitor_id") || crypto.randomUUID();

    if (authorSettings.prevent_duplicates) {
      const identifier = authorSettings.duplicate_identifier || "ip";
      
      if (identifier === "ip") {
        const { count, error } = await supabase
          .from("checklist_responses")
          .select("id", { count: 'exact', head: true })
          .eq("checklist_id", checklistUuid)
          .eq("visitor_id", visitorId);

        if (!error && count && count > 0) {
          toast.error(t((checklist?.settings as any)?.language, "alreadySubmitted"));
          setUploading(false);
          return;
        }
      } else if (identifier === "email" || identifier === "phone") {
        // Find the block corresponding to the identifier type
        const blocks = checklist.blocks || [];
        const targetBlock = blocks.find((b: any) => b.type === identifier);
        
        if (targetBlock) {
          const value = answers[targetBlock.id];
          if (value) {
            // Check if any existing response has this value for this block
            // Note: In Supabase, jsonb search for specific keys is better handled with proper filters if possible
            const { count: existsCount, error: countError } = await supabase
              .from("checklist_responses")
              .select("id", { count: 'exact', head: true })
              .eq("checklist_id", checklistUuid)
              .contains("answers", { [targetBlock.id]: value });

            if (!countError && existsCount !== null && existsCount > 0) {
              toast.error(t((checklist?.settings as any)?.language, identifier === 'email' ? "duplicateEmail" : "duplicatePhone"));
              setUploading(false);
              return;
            }
          }
        }
      }
    }

    // Resolve File answers -> upload to storage, get URLs
    // Collect every File into a flat task list so we can upload them in parallel
    // with a concurrency limit (24 camera blocks done one-by-one would time out).
    type Task = { key: string; idx: number; file: File };
    const tasks: Task[] = [];
    const resolved: Record<string, any> = {};
    for (const [k, v] of Object.entries(answers)) {
      if (v instanceof File) {
        tasks.push({ key: k, idx: -1, file: v });
        resolved[k] = null;
      } else if (Array.isArray(v) && v[0] instanceof File) {
        resolved[k] = new Array(v.length).fill(null);
        v.forEach((f: File, i: number) => tasks.push({ key: k, idx: i, file: f }));
      } else {
        resolved[k] = v;
      }
    }

    if (tasks.length > 0) {
      setUploadProgress({ done: 0, total: tasks.length });
      let done = 0;
      const CONCURRENCY = 4;
      let cursor = 0;
      const worker = async () => {
        while (true) {
          const i = cursor++;
          if (i >= tasks.length) return;
          const t = tasks[i];
          const url = await uploadFile(t.file);
          const entry = url ? { url, name: t.file.name, type: t.file.type } : null;
          if (t.idx === -1) {
            resolved[t.key] = entry;
          } else {
            resolved[t.key][t.idx] = entry;
          }
          done++;
          setUploadProgress({ done, total: tasks.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
      // Clean nulls out of arrays
      for (const k of Object.keys(resolved)) {
        if (Array.isArray(resolved[k])) resolved[k] = resolved[k].filter(Boolean);
      }
    }

    const settings = checklist?.settings || {};
    const retention = Number(settings.retentionDays) || 3;
    const isRetentionEnabled = settings.dataRetention === true;
    const expires = isRetentionEnabled 
      ? new Date(Date.now() + retention * 24 * 60 * 60 * 1000).toISOString() 
      : null;

    // Reutiliza a sessão criada no primeiro upload; se ainda não existe
    // (checklist sem fotos, envio direto), cria agora — uma única vez.
    void expires; // retenção é aplicada no backend a partir de settings.
    const session = await ensureResponseSession();
    if (!session) {
      toast.error(t((checklist?.settings as any)?.language, "sendError"));
      setUploading(false);
      return;
    }

    const { error: submitError } = await supabase.functions.invoke(
      "analyze-checklist-evidence",
      {
        body: {
          action: "submit-response",
          checklistId: checklistUuid,
          responseToken: session.responseToken,
          answers: resolved,
        },
      },
    );
    if (submitError) {
      const lang = (checklist?.settings as any)?.language;
      const code = await readInvokeErrorCode(submitError);
      console.error("[submit-response] falhou", { code });
      const key = code ? SUBMIT_ERROR_KEY[code] : undefined;
      if (key) {
        toast.error(t(lang, key));
      } else if (code === "model_unavailable") {
        toast.error(t(lang, "submitModelNotReady"));
      } else {
        // Fallback público sem detalhes técnicos.
        toast.error(t(lang, "submitAnalysisFailed"));
      }
      setUploading(false);
      return;
    }

    clearResponseSession();
    setSubmitted(true);
    setUploading(false);

    // Redirect to a custom URL if configured
    if (settings.redirectOnCompletion && settings.redirectUrl) {
      try {
        let url = String(settings.redirectUrl).trim();
        if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
        const parsed = new URL(url);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          window.location.href = parsed.toString();
          return;
        }
      } catch (e) {
        console.error("URL de redirecionamento inválida:", e);
      }
    }

    // Call edge function for email notifications
    try {
      supabase.functions.invoke("send-submission-emails", {
        body: {
          checklistId: checklistUuid,
          answers: resolved,
        },
      });
    } catch (e) {
      console.error("Error triggering email notification:", e);
    }

    
    // Update analytics with submission time
    if (analyticsId) {
      await supabase
        .from("checklist_analytics")
        .update({ 
          submitted_at: new Date().toISOString(),
          last_active_at: new Date().toISOString()
        })
        .eq("id", analyticsId);
    }
    } catch (err: any) {
      console.error("Erro inesperado no envio:", err);
      toast.error(`${t((checklist?.settings as any)?.language, "unexpectedError")}: ${err?.message || ""}`);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  // SEO meta tags and favicon are now rendered server-side via the route's head()
  // using loader data from getChecklistSeo — this ensures social media crawlers
  // (WhatsApp, Facebook, LinkedIn, X) actually see the custom title/description/og:image.

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-neutral-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF007F]"></div>
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-neutral-900 p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Checklist não encontrado</h1>
          <p className="text-neutral-500">O link que você acessou pode estar incorreto ou o checklist foi removido.</p>
        </div>
      </div>
    );
  }

  const settings = checklist.settings || {};
  const blocks = checklist.blocks || [];
  const isDark = settings.theme === "Escuro";

  // ─── Access controls ─────────────────────────────────────────────
  const isManuallyClosed = settings.closeForm === true;
  const scheduledClosed =
    settings.closeFormScheduled === true &&
    settings.closeFormDate &&
    new Date(settings.closeFormDate).getTime() <= Date.now();
  const limitReached =
    settings.limitSubmissions === true &&
    Number(settings.submissionLimit) > 0 &&
    submissionCount >= Number(settings.submissionLimit);
  const isClosed = !submitted && (isManuallyClosed || scheduledClosed || limitReached);
  const closedMessage =
    settings.closedFormMessage === true && settings.closedMessageText
      ? settings.closedMessageText
      : t((checklist?.settings as any)?.language, "formClosedDesc");

  if (isClosed) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6 text-center"
        style={{
          backgroundColor: isDark ? "#1a1a1a" : settings.bgColor || "#ffffff",
          color: isDark ? "#ffffff" : settings.textColor || "#000000",
          fontFamily: settings.font ? `'${settings.font}', sans-serif` : "inherit",
        }}
      >
        <div className="max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-neutral-400">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-3">{t(settings.language, "formClosedTitle")}</h1>
          <p className="opacity-70 whitespace-pre-line">{closedMessage}</p>
        </div>
      </div>
    );
  }

  // Password gate
  if (settings.passwordProtect === true && settings.formPassword && !passwordOk && !submitted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          backgroundColor: isDark ? "#1a1a1a" : settings.bgColor || "#ffffff",
          color: isDark ? "#ffffff" : settings.textColor || "#000000",
          fontFamily: settings.font ? `'${settings.font}', sans-serif` : "inherit",
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (passwordInput === settings.formPassword) {
              setPasswordOk(true);
              setPasswordError("");
            } else {
              setPasswordError(t(settings.language, "passwordWrong"));
            }
          }}
          className="w-full max-w-sm space-y-4 text-center"
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-pink-100 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-[#FF007F]">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold mb-1">Formulário protegido</h1>
            <p className="text-sm opacity-70">Digite a senha para acessar este formulário.</p>
          </div>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder={t(settings.language, "passwordPlaceholder")}
            autoFocus
            className="w-full px-4 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white outline-none focus:border-[#FF007F]"
          />
          {passwordError && (
            <p className="text-xs text-red-500">{passwordError}</p>
          )}
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg font-bold text-white bg-[#FF007F] hover:opacity-90 transition-opacity"
          >
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <CameraSessionProvider>
    <div
      className="min-h-screen overflow-y-auto relative"
      style={{
        backgroundColor: isDark ? "#1a1a1a" : settings.bgColor || "#ffffff",
        color: isDark ? "#ffffff" : settings.textColor || "#000000",
        fontFamily: settings.font ? `'${settings.font}', sans-serif` : "inherit",
        fontSize: settings.baseFontSize || "16px",
      }}
    >
      {/* Header removed as requested - checklist should be clean without navigation elements */}

      {settings.progressBar && !submitted && (() => {
        const NON_INPUT = new Set(["text","heading-1","heading-2","heading-3","divider","audio","qr-code","page-break","image","video","embed","label","observation"]);
        const inputBlocks = (blocks || []).filter((b: any) => !NON_INPUT.has(b.type));
        const isAnswered = (v: any) => {
          if (v === null || v === undefined) return false;
          if (typeof v === "string") return v.trim().length > 0;
          if (Array.isArray(v)) return v.length > 0;
          if (typeof v === "object") return Object.keys(v).length > 0;
          return true;
        };
        const answered = inputBlocks.filter((b: any) => isAnswered(answers[b.id])).length;
        const total = inputBlocks.length || 1;
        const pct = Math.min(100, Math.round((answered / total) * 100));
        return (
          <div className="fixed top-0 left-0 right-0 z-50 h-1.5 bg-neutral-200/60 dark:bg-neutral-800/60">
            <div
              className="h-full transition-all duration-300 ease-out"
              style={{ width: `${pct}%`, backgroundColor: settings.accentColor || settings.btnBgColor || "#FF007F" }}
            />
          </div>
        );
      })()}

      {submitted ? (
        <main className="max-w-4xl mx-auto px-6 pt-32 pb-32 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-pink-100 flex items-center justify-center mb-8">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-[#FF007F]">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4 tracking-tight">{settings.thankYouTitle || t(settings.language, "thankYouTitle")}</h1>
          <p className="opacity-70 mb-8">{settings.thankYouDescription || t(settings.language, "thankYouDesc")}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-pink-500 font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors shadow-sm"
          >
            <span>*</span> {t(settings.language, "createOwn")}
          </a>
        </main>
      ) : (
        <main className="max-w-full mx-auto pb-32">
          <div className="flex flex-col items-center w-full">
            <div className="w-full relative">
              {/* Cover and Profile */}
              {(() => {
                const profileBlock = blocks.find((b: any) => b.type === "image" && b.variant === "profile");
                const coverBlock = blocks.find((b: any) => b.type === "image" && b.variant === "cover");
                return (
                  <div className={`w-full ${profileBlock?.src && coverBlock?.src ? "mb-20" : "mb-10"}`}>
                    <div className="relative">
                      {coverBlock?.src && (
                        <div className="relative w-full h-48 sm:h-64 md:h-80 overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                          <img
                            src={coverBlock.src}
                            alt="Cover"
                            className="w-full h-full object-cover"
                            style={{
                              objectPosition: `${50 + ((coverBlock as any).position?.x || 0) / 8}% ${50 + ((coverBlock as any).position?.y || 0) / 8}%`,
                              transform: `scale(${(coverBlock as any).position?.zoom || 1})`,
                              transformOrigin: "center center",
                            }}
                          />
                        </div>
                      )}
                      {profileBlock?.src && (
                        <div className={`${coverBlock?.src ? "absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2" : "flex justify-center mb-8"} z-10`}>
                          <div 
                            className="border-4 border-white dark:border-neutral-900 shadow-lg overflow-hidden bg-white"
                            style={{
                              width: settings.logoWidth || "128px",
                              height: settings.logoHeight || "128px",
                              borderRadius: settings.logoRadius || "100%"
                            }}
                          >
                            <img 
                              src={profileBlock.src} 
                              alt="Profile" 
                              className="w-full h-full"
                              style={{
                                transform: `translate(${(profileBlock as any).position?.x || 0}px, ${(profileBlock as any).position?.y || 0}px) scale(${(profileBlock as any).position?.zoom || 1})`,
                                transformOrigin: "center center",
                                objectFit: "contain",
                                backgroundColor: "#f5f5f5",
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="w-full mx-auto px-6" style={{ maxWidth: settings.pageWidth || "800px" }}>
              {checklist.title && (
                <h1 className="text-4xl font-bold mb-10 tracking-tight" style={{ color: settings.textColor }}>{checklist.title}</h1>
              )}

              <form onSubmit={handleSubmit}>
                <div className="space-y-8">
                  {blocks.map((block: any) => {
                    if (block.type === "camera") {
                      return (
                        <div key={block.id} className="w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                          <PublicCameraBlock
                            block={block}
                            checklistId={checklist.id}
                            ensureResponseSession={ensureResponseSession}
                            onAnswer={setAnswer}
                            textColor={settings.textColor}
                            accentColor={settings.accentColor || settings.btnBgColor || "#111827"}
                          />
                        </div>
                      );
                    }
                    return (
                      <BlockRenderer
                        key={block.id}
                        block={block}
                        settings={settings}
                        mode="public"
                        answers={answers}
                        setAnswer={setAnswer}
                        isDark={isDark}
                      />
                    );
                  })}

                  <div className="mt-12 mb-4 flex">
                    <button
                      type="submit"
                      disabled={uploading}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold shadow-lg hover:opacity-90 transition-all active:scale-95"
                      style={{
                        backgroundColor: settings.btnBgColor || "#FF007F",
                        color: settings.btnTextColor || "#ffffff",
                        width: "fit-content"
                      }}
                    >
                      {uploading ? (
                        t(settings.language, "sending")
                      ) : (
                        <>
                          {(settings as any).btnIconPosition === "start" && renderBtnIcon((settings as any).btnIcon)}
                          {settings.btnText || t(settings.language, "submit")}
                          {(settings as any).btnIconPosition !== "start" && renderBtnIcon((settings as any).btnIcon)}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </main>
      )}

      {loaderData.showBranding && (
        <>
          {/* Desktop Version */}
          <Link 
            to={isLoggedIn ? "/inicio" : "/"} 
            className="hidden md:flex fixed bottom-6 right-8 z-[100] group items-center gap-3 transition-all hover:scale-105"
          >
            <span className="text-sm font-medium text-neutral-400 group-hover:text-neutral-600 transition-colors">
              Feito com
            </span>
            <img 
              src={tieckLogo} 
              alt="Tieck" 
              className="h-20 w-auto object-contain grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300" 
            />
          </Link>

          {/* Mobile Version - Fixed Bar */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-t border-neutral-200 dark:border-neutral-800 py-3 flex items-center justify-center">
            <Link 
              to={isLoggedIn ? "/inicio" : "/"} 
              className="flex items-center gap-3"
            >
              <span className="text-sm font-medium text-neutral-400">
                Feito com
              </span>
              <img 
                src={tieckLogo} 
                alt="Tieck" 
                className="h-20 w-auto object-contain" 
              />
            </Link>
          </div>
        </>
      )}
    </div>
    </CameraSessionProvider>
  );
}
