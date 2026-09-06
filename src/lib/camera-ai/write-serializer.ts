export interface WriteSerializer {
  /**
   * Run `op` exclusively: no other enqueued op is in flight at the same time.
   * Ops run in FIFO order; a rejected op never blocks the chain.
   * `PromiseLike` deixa passar builders thenables (ex.: PostgrestBuilder do
   * supabase-js), não apenas Promise nativas.
   */
  enqueue: <T>(op: () => PromiseLike<T>) => Promise<T>;
}

/**
 * 5C.3.3-B.1 — single serialization discipline for every writer of
 * `checklists.blocks` (general autosave/saveChecklist and the camera policy
 * sync). Guarantees that no two writers are ever in flight concurrently and
 * that an older writer always finishes before a newer one, so a stale writer
 * can never overwrite a freshly persisted policy.
 */
export function createWriteSerializer(): WriteSerializer {
  let chain: Promise<unknown> = Promise.resolve();
  return {
    enqueue<T>(op: () => PromiseLike<T>): Promise<T> {
      const result = chain.then(op, op);
      // Keep the chain alive regardless of success/failure.
      chain = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
}