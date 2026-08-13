import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Camera, CheckCircle2, XCircle, ChevronDown, ChevronUp, Info, AlertCircle, Images } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TieckCamera } from "@/components/TieckCamera";
import { Alert, AlertDescription } from "@/components/ui/alert";

type LabState = 
  | "idle" 
  | "candidate_selected" 
  | "preparing" 
  | "analyzing" 
  | "approved" 
  | "retake" 
  | "not_verifiable" 
  | "technical_failure" 
  | "session_expired" 
  | "rate_limited";

export function OpenAILabTest({ standard }: { standard: any }) {
  const [state, setState] = useState<LabState>("idle");
  const [candidate, setCandidate] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [showTech, setShowTech] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  
  const fileRef = useRef<HTMLInputElement>(null);

  const refs = standard?.references || [];
  const ready = refs.length === 2;

  const analyze = async () => {
    if (!candidate || state === "analyzing" || !ready) return;
    
    setState("analyzing");
    setResult(null);

    try {
      let { data: { session } } = await supabase.auth.getSession();
      
      // Try refresh once if session is missing
      if (!session) {
        const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
        session = refreshedSession;
      }

      if (!session) {
        setState("session_expired");
        toast.error("Sua sessão expirou. Entre novamente para continuar.");
        return;
      }

      const formData = new FormData();
      formData.append('standardId', standard.id);
      formData.append('candidate', candidate);
      formData.append('idempotencyKey', idempotencyKey);

      const res = await fetch('/api/camera-ai-openai-lab', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}` 
        },
        body: formData
      });

      const data = await res.json();
      
      if (res.status === 401) {
        setState("session_expired");
        throw new Error('Sua sessão expirou. Entre novamente.');
      }
      if (res.status === 429) {
        setState("rate_limited");
        throw new Error('Muitas tentativas. Tente novamente em alguns minutos.');
      }
      if (!res.ok) {
        setState("technical_failure");
        throw new Error(data.message || 'Erro na análise');
      }

      setResult(data);
      
      // Map server decision to lab states
      if (data.server_decision === 'approved') setState("approved");
      else if (data.server_decision === 'rejected') setState("retake");
      else setState("not_verifiable");

    } catch (e: any) {
      toast.error(e.message);
      if (state === "analyzing") setState("technical_failure");
    }
  };

  const handleFileSelection = useCallback((file: File) => {
    setCandidate(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
    setState("candidate_selected");
    setCameraOpen(false);
  }, []);

  return (
    <div className="space-y-6 pt-6 border-t">
      <div>
        <h3 className="text-lg font-bold">Teste de verificação</h3>
        <p className="text-sm text-muted-foreground">Envie uma foto para conferir como ela seria avaliada antes de usar esse padrão no checklist.</p>
      </div>

      <div className="flex flex-col items-center">
        <div className="w-full max-w-md aspect-video rounded-xl border-2 border-dashed bg-muted flex items-center justify-center overflow-hidden relative mb-4">
          {preview ? (
            <>
              <img src={preview} className="w-full h-full object-cover" alt="Candidata" />
              <div className="absolute top-2 right-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setCameraOpen(true)}>Câmera</Button>
                <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>Galeria</Button>
              </div>
            </>
          ) : (
            <div className="flex gap-4">
              <Button variant="ghost" onClick={() => setCameraOpen(true)} disabled={!ready}>
                <Camera className="mr-2 h-4 w-4" /> Tirar foto
              </Button>
              <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={!ready}>
                <Images className="mr-2 h-4 w-4" /> Galeria
              </Button>
            </div>
          )}
          <input 
            type="file" 
            ref={fileRef} 
            className="hidden" 
            accept="image/*" 
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelection(f);
            }} 
          />
        </div>

        <Button 
          className="w-full max-w-md h-12 bg-[#FF007F] hover:bg-[#e6006f] font-bold" 
          disabled={!candidate || state === "analyzing" || !ready} 
          onClick={analyze}
        >
          {state === "analyzing" ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificando a condição solicitada...</>
          ) : 'Analisar foto'}
        </Button>
        {!ready && <p className="text-xs text-muted-foreground mt-2">Adicione as duas referências para liberar o teste.</p>}
      </div>

      {state === "session_expired" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Sua sessão expirou. Entre novamente para continuar.</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="space-y-4 animate-in fade-in duration-500">
          {state === 'approved' ? (
            <div className="p-6 rounded-xl border bg-emerald-50 text-emerald-900 border-emerald-200">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <h4 className="text-lg font-bold">Foto aprovada</h4>
              </div>
              <p className="text-sm opacity-90">{result.observed_evidence?.join(". ") || 'A foto corresponde às referências e atende à condição solicitada.'}</p>
            </div>
          ) : state === 'retake' ? (
            <div className="p-6 rounded-xl border bg-amber-50 text-amber-900 border-amber-200">
              <div className="flex items-center gap-3 mb-2">
                <XCircle className="h-6 w-6 text-amber-600" />
                <h4 className="text-lg font-bold">Tire outra foto</h4>
              </div>
              <p className="text-sm font-bold mb-1">{result.blocking_reasons?.join(". ") || 'Não foi possível confirmar os critérios.'}</p>
              <p className="text-xs opacity-90">{result.capture_instruction}</p>
            </div>
          ) : (
            <div className="p-6 rounded-xl border bg-slate-50 text-slate-900 border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <Info className="h-6 w-6 text-slate-600" />
                <h4 className="text-lg font-bold">Não foi possível confirmar pela foto</h4>
              </div>
              <p className="text-sm opacity-90">{result.capture_instruction || 'Tente tirar a foto novamente com melhor iluminação.'}</p>
            </div>
          )}

          <div className="border rounded-xl overflow-hidden">
            <button 
              className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted/80 transition-colors" 
              onClick={() => setShowTech(!showTech)}
            >
              <span className="text-xs font-bold uppercase text-muted-foreground">Detalhes técnicos</span>
              {showTech ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showTech && (
              <div className="p-4 bg-muted/20 text-[11px] font-mono grid grid-cols-2 gap-y-2 gap-x-4">
                <div>Modelo: {result.telemetry?.model}</div>
                <div>Latência: {result.telemetry?.latency}ms</div>
                <div>Tokens In: {result.telemetry?.usage?.input_tokens || result.telemetry?.usage?.prompt_tokens}</div>
                <div>Tokens Out: {result.telemetry?.usage?.output_tokens || result.telemetry?.usage?.completion_tokens}</div>
                <div className="col-span-2">ID: {result.telemetry?.response_id}</div>
                <div>Decisão Bruta: {result.server_decision}</div>
                <div className="text-emerald-600 font-bold uppercase">Inferência Real Confirmada</div>
              </div>
            )}
          </div>
        </div>
      )}

      {cameraOpen && (
        <TieckCamera 
          open={cameraOpen}
          title="Capturar Candidata"
          onClose={() => setCameraOpen(false)}
          onCapture={handleFileSelection}
          allowGallery={true}
        />
      )}
    </div>
  );
}

