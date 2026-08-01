import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Play, Eye, Scale, CheckCircle2, RefreshCcw, HelpCircle, AlertTriangle, Camera, Sparkles } from "lucide-react";
import { CameraV3Preview } from "@/components/padrao/CameraV3Preview";
import {
  blobToBase64,
  referenceBase64,
  runBenchmark,
  isCorrect,
  ensureStandardProfile,
  profileOf,
  RELEASE_CASES,
  type ExpectedResult,
  type LabDecision,
  type LabRun,
  type ReleaseCase,
  type VisualStandard,
} from "@/lib/visual-standards";

const DECISION_META: Record<LabDecision, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  approved: { label: "Aprovado", tone: "bg-emerald-500/15 text-emerald-700", icon: CheckCircle2 },
  retake: { label: "Refazer foto", tone: "bg-amber-500/15 text-amber-700", icon: RefreshCcw },
  uncertain: { label: "Incerto", tone: "bg-sky-500/15 text-sky-700", icon: HelpCircle },
  technical_failure: { label: "Falha técnica", tone: "bg-rose-500/15 text-rose-700", icon: AlertTriangle },
};

interface Props {
  workspaceId: string;
  standards: VisualStandard[];
  selected: VisualStandard | null;
  onSelect: (s: VisualStandard | null) => void;
  runs: LabRun[];
  onRun: (run: LabRun) => void;
  onUpdateRun?: (id: string, patch: Partial<LabRun>) => void;
}


