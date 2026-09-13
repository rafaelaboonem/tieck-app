import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type InsightSeverity = "positivo" | "atencao" | "critico" | "info";
export type InsightCategory =
  | "recorrencia"
  | "turno"
  | "tendencia"
  | "evidencia"
  | "horario"
  | "critico";

export interface Insight {
  id: string;
  title: string;
  detail: string;
  category: InsightCategory;
  severity: InsightSeverity;
  metric?: string;
  source: string;
}

export interface UseInsightsParams {
  /**
   * Escopo organizacional obrigatório (workspaces.id === organization_id).
   * Fornecido pelo consumidor — o hook nunca lê o WorkspaceContext.
   */
  organizationId?: string | null;
  /** Somente consulta quando true e organizationId for válido. */
  enabled?: boolean;
}

interface OverdueRow {
  unit_id: string | null;
  shift_id: string | null;
  task_id: string | null;
  title: string | null;
  scheduled_at: string | null;
}

interface CriticalRow {
  unit_id: string | null;
  title: string | null;
}

interface RankingRow {
  unit_id: string | null;
  unit_name: string | null;
  compliance_pct: number | null;
}

function topKey<T extends string | null | undefined>(rows: { key: T }[]): { key: T; count: number } | null {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.key == null) continue;
    map.set(r.key as string, (map.get(r.key as string) ?? 0) + 1);
  }
  let best: { key: T; count: number } | null = null;
  for (const [k, c] of map) {
    if (!best || c > best.count) best = { key: k as T, count: c };
  }
  return best;
}

