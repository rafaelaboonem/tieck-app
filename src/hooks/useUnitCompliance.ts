import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { UnitComplianceData } from "@/components/dashboard/UnitComplianceChart";

// Regra oficial (idêntica à view analytics_unit_daily_compliance):
//   compliance_percentage      = 100 * SUM(weight_done)     / NULLIF(SUM(weight_total), 0)
//   due_compliance_percentage  = 100 * SUM(due_weight_done) / NULLIF(SUM(due_weight_total), 0)
// pesos: comum=1, importante=2, crítica=5
// Ao agregar por unidade em janelas multi-dia, somamos os pesos vindos da view e
// reaplicamos a fórmula — nunca média simples de porcentagens. Quando o
// denominador (weight_total ou due_weight_total) é 0 retornamos null.

export interface UseUnitComplianceParams {
  startDate: string; // YYYY-MM-DD (inclusivo)
  endDate: string; // YYYY-MM-DD (inclusivo)
  unitId?: string;
  /**
   * Escopo organizacional obrigatório (workspaces.id === organization_id).
   * Fornecido pelo consumidor — defesa em profundidade além da RLS.
   */
  organizationId?: string | null;
  enabled?: boolean;
}

interface DailyRow {
  organization_id: string;
  unit_id: string;
  unit_name: string;
  reference_date: string;
  total_scheduled_tasks: number;
  completed_tasks: number;
  completed_on_time: number;
  completed_late: number;
  overdue_open_tasks: number;
  delayed_tasks: number;
  critical_failures: number;
  pending_evidences: number;
  weight_total: number;
  weight_done: number;
  compliance_percentage: number | null;
  total_due_tasks: number;
  due_completed_tasks: number;
  due_weight_total: number;
  due_weight_done: number;
  due_compliance_percentage: number | null;
}

export type UnitComplianceRow = UnitComplianceData & {
  completedOnTime: number;
  completedLate: number;
  overdueOpenTasks: number;
  pendingEvidences: number;
  weightTotal: number;
  weightDone: number;
  totalDueTasks: number;
  dueCompletedTasks: number;
  dueWeightTotal: number;
  dueWeightDone: number;
  dueCompliancePercentage: number | null;
};

