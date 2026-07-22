import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type EvidenceAnalysisStatus =
  | "pending"
  | "processing"
  | "normal"
  | "anomaly"
  | "manual_review"
  | "failed";

export type EvidenceAnalysisResult = {
  status: EvidenceAnalysisStatus;
  publicMessage: string;
  canContinue: boolean;
  requiresResubmit: boolean;
  finishedAt: string | null;
};

const FINAL_STATUSES = new Set<EvidenceAnalysisStatus>([
  "normal",
  "anomaly",
  "manual_review",
  "failed",
]);

const FIRST_DELAY_MS = 2_000;
const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 15_000;
const TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Poll the public `status` action for a single analysis token.
 * - primeira consulta ~2s;
 * - backoff gradual até 15s;
 * - para em estado final;
 * - para no unmount;
 * - impede dois loops para o mesmo token;
 * - timeout total (2min) com uma última consulta ao final;
 * - usa somente a ação pública `status`.
 */
export function useChecklistEvidenceAnalysis(analysisToken: string | null) {
  const [result, setResult] = useState<EvidenceAnalysisResult | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const activeTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!analysisToken) {
      setResult(null);
      setIsPolling(false);
      setTimedOut(false);
      return;
    }
    // guarda contra dois loops para o mesmo token
    if (activeTokenRef.current === analysisToken) return;
    activeTokenRef.current = analysisToken;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    let attempt = 0;

    setIsPolling(true);
    setTimedOut(false);
    setResult(null);

    const queryOnce = async (): Promise<EvidenceAnalysisResult | null> => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "analyze-checklist-evidence",
          { body: { action: "status", analysisToken } },
        );
        if (cancelled) return null;
        if (error || !data || typeof data !== "object") return null;
        const r = data as EvidenceAnalysisResult;
        if (!r.status) return null;
        setResult(r);
        return r;
      } catch {
        return null;
      }
    };

    const schedule = (delay: number) => {
      timer = setTimeout(loop, delay);
    };

    const loop = async () => {
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      const timedOutNow = elapsed >= TIMEOUT_MS;
      const r = await queryOnce();
      if (cancelled) return;
      if (r && FINAL_STATUSES.has(r.status)) {
        setIsPolling(false);
        return;
      }
      if (timedOutNow) {
        setIsPolling(false);
        setTimedOut(true);
        return;
      }
      attempt++;
      const remaining = TIMEOUT_MS - (Date.now() - startedAt);
      const backoff = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS + attempt * 1_500);
      const delay = Math.max(500, Math.min(backoff, remaining));
      schedule(delay);
    };

    schedule(FIRST_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (activeTokenRef.current === analysisToken) activeTokenRef.current = null;
      setIsPolling(false);
    };
  }, [analysisToken]);

  return { result, isPolling, timedOut };
}
