import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Camera, Upload, Play, Loader2, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { Decision } from "@/server/camera-ai/schema";
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

interface Props {
  isOpen: boolean;
  onClose: () => void;
  blockId: string;
  checklistId: string;
  isReferenceMode?: boolean;
}

export function CameraVerificationTestDialog({ isOpen, onClose, blockId, checklistId, isReferenceMode = false }: Props) {
  const [step, setStep] = useState<"upload" | "preview" | "analyzing" | "result">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<TestResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = () => {
    setStep("upload");
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResult(null);
    setIsLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isOpen) reset();
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [isOpen]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    if (selectedFile.size > 3 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 3MB.");
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selectedFile.type)) {
      toast.error("Formato inválido. Use JPEG, PNG ou WebP.");
      return;
    }
    setFile(selectedFile);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setStep("preview");
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
        headers: { "Authorization": `Bearer ${token}` },
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

      setResult(await res.json());
      setStep("result");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;

      const errorKey = err instanceof Error ? err.message : "tech_failure";
      const messages: Record<string, string> = {
        "401": "Sessão expirada. Faça login novamente.",
        "403": "Você não tem permissão para testar este checklist.",
        "429": "Limite de testes atingido. Tente novamente em 10 minutos.",
        "policy_error": "Configuração da política inválida ou desatualizada.",
        "tech_failure": "Falha técnica ao processar a IA. Tente novamente."
      };
      toast.error(messages[errorKey] || messages["tech_failure"]);
      setStep("upload");
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
          <DialogDescription>Simule como a IA analisa esta pergunta em tempo real. Este teste executa uma análise de IA e pode gerar consumo.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isReferenceMode && (
            <p className="mb-4 text-xs font-medium text-muted-foreground">Comparando com a foto de referência configurada.</p>
          )}
          {step === "upload" && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-neutral-200 rounded-2xl hover:border-blue-300 hover:bg-blue-50/30 transition-all"
            >
              <Upload className="w-10 h-10 text-blue-500" />
              <span className="text-sm font-bold text-neutral-700">Carregar imagem (JPG, PNG, WebP - máx 3MB)</span>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
            </button>
          )}
          {(step === "preview" || step === "analyzing") && (
            <div className="space-y-6">
              <div className="relative aspect-video bg-neutral-900 rounded-2xl overflow-hidden">
                {previewUrl && <img src={previewUrl} className="w-full h-full object-cover" alt="Imagem candidata para teste" />}
                {step === "analyzing" && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                    <Loader2 className="w-10 h-10 animate-spin mb-4 text-pink-400" />
                    <p className="font-bold">Analisando imagem...</p>
                  </div>
                )}
              </div>
              {step === "preview" && (
                <div className="flex gap-3">
                  <button onClick={runTest} disabled={isLoading} className="flex-1 py-3 bg-pink-500 text-white rounded-xl font-bold transition-all disabled:opacity-50">Executar teste</button>
                  <button onClick={reset} disabled={isLoading} className="px-6 py-3 border rounded-xl font-bold text-neutral-600 hover:bg-neutral-50">Tentar outra</button>
                </div>
              )}
            </div>
          )}
          {step === "result" && result && (
            <div className="space-y-6">
              <div className={cn(
                "p-6 rounded-2xl border flex flex-col items-center text-center gap-4",
                result.decision === 'approved' ? 'bg-green-50 border-green-100 text-green-800' :
                result.decision === 'retake' ? 'bg-amber-50 border-amber-100 text-amber-800' :
                'bg-neutral-50 border-neutral-100 text-neutral-800'
              )}>
                {result.decision === 'approved' ? <CheckCircle2 className="w-12 h-12 text-green-500" /> :
                  result.decision === 'retake' ? <AlertCircle className="w-12 h-12 text-amber-500" /> :
                    <XCircle className="w-12 h-12 text-neutral-500" />}

                <h4 className="text-lg font-bold">
                  {result.decision === 'approved' ? 'Imagem Aprovada' :
                    result.decision === 'retake' ? 'Exigir nova foto' :
                      'Não observável'}
                </h4>
                <p className="text-sm opacity-90">{result.message}</p>
              </div>

              {result.evidence && (
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Evidências observadas</label>
                  <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100 text-xs text-neutral-600 leading-relaxed italic">
                    {result.evidence}
                  </div>
                </div>
              )}

              <button onClick={reset} className="w-full py-3 bg-neutral-900 text-white rounded-xl font-bold">Fazer novo teste</button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
