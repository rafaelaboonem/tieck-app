import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  loadMyExecutionOccurrences,
  type HomeExecutionOccurrence,
  type MyExecutionOccurrencesDatabase,
} from "@/lib/home-execution-occurrences";

/**
 * Home 6B.2C — the authenticated member's own OPEN scheduled occurrences.
 *
 * Read access is resolved server-side by
 * `list_my_checklist_execution_occurrences(p_workspace_id)`: the database pins
 * the result to the caller's active membership and to the requested workspace,
 * so this hook can never widen what the member already owns. The client cast is
 * the single explicit boundary (supabase/types.ts untouched).
 *
 * Scope ownership (same invariant as 6B.1B/6B.1B.4, applied here):
 *   * the published state carries the render scope that produced it, so on the
 *     first render after a scope change the previous workspace's occurrences are
 *     never returned — the effect-based clear alone would run too late;
 *   * a monotonic REQUEST sequence discards out-of-order responses;
 *   * a monotonic RENDER CYCLE, advanced during render whenever the data scope
 *     really changes, distinguishes the first A from a re-entered A (A→B→A) —
 *     scope equality alone cannot;
 *   * unmount forbids any later publication.
 *
 * `enabled=false` (personal context, unresolved workspace, unauthenticated) is a
 * different scope from "loaded and empty": it never queries, never keeps a
 * channel and never reports a false zero as a successful read.
 */
const occurrencesClient = supabase as unknown as SupabaseClient<MyExecutionOccurrencesDatabase>;

export type UseMyExecutionOccurrencesOptions = {
  workspaceId: string | null | undefined;
  /** RBAC/context gate — see canLoadMyExecutionOccurrences. */
  enabled: boolean;
};

export type UseMyExecutionOccurrencesResult = {
  /** Only occurrences of the CURRENT scope. Empty while another scope is loading. */
  occurrences: HomeExecutionOccurrence[];
  /** True when the current scope's read failed (do not present it as zero). */
  error: boolean;
  loading: boolean;
  refresh: () => void;
};

type PublishedState = {
  scopeKey: string | null;
  occurrences: HomeExecutionOccurrence[];
  error: boolean;
};

export function useMyExecutionOccurrences({
  workspaceId,
  enabled,
}: UseMyExecutionOccurrencesOptions): UseMyExecutionOccurrencesResult {
  const canQuery = enabled && !!workspaceId;
  const dataScopeKey = canQuery && workspaceId ? `ws:${workspaceId}` : null;

  const [state, setState] = useState<PublishedState>({
    scopeKey: null,
    occurrences: [],
    error: false,
  });
  const [retryNonce, setRetryNonce] = useState(0);

  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const cycleRef = useRef(0);
  const lastScopeKeyRef = useRef<string | null>(null);

  // Advanced DURING render, only when the data scope really changes — including
  // a return to a previously used workspace. No setState, no extra render.
  if (lastScopeKeyRef.current !== dataScopeKey) {
    lastScopeKeyRef.current = dataScopeKey;
    cycleRef.current += 1;
  }
  const cycle = cycleRef.current;

  // Eligibility AND the render cycle are part of the scope:
  //   * `on:` — a disabled read is never confused with an empty successful read;
  //   * `c:`  — data published in a PREVIOUS cycle of the same workspace is not
  //     presented as the current scope's result. Without it, returning to a
  //     workspace (A→B→A) would instantly re-serve cycle A1's rows as if they
  //     were the fresh read, with loading=false, hiding the refetch.
  const renderScopeKey = `${dataScopeKey ?? "none"}|on:${canQuery ? 1 : 0}|n:${retryNonce}|c:${cycle}`;

  useEffect(() => {
    mountedRef.current = true;
    const seq = ++seqRef.current;
    let cancelled = false;

    if (!canQuery || !workspaceId) {
      setState((prev) =>
        prev.scopeKey === renderScopeKey && prev.occurrences.length === 0 && !prev.error
          ? prev
          : { scopeKey: renderScopeKey, occurrences: [], error: false },
      );
      return () => {
        cancelled = true;
        mountedRef.current = false;
      };
    }

    const requestedWorkspaceId = workspaceId;

    (async () => {
      const result = await loadMyExecutionOccurrences(
        {
          fetchOccurrences: async (wsId) => {
            const { data, error } = await occurrencesClient.rpc(
              "list_my_checklist_execution_occurrences",
              { p_workspace_id: wsId },
            );
            return { data, error };
          },
        },
        requestedWorkspaceId,
      );

      if (cancelled || !mountedRef.current) return;
      if (seq !== seqRef.current) return; // a newer request owns the state
      if (cycle !== cycleRef.current) return; // scope left and (maybe) returned
      setState({ scopeKey: renderScopeKey, occurrences: result.occurrences, error: result.error });
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [canQuery, workspaceId, renderScopeKey, cycle]);

  const refresh = useCallback(() => setRetryNonce((n) => n + 1), []);

  // Synchronous scope ownership: state from another scope is never returned,
  // even on the very first render of the new scope.
  const isCurrentScope = state.scopeKey === renderScopeKey;

  return {
    occurrences: isCurrentScope ? state.occurrences : [],
    error: isCurrentScope ? state.error : false,
    loading: canQuery && !isCurrentScope,
    refresh,
  };
}
