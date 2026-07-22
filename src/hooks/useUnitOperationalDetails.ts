import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutionDbStatus, TaskWeight } from "@/lib/task-execution-status";

export interface UnitOperationalDetailsFilters {
  unitId: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
}

export interface EvidenceItem {
  id: string;
  storagePath: string;
  referencePath: string | null;
  status: string | null;
  submittedAt: string;
  submittedBy: string | null;
  taskExecutionId: string;
}

export interface OperationalExecution {
  executionId: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string | null;
  taskCode: string | null;
  weight: TaskWeight;
  shiftId: string | null;
  shiftName: string | null;
  scheduledAt: string;
  executedAt: string | null;
  status: ExecutionDbStatus;
  notes: string | null;
  executedBy: string | null;
  executedByName: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  evidences: EvidenceItem[];
  evidenceCount: number;
  pendingEvidences: number;
}

interface RawExecution {
  id: string;
  task_id: string;
  shift_id: string | null;
  scheduled_at: string;
  executed_at: string | null;
  status: ExecutionDbStatus;
  notes: string | null;
  executed_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  tasks: {
    id: string;
    title: string;
    description: string | null;
    code: string | null;
    weight: TaskWeight;
  } | null;
  shifts: { id: string; name: string } | null;
}

export interface UseUnitOperationalDetailsResult {
  data: OperationalExecution[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function endOfDayISO(dateISO: string): string {
  return `${dateISO}T23:59:59.999Z`;
}
function startOfDayISO(dateISO: string): string {
  return `${dateISO}T00:00:00.000Z`;
}

export function useUnitOperationalDetails(
  filters: UnitOperationalDetailsFilters,
): UseUnitOperationalDetailsResult {
  const { unitId, startDate, endDate } = filters;
  const [data, setData] = useState<OperationalExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError(null);

    const { data: rows, error: err } = await supabase
      .from("task_executions")
      .select(
        `id,task_id,shift_id,scheduled_at,executed_at,status,notes,executed_by,cancelled_at,cancellation_reason,
         tasks:task_id ( id, title, description, code, weight ),
         shifts:shift_id ( id, name )`,
      )
      .eq("unit_id", unitId)
      .gte("scheduled_at", startOfDayISO(startDate))
      .lte("scheduled_at", endOfDayISO(endDate))
      .order("scheduled_at", { ascending: true });

    if (err) {
      setError(err.message);
      setData([]);
      setLoading(false);
      return;
    }

    const executions = (rows ?? []) as unknown as RawExecution[];
    const executionIds = executions.map((e) => e.id);
    const userIds = Array.from(
      new Set(executions.map((e) => e.executed_by).filter((v): v is string => !!v)),
    );

    const [evRes, profRes] = await Promise.all([
      executionIds.length
        ? supabase
            .from("evidences")
            .select(
              "id,task_execution_id,storage_path,reference_path,status,submitted_at,submitted_by",
            )
            .in("task_execution_id", executionIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from("profiles").select("id,display_name,first_name,last_name").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (evRes.error) {
      setError(evRes.error.message);
      setData([]);
      setLoading(false);
      return;
    }

    // Agrupamento estrito por task_execution_id — nunca por task_id, dia ou turno.
    const evidencesByExecution = new Map<string, EvidenceItem[]>();
    for (const e of (evRes.data ?? []) as Array<{
      id: string;
      task_execution_id: string;
      storage_path: string;
      reference_path: string | null;
      status: string | null;
      submitted_at: string;
      submitted_by: string | null;
    }>) {
      if (!e.task_execution_id) continue;
      const arr = evidencesByExecution.get(e.task_execution_id) ?? [];
      arr.push({
        id: e.id,
        storagePath: e.storage_path,
        referencePath: e.reference_path,
        status: e.status,
        submittedAt: e.submitted_at,
        submittedBy: e.submitted_by,
        taskExecutionId: e.task_execution_id,
      });
      evidencesByExecution.set(e.task_execution_id, arr);
    }

    const profileById = new Map<string, string>();
    for (const p of (profRes.data ?? []) as Array<{
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
    }>) {
      const name =
        p.display_name ??
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ??
        null;
      if (name) profileById.set(p.id, name);
    }

    const items: OperationalExecution[] = executions.map((e) => {
      const evList = evidencesByExecution.get(e.id) ?? [];
      const pending = evList.filter(
        (ev) => (ev.status ?? "pending").toLowerCase() === "pending",
      ).length;
      return {
        executionId: e.id,
        taskId: e.task_id,
        taskTitle: e.tasks?.title ?? "Tarefa",
        taskDescription: e.tasks?.description ?? null,
        taskCode: e.tasks?.code ?? null,
        weight: e.tasks?.weight ?? "comum",
        shiftId: e.shift_id,
        shiftName: e.shifts?.name ?? null,
        scheduledAt: e.scheduled_at,
        executedAt: e.executed_at,
        status: e.status,
        notes: e.notes,
        executedBy: e.executed_by,
        executedByName: e.executed_by ? profileById.get(e.executed_by) ?? null : null,
        cancelledAt: e.cancelled_at,
        cancellationReason: e.cancellation_reason,
        evidences: evList,
        evidenceCount: evList.length,
        pendingEvidences: pending,
      };
    });

    setData(items);
    setLoading(false);
  }, [unitId, startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime debounced — só se o período incluir hoje ou for futuro.
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (endDate < today) return;
    if (!unitId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void load();
      }, 800);
    };
    const ch = supabase
      .channel(`unit-ops-${unitId}-${startDate}-${endDate}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_executions", filter: `unit_id=eq.${unitId}` },
        trigger,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "evidences", filter: `unit_id=eq.${unitId}` },
        trigger,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "evidence_reviews" }, trigger)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [load, unitId, startDate, endDate]);

  return { data, loading, error, refresh: load };
}