export interface UseUnitComplianceResult {
  data: UnitComplianceRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function aggregateByUnit(rows: DailyRow[]): UnitComplianceRow[] {
  const map = new Map<
    string,
    {
      unitId: string;
      unitName: string;
      total: number;
      completed: number;
      completedOnTime: number;
      completedLate: number;
      overdueOpen: number;
      delayed: number;
      critical: number;
      pendingEv: number;
      weightTotal: number;
      weightDone: number;
      totalDue: number;
      dueCompleted: number;
      dueWeightTotal: number;
      dueWeightDone: number;
    }
  >();

  for (const r of rows) {
    const key = r.unit_id;
    const cur = map.get(key) ?? {
      unitId: r.unit_id,
      unitName: r.unit_name,
      total: 0,
      completed: 0,
      completedOnTime: 0,
      completedLate: 0,
      overdueOpen: 0,
      delayed: 0,
      critical: 0,
      pendingEv: 0,
      weightTotal: 0,
      weightDone: 0,
      totalDue: 0,
      dueCompleted: 0,
      dueWeightTotal: 0,
      dueWeightDone: 0,
    };
    cur.total += r.total_scheduled_tasks ?? 0;
    cur.completed += r.completed_tasks ?? 0;
    cur.completedOnTime += r.completed_on_time ?? 0;
    cur.completedLate += r.completed_late ?? 0;
    cur.overdueOpen += r.overdue_open_tasks ?? 0;
    cur.delayed += r.delayed_tasks ?? 0;
    cur.critical += r.critical_failures ?? 0;
    cur.pendingEv += r.pending_evidences ?? 0;
    cur.weightTotal += r.weight_total ?? 0;
    cur.weightDone += r.weight_done ?? 0;
    cur.totalDue += r.total_due_tasks ?? 0;
    cur.dueCompleted += r.due_completed_tasks ?? 0;
    cur.dueWeightTotal += r.due_weight_total ?? 0;
    cur.dueWeightDone += r.due_weight_done ?? 0;
    map.set(key, cur);
  }

  return Array.from(map.values()).map((u) => ({
    unitId: u.unitId,
    unitName: u.unitName,
    completedTasks: u.completed,
    totalScheduledTasks: u.total,
    delayedTasks: u.delayed,
    criticalFailures: u.critical,
    compliancePercentage:
      u.weightTotal > 0 ? Math.round((1000 * u.weightDone) / u.weightTotal) / 10 : 0,
    completedOnTime: u.completedOnTime,
    completedLate: u.completedLate,
    overdueOpenTasks: u.overdueOpen,
    pendingEvidences: u.pendingEv,
    weightTotal: u.weightTotal,
    weightDone: u.weightDone,
    totalDueTasks: u.totalDue,
    dueCompletedTasks: u.dueCompleted,
    dueWeightTotal: u.dueWeightTotal,
    dueWeightDone: u.dueWeightDone,
    dueCompliancePercentage:
      u.dueWeightTotal > 0 ? Math.round((1000 * u.dueWeightDone) / u.dueWeightTotal) / 10 : null,
  }));
}

/** Escopo completo que produziu o estado publicado (org + datas + unidade). */
function complianceScope(p: {
  organizationId?: string | null;
  startDate: string;
  endDate: string;
  unitId?: string;
}): string {
  return `${p.organizationId ?? ""}|${p.startDate}|${p.endDate}|${p.unitId ?? ""}`;
}

export function useUnitCompliance(params: UseUnitComplianceParams): UseUnitComplianceResult {
  const { startDate, endDate, unitId, organizationId, enabled = true } = params;
  const canQuery = !!enabled && !!organizationId;
  const scope = complianceScope({ organizationId, startDate, endDate, unitId });
  // renderScope: escopo de dados + elegibilidade atual da consulta. A tag do
  // estado publicado inclui a elegibilidade — com enabled=false o retorno é
  // neutro sincronamente, e ao reabilitar (false → true) o estado anterior é
  // tratado como não concluído (loading=true) até a nova consulta publicar.
  const renderScope = `${scope}|${canQuery ? "on" : "off"}`;

  const [data, setData] = useState<UnitComplianceRow[]>([]);
  const [loading, setLoading] = useState(canQuery);
  const [error, setError] = useState<string | null>(null);

  // Identificador monotônico de requisição: somente a mais recente atualiza o
  // estado — resposta antiga que termina por último é descartada.
  const loadSeqRef = useRef(0);
  // Depois do unmount nenhuma requisição pendente pode escrever estado.
  const mountedRef = useRef(true);
  // Tag do renderScope que produziu o estado publicado — comparada
  // sincronamente a cada render, antes de qualquer efeito.
  const stateTagRef = useRef<string>(renderScope);
  // Escopo e gate ATUAIS, atualizados sincronamente durante o render (o valor
  // visto por qualquer callback assíncrono é sempre o mais recente).
  const currentScopeRef = useRef<string>(scope);
  const currentGateRef = useRef<boolean>(canQuery);
  currentScopeRef.current = scope;
  currentGateRef.current = canQuery;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSeqRef.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    // O escopo vem da PRÓPRIA closure (parâmetros capturados na criação do
    // callback) — nunca de currentScopeRef dentro do callback. Um callback
    // antigo de A chamado depois da troca para B é noop ANTES de qualquer
    // supabase.from: zero consulta com parâmetros de A, zero loading=true,
    // zero alteração de estado.
    const requestScope = scope;
    if (
      !mountedRef.current ||
      !currentGateRef.current ||
      !organizationId ||
      currentScopeRef.current !== requestScope
    ) {
      return;
    }
    const seq = ++loadSeqRef.current;
    // A resposta só pode escrever estado se: montado, requisição vigente E o
    // escopo atual ainda for o escopo capturado por ESTA requisição.
    const isCurrent = () =>
      mountedRef.current &&
      loadSeqRef.current === seq &&
      currentScopeRef.current === requestScope;
    setLoading(true);
    setError(null);
    try {
      // O filtro de organização é obrigatório — nunca consultar fora do escopo.
      let q = supabase
        .from("analytics_unit_daily_compliance")
        .select(
          "organization_id,unit_id,unit_name,reference_date,total_scheduled_tasks,completed_tasks,completed_on_time,completed_late,overdue_open_tasks,delayed_tasks,critical_failures,pending_evidences,weight_total,weight_done,compliance_percentage,total_due_tasks,due_completed_tasks,due_weight_total,due_weight_done,due_compliance_percentage",
        )
        .eq("organization_id", organizationId)
        .gte("reference_date", startDate)
        .lte("reference_date", endDate);

      if (unitId) q = q.eq("unit_id", unitId);

      const { data: rows, error: err } = await q;

      // Resposta antiga (troca de escopo/parâmetros) ou componente desmontado:
      // descarta sem tocar em nenhum estado.
      if (!isCurrent()) return;

      if (err) {
        stateTagRef.current = renderScope;
        setError(err.message);
        setData([]);
      } else {
        stateTagRef.current = renderScope;
        setData(aggregateByUnit((rows ?? []) as DailyRow[]));
      }
    } catch (e) {
      // Promise rejeitada (rede/exceção): fail-closed, sem dados antigos.
      if (!isCurrent()) return;
      console.error("useUnitCompliance: query threw", e);
      stateTagRef.current = renderScope;
      setError("Falha ao carregar dados de conformidade.");
      setData([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [startDate, endDate, unitId, organizationId, scope, renderScope]);

  useEffect(() => {
    // Troca de renderScope (escopo/params/elegibilidade): invalida requisições
    // pendentes do anterior e limpa o estado publicado.
    if (stateTagRef.current !== renderScope) {
      loadSeqRef.current += 1;
      setData([]);
      setError(null);
      stateTagRef.current = renderScope;
    }
    if (!canQuery) {
      // Sem escopo/sem permissão: zero consulta, zero canal, estado neutro.
      loadSeqRef.current += 1;
      setLoading(false);
      setData([]);
      setError(null);
      stateTagRef.current = renderScope;
      return;
    }
    void load();
  }, [load, canQuery, renderScope]);

  // Realtime debounced: só quando a janela inclui hoje, está habilitado e há
  // escopo. O canal é identificado pela organização e filtra eventos por
  // organization_id — eventos de outra organização não disparam recarga. O
  // trigger fecha sobre o load do seu próprio escopo: um trigger antigo é
  // bloqueado pelo gate de escopo dentro do load.
  useEffect(() => {
    if (!canQuery || !organizationId) return;
    const today = new Date().toISOString().slice(0, 10);
    if (endDate < today) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void load();
      }, 800);
    };
    const orgFilter = `organization_id=eq.${organizationId}`;
    const ch = supabase
      .channel(`compliance-${organizationId}-${startDate}-${endDate}-${unitId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_executions", filter: orgFilter },
        trigger,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "evidences", filter: orgFilter },
        trigger,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: orgFilter },
        trigger,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [load, startDate, endDate, unitId, organizationId, canQuery]);

  // Propriedade síncrona do render (antes de qualquer efeito): o estado só é
  // exposto se a tag pertencer ao renderScope ATUAL — cobre troca de escopo E
  // elegibilidade. canQuery=false devolve neutro imediatamente; reabilitar sem
  // resultado do novo renderScope devolve loading=true (nunca um vazio falso).
  // Sem setState durante o render.
  if (stateTagRef.current !== renderScope) {
    return { data: [], error: null, loading: canQuery, refresh: load };
  }

  return { data, loading, error, refresh: load };
}
