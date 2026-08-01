import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, Check, X } from "lucide-react";
import {
  MIN_LABELED_SAMPLE,
  computeMetrics,
  computeRelease,
  computeUsage,
  download,
  exportRows,
  toCsv,
  type LabRun,
} from "@/lib/visual-standards";

export function PerformanceTab({ runs }: { runs: LabRun[] }) {
  const m = computeMetrics(runs);
  const release = computeRelease(runs);
  const usage = computeUsage(runs);

  if (!runs.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground" />
          <p className="max-w-md text-sm text-muted-foreground">
            Nenhum teste nesta sessão ainda. Os indicadores aparecem assim que você rodar testes no laboratório.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Testes na sessão" value={String(m.total)} />
        <Metric label="Acertos" value={String(m.hits)} />
        <Metric label="Falsas aprovações" value={String(m.falseApprovals)} tone="text-rose-600" />
        <Metric label="Falsas reprovações" value={String(m.falseRejections)} tone="text-amber-600" />
        <Metric label="Incertos" value={String(m.uncertain)} />
        <Metric label="Falhas técnicas" value={String(m.technicalFailures)} />
        <Metric
          label="Concordância entre etapas"
          value={m.agreement == null ? "—" : `${Math.round(m.agreement * 100)}%`}
        />
        <Metric label="Tempo médio" value={m.avgLatencyMs == null ? "—" : `${m.avgLatencyMs} ms`} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Assertividade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-2xl font-semibold">
            {m.accuracy == null ? "—" : `${Math.round(m.accuracy * 100)}%`}
          </p>
          {!m.enoughSample && (
            <p className="text-xs text-amber-700">
              Amostra pequena: com menos de {MIN_LABELED_SAMPLE} testes classificados, este número é apenas indicativo.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Com referência: {m.withReference} · Sem referência: {m.withoutReference}
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
            <Metric label="Neurônios" value={usage.neurons.toFixed(2)} />
            <Metric label="Custo estimado" value={`US$ ${usage.estimatedUsd.toFixed(5)}`} />
            <Metric label="Checagens locais (sem IA)" value={String(usage.localChecks)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Tokens: {usage.inputTokens} de entrada · {usage.outputTokens} de saída.
            {usage.avgNeuronsPerRun != null && ` Média por teste: ${usage.avgNeuronsPerRun.toFixed(2)} neurônios.`}
          </p>
          <p className="text-xs text-muted-foreground">
            O trabalho local (luz, foco, estabilidade e enquadramento) não consome IA. A IA só é chamada quando a cena
            fica estável, respeitando o intervalo mínimo e o limite por sessão.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Trava de liberação da câmera</CardTitle>
        </CardHeader>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className={release.ready ? "text-emerald-700" : "text-muted-foreground"}>
            {release.ready
              ? "Todos os casos obrigatórios passaram nesta sessão."
              : "A câmera continua em prévia interna até todos os casos passarem."}
          </p>
          <ul className="space-y-1">
            {release.cases.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-xs">
                {c.passed ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                ) : (
                  <X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                )}
                <span className={c.passed ? "" : "text-muted-foreground"}>{c.label}</span>
                {c.falseApproval && <span className="text-rose-600">falsa aprovação</span>}
              </li>
            ))}
          </ul>
          {release.blockedByFalseApproval && (
            <p className="text-xs text-rose-600">
              Há falsa aprovação registrada: a liberação fica bloqueada até um novo teste correto.
            </p>
          )}
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
