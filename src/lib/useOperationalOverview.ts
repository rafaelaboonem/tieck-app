import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UnitRanking {
  organization_id: string | null;
  unit_id: string | null;
  unit_name: string | null;
  compliance_pct: number | null;
  overdue_count: number | null;
  critical_missed: number | null;
}

export interface OperationalOverview {
  ranking: UnitRanking[];
  overdueCount: number;
  criticalMissed: number;
  pendingEvidences: number;
  avgCompliance: number | null;
  isEmpty: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useOperationalOverview(): OperationalOverview {
  const [ranking, setRanking] = useState<UnitRanking[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [criticalMissed, setCriticalMissed] = useState(0);
  const [pendingEvidences, setPendingEvidences] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [rank, over, crit, ev] = await Promise.all([
      supabase.from("analytics_unit_ranking").select("*"),
      supabase.from("analytics_overdue_tasks").select("id", { count: "exact", head: true }),
      supabase.from("analytics_critical_failures").select("id", { count: "exact", head: true }),
      supabase.from("evidences").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    setRanking((rank.data as UnitRanking[] | null) ?? []);
    setOverdueCount(over.count ?? 0);
    setCriticalMissed(crit.count ?? 0);
    setPendingEvidences(ev.count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("op-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "task_executions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "evidences" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const avgCompliance =
    ranking.length > 0
      ? Math.round(
          (ranking.reduce((s, r) => s + (r.compliance_pct ?? 0), 0) / ranking.length) * 10,
        ) / 10
      : null;

  return {
    ranking,
    overdueCount,
    criticalMissed,
    pendingEvidences,
    avgCompliance,
    isEmpty: ranking.length === 0 && overdueCount === 0 && criticalMissed === 0,
    loading,
    refresh: load,
  };
}