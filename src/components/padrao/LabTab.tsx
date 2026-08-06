import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Play, Eye, Scale, CheckCircle2, RefreshCcw, HelpCircle, AlertTriangle, Camera, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CameraV3Preview } from "@/components/padrao/CameraV3Preview";


import {
  blobToBase64,
  referenceBase64,
  runBenchmark,
  prepareStandard,
  profileOf,
  startLabSession,
  createLabAttempt,
  CONDITION_STATUS_LABEL,
  LAB_PROVIDERS,
  DEFAULT_LAB_PROVIDER,
  type LabDecision,
  type LabProvider,
  type LabRun,
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
  /** Padrão da pergunta selecionada no topo da Central Visual. */
  selected: VisualStandard | null;
  runs: LabRun[];
  onRun: (run: LabRun) => void;
}

export function LabTab({ workspaceId, selected, runs, onRun }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [provider, setProvider] = useState<LabProvider>(DEFAULT_LAB_PROVIDER);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [profiling, setProfiling] = useState(false);
  const [attemptsUsed, setAttemptsUsed] = useState<number | null>(null);
  const [attemptsLimit, setAttemptsLimit] = useState<number | null>(null);

  const profile = profileOf(selected);
  const question = selected?.question ?? "";
  const refs = selected?.references || [];
  const hasReferences = refs.length >= 2;
  const isOwner = Boolean(userId && selected && selected.created_by === userId);




  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id ?? null);
    });
    return () => { cancelled = true; };
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

  const lastRun = runs[0] ?? null;
  const canRun = useMemo(
    () => Boolean(file && question.trim() && !running),
    [file, question, running],
  );

  const pushRun = (res: LabRun) => {
    onRun(res);
    if (res.combined.decision === "technical_failure") toast.error("Não foi possível verificar agora.");
  };

  const execute = async () => {
    if (!file || !question.trim()) return;
    setRunning(true);
    try {
      const imageBase64 = await blobToBase64(file);
      let ref: string | null = null;
      if (hasReference && selected?.reference_path && provider !== "google_gemini") {
        ref = await referenceBase64(selected.reference_path);
      }
      // Sessão e tentativa são emitidas pelo servidor: o cliente não escolhe o orçamento.
      const session = await startLabSession(workspaceId, selected?.id ?? null);
      if (!session.ok) {
        toast.error(session.message ?? "Limite de sessões atingido. Tente mais tarde.");
        return;
      }
      const attempt = await createLabAttempt(workspaceId, session.sessionId);
      if (!attempt.ok || !attempt.attemptId) {
        toast.error(
          attempt.reason === "attempt_limit_reached"
            ? "Esta sessão atingiu o limite de análises. Abra outra em alguns minutos."
            : "Não foi possível iniciar a análise agora.",
        );
        return;
      }
      setAttemptsUsed(attempt.attemptsUsed);
      setAttemptsLimit(attempt.attemptsLimit ?? null);
      const res = await runBenchmark({
        workspaceId,
        question,
        imageBase64,
        referenceBase64: ref,
        standardId: selected?.id ?? null,
        profile,
        sessionId: session.sessionId,
        attemptId: attempt.attemptId,
        provider,
      });

      pushRun({
        ...res,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        question,
        cameraBlockId: selected?.camera_block_id ?? null,
        source: "upload",
      });
    } catch (e) {
      toast.error("Não foi possível analisar agora. Tente novamente.");
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
      const out = await prepareStandard(workspaceId, selected.id);
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
          <CardTitle className="text-lg">Analisar uma foto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected && (
            <p className="rounded-lg border p-3 text-sm text-muted-foreground">
              Esta pergunta ainda não possui um padrão visual. Configure o padrão para testar aqui.
            </p>
          )}



          <div className="space-y-1 rounded-lg border p-3">
            <p className="text-sm font-medium">O que será verificado</p>
            <p className="text-sm text-muted-foreground">
              {question ? `“${question}”` : "Selecione a pergunta para ver o que será enviado à IA."}
            </p>
            <p className="text-xs text-muted-foreground">
              A pergunta é definida no bloco de câmera do projeto e não pode ser editada aqui.
            </p>
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
              <img
                src={previewUrl}
                alt="Pré-visualização da foto de teste"
                className="mt-2 max-h-48 rounded-lg object-contain"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Fotos do laboratório são analisadas em memória e não são armazenadas.
            </p>
          </div>

          {hasReference && (
            <p className="flex items-center gap-2 rounded-lg border p-3 text-xs text-muted-foreground">
              <ImageIcon className="h-4 w-4 shrink-0" aria-hidden />
              Referência do padrão será usada automaticamente.
            </p>
          )}

          <Button className="w-full bg-[#FF007F] hover:bg-[#e6006f]" disabled={!canRun} onClick={execute}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {running ? "Analisando…" : "Analisar foto"}
          </Button>

          <Button variant="outline" className="w-full" onClick={openCamera} disabled={profiling}>
            {profiling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
            Testar com a câmera
          </Button>

          {attemptsUsed != null && attemptsLimit != null && (
            <p className="text-xs text-muted-foreground">
              Sessão atual: {attemptsUsed} de {attemptsLimit} análises finais usadas.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            A prévia da câmera é interna: as imagens são analisadas em memória e nada é salvo.
          </p>

          {isOwner && (
            <div className="rounded-lg border">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
                onClick={() => setAdvancedOpen((v) => !v)}
                aria-expanded={advancedOpen}
              >
                Opções avançadas
                <span className="text-xs text-muted-foreground">{advancedOpen ? "ocultar" : "mostrar"}</span>
              </button>
              {advancedOpen && (
                <div className="space-y-2 border-t p-3">
                  <Label htmlFor="lab-provider">Avaliador visual (uso interno)</Label>
                  <select
                    id="lab-provider"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as LabProvider)}
                  >
                    {LAB_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {LAB_PROVIDERS.find((p) => p.value === provider)?.hint}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {lastRun ? (
          <RunDetail run={lastRun} />
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Escolha uma foto e clique em “Analisar foto” para ver o resultado real da IA.
            </CardContent>
          </Card>
        )}

        {runs.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Análises anteriores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {runs.slice(1, 8).map((r) => {
                const meta = DECISION_META[r.combined.decision];
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-xs">
                    <span className="truncate">{r.question}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      {r.source === "camera_v3" && <Badge variant="outline">câmera</Badge>}
                      <Badge variant="outline" className={meta.tone}>{meta.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {selected && (
        <CameraV3Preview
          open={cameraOpen}
          workspaceId={workspaceId}
          question={question}
          profile={profile}
          standardId={selected.id}
          referencePath={selected.reference_path}
          useReference={hasReference}
          onClose={() => setCameraOpen(false)}
          onResult={({ response, live }) =>
            pushRun({
              ...response,
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              question,
              cameraBlockId: selected.camera_block_id ?? null,
              source: "camera_v3",
              live,
            })
          }
        />
      )}
    </div>
  );
}

function RunDetail({ run }: { run: LabRun }) {
  const meta = DECISION_META[run.combined.decision];
  const Icon = meta.icon;
  const confidence = run.combined.confidence ?? run.judge?.confidence ?? null;
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
          <span>
            Referência: {run.referenceMode === "none" ? "não usada" : run.referenceMode === "multi_image" ? "comparada" : "descrita"}
          </span>
          <span>Tempo total: {run.totalLatencyMs} ms</span>
          {confidence != null && <span>Confiança: {Math.round(confidence * 100)}%</span>}
          {run.combined.condition_status && (
            <span>Condição: {CONDITION_STATUS_LABEL[run.combined.condition_status]}</span>
          )}
          {run.provider && <span>Avaliador: {run.provider}</span>}
          {run.modelId && <span>Modelo: {run.modelId}</span>}
          {run.usage && (
            <span>
              Consumo: {run.usage.calls} chamada(s)
              {run.usage.neurons != null && ` · ${run.usage.neurons.toFixed(2)} neurônios`}
              {run.usage.costUsd != null
                ? ` · US$ ${run.usage.costUsd.toFixed(5)}`
                : run.usage.estimatedUsd != null
                  ? ` · US$ ${run.usage.estimatedUsd.toFixed(5)}`
                  : ""}
              {run.usage.inputTokens != null &&
                ` · ${run.usage.inputTokens}/${run.usage.outputTokens ?? 0} tokens`}
            </span>
          )}

          {run.live && (
            <>
              <span>
                Tempo até encontrar: {run.live.timeToTargetMs == null ? "—" : `${(run.live.timeToTargetMs / 1000).toFixed(1)} s`}
              </span>
              <span>
                Verificações de IA ao vivo: {run.live.liveChecks}
                {run.live.avgLiveLatencyMs != null ? ` (${run.live.avgLiveLatencyMs} ms)` : ""}
              </span>
              {run.live.localChecks != null && (
                <span>Checagens locais (sem IA): {run.live.localChecks}</span>
              )}
            </>
          )}
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
