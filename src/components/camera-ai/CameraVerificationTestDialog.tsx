import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Camera, Upload, Play, Loader2, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { CameraVerificationPolicyV1, Decision } from "@/server/camera-ai/schema";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TestResponse {
  ok: boolean;
  decision: Decision;
  code: string;
  message: string;
  evidence: string;
  requestId: string;
}

interface CameraVerificationTestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  policy?: CameraVerificationPolicyV1;
  blockId: string;
  checklistId: string;
}

export function CameraVerificationTestDialog({
  isOpen,
  onClose,
  policy,
  blockId,
  checklistId,
}: CameraVerificationTestDialogProps) {
  const [step, setStep] = useState<"upload" | "preview" | "analyzing" | "result">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<TestResponse | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = () => {
    stopCamera();
    setStep("upload");
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResult(null);
    setIsLoading(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment", width: 1280, height: 720 } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCapturing(true);
      setStep("preview");
    } catch (err) {
      toast.error("Erro ao acessar a câmera. Verifique as permissões.");
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], "test-capture.jpg", { type: "image/jpeg" });
        setFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        setStep("preview");
        stopCamera();
      }
    }, "image/jpeg", 0.9);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 5 * 1024 * 1024) {
        toast.error("A imagem deve ter no máximo 5MB.");
        return;
      }
      if (!selectedFile.type.startsWith("image/")) {
        toast.error("Por favor, selecione uma imagem válida.");
        return;
      }
      setFile(selectedFile);
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      setStep("preview");
    }
  };

  const runTest = async () => {
    if (!file || isLoading) return;
    setIsLoading(true);
    setStep("analyzing");
    
    abortControllerRef.current = new AbortController();

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("401");

      const formData = new FormData();
      formData.append("candidate", file);
      formData.append("checklistId", checklistId);
      formData.append("blockId", blockId);

      const res = await fetch("/api/camera-ai/test-verification", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 401) throw new Error("401");
        if (res.status === 403) throw new Error("403");
        if (res.status === 429) throw new Error("429");
        if (errorData.code === "invalid_policy" || errorData.code === "checklist_update_required") throw new Error("policy_error");
        throw new Error("tech_failure");
      }

      const data = await res.json();
      setResult(data);
      setStep("result");
    } catch (err: any) {
      if (err.name === 'AbortError') return;

      const messages: Record<string, string> = {
        "401": "Sessão expirada. Faça login novamente.",
        "403": "Você não tem permissão para testar este checklist.",
        "429": "Limite de testes atingido. Tente novamente em 10 minutos.",
        "policy_error": "Configuração da política inválida ou desatualizada.",
        "tech_failure": "Falha técnica ao processar a IA. Tente novamente."
      };

      toast.error(messages[err.message] || messages["tech_failure"]);
      setStep("preview");
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        if (isLoading && !confirm("Deseja cancelar o teste em andamento?")) return;
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Testar verificação</DialogTitle>
          <DialogDescription>
            Simule como a IA analisa esta pergunta em tempo real.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === "upload" && (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={startCamera}
                className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-neutral-200 rounded-2xl hover:border-pink-300 hover:bg-pink-50/30 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-pink-500 group-hover:scale-110 transition-transform">
                  <Camera className="w-6 h-6" />
                </div>
                <span className="text-sm font-bold text-neutral-700">Tirar foto</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-neutral-200 rounded-2xl hover:border-blue-300 hover:bg-blue-50/30 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-sm font-bold text-neutral-700">Carregar imagem</span>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
              </button>
            </div>
          )}

          {(step === "preview" || step === "analyzing") && (
            <div className="space-y-6">
              <div className="relative aspect-video bg-neutral-900 rounded-2xl overflow-hidden shadow-inner border border-neutral-200">
                {isCapturing ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  previewUrl && (
                    <img
                      src={previewUrl}
                      className="w-full h-full object-cover"
                      alt="Preview"
                    />
                  )
                )}

                {step === "analyzing" && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white p-6 text-center">
                    <Loader2 className="w-10 h-10 animate-spin mb-4 text-pink-400" />
                    <p className="font-bold">Analisando imagem...</p>
                    <p className="text-xs text-white/70 mt-1">Isso pode levar alguns segundos.</p>
                  </div>
                )}
              </div>

              {step === "preview" && (
                <div className="flex gap-3">
                  {isCapturing ? (
                    <button
                      onClick={capturePhoto}
                      className="flex-1 py-3 bg-pink-500 text-white rounded-xl font-bold shadow-lg shadow-pink-200 transition-transform active:scale-[0.98]"
                    >
                      Capturar
                    </button>
                  ) : (
                    <button
                      onClick={runTest}
                      disabled={isLoading}
                      className="flex-1 py-3 bg-pink-500 text-white rounded-xl font-bold shadow-lg shadow-pink-200 flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                      Executar teste
                    </button>
                  )}
                  <button
                    onClick={reset}
                    disabled={isLoading}
                    className="px-6 py-3 border border-neutral-200 rounded-xl font-bold text-neutral-600 hover:bg-neutral-50 transition-all disabled:opacity-50"
                  >
                    Tentar outra
                  </button>
                </div>
              )}
            </div>
          )}

          {step === "result" && result && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className={cn(
                "p-6 rounded-2xl border flex flex-col items-center text-center gap-4",
                result.decision === 'approved' 
                  ? 'bg-green-50 border-green-100 text-green-800' 
                  : result.decision === 'retake'
                  ? 'bg-amber-50 border-amber-100 text-amber-800'
                  : 'bg-neutral-50 border-neutral-100 text-neutral-800'
              )}>
                {result.decision === 'approved' ? (
                  <CheckCircle2 className="w-12 h-12 text-green-500" />
                ) : result.decision === 'retake' ? (
                  <AlertCircle className="w-12 h-12 text-amber-500" />
                ) : (
                  <XCircle className="w-12 h-12 text-neutral-500" />
                )}
                
                <div>
                  <h4 className="text-lg font-bold">
                    {result.decision === 'approved' ? 'Imagem Aprovada' : result.decision === 'retake' ? 'Ação Necessária' : 'Não Observável'}
                  </h4>
                  <p className="text-sm opacity-90 mt-1">{result.message}</p>
                </div>
              </div>

              {result.evidence && (
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                    Evidências observadas
                  </label>
                  <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 text-xs leading-relaxed text-neutral-700 whitespace-pre-wrap">
                    {result.evidence}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                 <button
                  onClick={reset}
                  className="flex-1 py-3 bg-neutral-900 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-neutral-800 transition-all"
                >
                  Fazer novo teste
                </button>
                <div className="px-4 py-3 bg-neutral-100 text-neutral-400 rounded-xl flex items-center justify-center text-[10px] font-mono">
                  ID: {result.requestId}
                </div>
              </div>
              
              {result.decision !== 'approved' && (
                <p className="text-[11px] text-neutral-400 text-center italic">
                  Dica: Tente enquadrar melhor o objeto e garanta boa iluminação.
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
