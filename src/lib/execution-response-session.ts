/**
 * Execution 6A.3.2 — canonical response-session linkage.
 *
 * A Camera AI verification executed during a public response MUST stay linked
 * to the SAME `checklist_responses.id` that `finalize_public_response`
 * finalizes. Both the verify and the submit resolve their session through
 * `ensureCanonicalResponseSession` — one canonical source (persisted session →
 * in-flight creation → new creation) — so they always agree on
 * responseId/responseToken. A render-time `session` snapshot is NEVER used for
 * the token (it can go stale when a `forceNew` recovery rotates the session);
 * only an explicit `sessionOverride` (the freshly created session of the
 * recovery retry) bypasses the canonical resolver.
 */

export type ResponseSession = {
  responseId: string;
  responseToken: string;
  checklistId: string;
  createdAt: number;
};

export type ResponseSessionPersistence = {
  read: (checklistId: string) => ResponseSession | null;
  write: (checklistId: string, session: ResponseSession) => void;
  clear: (checklistId: string) => void;
};

export type InFlightRegistry = {
  get: () => Promise<ResponseSession | null> | null;
  set: (promise: Promise<ResponseSession | null> | null) => void;
};

export type EnsureCanonicalResponseSessionOptions = {
  checklistId: string;
  persistence: ResponseSessionPersistence;
  /** Registry deduplicating concurrent creations (max one in flight). */
  inflight: InFlightRegistry;
  /** Creates the response row server-side (create_public_response). */
  create: (checklistId: string) => Promise<ResponseSession | null>;
  /** forceNew clears the persisted session first (recovery path). */
  forceNew?: boolean;
  /** Optional validity check; expired sessions are cleared before creating. */
  isExpired?: (session: ResponseSession) => boolean;
};

/**
 * Canonical session resolution used by BOTH the camera verify and the submit:
 *
 * 1. forceNew → clear persisted, then create (and persist).
 * 2. else a valid persisted session → reuse it (never create another row).
 * 3. else an in-flight creation → share it (concurrency dedup, max 1 writer).
 * 4. else create a new session and persist it.
 *
 * After the camera calls this, the SAME responseId/responseToken remain valid
 * until submit/finalize — the submit reuses them; the Camera AI never uses a
 * different response id than the one that will be finalized.
 */
export async function ensureCanonicalResponseSession(
  options: EnsureCanonicalResponseSessionOptions
): Promise<ResponseSession | null> {
  const { checklistId, persistence, inflight, create, forceNew = false, isExpired } = options;

  if (forceNew) {
    persistence.clear(checklistId);
  } else {
    const existing = persistence.read(checklistId);
    if (existing) {
      if (!isExpired || !isExpired(existing)) return existing;
      persistence.clear(checklistId);
    }
  }

  const inFlight = inflight.get();
  if (inFlight) return inFlight;

  const promise = (async () => {
    const session = await create(checklistId);
    if (session) persistence.write(checklistId, session);
    return session;
  })();
  inflight.set(promise);
  try {
    return await promise;
  } finally {
    inflight.set(null);
  }
}

/** Minimum session shape the camera verify needs (responseId + responseToken). */
export type CameraActiveSession = Pick<ResponseSession, "responseId" | "responseToken">;

/**
 * Session used by one camera verification. Always resolves through the
 * canonical `ensureResponseSession` — a stale/null `session` prop is never
 * preferred (it can point to an orphaned response after a forceNew rotation).
 * Only an explicit `sessionOverride` (the just-created session of a recovery
 * retry) is honored directly.
 */
export function resolveCameraActiveSession(options: {
  sessionOverride?: CameraActiveSession | null;
  ensureResponseSession: () => Promise<ResponseSession | null>;
}): Promise<CameraActiveSession | null> {
  if (options.sessionOverride) return Promise.resolve(options.sessionOverride);
  return options.ensureResponseSession();
}

/**
 * Linkage contract: the session used by the camera verify must be the SAME
 * response the submit finalizes (same responseId and responseToken).
 */
export function assertSameResponseSession(
  verifySession: ResponseSession | null | undefined,
  submitSession: ResponseSession | null | undefined
): boolean {
  if (!verifySession || !submitSession) return false;
  return (
    verifySession.responseId === submitSession.responseId &&
    verifySession.responseToken === submitSession.responseToken
  );
}