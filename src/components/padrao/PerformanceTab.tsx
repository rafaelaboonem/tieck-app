import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp } from "lucide-react";
import {
  computeMetrics,
  computeUsage,
  download,
  exportRows,
  toCsv,
  type LabRun,
} from "@/lib/visual-standards";

export function PerformanceTab({
  runs: allRuns,
  cameraBlockId,
}: {
  runs: LabRun[];
  /** Pergunta selecionada no topo da Central Visual. */
  cameraBlockId?: string | null;
}) {
  const [workspaceWide, setWorkspaceWide] = useState(false);
  const scoped = cameraBlockId && !workspaceWide;
  const runs = scoped ? allRuns.filter((r) => r.cameraBlockId === cameraBlockId) : allRuns;
  const m = computeMetrics(runs);
  const usage = computeUsage(runs);

  const scopeToggle = cameraBlockId ? (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {scoped ? "Métricas da pergunta selecionada." : "Métricas de todas as perguntas desta sessão."}
      </p>
      <Button variant="outline" size="sm" onClick={() => setWorkspaceWide((v) => !v)}>
        {scoped ? "Ver todo o workspace" : "Ver apenas esta pergunta"}
      </Button>
    </div>
  ) : null;

  if (!runs.length) {
    return (
      <div className="space-y-4">
        {scopeToggle}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">
              Nenhuma análise nesta sessão ainda. Os indicadores aparecem assim que você analisar uma foto no laboratório.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Análises na sessão" value={String(m.total)} />
        <Metric label="Aprovadas" value={String(m.approved)} tone="text-emerald-700" />
        <Metric label="Nova foto" value={String(m.retake)} tone="text-amber-700" />
        <Metric label="Incertas" value={String(m.uncertain)} />
        <Metric label="Falhas técnicas" value={String(m.technicalFailures)} tone="text-rose-600" />
        <Metric
          label="Confiança média"
          value={m.avgConfidence == null ? "—" : `${Math.round(m.avgConfidence * 100)}%`}
        />
        <Metric label="Latência média" value={m.avgLatencyMs == null ? "—" : `${m.avgLatencyMs} ms`} />
        <Metric label="Com referência" value={`${m.withReference} de ${m.total}`} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Avaliador utilizado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            Provedor: {m.providers.length ? m.providers.join(", ") : "—"}
          </p>
          <p className="text-muted-foreground">
            Modelo: {m.models.length ? m.models.join(", ") : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            Estas métricas são coletadas automaticamente pela própria execução. Assertividade não é exibida porque
            não existe gabarito informado — sem ele o número não seria honesto.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Consumo de IA nesta sessão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Chamadas de IA" value={String(usage.aiCalls)} />
            <Metric label="Custo estimado (tokens)" value={`US$ ${usage.tokenCostUsd.toFixed(5)}`} />
            <Metric label="Neurônios (Cloudflare)" value={usage.neurons.toFixed(2)} />
            <Metric label="Checagens locais (sem IA)" value={String(usage.localChecks)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Tokens: {usage.inputTokens} de entrada · {usage.outputTokens} de saída
            {usage.cachedTokens > 0 && ` · ${usage.cachedTokens} em cache`}.
            {usage.neurons > 0 && ` Valor teórico dos neurônios: US$ ${usage.estimatedUsd.toFixed(5)}.`}
          </p>
          <p className="text-xs text-muted-foreground">
            Tokens e neurônios são contabilidades separadas: tokens vêm do avaliador Gemini e neurônios do
            provedor de rollback. O trabalho local (luz, foco, estabilidade e enquadramento) não consome IA.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={() => download(`tieck-lab-${Date.now()}.csv`, toCsv(runs), "text/csv;charset=utf-8")}
        >
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            download(`tieck-lab-${Date.now()}.json`, JSON.stringify(exportRows(runs), null, 2), "application/json")
          }
        >
          <Download className="mr-2 h-4 w-4" /> Exportar JSON
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        A exportação contém apenas decisões, motivos e tempos — nunca imagens ou dados brutos do modelo.
      </p>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-semibold ${tone ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
