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
  ensureResponseSession: (options?: { forceNew?: boolean }) => Promise<{ responseId: string; responseToken: string; checklistId: string; createdAt: number } | null>;
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
  | "received"
  | "storage_failure";

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
  // removed retryAttempted from React state to control recovery via recoveryAttempt argument
  
  const inFlightRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<AbortReason | null>(null);
  const requestSequenceRef = useRef<number>(0);
  const recoveryInProgressRef = useRef<boolean>(false);

  const isAIEnabled = import.meta.env.VITE_CAMERA_AI_ENABLED === "true";

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
    
    const newIdempotencyKey = crypto.randomUUID();
    setIdempotencyKey(newIdempotencyKey);
    setFailureReason("none");
    recoveryInProgressRef.current = false;

    void processVerification(file, newIdempotencyKey, requestSequenceRef.current);
  };


  const processVerification = async (
    file: File, 
    key: string, 
    sequence: number, 
    options?: { sessionOverride?: { responseId: string; responseToken: string }; recoveryAttempt?: number }
  ) => {
    const recoveryAttempt = options?.recoveryAttempt ?? 0;
    const isRetry = recoveryAttempt > 0;
    // Double-click protection: if we're already processing THIS exact capture, ignore.
    if (inFlightRef.current && key === idempotencyKey && !isRetry) return;
    
    setErrorMsg(null);
    setEvidence(null);

    // Closure to check if this request is still the active one
    const isCurrent = () => sequence === requestSequenceRef.current;

    let activeSession = options?.sessionOverride ?? session ?? (await ensureResponseSession());
    
    if (!isCurrent()) return;

    if (!activeSession) {
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
        });

        if (!isCurrent()) return;
        
        if (onAnswer) onAnswer(block.id, url);
        setState("received");
      } catch (err: unknown) {
        if (!isCurrent()) return;
        console.error("Upload error:", err);
        setErrorMsg("Erro ao enviar foto.");
        setFailureReason("network_unknown");
        setState("technical_failure");
      }
      return;
    }

    // AI Flow
    setState("preparing");
    inFlightRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    abortReasonRef.current = null;

    let timeoutId: number | null = null;

    try {
      let fileToVerify = file;
      if (file.size > 3 * 1024 * 1024) {
        const compressed = await compressImage(file);
        if (compressed) fileToVerify = compressed;
      }

      if (!isCurrent()) return;
      setState("analyzing");

      timeoutId = window.setTimeout(() => {
        if (requestSequenceRef.current === sequence) {
          abortReasonRef.current = "timeout";
          controller.abort();
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
        signal: controller.signal
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      if (!isCurrent()) return;

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        setState("technical_failure");
        setFailureReason("server_failed");
        setErrorMsg("Ocorreu uma falha técnica no servidor. Tente novamente.");
        return;
      }

      const data: any = await response.json();
      
      if (response.status === 429) {
        setState("rate_limited");
        return;
      }

      if (data.code === 'storage_failure') {
        setState("storage_failure");
        setErrorMsg(data.message || "Foto aprovada, mas falha ao salvar no servidor.");
        return;
      }

      if (response.status === 409) {
        setState("technical_failure");
        setFailureReason("processing");
        setErrorMsg(data.message || "A foto ainda está sendo processada. Tente novamente em instantes.");
        return;
      }

      // Tratamento de Sessão Expirada ou Divergente
      if (response.status === 401 || response.status === 403) {
        const canRecover = recoveryAttempt === 0 && (data.code === 'unauthorized' || data.code === 'id_mismatch');
        
        if (canRecover && isCurrent()) {
          setState("preparing");
          const newSession = await ensureResponseSession({ forceNew: true });
          if (newSession && isCurrent()) {
            return await processVerification(file, key, sequence, { 
              sessionOverride: newSession, 
              recoveryAttempt: 1 
            });
          }
        }
        
        setState("technical_failure");
        setFailureReason("configuration");
        const codeMsg = data.requestId ? ` (Código de suporte: ${data.requestId})` : "";
        setErrorMsg((data.message || "Sessão inválida. Recarregue a página.") + codeMsg);
        return;
      }

      if (response.status === 404) {
        const code = data?.code;
        if (code === "invalid_block") {
          setState("technical_failure");
          setFailureReason("configuration");
          const codeMsg = data.requestId ? ` (Código de suporte: ${data.requestId})` : "";
          setErrorMsg("Este checklist foi atualizado. Recarregue a página." + codeMsg);
          return;
        }
      }

      if (response.status === 503) {
        setState("technical_failure");
        setFailureReason("configuration");
        const code = data?.code;
        const codeMsg = data.requestId ? ` (Código de suporte: ${data.requestId})` : "";
        if (code === "camera_ai_disabled") {
          setErrorMsg("A verificação inteligente está temporariamente indisponível." + codeMsg);
        } else {
          setErrorMsg((data.message || "Servidor em manutenção ou configuração ausente.") + codeMsg);
        }
        return;
      }

      if (response.status >= 500) {
        setState("technical_failure");
        setFailureReason("server_failed");
        const codeMsg = data.requestId ? ` (Código de suporte: ${data.requestId})` : "";
        setErrorMsg((data.message || "O servidor encontrou um erro. Tente novamente.") + codeMsg);
        return;
      }

      const parsed = CameraAIResponseSchema.safeParse(data);
      if (!parsed.success) {
        setState("technical_failure");
        setFailureReason("server_failed");
        const codeMsg = data.requestId ? ` (Código de suporte: ${data.requestId})` : "";
        setErrorMsg("Resposta do servidor em formato inválido." + codeMsg);
        return;
      }

      const result = parsed.data;
      if (!result.ok) {
        setState("technical_failure");
        setFailureReason("server_failed");
        const codeMsg = data.requestId ? ` (Código de suporte: ${data.requestId})` : "";
        setErrorMsg((result.message || "Falha na verificação.") + codeMsg);
        return;
      }

      if (result.decision === "approved") {
        if (!result.persisted || !result.evidenceId) {
          setState("technical_failure");
          setFailureReason("server_failed");
          setErrorMsg("Foto aprovada, mas a persistência falhou no servidor.");
          return;
        }

        if (!isCurrent()) return;
        
        if (onAnswer) {
          onAnswer(block.id, JSON.stringify({
            type: 'camera',
            evidenceId: result.evidenceId,
            aiEnabled: true,
            decision: 'approved',
            canContinue: true,
            evidence: result.evidence || ''
          }));
        }
        setEvidence(result.evidence || null);
        setState("approved");
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
      if (timeoutId) window.clearTimeout(timeoutId);
      
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      
      if (isAbort) {
        if (!isCurrent()) return;
        if (abortReasonRef.current === "timeout") {
          setState("technical_failure");
          setFailureReason("timeout_unknown");
          setErrorMsg("A verificação demorou mais que o esperado. Tente novamente.");
        }
        return;
      }

      if (!isCurrent()) return;
      console.error("Verification error:", err);
      setState("technical_failure");
      setFailureReason("network_unknown");
      setErrorMsg("Falha de conexão com o servidor. Verifique sua internet.");
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (isCurrent()) {
        inFlightRef.current = false;
        abortControllerRef.current = null;
      }
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
      
      void processVerification(capturedFile, keyToUse, requestSequenceRef.current, { recoveryAttempt: 0 });
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

      {(state === "technical_failure" || state === "storage_failure") && (
        <Alert variant="destructive" className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="flex flex-col gap-3 w-full">
            <span className="text-sm font-medium text-red-900">
              {errorMsg || "Não foi possível verificar esta foto agora."}
            </span>
            <div className="flex gap-2">
              {failureReason !== "configuration" && (
                <Button variant="outline" size="sm" onClick={retryCurrentPhoto} disabled={inFlightRef.current} className="bg-white border-red-200 text-red-700 hover:bg-red-100">
                  {state === "storage_failure" ? "Tentar salvar novamente" : "Tentar novamente"}
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