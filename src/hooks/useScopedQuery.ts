import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 6B.2D — shared scoped-query engine.
 *
 * Extracted so the two NEW occurrence hooks (metrics + details) inherit the
 * invariants consolidated in 6B.1B → 6B.1B.4 instead of re-implementing them.
 * `useUnitCompliance` / `useUnitOperationalDetails` are deliberately NOT
 * migrated to it: this phase must not refactor working hooks.
 *
 * Invariants, each one load-bearing:
 *
 *   1. SYNCHRONOUS render ownership. The published state carries the
 *      `renderScope` that produced it. On the FIRST render of a new scope the
 *      value returned is already neutral — an effect-based clear runs too late
 *      and would leak the previous scope's rows for one render.
 *   2. `renderScope` = data scope + current eligibility. `enabled=false`
 *      therefore returns neutral immediately (never stale rows), and coming back
 *      to `true` reports `loading=true` instead of a false empty success.
 *   3. Monotonic REQUEST sequence: only the newest request may publish.
 *   4. Monotonic RENDER CYCLE: content equality cannot tell the first A from a
 *      re-entered A (A→B→A), so callbacks from the abandoned cycle stay noop
 *      forever.
 *   5. Every callback captures its OWN scope/eligibility/cycle/params from the
 *      render that created it — never from refs read late. A stale refresh (even
 *      one created while disabled) is a noop BEFORE any query, and before any
 *      state change or sequence bump that could invalidate the live request.
 *   6. Unmount forbids all later publication.
 *
 * `fetcher` and `params` MUST be referentially stable for a given scope
 * (useCallback/useMemo at the call site), otherwise `refresh` changes identity
 * every render and the effect would re-run on every render.
 */
export type UseScopedQueryOptions<P, T> = {
  /** Data scope key: everything that changes WHICH rows the query must return. */
  scope: string;
  /** Current eligibility (auth/RBAC/context gate). */
  enabled: boolean;
  /** Query params, memoized for the current scope. Captured per closure. */
  params: P;
  /** Stable fetcher. Throwing means "fail closed" (the error slot is used). */
  fetcher: (params: P) => Promise<T>;
  /** Neutral value: initial state AND the value while no result exists. */
  initial: T;
  /** Generic, leak-free message shown when the query fails. */
  errorMessage: string;
  /** Hook name used in console diagnostics. */
  label: string;
};

export type UseScopedQueryResult<T> = {
  data: T;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useScopedQuery<P, T>({
  scope,
  enabled,
  params,
  fetcher,
  initial,
  errorMessage,
  label,
}: UseScopedQueryOptions<P, T>): UseScopedQueryResult<T> {
  const renderScope = `${scope}|${enabled ? "on" : "off"}`;

  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  // Monotonic request id: only the newest request may write state.
  const loadSeqRef = useRef(0);
  // After unmount nothing may publish.
  const mountedRef = useRef(true);
  // Tag of the renderScope that produced the state currently stored.
  const stateTagRef = useRef<string>(renderScope);
  // Scope refs, refreshed SYNCHRONOUSLY during render (no setState here).
  const currentScopeRef = useRef<string>(scope);
  const currentRenderScopeRef = useRef<string>(renderScope);
  const currentGateRef = useRef<boolean>(enabled);
  currentScopeRef.current = scope;
  currentRenderScopeRef.current = renderScope;
  currentGateRef.current = enabled;

  // Monotonic cycle: advanced during render only when renderScope really
  // changes, so A→B→A cannot revalidate a callback from the first A.
  const cycleRef = useRef(0);
  const cycleScopeRef = useRef<string>(renderScope);
  if (cycleScopeRef.current !== renderScope) {
    cycleScopeRef.current = renderScope;
    cycleRef.current += 1;
  }
  const cycle = cycleRef.current;

  const initialRef = useRef<T>(initial);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSeqRef.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    // Everything comes from THIS closure, never from a ref read late.
    const requestScope = scope;
    const requestRenderScope = renderScope;
    const requestEnabled = enabled;
    const requestCycle = cycle;
    const requestParams = params;
    const requestFetch = fetcher;

    // Stale/ineligible callback: noop BEFORE the query, before bumping the
    // sequence (which would cancel the live request) and before any state change.
    if (
      !mountedRef.current ||
      !requestEnabled ||
      !currentGateRef.current ||
      currentScopeRef.current !== requestScope ||
      currentRenderScopeRef.current !== requestRenderScope ||
      cycleRef.current !== requestCycle
    ) {
      return;
    }

    const seq = ++loadSeqRef.current;
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
      const result = await requestFetch(requestParams);
      if (!isCurrent()) return;
      stateTagRef.current = requestRenderScope;
      setData(result);
    } catch (e) {
      // A rejected promise (network/client exception) must still end loading and
      // must never leave the previous scope's rows on screen.
      if (!isCurrent()) return;
      console.error(`${label}: query threw`, e);
      stateTagRef.current = requestRenderScope;
      setError(errorMessage);
      setData(initialRef.current);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [scope, renderScope, cycle, enabled, params, fetcher, errorMessage, label]);

  useEffect(() => {
    // Scope or eligibility changed: invalidate pending work and clear.
    if (stateTagRef.current !== renderScope) {
      loadSeqRef.current += 1;
      setData(initialRef.current);
      setError(null);
      stateTagRef.current = renderScope;
    }
    if (!enabled) {
      // No scope/no permission: zero query, zero channel, neutral state.
      loadSeqRef.current += 1;
      setLoading(false);
      setData(initialRef.current);
      setError(null);
      stateTagRef.current = renderScope;
      return;
    }
    void load();
  }, [load, enabled, renderScope]);

  // Synchronous ownership, before any effect: the stored state is exposed only
  // when its tag is the CURRENT renderScope.
  if (stateTagRef.current !== renderScope) {
    return { data: initialRef.current, error: null, loading: enabled, refresh: load };
  }

  return { data, loading, error, refresh: load };
}
