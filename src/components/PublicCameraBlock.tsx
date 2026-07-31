import { useRef, useState } from "react";
import { Camera, X, RefreshCw, Loader2, CheckCircle2, AlertTriangle, XCircle, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { compressImage } from "@/lib/compress-image";
import { checkLocalPhotoQuality } from "@/lib/photo-quality";
import { useChecklistEvidenceAnalysis, type EvidenceAnalysisResult, type EvidenceAnalysisStatus } from "@/hooks/useChecklistEvidenceAnalysis";

type Phase =
  | "idle"
  | "preview"
  | "checking"
  | "uploading"
  | "confirming"
  | "analyzing"
  | "completed"
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

type CameraVision = {
  enabled?: boolean;
  criteria?: string[];
  confidenceThreshold?: number | null;
  minWidth?: number | null;
  minHeight?: number | null;
  onAnomaly?: string;
  onAnalysisFailure?: string;
};

function statusMeta(status: EvidenceAnalysisStatus | undefined) {
  switch (status) {
    case "normal":
      return { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "anomaly":
      return { icon: AlertTriangle, tone: "bg-amber-50 text-amber-800 border-amber-200" };
    case "manual_review":
      return { icon: ClipboardCheck, tone: "bg-sky-50 text-sky-800 border-sky-200" };
    case "failed":
      return { icon: XCircle, tone: "bg-red-50 text-red-800 border-red-200" };
    case "pending":
    case "processing":
    default:
      return { icon: Loader2, tone: "bg-neutral-50 text-neutral-700 border-neutral-200" };
  }
}

export function PublicCameraBlock({ block, checklistId, ensureResponseSession, onAnswer, textColor, accentColor }: Props) {
  const vision = (block?.vision ?? null) as CameraVision | null;
  const visionEnabled = vision?.enabled === true;

  const title = String(block?.title || block?.subtitle || "").trim();
  const description = String(block?.description ?? "").trim();
  const required = block?.required === true;
  const captureGuidance = String(block?.captureGuidance ?? "").trim();
  const criteria = Array.isArray(vision?.criteria)
    ? vision.criteria
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analysisToken, setAnalysisToken] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [analysisEnabled, setAnalysisEnabled] = useState(false);

  const { result: analysisResult, isPolling, timedOut } = useChecklistEvidenceAnalysis(analysisToken);

  // Propaga o resultado da análise para o answer (usado no submit final).
  const lastEmittedRef = useRef<string>("");
  if (evidenceId) {
    const payload: PublicCameraAnswer = {
      evidenceId,
      analysisEnabled,
      analysis: analysisResult,
    };
    const key = JSON.stringify(payload);
    if (lastEmittedRef.current !== key) {
      lastEmittedRef.current = key;
      // Emit after render to avoid state updates during parent render.
      queueMicrotask(() => onAnswer(block.id, payload));
    }
  }

  const resetSelection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
    setErrorMsg(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const resetAll = () => {
    resetSelection();
    setEvidenceId(null);
    setAnalysisToken(null);
    setAnalysisEnabled(false);
    lastEmittedRef.current = "";
    onAnswer(block.id, null);
  };

  const onPick = (file: File | null) => {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMsg(null);
    setPendingFile(file);
    // Auto-envia: o próprio app de câmera do dispositivo já confirma a foto antes.
    void startUploadFlow(file);
  };

  const startUploadFlow = async (fileOverride?: File) => {
    const source = fileOverride ?? pendingFile;
    if (!source) return;
    setErrorMsg(null);
    setPhase("checking");

    const localQuality = await checkLocalPhotoQuality(source, {
      minWidth: vision?.minWidth,
      minHeight: vision?.minHeight,
    });
    if (!localQuality.ok) {
      const message =
        localQuality.reason === "resolution_too_low"
          ? "A foto tem resolução muito baixa. Aproxime-se e tire outra foto."
          : localQuality.reason === "too_dark"
            ? "A foto está muito escura. Melhore a iluminação e tente novamente."
            : "A foto está clara demais. Ajuste o enquadramento ou a iluminação.";
      setErrorMsg(message);
      setPhase("error");
      return;
    }

    const session = await ensureResponseSession();
    if (!session) {
      setErrorMsg("Não foi possível iniciar o envio. Tente novamente.");
      setPhase("error");
      return;
    }

    setPhase("uploading");

    // Comprime imagens grandes antes de subir.
    let file: File = source;
    const looksImage = (file.type || "").startsWith("image/") || /\.(heic|heif|jpg|jpeg|png|webp)$/i.test(file.name);
    if (looksImage && file.size > 400_000) {
      try {
        const compressed = await compressImage(file);
        if (compressed) file = compressed;
      } catch { /* usa original */ }
    }

    // 1) start-upload — o backend decide storagePath e attemptNumber.
    let startData: any = null;
    try {
      const res = await supabase.functions.invoke("analyze-checklist-evidence", {
        body: {
          action: "start-upload",
          checklistId,
          blockId: block.id,
          responseToken: session.responseToken,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        },
      });
      if (res.error || !res.data?.uploadUrl || !res.data?.uploadToken || !res.data?.storagePath || !res.data?.evidenceId) {
        throw new Error(res.error?.message || "start_upload_failed");
      }
      startData = res.data;
    } catch (e: any) {
      console.error("[camera] start-upload falhou", e);
      setErrorMsg("Falha ao iniciar o envio. Tente novamente.");
      setPhase("error");
      return;
    }

    // 2) upload direto pela signed URL (bucket privado checklist-evidences).
    try {
      const up = await supabase.storage
        .from("checklist-evidences")
        .uploadToSignedUrl(startData.storagePath, startData.uploadToken, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (up.error) throw up.error;
    } catch (e: any) {
      console.error("[camera] upload signed url falhou", e);
      setErrorMsg("Falha ao enviar a foto. Verifique sua conexão.");
      setPhase("error");
      return;
    }

    // 3) confirm-upload — backend valida binário e (se necessário) inicia análise.
    setPhase("confirming");
    try {
      const res = await supabase.functions.invoke("analyze-checklist-evidence", {
        body: {
          action: "confirm-upload",
          responseToken: session.responseToken,
          evidenceId: startData.evidenceId,
        },
      });
      if (res.error || !res.data) throw new Error(res.error?.message || "confirm_failed");
      const data = res.data as {
        analysisEnabled?: boolean;
        analysisId?: string;
        analysisToken?: string;
        alreadyStarted?: boolean;
        error?: string;
      };
      if ((data as any).error) {
        setErrorMsg(publicMessageForInvalid((data as any).error));
        setPhase("error");
        return;
      }
      setEvidenceId(startData.evidenceId as string);
      const analysisOn = data.analysisEnabled === true;
      setAnalysisEnabled(analysisOn);
      if (!analysisOn) {
        setPhase("completed");
        // preview permanece; answer é emitido via efeito no render.
        return;
      }
      if (data.analysisToken) {
        setAnalysisToken(data.analysisToken);
        setPhase("analyzing");
      } else {
        // alreadyStarted sem token — não temos como recuperar. Tratamos como
        // revisão manual até o backend fornecer um caminho para reidratar.
        setPhase("analyzing");
      }
    } catch (e: any) {
      console.error("[camera] confirm-upload falhou", e);
      setErrorMsg("Não foi possível confirmar o envio. Tente novamente.");
      setPhase("error");
    }
  };

  const publicResult: EvidenceAnalysisResult | null = analysisResult;
  const finalStatus = publicResult?.status;
  const showAnalysisBlock = analysisEnabled;

  const canPickPhoto = phase === "idle";

  return (
    <div className="w-full">
      <div
        role={canPickPhoto ? "button" : undefined}
        tabIndex={canPickPhoto ? 0 : undefined}
        aria-label={canPickPhoto ? `Responder com foto: ${title || "Câmera"}` : undefined}
        onClick={canPickPhoto ? () => inputRef.current?.click() : undefined}
        onKeyDown={canPickPhoto ? (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
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
          <div className="flex items-center gap-2">
            <h3 className="flex-1 min-w-0 text-sm font-bold leading-snug break-words" style={{ color: textColor }}>
              {title || "Câmera"}
              {required && <span className="text-red-500 ml-1">*</span>}
            </h3>
          </div>
          {description && (
            <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{description}</p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {(phase === "completed" || phase === "analyzing") && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 uppercase tracking-wider">
                Foto enviada
              </span>
            )}
          </div>
        </div>
        {canPickPhoto && (
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        )}
      </div>

      {captureGuidance && phase === "idle" && (
        <p className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 mb-2">
          {captureGuidance}
        </p>
      )}

      {visionEnabled && criteria.length > 0 && phase === "idle" && (
        <div className="bg-sky-50/70 border border-sky-100 rounded-lg px-3 py-2.5 mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-800 mb-1.5">
            A foto deve mostrar
          </p>
          <ul className="space-y-1">
            {criteria.map((criterion, index) => (
              <li key={`${criterion}-${index}`} className="flex items-start gap-2 text-xs text-sky-950">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-600" aria-hidden />
                <span>{criterion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(phase === "checking" || phase === "uploading") && previewUrl && (
        <img src={previewUrl} alt="Pré-visualização" className="w-full max-h-80 object-contain rounded-lg border border-neutral-200 bg-black/5 mb-2" />
      )}

      {(phase === "checking" || phase === "uploading" || phase === "confirming") && (
        <div className="flex items-center gap-2 text-sm text-neutral-600 py-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          {phase === "checking"
            ? "Verificando qualidade da foto..."
            : phase === "uploading"
              ? "Enviando foto..."
              : "Confirmando envio..."}
        </div>
      )}

      {(phase === "analyzing" || phase === "completed") && previewUrl && (
        <img src={previewUrl} alt="Foto enviada" className="w-full max-h-80 object-contain rounded-lg border border-neutral-200 bg-black/5 mb-2" />
      )}

      {phase === "analyzing" && showAnalysisBlock && (
        <AnalysisStatusCard
          result={publicResult}
          isPolling={isPolling}
          timedOut={timedOut}
          onRetry={resetAll}
        />
      )}

      {phase === "completed" && !showAnalysisBlock && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 py-1">
          <CheckCircle2 className="w-4 h-4" aria-hidden />
          Foto recebida.
          <button type="button" onClick={resetAll} className="ml-2 text-xs underline text-neutral-500 hover:text-neutral-700">
            Trocar foto
          </button>
        </div>
      )}

      {/* Se a análise terminou, mostra o card final e permite trocar quando aplicável */}
      {phase === "analyzing" && publicResult && !isPolling && (
        <div className="mt-2">
          {publicResult.requiresResubmit && (
            <button
              type="button"
              onClick={resetAll}
              className="text-xs underline text-neutral-600 hover:text-neutral-900"
            >
              Tirar outra foto
            </button>
          )}
          {!publicResult.requiresResubmit && (
            <button
              type="button"
              onClick={resetAll}
              className="text-xs underline text-neutral-500 hover:text-neutral-700"
            >
              Trocar foto
            </button>
          )}
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
            onClick={resetSelection}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm hover:bg-neutral-50"
          >
            <RefreshCw className="w-4 h-4" aria-hidden />
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}

function AnalysisStatusCard({
  result,
  isPolling,
  timedOut,
  onRetry,
}: {
  result: EvidenceAnalysisResult | null;
  isPolling: boolean;
  timedOut: boolean;
  onRetry: () => void;
}) {
  if (!result && isPolling) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-600 py-2">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        Analisando sua evidência...
      </div>
    );
  }
  if (!result && timedOut) {
    return (
      <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <AlertTriangle className="w-4 h-4 mt-0.5" aria-hidden />
        <span>Não recebemos o resultado da análise a tempo. Você pode continuar; a evidência será revisada.</span>
      </div>
    );
  }
  if (!result) return null;
  const meta = statusMeta(result.status);
  const Icon = meta.icon;
  return (
    <div className={`flex items-start gap-2 text-sm border rounded-lg px-3 py-2 ${meta.tone}`}>
      <Icon className={`w-4 h-4 mt-0.5 ${isPolling ? "animate-spin" : ""}`} aria-hidden />
      <div className="flex-1">
        <div>{result.publicMessage}</div>
        {result.requiresResubmit && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline"
          >
            <RefreshCw className="w-3 h-3" aria-hidden />
            Tirar outra foto
          </button>
        )}
      </div>
    </div>
  );
}

function publicMessageForInvalid(code: string): string {
  if (code.startsWith("invalid_image_")) {
    const reason = code.replace("invalid_image_", "");
    if (reason === "too_small" || reason === "resolution_too_low")
      return "A foto está abaixo da resolução mínima exigida.";
    if (reason === "unsupported_mime" || reason === "invalid_magic_bytes")
      return "Formato de imagem não suportado. Envie JPEG, PNG ou WebP.";
    if (reason === "too_large") return "A foto excede o tamanho máximo.";
    return "A imagem enviada é inválida.";
  }
  if (code === "attempt_limit_reached") return "Limite de tentativas atingido para esta pergunta.";
  if (code === "file_too_large") return "A foto excede o tamanho máximo.";
  if (code === "unsupported_mime") return "Formato não suportado. Envie JPEG, PNG ou WebP.";
  if (code === "vision_not_configured") return "A análise visual deste item ainda não foi configurada.";
  return "Não foi possível processar a foto. Tente novamente.";
}
