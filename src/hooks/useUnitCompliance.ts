import { useCallback, useEffect, useState } from "react";
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

export function useUnitCompliance(params: UseUnitComplianceParams): UseUnitComplianceResult {
  const { startDate, endDate, unitId } = params;
  const [data, setData] = useState<UnitComplianceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from("analytics_unit_daily_compliance")
      .select(
        "organization_id,unit_id,unit_name,reference_date,total_scheduled_tasks,completed_tasks,completed_on_time,completed_late,overdue_open_tasks,delayed_tasks,critical_failures,pending_evidences,weight_total,weight_done,compliance_percentage,total_due_tasks,due_completed_tasks,due_weight_total,due_weight_done,due_compliance_percentage",
      )
      .gte("reference_date", startDate)
      .lte("reference_date", endDate);

    if (unitId) q = q.eq("unit_id", unitId);

    const { data: rows, error: err } = await q;
    if (err) {
      setError(err.message);
      setData([]);
    } else {
      setData(aggregateByUnit((rows ?? []) as DailyRow[]));
    }
    setLoading(false);
  }, [startDate, endDate, unitId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime debounced: só quando a janela inclui hoje. Períodos totalmente
  // históricos não recebem invalidação contínua.
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (endDate < today) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        load();
      }, 800);
    };
    const ch = supabase
      .channel(`compliance-${startDate}-${endDate}-${unitId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_executions" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "evidences" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, trigger)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [load, startDate, endDate, unitId]);

  return { data, loading, error, refresh: load };
}
