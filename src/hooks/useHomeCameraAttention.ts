import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  loadHomeCameraAttention,
  toHomeCameraAttentionMap,
  type HomeCameraAttentionByChecklist,
  type HomeCameraAttempt,
  type HomeCameraResponse,
} from "@/lib/home-camera-attention";

/**
 * Home 6A.3 — loads Camera AI rejection signals for the checklists currently
 * visible on `/inicio`.
 *
 * Secondary enrichment: the Home never waits for these signals and a failure
 * is fail-closed (no IA priorities added). Queries are strictly scoped to the
 * visible checklist ids and only enabled when the RBAC gate allows it
 * (`canLoadHomeCameraAttention` — Viewer never triggers administrative
 * submission queries).
 */
export function useHomeCameraAttention({
  checklists,
  enabled,
}: {
  checklists: any[];
  enabled: boolean;
}): HomeCameraAttentionByChecklist {
  const [attention, setAttention] = useState<HomeCameraAttentionByChecklist>({});

  const visibleIds = checklists
    .map((c) => c?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const visibleKey = visibleIds.join(",");

  useEffect(() => {
    let cancelled = false;
    if (!enabled || visibleIds.length === 0) {
      setAttention({});
      return;
    }

    (async () => {
      const result = await loadHomeCameraAttention(
        {
          fetchResponses: async (ids) => {
            const { data, error } = await supabase
              .from("checklist_responses")
              .select("id, checklist_id, submitted_at, created_at")
              .in("checklist_id", ids)
              .not("submitted_at", "is", null);
            return { data: (data ?? []) as HomeCameraResponse[], error };
          },
          fetchAttempts: async (responseIds) => {
            const { data, error } = await supabase
              .from("camera_ai_attempts")
              .select(
                "id, response_id, evidence_id, block_id, status, decision, code, evidence, completed_at, updated_at, created_at"
              )
              .in("response_id", responseIds);
            return { data: (data ?? []) as HomeCameraAttempt[], error };
          },
        },
        visibleIds
      );
      if (!cancelled) setAttention(toHomeCameraAttentionMap(result));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, visibleKey]);

  return attention;
}