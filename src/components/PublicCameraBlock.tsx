import { useRef, useState } from "react";
import { Camera, RefreshCw, Loader2, CheckCircle2, XCircle, ScanLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { checkLocalPhotoQuality } from "@/lib/photo-quality";
import { TieckCamera } from "@/components/TieckCamera";
import { useChecklistEvidenceAnalysis, type EvidenceAnalysisResult } from "@/hooks/useChecklistEvidenceAnalysis";

type Phase =
  | "idle"
  | "checking"
  | "uploading"
  | "confirming"
  | "analyzing"
  | "approved"
  | "retake"
  | "error";

export type PublicCameraAnswer = {
  evidenceId: string;
  analysisEnabled: boolean;
  analysis?: EvidenceAnalysisResult | null;
};

type Props = {
  block: any;
  checklistId: string;
  ensureResponseSession: () => Promise<{ responseId: string; responseToken: string } | null>;
  onAnswer: (blockId: string, value: PublicCameraAnswer | null) => void;
  textColor?: string;
  accentColor?: string;
};

/**
 * Camera AI V2 — experiência pública.
 * Sem critérios visíveis, sem jargão técnico: tirar foto, verificar, aprovar
 * ou pedir outra foto.
 */
export function PublicCameraBlock({ block, checklistId, ensureResponseSession, onAnswer, textColor, accentColor }: Props) {
  const title = String(block?.title || block?.subtitle || "").trim();
  const description = String(block?.description ?? "").trim();
  const required = block?.required === true;
  const captureGuidance = String(block?.captureGuidance ?? "").trim();
  const vision = (block?.vision ?? null) as { minWidth?: number | null; minHeight?: number | null } | null;

  const [cameraOpen, setCameraOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analysisToken, setAnalysisToken] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [session, setSession] = useState<{ responseId: string; responseToken: string } | null>(null);

  const { result: analysisResult, isPolling, timedOut } = useChecklistEvidenceAnalysis(analysisToken);

  // Resolve o estado final do polling em fase visual.
  if (phase === "analyzing" && analysisResult && !isPolling) {
    const next: Phase = analysisResult.status === "normal" ? "approved" : "retake";
    queueMicrotask(() => setPhase(next));
  }
  if (phase === "analyzing" && !analysisResult && timedOut) {
    queueMicrotask(() => setPhase("retake"));
  }

  const lastEmittedRef = useRef<string>("");
  if (evidenceId) {
    const payload: PublicCameraAnswer = { evidenceId, analysisEnabled, analysis: analysisResult };
    const key = JSON.stringify(payload);
    if (lastEmittedRef.current !== key) {
      lastEmittedRef.current = key;
      queueMicrotask(() => onAnswer(block.id, payload));
    }
  }

  const resetAll = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setErrorMsg(null);
    setPhase("idle");
    setEvidenceId(null);
    setAnalysisToken(null);
    setAnalysisEnabled(false);
    lastEmittedRef.current = "";
    onAnswer(block.id, null);
  };

  const openCamera = async () => {
    // Sessão antecipada habilita a assistência de enquadramento.
    if (!session) {
      const created = await ensureResponseSession();
      if (created) setSession(created);
    }
    setCameraOpen(true);
  };

  const handleCapture = (file: File) => {
    setCameraOpen(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMsg(null);
    void runUpload(file);
  };

  const runUpload = async (source: File) => {
    setPhase("checking");

    const localQuality = await checkLocalPhotoQuality(source, {
      minWidth: vision?.minWidth,
      minHeight: vision?.minHeight,
    });
    if (!localQuality.ok) {
      setErrorMsg(
        localQuality.reason === "resolution_too_low"
          ? "A foto ficou com pouca definição. Aproxime-se e tire outra."
          : localQuality.reason === "too_dark"
            ? "A foto está muito escura. Melhore a iluminação e tente novamente."
            : "A foto está clara demais. Ajuste a iluminação e tente novamente.",
      );
      setPhase("error");
      return;
    }

    const active = session ?? (await ensureResponseSession());
    if (!active) {
      setErrorMsg("Não foi possível iniciar o envio. Tente novamente.");
      setPhase("error");
      return;
    }
    setSession(active);

    setPhase("uploading");

    let file: File = source;
    if (file.size > 400_000) {
      try {
        const compressed = await compressImage(file);
        if (compressed) file = compressed;
      } catch { /* usa original */ }
    }

    let startData: any = null;
    try {
      const res = await supabase.functions.invoke("analyze-checklist-evidence", {
        body: {
          action: "start-upload",
          checklistId,
          blockId: block.id,
          responseToken: active.responseToken,
          fileName: file.name,
          mimeType: file.type || "image/jpeg",
          fileSize: file.size,
        },
      });
      if (res.error || !res.data?.uploadUrl || !res.data?.uploadToken || !res.data?.storagePath || !res.data?.evidenceId) {
        throw new Error("start_upload_failed");
      }
      startData = res.data;
    } catch {
      setErrorMsg("Falha ao iniciar o envio. Tente novamente.");
      setPhase("error");
      return;
    }

    try {
      const up = await supabase.storage
        .from("checklist-evidences")
        .uploadToSignedUrl(startData.storagePath, startData.uploadToken, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
      if (up.error) throw up.error;
    } catch {
      setErrorMsg("Falha ao enviar a foto. Verifique sua conexão.");
      setPhase("error");
      return;
    }

    setPhase("confirming");
    try {
      const res = await supabase.functions.invoke("analyze-checklist-evidence", {
        body: {
          action: "confirm-upload",
          responseToken: active.responseToken,
          evidenceId: startData.evidenceId,
        },
      });
      if (res.error || !res.data) throw new Error("confirm_failed");
      const data = res.data as {
        analysisEnabled?: boolean;
        analysisToken?: string;
        error?: string;
      };
      if (data.error) {
        setErrorMsg(publicMessageForInvalid(data.error));
        setPhase("error");
        return;
      }
      setEvidenceId(startData.evidenceId as string);
      const analysisOn = data.analysisEnabled === true;
      setAnalysisEnabled(analysisOn);
      if (!analysisOn) {
        setPhase("approved");
        return;
      }
      if (data.analysisToken) setAnalysisToken(data.analysisToken);
      setPhase("analyzing");
    } catch {
      setErrorMsg("Não foi possível confirmar o envio. Tente novamente.");
      setPhase("error");
    }
  };

  const busy = phase === "checking" || phase === "uploading" || phase === "confirming";
  const canPickPhoto = phase === "idle";
  const retakeMessage = analysisResult?.publicMessage || "Não foi possível confirmar. Tire outra foto.";

  return (
    <div className="w-full">
      <div
        role={canPickPhoto ? "button" : undefined}
        tabIndex={canPickPhoto ? 0 : undefined}
        aria-label={canPickPhoto ? `Responder com foto: ${title || "Câmera"}` : undefined}
        onClick={canPickPhoto ? () => void openCamera() : undefined}
        onKeyDown={canPickPhoto ? (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void openCamera();
          }
        } : undefined}
        className={`flex items-center gap-3 w-full border border-neutral-200 rounded-xl px-4 py-4 bg-white transition-all relative shadow-sm mb-3 ${canPickPhoto ? "cursor-pointer hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2" : ""}`}
        style={canPickPhoto ? { outlineColor: accentColor || textColor } : undefined}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${textColor ?? "#111827"}1A` }}
        >
          <Camera className="w-5 h-5" style={{ color: textColor }} aria-hidden />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold leading-snug break-words" style={{ color: textColor }}>
            {title || "Câmera"}
            {required && <span className="text-red-500 ml-1">*</span>}
          </h3>
          {description && <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{description}</p>}
          {phase === "approved" && (
            <span className="inline-block mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 uppercase tracking-wider">
              Foto aprovada
            </span>
          )}
        </div>
      </div>

      {captureGuidance && phase === "idle" && (
        <p className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 mb-2">
          {captureGuidance}
        </p>
      )}

      {previewUrl && phase !== "idle" && (
        <div className="relative mb-2 overflow-hidden rounded-lg border border-neutral-200 bg-black/5">
          <img src={previewUrl} alt="Foto enviada" className="w-full max-h-80 object-contain" />
          {(busy || phase === "analyzing") && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-white/60 to-transparent animate-[tieck-scan_1.6s_ease-in-out_infinite]" />
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes tieck-scan{0%{transform:translateY(-40%)}50%{transform:translateY(300%)}100%{transform:translateY(-40%)}}`}</style>

      {busy && (
        <div className="flex items-center gap-2 text-sm text-neutral-600 py-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          {phase === "checking" ? "Preparando a foto..." : phase === "uploading" ? "Enviando foto..." : "Confirmando envio..."}
        </div>
      )}

      {phase === "analyzing" && (
        <div className="flex items-center gap-2 text-sm text-neutral-600 py-2" aria-live="polite">
          <ScanLine className="w-4 h-4 animate-pulse" aria-hidden />
          Verificando a foto...
        </div>
      )}

      {phase === "approved" && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 py-1">
          <CheckCircle2 className="w-4 h-4" aria-hidden />
          Foto aprovada.
          <button type="button" onClick={resetAll} className="ml-2 text-xs underline text-neutral-500 hover:text-neutral-700">
            Trocar foto
          </button>
        </div>
      )}

      {phase === "retake" && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <RefreshCw className="w-4 h-4 mt-0.5" aria-hidden />
            <span>{retakeMessage}</span>
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm hover:bg-neutral-50"
          >
            <Camera className="w-4 h-4" aria-hidden />
            Tirar outra foto
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <XCircle className="w-4 h-4 mt-0.5" aria-hidden />
            <span>{errorMsg ?? "Falha ao enviar a foto."}</span>
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm hover:bg-neutral-50"
          >
            <RefreshCw className="w-4 h-4" aria-hidden />
            Tentar novamente
          </button>
        </div>
      )}

      <TieckCamera
        open={cameraOpen}
        title={title || "Câmera"}
        hint={captureGuidance || description}
        live={session ? { checklistId, blockId: block.id, responseToken: session.responseToken } : null}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCapture}
      />
    </div>
  );
}

function publicMessageForInvalid(code: string): string {
  if (code.startsWith("invalid_image_")) {
    const reason = code.replace("invalid_image_", "");
    if (reason === "too_small" || reason === "resolution_too_low") return "A foto ficou com pouca definição. Tire outra.";
    if (reason === "unsupported_mime" || reason === "invalid_magic_bytes") return "Formato de imagem não suportado.";
    if (reason === "too_large") return "A foto excede o tamanho máximo.";
    return "A imagem enviada é inválida.";
  }
  if (code === "attempt_limit_reached") return "Limite de tentativas atingido para esta pergunta.";
  if (code === "file_too_large") return "A foto excede o tamanho máximo.";
  if (code === "unsupported_mime") return "Formato não suportado.";
  return "Não foi possível processar a foto. Tente novamente.";
}