export function useInsights(params: UseInsightsParams = {}) {
  const { organizationId, enabled = true } = params;
  const canQuery = !!enabled && !!organizationId;

  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(canQuery);
  const [isEmpty, setIsEmpty] = useState(true);
  // Fail-closed: qualquer falha nas 5 consultas invalida o resultado inteiro.
  // O detalhe técnico (SQL/tabela/schema) nunca sai daqui — a UI mostra apenas
  // uma mensagem genérica.
  const [error, setError] = useState(false);

  // Identificador monotônico de requisição: somente a requisição mais recente
  // pode atualizar o estado — uma resposta antiga que termina por último é
  // descartada sem tocar em nenhum estado (proteção contra corridas).
  const loadSeqRef = useRef(0);
  // Depois do unmount nenhuma requisição pendente pode escrever estado.
  const mountedRef = useRef(true);
  // Escopo (workspace) dono do estado publicado atual.
  const lastScopeRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Invalida toda requisição pendente no unmount.
      loadSeqRef.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    if (!mountedRef.current || !organizationId) return;
    const seq = ++loadSeqRef.current;
    const isCurrent = () => mountedRef.current && loadSeqRef.current === seq;
    setLoading(true);
    setError(false);
    try {
      // Todas as consultas recebem exatamente o organizationId atual — defesa
      // em profundidade além da RLS.
      const [overdueRes, criticalRes, rankRes, evPendRes, evRejRes] = await Promise.all([
        supabase
          .from("analytics_overdue_tasks")
          .select("unit_id,shift_id,task_id,title,scheduled_at")
          .eq("organization_id", organizationId),
        supabase
          .from("analytics_critical_failures")
          .select("unit_id,title")
          .eq("organization_id", organizationId),
        supabase
          .from("analytics_unit_ranking")
          .select("unit_id,unit_name,compliance_pct")
          .eq("organization_id", organizationId),
        supabase
          .from("evidences")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .eq("organization_id", organizationId),
        supabase
          .from("evidences")
          .select("id", { count: "exact", head: true })
          .eq("status", "rejected")
          .eq("organization_id", organizationId),
      ]);

      // Resposta de uma requisição antiga ou de um componente já desmontado:
      // descarta sem alterar insights, isEmpty, error ou loading.
      if (!isCurrent()) return;

      // Fail-closed: dados parciais nunca são renderizados como se fossem completos.
      const failed =
        overdueRes.error !== null ||
        criticalRes.error !== null ||
        rankRes.error !== null ||
        evPendRes.error !== null ||
        evRejRes.error !== null;
      if (failed) {
        // Detalhe técnico vai apenas para console (auditoria), nunca para a UI.
        console.error("useInsights: one or more insight queries failed");
        setInsights([]);
        setIsEmpty(false);
        setError(true);
        return;
      }

      const overdue = (overdueRes.data ?? []) as OverdueRow[];
      const critical = (criticalRes.data ?? []) as CriticalRow[];
      const ranking = (rankRes.data ?? []) as RankingRow[];
      const pendingEv = evPendRes.count ?? 0;
      const rejectedEv = evRejRes.count ?? 0;

      const result: Insight[] = [];

      // 1. Reincidência — tarefa mais atrasada
      const topTask = topKey(overdue.map((r) => ({ key: r.task_id })));
      if (topTask && topTask.count >= 2) {
        const title = overdue.find((r) => r.task_id === topTask.key)?.title ?? "Tarefa";
        result.push({
          id: "recorrencia-tarefa",
          title: `“${title}” atrasou ${topTask.count}x`,
          detail: `Esta tarefa acumula ${topTask.count} atrasos recentes — verifique causa raiz.`,
          category: "recorrencia",
          severity: "critico",
          metric: `${topTask.count}x`,
          source: "analytics_overdue_tasks",
        });
      }

      // 2. Turno — turno com mais atrasos
      const topShift = topKey(overdue.map((r) => ({ key: r.shift_id })));
      const totalOverdue = overdue.length;
      if (topShift && totalOverdue > 0) {
        const pct = Math.round((topShift.count / totalOverdue) * 100);
        if (pct >= 40) {
          result.push({
            id: "turno-pico",
            title: `Um turno concentra ${pct}% dos atrasos`,
            detail: `${topShift.count} de ${totalOverdue} atrasos vêm do mesmo turno.`,
            category: "turno",
            severity: "atencao",
            metric: `${pct}%`,
            source: "analytics_overdue_tasks",
          });
        }
      }

      // 3. Tendência — melhor unidade
      if (ranking.length > 0) {
        const sorted = [...ranking].sort((a, b) => (b.compliance_pct ?? 0) - (a.compliance_pct ?? 0));
        const best = sorted[0];
        if (best?.compliance_pct != null && best.compliance_pct >= 90) {
          result.push({
            id: "tendencia-top",
            title: `${best.unit_name ?? "Unidade"} lidera com ${best.compliance_pct}% de conformidade`,
            detail: `Melhor unidade nas últimas 24h.`,
            category: "tendencia",
            severity: "positivo",
            metric: `${best.compliance_pct}%`,
            source: "analytics_unit_ranking",
          });
        }
        const worst = sorted[sorted.length - 1];
        if (worst?.compliance_pct != null && worst.compliance_pct < 70 && worst.unit_id !== best?.unit_id) {
          result.push({
            id: "tendencia-bottom",
            title: `${worst.unit_name ?? "Unidade"} abaixo do esperado (${worst.compliance_pct}%)`,
            detail: `Conformidade abaixo de 70% nas últimas 24h.`,
            category: "tendencia",
            severity: "atencao",
            metric: `${worst.compliance_pct}%`,
            source: "analytics_unit_ranking",
          });
        }
      }

      // 4. Evidências pendentes/rejeitadas
      if (pendingEv > 0) {
        result.push({
          id: "evidencia-pending",
          title: `${pendingEv} evidência${pendingEv > 1 ? "s" : ""} aguardando revisão`,
          detail: `Fotos enviadas ainda não foram aprovadas ou rejeitadas.`,
          category: "evidencia",
          severity: pendingEv >= 10 ? "atencao" : "info",
          metric: `${pendingEv}`,
          source: "evidences",
        });
      }
      if (rejectedEv > 0) {
        result.push({
          id: "evidencia-rejected",
          title: `${rejectedEv} evidência${rejectedEv > 1 ? "s" : ""} rejeitada${rejectedEv > 1 ? "s" : ""}`,
          detail: `Reenvio necessário — verifique o motivo em cada evidência.`,
          category: "evidencia",
          severity: "atencao",
          metric: `${rejectedEv}`,
          source: "evidences",
        });
      }

      // 5. Horário — pico de atrasos por hora
      const hourMap = new Map<number, number>();
      for (const r of overdue) {
        if (!r.scheduled_at) continue;
        const h = new Date(r.scheduled_at).getHours();
        hourMap.set(h, (hourMap.get(h) ?? 0) + 1);
      }
      if (hourMap.size > 0) {
        const [peakHour, peakCount] = [...hourMap.entries()].sort((a, b) => b[1] - a[1])[0];
        if (peakCount >= 2) {
          result.push({
            id: "horario-pico",
            title: `Pico de atrasos entre ${peakHour}h e ${peakHour + 1}h`,
            detail: `${peakCount} atraso${peakCount > 1 ? "s" : ""} concentrado${peakCount > 1 ? "s" : ""} nessa janela.`,
            category: "horario",
            severity: "info",
            metric: `${peakHour}h–${peakHour + 1}h`,
            source: "analytics_overdue_tasks",
          });
        }
      }

      // 6. Crítico — unidades com tarefa crítica não realizada hoje
      const critUnits = new Set(critical.map((r) => r.unit_id).filter(Boolean));
      if (critUnits.size > 0) {
        result.push({
          id: "critico-hoje",
          title: `${critUnits.size} unidade${critUnits.size > 1 ? "s" : ""} com tarefa crítica pendente hoje`,
          detail: `Tarefas de peso crítico não realizadas até agora.`,
          category: "critico",
          severity: "critico",
          metric: `${critUnits.size}`,
          source: "analytics_critical_failures",
        });
      }

      // A requisição pode ter sido substituída durante o processamento —
      // somente a mais recente publica o resultado.
      if (!isCurrent()) return;

      setInsights(result);
      setIsEmpty(result.length === 0);
      setError(false);
    } catch (err) {
      // Promise rejeitada (falha de rede, exceção do cliente): mesmo tratamento
      // fail-closed de uma resposta com error — nunca dados parciais.
      if (!isCurrent()) return;
      console.error("useInsights: insight queries threw", err);
      setInsights([]);
      setIsEmpty(false);
      setError(true);
    } finally {
      // Encerra o carregamento somente para a requisição vigente.
      if (isCurrent()) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    // Troca de escopo: invalida imediatamente toda requisição pendente do
    // workspace anterior e limpa o estado — nunca renderizar insights de A
    // sob o escopo B.
    if (lastScopeRef.current !== (organizationId ?? null)) {
      lastScopeRef.current = organizationId ?? null;
      loadSeqRef.current += 1;
      setInsights([]);
      setIsEmpty(true);
      setError(false);
    }
    if (!canQuery) {
      // Sem escopo/sem permissão: zero consulta, zero subscription, estado neutro.
      loadSeqRef.current += 1;
      setLoading(false);
      setInsights([]);
      setIsEmpty(true);
      setError(false);
      return;
    }
    void load();
    // Canal identificado pelo escopo; eventos de outra organização não disparam recarga.
    const ch = supabase
      .channel(`insights-${organizationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_executions", filter: `organization_id=eq.${organizationId}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "evidences", filter: `organization_id=eq.${organizationId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, canQuery, organizationId]);

  return { insights, loading, isEmpty, error, refresh: load };
}
