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
   * Turno global (6B.3). Ausente = TODOS os turnos (inclusive execuções sem
   * turno). Quando informado, o cliente aplica `.eq("shift_id", shiftId)` — a
   * view agora tem grão por turno e o filtro apenas recorta o conjunto.
   */
  shiftId?: string;
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
  shift_id: string | null;
  shift_name: string | null;
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

/**
 * Contrato estrutural mínimo do cliente para a view analítica. A dimensão de
 * turno (6B.3) ainda não existe em `supabase/types.ts`, porque a migration
 * 20260914170000 não foi aplicada remotamente — tipamos apenas o encadeamento
 * usado aqui, sem alterar tipos gerados a partir de um schema que ainda não os
 * possui (mesma estratégia de useUnitOccurrenceMetrics/useShiftOptions).
 */
type ComplianceQuery = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  eq: (column: string, value: string) => ComplianceQuery;
  gte: (column: string, value: string) => ComplianceQuery;
  lte: (column: string, value: string) => ComplianceQuery;
};
type ComplianceViewClient = {
  from: (table: "analytics_unit_daily_compliance") => {
    select: (columns: string) => ComplianceQuery;
  };
};

const complianceView = supabase as unknown as ComplianceViewClient;

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
  shiftId?: string;
}): string {
  // O turno faz parte do escopo: trocar de turno invalida respostas em voo
  // exatamente como trocar de unidade (6B.1B/6B.3).
  return `${p.organizationId ?? ""}|${p.startDate}|${p.endDate}|${p.unitId ?? ""}|${p.shiftId ?? ""}`;
}

export function useUnitCompliance(params: UseUnitComplianceParams): UseUnitComplianceResult {
  const { startDate, endDate, unitId, shiftId, organizationId, enabled = true } = params;
  const canQuery = !!enabled && !!organizationId;
  const scope = complianceScope({ organizationId, startDate, endDate, unitId, shiftId });
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
  // Escopo ATUAL, atualizado sincronamente durante o render.
  const currentScopeRef = useRef<string>(scope);
  // Tag do renderScope atual, usada por isCurrent para bloquear callbacks
  // antigos (inclusive refresh/load criados com enabled=false).
  const currentRenderScopeRef = useRef<string>(renderScope);
  const currentGateRef = useRef<boolean>(canQuery);
  currentScopeRef.current = scope;
  currentRenderScopeRef.current = renderScope;
  currentGateRef.current = canQuery;
  // Ciclo de render: identidade MONOTÔNICA do ciclo lógico de renderScope. A
  // igualdade de CONTEÚDO de renderScope não distingue A1 de A2 (A→B→A): ao
  // reentrar em A, um callback criado no primeiro A voltaria a passar nos
  // gates. O ciclo só avança quando o renderScope muda de verdade, é
  // incrementado sincronamente durante o render (sem setState, sem render
  // extra, sem dependência instável) e cada closure captura o seu
  // requestCycle — depois de abandonado, um callback permanece stale para
  // sempre.
  const cycleRef = useRef(0);
  const cycleScopeRef = useRef<string>(renderScope);
  if (cycleScopeRef.current !== renderScope) {
    cycleScopeRef.current = renderScope;
    cycleRef.current += 1;
  }
  const cycle = cycleRef.current;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSeqRef.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    // O escopo e a elegibilidade vêm da PRÓPRIA closure (parâmetros/
    // tags capturados na criação do callback) — nunca de refs atualizadas
    // tardiamente dentro do callback. Um callback criado com enabled=false
    // (renderScope ...|off) e um refresh desabilitado continuam noop para
    // sempre: mesmo após enabled voltar a true, mesmo com mesmo
    // organizationId/parâmetros, mesmo durante ou após a carga atual.
    const requestScope = scope;
    const requestRenderScope = renderScope;
    const requestEnabled = canQuery;
    // Ciclo capturado pela PRÓPRIA closure: um callback do ciclo anterior não
    // é revalidado quando o conteúdo do escopo volta a coincidir (A→B→A).
    const requestCycle = cycle;
    if (
      !mountedRef.current ||
      !requestEnabled ||
      !currentGateRef.current ||
      !organizationId ||
      currentScopeRef.current !== requestScope ||
      currentRenderScopeRef.current !== requestRenderScope ||
      cycleRef.current !== requestCycle
    ) {
      return;
    }
    const seq = ++loadSeqRef.current;
    // A resposta só pode escrever estado se: montado, requisição vigente,
    // gate atual e SAME renderScope capturado — um callback antigo do
    // workspace A ou um refresh desabilitado não pode publicar sob B mesmo
    // que o escopo de dados coincida.
    const isCurrent = () =>
      mountedRef.current &&
      loadSeqRef.current === seq &&
      currentGateRef.current &&
      currentScopeRef.current === requestScope &&
      currentRenderScopeRef.current === requestRenderScope &&
      cycleRef.current === requestCycle;
    setLoading(true);
    setError(null);
    try {
      // O filtro de organização é obrigatório — nunca consultar fora do escopo.
      let q = complianceView
        .from("analytics_unit_daily_compliance")
        .select(
          "organization_id,unit_id,unit_name,reference_date,shift_id,shift_name,total_scheduled_tasks,completed_tasks,completed_on_time,completed_late,overdue_open_tasks,delayed_tasks,critical_failures,pending_evidences,weight_total,weight_done,compliance_percentage,total_due_tasks,due_completed_tasks,due_weight_total,due_weight_done,due_compliance_percentage",
        )
        .eq("organization_id", organizationId)
        .gte("reference_date", startDate)
        .lte("reference_date", endDate);

      if (unitId) q = q.eq("unit_id", unitId);
      // Sem shiftId NENHUM filtro de turno é aplicado: "todos os turnos" inclui
      // as execuções sem turno, que ficam de fora de qualquer turno específico.
      if (shiftId) q = q.eq("shift_id", shiftId);

      const { data: rows, error: err } = await q;

      // Resposta antiga (troca de escopo/parâmetros) ou componente desmontado:
      // descarta sem tocar em nenhum estado.
      if (!isCurrent()) return;

      if (err) {
        stateTagRef.current = requestRenderScope;
        setError(err.message);
        setData([]);
      } else {
        stateTagRef.current = requestRenderScope;
        setData(aggregateByUnit((rows ?? []) as unknown as DailyRow[]));
      }
    } catch (e) {
      // Promise rejeitada (rede/exceção): fail-closed, sem dados antigos.
      if (!isCurrent()) return;
      console.error("useUnitCompliance: query threw", e);
      stateTagRef.current = requestRenderScope;
      setError("Falha ao carregar dados de conformidade.");
      setData([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [startDate, endDate, unitId, shiftId, organizationId, scope, renderScope, cycle, canQuery]);

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
    // Todo renderScope atualiza a referência que isCurrent usa, e todo
    // load/refresh captura requestRenderScope + requestEnabled.
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
      // O nome do canal inclui o turno: trocar de turno abre um canal próprio
      // em vez de reaproveitar (por nome) o canal do recorte anterior.
      .channel(
        `compliance-${organizationId}-${startDate}-${endDate}-${unitId ?? "all"}-${shiftId ?? "all"}`,
      )
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
  }, [load, startDate, endDate, unitId, shiftId, organizationId, canQuery]);

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
