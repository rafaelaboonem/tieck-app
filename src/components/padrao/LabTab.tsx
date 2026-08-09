import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Play, CheckCircle2, RefreshCcw, HelpCircle, AlertTriangle, Camera, ImageIcon, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { 
  blobToBase64, 
  profileOf, 
  type VisualStandard, 
  type LabRun,
  type LabDecision 
} from "@/lib/visual-standards";

const DECISION_META: Record<string, { label: string; tone: string; icon: any }> = {
  approved: { label: "Aprovado", tone: "bg-emerald-500/15 text-emerald-700", icon: CheckCircle2 },
  retake: { label: "Refazer foto", tone: "bg-amber-500/15 text-amber-700", icon: RefreshCcw },
  not_observable: { label: "Não observável", tone: "bg-sky-500/15 text-sky-700", icon: HelpCircle },
  technical_failure: { label: "Falha técnica", tone: "bg-rose-500/15 text-rose-700", icon: AlertTriangle },
};

interface Props {
  workspaceId: string;
  selected: VisualStandard | null;
  runs: LabRun[];
  onRun: (run: LabRun) => void;
}

export function LabTab({ workspaceId, selected, runs, onRun }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const hasReferences = (selected?.references?.length ?? 0) === 2;
  const isOwner = Boolean(userId && selected && selected.created_by === userId);

  const executeV4 = async () => {
    if (!file || !selected) return;
    setRunning(true);
    try {
      const imageBase64 = await blobToBase64(file);
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch('/api/public/verify-camera-v4', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          checklistId: crypto.randomUUID(), // Mock for lab
          blockId: 'lab-block',
          cameraBlockId: selected.camera_block_id,
          visualStandardId: selected.id,
          imageBase64
        })
      });

      const data = await res.json();
      toast.success(data.message || "Teste concluído em modo Lab.");
    } catch (e) {
      toast.error("Erro ao executar teste V4.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-[#FF007F]" />
            Laboratório Camera AI V4
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Selecione um padrão para testar.</p>
          ) : !hasReferences ? (
            <p className="text-sm text-amber-600">O padrão precisa de exatamente 2 referências para o teste V4.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-sm font-medium">Padrão: {selected.question}</p>
                <p className="text-xs text-muted-foreground mt-1">Status: {selected.status}</p>
              </div>

              <div className="space-y-2">
                <Label>Foto Candidata</Label>
                <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {previewUrl && (
                  <div className="mt-2 aspect-video relative rounded-lg overflow-hidden border">
                    <img src={previewUrl} className="object-contain w-full h-full" alt="Preview" />
                  </div>
                )}
              </div>

              {isOwner && (
                <Button 
                  className="w-full bg-[#FF007F] hover:bg-[#e6006f]" 
                  disabled={!file || running} 
                  onClick={executeV4}
                >
                  {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  Testar Camera V4 (Isolado)
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Histórico recente (Lab)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="flex items-center justify-between p-2 border rounded-md text-xs">
                <span>{new Date(run.at).toLocaleTimeString()}</span>
                <Badge variant="outline">{run.combined.decision}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
