import { CameraAIResponseSchema, type CameraAIResponse, type PublicCameraBlockData } from "./camera-ai/types";
import { uploadCameraEvidence } from "./camera-ai/upload";
import { compressImage } from "@/lib/compress-image";
import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, RefreshCw, AlertCircle, CheckCircle2, Loader2, CameraIcon, RotateCcw, ImagePlus, AlertTriangle } from "lucide-react";
import { TieckCamera } from "./TieckCamera";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { cn } from "@/lib/utils";

interface PublicCameraBlockProps {
  block: PublicCameraBlockData;
  checklistId: string;
  accentColor?: string;
  textColor?: string;
  title?: string;
  onAnswer?: (blockId: string, value: string) => void;
  onCameraActiveChange?: (active: boolean) => void;
  session?: { responseId: string; responseToken: string } | null;
  ensureResponseSession: () => Promise<{ responseId: string; responseToken: string } | null>;
  language?: string;
}

type VerificationState = 
  | "idle" 
  | "capturing" 
  | "preparing" 
  | "analyzing" 
  | "approved" 
  | "retake" 
  | "not_observable" 
  | "technical_failure" 
  | "rate_limited" 
  | "uploading" 
  | "received";

type FailureReason = "network_unknown" | "timeout_unknown" | "server_failed" | "processing" | "configuration" | "none";
type AbortReason = "timeout" | "retake" | "close" | "unmount";

