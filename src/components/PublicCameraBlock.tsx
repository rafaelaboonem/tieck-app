import { useRef, useState } from "react";
import { Camera, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { checkLocalPhotoQuality } from "@/lib/photo-quality";
import { TieckCamera } from "@/components/TieckCamera";

type Phase =
  | "idle"
  | "local_check"
  | "uploading"
  | "received"
  | "retake"
  | "technical_failure";

export type PublicCameraAnswer = {
  evidenceId: string;
};

type Props = {
  block: any;
  checklistId: string;
  ensureResponseSession: () => Promise<{ responseId: string; responseToken: string } | null>;
  onAnswer: (blockId: string, value: PublicCameraAnswer | null) => void;
  textColor?: string;
  accentColor?: string;
  onCameraToggle?: (open: boolean) => void;
};

/**
 * Camera Capture — Baseline neutra sem IA.
 */
export function PublicCameraBlock({ block, checklistId, ensureResponseSession, onAnswer, textColor, accentColor, onCameraToggle }: Props) {
  const title = String(block?.title || block?.subtitle || "").trim();
  const description = String(block?.description ?? "").trim();
  const required = block?.required === true;
  const captureGuidance = String(block?.captureGuidance ?? "").trim();
  const vision = (block?.vision ?? null) as { minWidth?: number | null; minHeight?: number | null } | null;

  const [cameraOpen, setCameraOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [session, setSession] = useState<{ responseId: string; responseToken: string } | null>(null);

  const lastEmittedRef = useRef<string>("");
  if (evidenceId) {
    const payload: PublicCameraAnswer = { evidenceId };
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
    lastEmittedRef.current = "";
    onAnswer(block.id, null);
  };

  const openCamera = async () => {
    if (!session) {
      const created = await ensureResponseSession();
      if (created) setSession(created);
    }
    setCameraOpen(true);
    onCameraToggle?.(true);
  };

  const handleCapture = (file: File) => {
    setCameraOpen(false);
    onCameraToggle?.(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMsg(null);
    void runUpload(file);
  };

  const runUpload = async (source: File) => {
    setPhase("local_check");

    const localQuality = await checkLocalPhotoQuality(source, {
      minWidth: vision?.minWidth,
      minHeight: vision?.minHeight,
    });
    if (!localQuality.ok) {
      setErrorMsg(
        localQuality.reason === "resolution_too_low"
          ? "A imagem está desfocada. Mantenha o celular firme e tire outra."
          : localQuality.reason === "too_dark"
            ? "Procure um local mais iluminado e tire outra foto."
            : "A foto está clara demais. Ajuste a iluminação e tente novamente.",
      );
      setPhase("retake");
      return;
    }

    const active = session ?? (await ensureResponseSession());
    if (!active) {
      setErrorMsg("Não foi possível iniciar o envio. Tente novamente.");
      setPhase("technical_failure");
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
      // Inicia a resposta no banco e reserva o ID da evidência
      const { data, error } = await supabase.rpc("prepare_evidence_upload", {
        p_checklist_id: checklistId,
        p_block_id: block.id,
        p_response_token: active.responseToken,
        p_file_name: file.name,
        p_mime_type: file.type || "image/jpeg",
        p_file_size: file.size
      });

      if (error || !data?.upload_url || !data?.storage_path || !data?.evidence_id) {
        throw new Error("prepare_failed");
      }

      startData = {
        uploadUrl: data.upload_url,
        uploadToken: data.upload_token,
        storagePath: data.storage_path,
        evidenceId: data.evidence_id
      };
    } catch (err) {
      console.error("Prepare error:", err);
      setErrorMsg("Falha ao iniciar o envio. Tente novamente.");
      setPhase("technical_failure");
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
      setPhase("technical_failure");
      return;
    }

    try {
      // Confirmação direta no banco via RPC neutra
      const { error } = await supabase.rpc("confirm_evidence_upload", {
        p_response_token: active.responseToken,
        p_evidence_id: startData.evidenceId
      });

      if (error) throw error;
      
      setEvidenceId(startData.evidenceId as string);
      setPhase("received");
    } catch (err) {
      console.error("Confirm error:", err);
      setErrorMsg("Não foi possível confirmar o envio. Tente novamente.");
      setPhase("technical_failure");
    }
  };

  const busy = phase === "local_check" || phase === "uploading";
  const canPickPhoto = phase === "idle";

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
          {phase === "received" && (
            <span className="inline-block mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 uppercase tracking-wider">
              Foto recebida
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
        <div
          className={`relative mb-2 overflow-hidden rounded-xl border-2 bg-black/5 transition-colors ${
            phase === "received"
              ? "border-blue-400"
              : phase === "retake"
                ? "border-amber-400"
                : "border-neutral-200"
          }`}
        >
          <img src={previewUrl} alt="Foto enviada" className="w-full max-h-80 object-contain" />
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-sm text-neutral-600 py-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          {phase === "local_check" ? "Verificando a foto no aparelho..." : "Enviando foto..."}
        </div>
      )}

      {phase === "received" && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 py-1">
          <CheckCircle2 className="w-4 h-4 text-blue-500" aria-hidden />
          Foto recebida.
          <button type="button" onClick={resetAll} className="ml-2 text-xs underline text-neutral-500 hover:text-neutral-700">
            Trocar foto
          </button>
        </div>
      )}

      {phase === "retake" && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <RefreshCw className="w-4 h-4 mt-0.5" aria-hidden />
            <span>{errorMsg || "Não foi possível confirmar. Tire outra foto."}</span>
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

      {phase === "technical_failure" && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
            <Loader2 className="w-4 h-4 mt-0.5" aria-hidden />
            <span>{errorMsg || "Falha técnica ao processar foto."}</span>
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm hover:bg-neutral-50"
          >
            <Camera className="w-4 h-4" aria-hidden />
            Tentar novamente
          </button>
        </div>
      )}

      {cameraOpen && (
        <TieckCamera
          open={cameraOpen}
          title={title || "Câmera"}
          allowGallery={true}
          onClose={() => {
            setCameraOpen(false);
            onCameraToggle?.(false);
          }}
          onCapture={handleCapture}
        />
      )}
    </div>
  );
}
