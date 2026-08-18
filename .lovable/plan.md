# PATCH 5B.3 — CORRIGIR STALE CLOSURE DO useUnitCompliance

Fix stale closure in `useUnitCompliance` hook where `enabled` flag was missing from dependencies, preventing data load when authorization resolves.

## Proposed Changes

### 1. Hook Hardening
- **File:** `src/hooks/useUnitCompliance.ts`
- Add `enabled` to `useCallback` dependency array for `load`.
- Audit and ensure `enabled` is present in all relevant `useEffect` dependency arrays.
- Ensure realtime subscriptions are correctly cleaned up or not created when `enabled` is false.

### 2. Integrity Testing
- **File:** `src/hooks/__tests__/useUnitCompliance.test.ts`
- Add a comprehensive transition test:
    - Initial render with `enabled: false`.
    - Verification: Zero Supabase calls.
    - Rerender with `enabled: true`.
    - Verification: Immediate Supabase query trigger.
    - Transition back to `enabled: false`.
    - Verification: Cleanup of subscriptions and prevention of new queries.

## Technical Details
The current implementation of `load` uses `enabled` inside its body but misses it in its dependency array. In React, this creates a "stale closure" where the function remembers `enabled` as `false` even after the prop changes to `true`, until some other dependency (like date or unitId) forces a recreation.

```typescript
// Before
const load = useCallback(async () => {
  if (!enabled) return;
  // ...
}, [startDate, endDate, unitId]);

// After
const load = useCallback(async () => {
  if (!enabled) return;
  // ...
}, [startDate, endDate, unitId, enabled]);
```

Verified against production build requirements.