export function PublicCameraBlock({
  block,
  checklistId,
  accentColor,
  textColor,
  title,
  onAnswer,
  onCameraActiveChange,
  session,
  ensureResponseSession,
}: PublicCameraBlockProps) {
  const [state, setState] = useState<VerificationState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<FailureReason>("none");
  
  const inFlightRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<AbortReason | null>(null);
  const requestSequenceRef = useRef<number>(0);

  const isAIEnabled = import.meta.env.VITE_CAMERA_AI_ENABLED === "true" || (import.meta.env as any).VITE_CAMERA_AI_ENABLED_FORCE === "true";

  // Cleanup effect for preview URL
  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  // Cleanup effect for requests
  useEffect(() => {
    return () => {
      requestSequenceRef.current++;
      if (abortControllerRef.current) {
        abortReasonRef.current = "unmount";
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCapture = async (file: File) => {
    // 1. Limpeza de resposta anterior de verdade
    // Se a foto foi aprovada anteriormente e estamos tirando uma nova, limpamos a resposta anterior.
    // Isso precisa ocorrer ANTES da nova verificação.
    if (onAnswer) {
      onAnswer(block.id, "");
    }

    // 2. Incremento da sequência e abort da requisição anterior
    requestSequenceRef.current++;
    if (abortControllerRef.current) {
      abortReasonRef.current = "retake";
      abortControllerRef.current.abort();
    }

    if (preview) URL.revokeObjectURL(preview);
    const newPreview = URL.createObjectURL(file);
    setPreview(newPreview);
    setCapturedFile(file);
    
    // Cada nova foto gera um novo idempotencyKey
    const newIdempotencyKey = crypto.randomUUID();
    setIdempotencyKey(newIdempotencyKey);
    setFailureReason("none");

    void processVerification(file, newIdempotencyKey, requestSequenceRef.current);
  };

  const processVerification = async (file: File, key: string, sequence: number) => {
    if (inFlightRef.current && key === idempotencyKey) return;
    
    setErrorMsg(null);
    setEvidence(null);

    const checkSequence = () => sequence === requestSequenceRef.current;

    const activeSession = session ?? (await ensureResponseSession());
    if (!activeSession) {
      if (!checkSequence()) return;
      setErrorMsg("Falha ao iniciar sessão.");
      setFailureReason("configuration");
      setState("technical_failure");
      return;
    }

    if (!isAIEnabled) {
      setState("uploading");
      try {
        let fileToUpload = file;
        if (file.size > 400_000) {
          const compressed = await compressImage(file);
          if (compressed) fileToUpload = compressed;
        }
        
        const url = await uploadCameraEvidence({
          file: fileToUpload,
          checklistId,
          blockId: block.id,
          // Não passamos onAnswer diretamente para controlar o momento da chamada
        });

        if (!checkSequence()) return;
        
        if (onAnswer) onAnswer(block.id, url);
        setState("received");
      } catch (err) {
        if (!checkSequence()) return;
        console.error("Upload error:", err);
        setErrorMsg("Erro ao enviar foto.");
        setFailureReason("network_unknown");
        setState("technical_failure");
      }
      return;
    }

    // Fluxo IA
    setState("preparing");
    inFlightRef.current = true;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      let fileToVerify = file;
      // Comprimimos se necessário (limite 3MB para a IA)
      if (file.size > 3 * 1024 * 1024) {
        const compressed = await compressImage(file);
        if (compressed) fileToVerify = compressed;
      }

      if (!checkSequence()) return;
      setState("analyzing");

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      abortReasonRef.current = null;

      timeoutId = setTimeout(() => {
        if (abortControllerRef.current) {
          abortReasonRef.current = "timeout";
          abortControllerRef.current.abort();
        }
      }, 35000);

      const formData = new FormData();
      formData.append("checklistId", checklistId);
      formData.append("blockId", block.id);
      formData.append("responseToken", activeSession.responseToken);
      formData.append("idempotencyKey", key);
      formData.append("candidate", fileToVerify);

      const response = await fetch("/api/camera-ai/verify", {
        method: "POST",
        body: formData,
        signal
      });

      if (timeoutId) clearTimeout(timeoutId);
      if (!checkSequence()) return;

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        setState("technical_failure");
        setFailureReason("server_failed");
        setErrorMsg("Ocorreu uma falha técnica no servidor. Tente novamente.");
        return;
      }

      const data = await response.json();
      
      if (response.status === 429) {
        setState("rate_limited");
        return;
      }

      if (response.status === 409) {
        setState("technical_failure");
        setFailureReason("processing");
        setErrorMsg("A foto ainda está sendo processada. Tente novamente em instantes.");
        return;
      }

      if (response.status === 503) {
        setState("technical_failure");
        setFailureReason("configuration");
        if (data.code === "camera_ai_disabled") {
          setErrorMsg("A verificação inteligente está temporariamente indisponível.");
        } else {
          setErrorMsg("Servidor em manutenção ou configuração ausente.");
        }
        return;
      }

      if (response.status >= 500) {
        setState("technical_failure");
        setFailureReason("server_failed");
        setErrorMsg("O servidor encontrou um erro. Tente novamente.");
        return;
      }

      const parsed = CameraAIResponseSchema.safeParse(data);
      if (!parsed.success) {
        setState("technical_failure");
        setFailureReason("server_failed");
        setErrorMsg("Resposta do servidor em formato inválido.");
        return;
      }

      const result = parsed.data;
      if (!result.ok) {
        setState("technical_failure");
        setFailureReason("server_failed");
        setErrorMsg(result.message || "Falha na verificação.");
        return;
      }

      if (result.decision === "approved") {
        setState("uploading");
        try {
          const url = await uploadCameraEvidence({
            file: fileToVerify,
            checklistId,
            blockId: block.id,
          });

          if (!checkSequence()) return;
          
          if (onAnswer) onAnswer(block.id, url);
          setEvidence(result.evidence || null);
          setState("approved");
        } catch (uploadErr) {
          if (!checkSequence()) return;
          console.error("Upload error after approval:", uploadErr);
          setState("technical_failure");
          setFailureReason("network_unknown");
          setErrorMsg("Foto aprovada, mas falha ao salvar no servidor.");
          // Limpa resposta aprovada se upload falhou
          if (onAnswer) onAnswer(block.id, "");
        }
      } else if (result.decision === "retake") {
        setState("retake");
        setErrorMsg(result.message || "Tire outra foto.");
        setEvidence(result.evidence || null);
      } else if (result.decision === "not_observable") {
        setState("not_observable");
        setErrorMsg(result.message || "Não foi possível confirmar pela foto.");
        setEvidence(result.evidence || null);
      } else {
        setState("technical_failure");
        setFailureReason("server_failed");
      }

    } catch (err: unknown) {
      if (timeoutId) clearTimeout(timeoutId);
      
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      
      if (isAbort) {
        if (abortReasonRef.current === "timeout") {
          if (!checkSequence()) return;
          setState("technical_failure");
          setFailureReason("timeout_unknown");
          setErrorMsg("A verificação demorou mais que o esperado. Tente novamente.");
        }
        // Outros aborts (close/retake/unmount) são ignorados silenciosamente
        return;
      }

      if (!checkSequence()) return;
      console.error("Verification error:", err);
      setState("technical_failure");
      setFailureReason("network_unknown");
      setErrorMsg("Falha de conexão com o servidor. Verifique sua internet.");
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      inFlightRef.current = false;
      abortControllerRef.current = null;
    }
  };

  const openCamera = () => {
    requestSequenceRef.current++;
    if (abortControllerRef.current) {
      abortReasonRef.current = "close";
      abortControllerRef.current.abort();
    }
    setState("capturing");
    onCameraActiveChange?.(true);
    setErrorMsg(null);
    setEvidence(null);
  };

  const closeCamera = () => {
    if (state === "capturing") {
      setState("idle");
      onCameraActiveChange?.(false);
    }
  };

  const retryCurrentPhoto = () => {
    if (capturedFile && idempotencyKey) {
      // Regras de retry:
      // network_unknown, timeout_unknown, processing -> Reutiliza mesma chave
      // server_failed -> Nova chave
      let keyToUse = idempotencyKey;
      if (failureReason === "server_failed") {
        keyToUse = crypto.randomUUID();
        setIdempotencyKey(keyToUse);
      }
      
      void processVerification(capturedFile, keyToUse, requestSequenceRef.current);
    }
  };

  if (state === "capturing") {
    return (
      <TieckCamera
        open={true}
        title={title || block.title || "Câmera"}
        onCapture={handleCapture}
        onClose={closeCamera}
      />
    );
  }

  return (
    <div className="w-full space-y-4">
      {state === "idle" && (
        <Button
          variant="outline"
          className="w-full h-20 border-dashed flex flex-col items-center justify-center gap-1 group transition-all"
          onClick={openCamera}
          style={{ borderColor: accentColor, color: textColor }}
        >
          <CameraIcon className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />
          <span className="font-semibold">{title || block.title || "Adicionar foto"}</span>
          {block.description && <span className="text-[10px] opacity-70 px-4 line-clamp-1">{block.description}</span>}
        </Button>
      )}

      {(["preparing", "analyzing", "approved", "retake", "not_observable", "technical_failure", "rate_limited", "uploading", "received"].includes(state)) && preview && (
        <div className={cn(
          "relative aspect-[4/3] rounded-2xl overflow-hidden border-2 transition-colors duration-500",
          state === "approved" ? "border-green-500 shadow-lg shadow-green-100" : 
          (state === "retake" || state === "not_observable") ? "border-amber-500 shadow-lg shadow-amber-100" : 
          state === "technical_failure" ? "border-red-500" : "border-neutral-200"
        )}>
          <img src={preview} alt="Capture preview" className="w-full h-full object-cover" />
          
          {state === "analyzing" && (
            <div className="absolute inset-0 z-10">
              <div className="w-full h-0.5 bg-[#FF007F] shadow-[0_0_15px_#FF007F] absolute animate-[scan_2s_ease-in-out_infinite]" />
              <div className="absolute inset-0 bg-[#FF007F]/5 animate-pulse" />
            </div>
          )}

          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 p-6 text-center">
            {state === "preparing" && (
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 flex items-center gap-3 shadow-xl">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-600" />
                <span className="text-sm font-bold text-neutral-800">Preparando foto...</span>
              </div>
            )}
            
            {state === "analyzing" && (
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 flex items-center gap-3 shadow-xl">
                <Loader2 className="w-5 h-5 animate-spin text-[#FF007F]" />
                <span className="text-sm font-bold text-neutral-800">Verificando a foto...</span>
              </div>
            )}

            {state === "uploading" && (
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 flex items-center gap-3 shadow-xl">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span className="text-sm font-bold text-neutral-800">Salvando evidência...</span>
              </div>
            )}

            {state === "approved" && (
              <div className="mt-auto w-full bg-white/95 backdrop-blur-sm rounded-xl p-4 shadow-xl border-t-4 border-green-500 animate-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-bold text-green-900">Foto aprovada</span>
                </div>
                {evidence && <p className="text-[11px] text-neutral-700 leading-relaxed text-left">{evidence}</p>}
                <Button variant="ghost" size="sm" onClick={openCamera} className="w-full mt-2 h-8 text-xs text-neutral-500 hover:bg-neutral-100">
                  <RotateCcw className="w-3 h-3 mr-2" />
                  Trocar foto
                </Button>
              </div>
            )}

            {(state === "retake" || state === "not_observable") && (
              <div className="mt-auto w-full bg-white/95 backdrop-blur-sm rounded-xl p-4 shadow-xl border-t-4 border-amber-500 animate-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-bold text-amber-900">
                    {state === "retake" ? "Tire outra foto" : "Não foi possível confirmar"}
                  </span>
                </div>
                {errorMsg && <p className="text-[11px] text-neutral-700 leading-relaxed text-left mb-3">{errorMsg}</p>}
                {evidence && <p className="text-[10px] text-neutral-500 italic text-left mb-3">"{evidence}"</p>}
                <Button onClick={openCamera} className="w-full h-10 bg-amber-600 hover:bg-amber-700 text-white font-bold">
                  <CameraIcon className="w-4 h-4 mr-2" />
                  Tirar outra foto
                </Button>
              </div>
            )}
            
            {state === "received" && (
              <div className="mt-auto w-full bg-blue-50/95 backdrop-blur-sm rounded-xl p-4 shadow-xl border-t-4 border-blue-500">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-bold text-blue-900">Foto recebida</span>
                </div>
                <p className="text-[10px] text-blue-700 text-left mb-2">A verificação inteligente ainda não está ativada.</p>
                <Button variant="ghost" size="sm" onClick={openCamera} className="w-full h-8 text-xs text-blue-700 hover:bg-blue-100">
                  <RotateCcw className="w-3 h-3 mr-2" />
                  Trocar foto
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {state === "technical_failure" && (
        <Alert variant="destructive" className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="flex flex-col gap-3 w-full">
            <span className="text-sm font-medium text-red-900">
              {errorMsg || "Não foi possível verificar esta foto agora."}
            </span>
            <div className="flex gap-2">
              {failureReason !== "configuration" && (
                <Button variant="outline" size="sm" onClick={retryCurrentPhoto} disabled={inFlightRef.current} className="bg-white border-red-200 text-red-700 hover:bg-red-100">
                  Tentar novamente
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={openCamera} className="text-red-700 underline">
                Tirar outra foto
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {state === "rate_limited" && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm font-medium text-amber-900">
            Muitas tentativas em pouco tempo. Aguarde alguns minutos.
          </AlertDescription>
        </Alert>
      )}

      <style>{`
        @keyframes scan {
          0%, 100% { top: 10%; }
          50% { top: 90%; }
        }
      `}</style>
    </div>
  );
}