export function LabTab({ workspaceId, standards, selected, onSelect, runs, onRun, onUpdateRun }: Props) {
  const [question, setQuestion] = useState(selected?.question ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [expected, setExpected] = useState<ExpectedResult>("approved");
  const [useReference, setUseReference] = useState(true);
  const [running, setRunning] = useState(false);
  const [releaseCase, setReleaseCase] = useState<ReleaseCase | "">("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [profiling, setProfiling] = useState(false);

  const profile = profileOf(selected);

  useEffect(() => {
    if (selected) setQuestion(selected.question);
  }, [selected]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const lastRun = runs[0] ?? null;
  const canRun = useMemo(() => Boolean(file && question.trim() && !running), [file, question, running]);

  const register = (res: Parameters<typeof isCorrect>[0] extends never ? never : LabRun) => res;

  const pushRun = (res: LabRun) => {
    res.correct = isCorrect(res);
    onRun(res);
    if (res.combined.decision === "technical_failure") toast.error("Não foi possível verificar agora.");
  };

  const execute = async () => {
    if (!file) return;
    setRunning(true);
    try {
      const imageBase64 = await blobToBase64(file);
      let ref: string | null = null;
      if (useReference && selected?.reference_path) {
        ref = await referenceBase64(selected.reference_path);
      }
      const res = await runBenchmark({
        workspaceId,
        question,
        imageBase64,
        referenceBase64: ref,
        standardId: selected?.id ?? null,
        profile,
      });
      pushRun({
        ...res,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        question,
        expected,
        correct: null,
        source: "upload",
        releaseCase: releaseCase || null,
      });
    } catch (e) {
      toast.error(`Não foi possível analisar agora. Tente novamente.`);
      console.error("[lab]", (e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const openCamera = async () => {
    if (!selected) {
      toast.error("Selecione um padrão salvo para testar com a câmera.");
      return;
    }
    if (!profile) {
      setProfiling(true);
      const out = await ensureStandardProfile(workspaceId, selected.id);
      setProfiling(false);
      if (!out.ok) {
        toast.error("Não foi possível preparar este padrão agora.");
        return;
      }
      toast.message("Padrão preparado. Recarregue a lista se o resumo não aparecer.");
    }
    setCameraOpen(true);
  };


  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rodar um teste</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Padrão</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selected?.id ?? ""}
              onChange={(e) => onSelect(standards.find((s) => s.id === e.target.value) ?? null)}
            >
              <option value="">Sem padrão salvo (pergunta livre)</option>
              {standards.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lab-question">Pergunta enviada à IA</Label>
            <Textarea id="lab-question" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lab-file">Foto de teste</Label>
            <Input
              id="lab-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {previewUrl && (
              <img src={previewUrl} alt="Pré-visualização da foto de teste" className="mt-2 max-h-48 rounded-lg object-contain" />
            )}
            <p className="text-xs text-muted-foreground">
              Fotos do laboratório são analisadas em memória e não são armazenadas.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm">Usar foto de referência do padrão</Label>
              <p className="text-xs text-muted-foreground">
                {selected?.reference_path ? "Referência disponível." : "Este padrão não tem referência."}
              </p>
            </div>
            <Switch
              checked={useReference && Boolean(selected?.reference_path)}
              disabled={!selected?.reference_path}
              onCheckedChange={setUseReference}
            />
          </div>

          <div className="space-y-2">
            <Label>Resultado esperado</Label>
            <div className="flex gap-2">
              {(["approved", "retake"] as const).map((v) => (
                <Button
                  key={v}
                  type="button"
                  variant={expected === v ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExpected(v)}
                >
                  {v === "approved" ? "Deveria aprovar" : "Deveria pedir nova foto"}
                </Button>
              ))}
            </div>
          </div>

          <Button className="w-full bg-[#FF007F] hover:bg-[#e6006f]" disabled={!canRun} onClick={execute}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {running ? "Analisando…" : "Rodar teste"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {lastRun ? <RunDetail run={lastRun} /> : (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Envie uma foto e rode o primeiro teste para ver as duas etapas da análise.
            </CardContent>
          </Card>
        )}

        {runs.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Testes anteriores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {runs.slice(1, 8).map((r) => {
                const meta = DECISION_META[r.combined.decision];
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-xs">
                    <span className="truncate">{r.question}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className={meta.tone}>{meta.label}</Badge>
                      <span className="text-muted-foreground">
                        {r.correct === null ? "—" : r.correct ? "acerto" : "erro"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function RunDetail({ run }: { run: LabRun }) {
  const meta = DECISION_META[run.combined.decision];
  const Icon = meta.icon;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">Resultado</CardTitle>
          <Badge variant="outline" className={meta.tone}>
            <Icon className="mr-1 h-3 w-3" /> {meta.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-lg bg-muted p-3 text-sm">{run.combined.public_message}</p>

        <Step
          icon={<Eye className="h-4 w-4 text-sky-600" />}
          title="Etapa 1 — Observação da foto"
          latency={run.observer?.latencyMs}
        >
          {run.observer ? (
            <div className="space-y-1">
              <p>{run.observer.observation}</p>
              <p className="text-xs text-muted-foreground">
                Item visível: {yn(run.observer.targetVisible)} · Desfocada: {yn(run.observer.blurry)} · Escura: {yn(run.observer.dark)}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">Etapa não concluída.</p>
          )}
        </Step>

        <Step
          icon={<Scale className="h-4 w-4 text-violet-600" />}
          title="Etapa 2 — Julgamento do padrão"
          latency={run.judge?.latencyMs}
        >
          {run.judge ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Decisão: {run.judge.decision} · Condição atendida: {yn(run.judge.conditionMet)} · Confiança:{" "}
                {run.judge.confidence == null ? "—" : `${Math.round(run.judge.confidence * 100)}%`}
              </p>
              {run.judge.observations.length > 0 && (
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {run.judge.observations.slice(0, 4).map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Etapa não concluída.</p>
          )}
        </Step>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Referência: {run.referenceMode === "none" ? "não usada" : run.referenceMode === "multi_image" ? "comparada" : "descrita"}</span>
          <span>Tempo total: {run.totalLatencyMs} ms</span>
          <span>Esperado: {run.expected === "approved" ? "aprovar" : "nova foto"}</span>
          <span>{run.correct === null ? "Sem classificação" : run.correct ? "Acerto" : "Erro"}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Step({ icon, title, latency, children }: { icon: React.ReactNode; title: string; latency?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">{icon}{title}</div>
        {latency != null && <span className="text-xs text-muted-foreground">{latency} ms</span>}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function yn(v: boolean | null | undefined) {
  return v == null ? "—" : v ? "sim" : "não";
}
