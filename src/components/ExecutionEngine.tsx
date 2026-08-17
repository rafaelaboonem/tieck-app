import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { t } from "@/lib/checklist-i18n";
import { BlockRenderer } from "@/components/BlockRenderer";
import { PublicCameraBlock } from "@/components/PublicCameraBlock";
import { CameraSessionProvider } from "@/contexts/CameraSessionContext";
import { 
  ArrowRight, 
  ArrowUpRight, 
  ArrowRightCircle, 
  ArrowBigRight, 
  MoveRight, 
  Send, 
  SendHorizontal, 
  Check, 
  CheckCircle, 
  CheckCheck,
  Loader2
} from "lucide-react";

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

const SUBMIT_ERROR_KEY: Record<string, Parameters<typeof t>[1]> = {
  required_evidence_missing: "requiredError",
  required_block_missing: "requiredError",
  invalid_response_token: "submitSessionExpired",
  checklist_mismatch: "submitSessionExpired",
  checklist_not_published: "submitChecklistUnavailable",
  rate_limited: "submitRateLimited",
};

export function ExecutionEngine({ 
  checklist, 
  onSubmitted,
  analyticsId,
  mode = "public"
}: { 
  checklist: any; 
  onSubmitted: () => void;
  analyticsId?: string | null;
  mode?: "public" | "authenticated";
}) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  
  const setAnswer = (blockId: string, value: any) => {
    setAnswers((p) => ({ ...p, [blockId]: value }));
  };

  const responseSessionKey = (cid?: string): string => {
    return `tieck_response_session_${cid || checklist?.id}`;
  };

  const readResponseSession = (cid?: string): { responseId: string; responseToken: string; checklistId: string; createdAt: number } | null => {
    try {
      const key = responseSessionKey(cid);
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.responseId || !parsed?.responseToken || parsed.checklistId !== (cid || checklist?.id)) return null;
      if (Date.now() - parsed.createdAt > 23 * 60 * 60 * 1000) return null;
      return parsed;
    } catch { return null; }
  };

  const clearResponseSession = (cid?: string) => {
    try { sessionStorage.removeItem(responseSessionKey(cid)); } catch { /* noop */ }
  };

  const responseSessionPromise = useRef<Promise<any> | null>(null);

  const ensureResponseSession = async (options?: { forceNew?: boolean }): Promise<any> => {
    const currentChecklistId = checklist?.id;
    if (options?.forceNew) clearResponseSession(currentChecklistId);
    else {
      const existing = readResponseSession(currentChecklistId);
      if (existing) return existing;
    }

    if (responseSessionPromise.current) return responseSessionPromise.current;

    let visitorId = localStorage.getItem("tieck_visitor_id");
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem("tieck_visitor_id", visitorId);
    }

    responseSessionPromise.current = (async () => {
      const { data, error } = await (supabase.rpc as any)("create_public_response", {
        p_checklist_id: currentChecklistId,
        p_visitor_id: visitorId
      });

      if (error || !data || (data as any).length === 0) return null;
      const respData = (data as any)[0];
      const session = { 
        responseId: respData.response_id, 
        responseToken: respData.response_token,
        checklistId: currentChecklistId,
        createdAt: Date.now()
      };
      sessionStorage.setItem(responseSessionKey(currentChecklistId), JSON.stringify(session));
      return session;
    })();

    try { return await responseSessionPromise.current; } finally { responseSessionPromise.current = null; }
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    const session = await ensureResponseSession();
    if (!session) return null;

    let fileToUpload: File = file;
    const isImage = (file.type || "").startsWith("image/") || /\.(heic|heif|jpg|jpeg|png|webp)$/i.test(file.name);
    if (isImage && file.size > 400_000) {
      const compressed = await compressImage(file);
      if (compressed) fileToUpload = compressed;
    }

    const rawExt = (fileToUpload.name.includes(".") ? fileToUpload.name.split(".").pop() : "") || "";
    const ext = (rawExt || (fileToUpload.type.split("/")[1] ?? "bin")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
    const path = `responses/${checklist.id}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from("checklist-assets").upload(path, fileToUpload);
    if (error) {
      toast.error(`Falha ao enviar "${file.name}": ${error.message}`);
      return null;
    }
    const { data } = supabase.storage.from("checklist-assets").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (uploading) return;
    setUploading(true);

    try {
      const blocks = checklist.blocks || [];
      const hasBlockingCamera = blocks.some((b: any) => {
        if (b.type !== 'camera' || !b.required) return false;
        const ans = answers[b.id];
        if (!ans) return true;
        try {
          const parsed = typeof ans === 'string' ? JSON.parse(ans) : ans;
          return !(parsed.decision === 'approved' && parsed.evidenceId && parsed.canContinue);
        } catch { return true; }
      });

      if (hasBlockingCamera) {
        toast.error(t(checklist.settings?.language, "requiredError"));
        setUploading(false); return;
      }

      const missingRequired = blocks.filter((b: any) => {
        const isInteractive = ["short-answer", "long-answer", "multiple-choice", "checkboxes", "dropdown", "multi-select", "number", "email", "phone", "link", "file-upload", "date", "time", "linear-scale", "matrix", "rating", "signature", "ranking", "image", "camera"].includes(b.type);
        if (!isInteractive || b.required === false) return false;
        if (b.type === "image" && (b.variant === "profile" || b.variant === "cover")) return false;
        const answer = answers[b.id];
        return (answer === undefined || answer === null || answer === "" || (Array.isArray(answer) && answer.length === 0));
      });

      if (missingRequired.length > 0) {
        toast.error(t(checklist.settings?.language, "requiredError"));
        setUploading(false); return;
      }

      const tasks: { key: string; idx: number; file: File }[] = [];
      const resolved: Record<string, any> = {};
      for (const [k, v] of Object.entries(answers)) {
        if (v instanceof File) { tasks.push({ key: k, idx: -1, file: v }); resolved[k] = null; }
        else if (Array.isArray(v) && v[0] instanceof File) {
          resolved[k] = new Array(v.length).fill(null);
          v.forEach((f: any, i: number) => tasks.push({ key: k, idx: i, file: f }));
        } else resolved[k] = v;
      }

      if (tasks.length > 0) {
        setUploadProgress({ done: 0, total: tasks.length });
        let done = 0;
        const worker = async () => {
          for (let i = 0; i < tasks.length; i++) {
            const t = tasks[i];
            const url = await uploadFile(t.file);
            const entry = url ? { url, name: t.file.name, type: t.file.type } : null;
            if (t.idx === -1) resolved[t.key] = entry; else resolved[t.key][t.idx] = entry;
            done++; setUploadProgress({ done, total: tasks.length });
          }
        };
        await worker();
        for (const k of Object.keys(resolved)) if (Array.isArray(resolved[k])) resolved[k] = resolved[k].filter(Boolean);
      }

      const session = await ensureResponseSession();
      if (!session) { toast.error(t(checklist.settings?.language, "sendError")); setUploading(false); return; }

      const { data: finalizeData, error: finalizeError } = await (supabase.rpc as any)("finalize_public_response", {
        p_response_token: session.responseToken,
        p_checklist_id: checklist.id,
        p_answers: resolved
      });

      if (finalizeError) {
        toast.error(t(checklist.settings?.language, (SUBMIT_ERROR_KEY as any)[finalizeError.message] || "sendError"));
        setUploading(false); return;
      }

      if (checklist.settings?.redirectOnCompletion && checklist.settings?.redirectUrl) {
        let url = String(checklist.settings.redirectUrl).trim();
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        clearResponseSession();
        window.location.href = url;
        return;
      }

      try { supabase.functions.invoke("send-submission-emails", { body: { checklistId: checklist.id, answers: resolved } }); } catch {}
      if (analyticsId) await supabase.from("checklist_analytics").update({ submitted_at: new Date().toISOString() }).eq("id", analyticsId);

      clearResponseSession();
      onSubmitted();
    } catch (err: any) {
      toast.error(`${t(checklist.settings?.language, "unexpectedError")}: ${err?.message || ""}`);
    } finally { setUploading(false); setUploadProgress(null); }
  };

  const settings = checklist.settings || {};
  const blocks = checklist.blocks || [];
  const isDark = settings.theme === "Escuro";

  return (
    <CameraSessionProvider>
      <div className="w-full mx-auto px-6" style={{ maxWidth: settings.pageWidth || "800px" }}>
        {checklist.title && (
          <h1 className="text-4xl font-bold mb-10 tracking-tight" style={{ color: settings.textColor }}>{checklist.title}</h1>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-8">
            {blocks.map((block: any) => (
              block.type === "camera" ? (
                <div key={block.id} className="w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <PublicCameraBlock
                    block={block}
                    checklistId={checklist.id}
                    ensureResponseSession={ensureResponseSession}
                    session={readResponseSession()}
                    onAnswer={setAnswer}
                    onCameraActiveChange={setCameraActive}
                    textColor={settings.textColor}
                    accentColor={settings.accentColor || settings.btnBgColor || "#111827"}
                    title={block.question || block.title}
                    language={settings.language}
                  />
                </div>
              ) : (
                <BlockRenderer
                  key={block.id}
                  block={block}
                  settings={settings}
                  mode={mode === "authenticated" ? "public" : mode}
                  answers={answers}
                  setAnswer={setAnswer}
                  isDark={isDark}
                  onCameraToggle={setCameraActive}
                />
              )
            ))}

            <div className="mt-12 mb-4 flex flex-col gap-4">
              {uploadProgress && (
                <div className="w-full bg-neutral-100 rounded-full h-2">
                  <div 
                    className="bg-[#FF007F] h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }}
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={uploading}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold shadow-lg hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                style={{
                  backgroundColor: settings.btnBgColor || "#FF007F",
                  color: settings.btnTextColor || "#ffffff",
                  width: "fit-content"
                }}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t(settings.language, "sending")}
                  </>
                ) : (
                  <>
                    {settings.btnIconPosition === "start" && renderBtnIcon(settings.btnIcon)}
                    {settings.btnText || t(settings.language, "submit")}
                    {settings.btnIconPosition !== "start" && renderBtnIcon(settings.btnIcon)}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </CameraSessionProvider>
  );
}
