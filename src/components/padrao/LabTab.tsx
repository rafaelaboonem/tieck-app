import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Camera, FlaskConical, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function LabTab({ standard, workspaceId }: { standard: any, workspaceId: string }) {
  const [candidate, setCandidate] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const analysisPromiseRef = useRef<Promise<any> | null>(null);

  const refs = standard?.references || [];
  const ref1 = refs.find((r: any) => r.position === 1);
  const ref2 = refs.find((r: any) => r.position === 2);
  const hasExactTwoRefs = refs.length === 2 && ref1 && ref2;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCandidate(file);
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const analyze = async () => {
    if (!candidate || analyzing || analysisPromiseRef.current) return;
    
    setAnalyzing(true);
    setResult(null);
    
    const idempotencyKey = crypto.randomUUID();
    
    const performAnalysis = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Unauthorized');

      const formData = new FormData();
      formData.append('standardId', standard.id);
      formData.append('idempotencyKey', idempotencyKey);
      formData.append('candidate', candidate);

      const res = await fetch('/api/camera-ai-openai-lab', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro na análise');
      return data;
    };

    analysisPromiseRef.current = performAnalysis();

    try {
      const data = await analysisPromiseRef.current;
      setResult(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAnalyzing(false);
      analysisPromiseRef.current = null;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FlaskConical className="h-5 w-5 text-amber-500" />
            Laboratório OpenAI
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">Referência 1</span>
              <div className="aspect-video rounded-lg border bg-muted overflow-hidden">
                {ref1 ? <img src={supabase.storage.from('visual-standards').getPublicUrl(ref1.storage_path).data.publicUrl} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Ausente</div>}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">Referência 2</span>
              <div className="aspect-video rounded-lg border bg-muted overflow-hidden">
                {ref2 ? <img src={supabase.storage.from('visual-standards').getPublicUrl(ref2.storage_path).data.publicUrl} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Ausente</div>}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">Foto Candidata</span>
              <div className="relative aspect-video rounded-lg border-2 border-dashed bg-muted/50 overflow-hidden flex items-center justify-center cursor-pointer hover:bg-muted" onClick={() => fileRef.current?.click()}>
                {preview ? <img src={preview} className="w-full h-full object-cover" /> : <Camera className="h-8 w-8 text-muted-foreground" />}
                <input type="file" className="hidden" ref={fileRef} accept="image/jpeg,image/png,image/webp" onChange={onFileChange} />
              </div>
            </div>
          </div>

          <Button 
            className="w-full bg-[#FF007F] hover:bg-[#e6006f]" 
            disabled={!candidate || analyzing || !hasExactTwoRefs}
            onClick={analyze}
          >
            {analyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analisando a foto...</> : 'Analisar com OpenAI'}
          </Button>

          {result && (
            <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className={`p-4 rounded-xl border flex items-center gap-3 ${result.server_decision === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700' : 'bg-rose-500/10 border-rose-500/20 text-rose-700'}`}>
                {result.server_decision === 'approved' ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
                <div>
                  <p className="font-bold uppercase tracking-tight">Decisão: {result.server_decision}</p>
                  <p className="text-xs opacity-80">{result.capture_instruction}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Metric label="Alvo presente" value={result.target_present} />
                <Metric label="Contexto correto" value={result.same_task_context} />
                <Metric label="Observável" value={result.condition_observable} />
                <Metric label="Condição atendida" value={result.condition_met} />
                <Metric label="Qualidade OK" value={result.image_quality_usable} />
                <Metric label="Consistência" value={result.reference_consistency === 'match'} />
              </div>

              <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground border-t pt-4 font-mono">
                <span>Model: {result.telemetry.model}</span>
                <span>• ID: {result.telemetry.response_id}</span>
                <span>• Tokens: {result.telemetry.usage?.total_tokens}</span>
                <span>• Latência: {result.telemetry.latency}ms</span>
                <span>• Confiança: {(result.confidence * 100).toFixed(1)}%</span>
                {result.telemetry.response_id && result.telemetry.usage && (
                  <span className="text-emerald-600 font-bold ml-auto">INFERÊNCIA REAL CONFIRMADA</span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string, value: boolean }) {
  return (
    <div className="flex flex-col p-2 rounded-lg border bg-background">
      <span className="text-[10px] uppercase font-medium text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold ${value ? 'text-emerald-600' : 'text-rose-600'}`}>{value ? 'SIM' : 'NÃO'}</span>
    </div>
  );
}
