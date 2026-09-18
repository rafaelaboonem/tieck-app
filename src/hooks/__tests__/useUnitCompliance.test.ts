import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUnitCompliance } from '../useUnitCompliance';
import { supabase } from '@/integrations/supabase/client';

interface QResult {
  data: unknown;
  error: unknown;
}

// PostgREST builder encadeável thenable. Toda função de filtro registra a
// chamada e devolve o próprio builder; o await resolve no resultado final.
function makeBuilder(result: QResult) {
  const calls: Array<[string, unknown]> = [];
  const b: any = Promise.resolve(result);
  const chain = (name: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push([name, args]);
      return b;
    });
  b.select = chain('select');
  b.eq = chain('eq');
  b.gte = chain('gte');
  b.lte = chain('lte');
  b.__calls = calls;
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => makeBuilder({ data: [], error: null })),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

const baseParams = {
  startDate: '2026-01-01',
  endDate: '2026-01-01',
  organizationId: 'org-1',
  enabled: true,
};

describe('useUnitCompliance with enabled flag (pre-6B.1B contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not query supabase when enabled is false', async () => {
    const { result } = renderHook(() => useUnitCompliance({
      startDate: '2026-01-01',
      endDate: '2026-01-01',
      organizationId: 'org-1',
      enabled: false
    }));

    expect(supabase.from).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);
  });

  it('should query supabase when enabled is true', async () => {
    await act(async () => {
      renderHook(() => useUnitCompliance({
        startDate: '2026-01-01',
        endDate: '2026-01-01',
        organizationId: 'org-1',
        enabled: true
      }));
    });

    expect(supabase.from).toHaveBeenCalledWith('analytics_unit_daily_compliance');
  });

  it('should not open realtime channel when enabled is false', () => {
    renderHook(() => useUnitCompliance({
      startDate: '2026-01-01',
      endDate: '2026-12-31', // Future date to trigger realtime logic
      organizationId: 'org-1',
      enabled: false
    }));

    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it('should handle transition false -> true -> false (stale closure test)', async () => {
    const { rerender } = renderHook(
      ({ enabled }) => useUnitCompliance({
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        organizationId: 'org-1',
        enabled
      }),
      { initialProps: { enabled: false } }
    );

    // 1. Initially disabled
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.channel).not.toHaveBeenCalled();

    // 2. Transition to enabled
    await act(async () => {
      rerender({ enabled: true });
    });

    // Should trigger query AND realtime
    expect(supabase.from).toHaveBeenCalledWith('analytics_unit_daily_compliance');
    expect(supabase.channel).toHaveBeenCalled();

    // 3. Transition back to disabled
    await act(async () => {
      rerender({ enabled: false });
    });

    // Should remove channel
    expect(supabase.removeChannel).toHaveBeenCalled();

    // Clear mocks to check for new calls
    vi.clearAllMocks();

    // Should NOT trigger any new query even if something else changes while disabled
    await act(async () => {
      rerender({ enabled: false });
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('useUnitCompliance — 6B.1B workspace scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('missing organizationId: zero query, zero realtime, neutral state', async () => {
    const { result } = renderHook(() => useUnitCompliance({
      ...baseParams,
      organizationId: null,
    }));

    await act(async () => {});

    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.channel).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('enabled query contains the exact organization_id', async () => {
    await act(async () => {
      renderHook(() => useUnitCompliance(baseParams));
    });

    const builder = vi.mocked(supabase.from).mock.results[0].value as any;
    const eqCalls = builder.__calls.filter(([n]: any) => n === 'eq');
    expect(eqCalls).toContainEqual(['eq', ['organization_id', 'org-1']]);
  });

  it('dates and optional unit_id filters remain applied', async () => {
    await act(async () => {
      renderHook(() => useUnitCompliance({ ...baseParams, unitId: 'unit-9' }));
    });

    const builder = vi.mocked(supabase.from).mock.results[0].value as any;
    const names = builder.__calls.map(([n]: any) => n);
    expect(names).toContain('gte');
    expect(names).toContain('lte');
    expect(builder.__calls).toContainEqual(['eq', ['organization_id', 'org-1']]);
    expect(builder.__calls).toContainEqual(['eq', ['unit_id', 'unit-9']]);
  });

  it('workspace switch A -> B removes channel A and queries B', async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(
      ({ organizationId }) => useUnitCompliance({
        ...baseParams,
        endDate: '2026-12-31', // janela inclui hoje para abrir o canal realtime
        organizationId,
      }),
      { initialProps: { organizationId: 'org-A' } },
    );

    await act(async () => {});
    expect(supabase.channel).toHaveBeenCalledWith(
      expect.stringContaining('compliance-org-A'),
    );
    const channelCallsAfterA = vi.mocked(supabase.channel).mock.calls.length;
    const fromCallsAfterA = vi.mocked(supabase.from).mock.calls.length;

    await act(async () => {
      rerender({ organizationId: 'org-B' });
    });

    // Canal A removido; canal B aberto com o nome do novo escopo.
    expect(supabase.removeChannel).toHaveBeenCalled();
    expect(vi.mocked(supabase.channel).mock.calls.length).toBeGreaterThan(channelCallsAfterA);
    expect(vi.mocked(supabase.channel).mock.calls.some(([n]) => String(n).includes('compliance-org-B'))).toBe(true);
    // Nova consulta para o escopo B.
    expect(vi.mocked(supabase.from).mock.calls.length).toBeGreaterThan(fromCallsAfterA);

    // A consulta mais recente contém organization_id de B.
    const lastBuilder = vi.mocked(supabase.from).mock.results[
      vi.mocked(supabase.from).mock.results.length - 1
    ].value as any;
    expect(lastBuilder.__calls).toContainEqual(['eq', ['organization_id', 'org-B']]);
    vi.useRealTimers();
  });

  it('realtime channel name includes the organizationId', async () => {
    renderHook(() => useUnitCompliance({
      ...baseParams,
      endDate: '2026-12-31', // janela inclui hoje
    }));

    // 6B.3: o turno também identifica o canal — semTurno = "all".
    expect(supabase.channel).toHaveBeenCalledWith('compliance-org-1-2026-01-01-2026-12-31-all-all');
  });

  it('realtime channel name carries the selected shift', async () => {
    renderHook(() => useUnitCompliance({
      ...baseParams,
      endDate: '2026-12-31',
      shiftId: 'shift-manha',
    }));

    expect(supabase.channel).toHaveBeenCalledWith(
      'compliance-org-1-2026-01-01-2026-12-31-all-shift-manha',
    );
  });
});

// ---------------------------------------------------------------------------
// Testes comportamentais reais de corrida (promises diferidas).
// ---------------------------------------------------------------------------
describe('useUnitCompliance — 6B.1B races/rejection/unmount (deferred)', () => {
  type D<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
  function deferred<T>(): D<T> {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  function gatedBuilder(gate: D<QResult>) {
    const b: any = {};
    b.then = (onF: any, onR: any) => gate.promise.then(onF, onR);
    b.catch = (onR: any) => gate.promise.catch(onR);
    b.finally = (cb: any) => gate.promise.finally(cb);
    const chain = () => vi.fn(() => b);
    b.select = chain();
    b.eq = chain();
    b.gte = chain();
    b.lte = chain();
    return b;
  }

  const drain = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejected query ends fail-closed: loading=false, error set, no stale data', async () => {
    const gate = deferred<QResult>();
    vi.mocked(supabase.from).mockImplementation((() => gatedBuilder(gate)) as never);
    const { result } = renderHook(() => useUnitCompliance(baseParams));
    expect(result.current.loading).toBe(true);

    gate.reject(new Error('network boom'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toEqual([]);
  });

  it('real race: slow A resolved after fast B must not repopulate data', async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    let call = 0;
    vi.mocked(supabase.from).mockImplementation((() => gatedBuilder(++call <= 1 ? gateA : gateB)) as never);

    const { result, rerender } = renderHook(
      ({ organizationId }) => useUnitCompliance({ ...baseParams, organizationId }),
      { initialProps: { organizationId: 'org-A' } },
    );
    expect(result.current.loading).toBe(true);

    // Troca para B; o hook abre uma nova requisição (gate B).
    await act(async () => {
      rerender({ organizationId: 'org-B' });
      await drain();
    });

    // B resolve primeiro com dados do escopo B.
    gateB.resolve({ data: [{ unit_id: 'uB', unit_name: 'B', organization_id: 'org-B' }], error: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].unitName).toBe('B');

    // A resposta antiga de A chega por último com dados de A: descartada.
    gateA.resolve({ data: [{ unit_id: 'uA', unit_name: 'STALE-A', organization_id: 'org-A' }], error: null });
    await act(async () => { await drain(); });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].unitName).toBe('B');
    expect(JSON.stringify(result.current.data)).not.toContain('STALE-A');
  });

  it('unmount prevents any later state write', async () => {
    const gate = deferred<QResult>();
    vi.mocked(supabase.from).mockImplementation((() => gatedBuilder(gate)) as never);
    const { result, unmount } = renderHook(() => useUnitCompliance(baseParams));
    expect(result.current.loading).toBe(true);

    unmount();
    gate.resolve({ data: [{ unit_id: 'u1', unit_name: 'X', organization_id: 'org-1' }], error: null });
    await act(async () => { await drain(); });

    // Nenhum setState pós-unmount: o snapshot do estado permanece intacto.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6B.2I — segunda agregação (POR TURNO) da MESMA resposta.
//
// "Insights da operação" não abre consulta, canal nem estado assíncrono próprio:
// ele lê `shiftData`, publicado no MESMO ponto em que `data` é publicado. Estes
// testes fixam exatamente isso.
// ---------------------------------------------------------------------------
describe('useUnitCompliance — 6B.2I shiftData (mesma resposta)', () => {
  type D<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
  function deferred<T>(): D<T> {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  function gatedBuilder(gate: D<QResult>) {
    const b: any = {};
    b.then = (onF: any, onR: any) => gate.promise.then(onF, onR);
    b.catch = (onR: any) => gate.promise.catch(onR);
    b.finally = (cb: any) => gate.promise.finally(cb);
    const chain = () => vi.fn(() => b);
    b.select = chain();
    b.eq = chain();
    b.gte = chain();
    b.lte = chain();
    return b;
  }

  const drain = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

  const dailyRow = (unit: string, shiftId: string | null, shiftName: string | null, total: number, done: number) => ({
    organization_id: 'org-1',
    unit_id: unit,
    unit_name: unit === 'u1' ? 'Unidade Norte' : 'Unidade Centro',
    reference_date: '2026-01-01',
    shift_id: shiftId,
    shift_name: shiftName,
    total_scheduled_tasks: total,
    completed_tasks: done,
    completed_on_time: done,
    completed_late: 0,
    overdue_open_tasks: 0,
    delayed_tasks: 0,
    critical_failures: 0,
    pending_evidences: 0,
    weight_total: total,
    weight_done: done,
    compliance_percentage: null,
    total_due_tasks: total,
    due_completed_tasks: done,
    due_weight_total: total * 2,
    due_weight_done: done * 2,
    due_compliance_percentage: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publica data (unidade) e shiftData (turno) da MESMA resposta', async () => {
    const gate = deferred<QResult>();
    vi.mocked(supabase.from).mockImplementation((() => gatedBuilder(gate)) as never);

    const { result } = renderHook(() => useUnitCompliance({ ...baseParams, startDate: '2026-01-01' }));

    gate.resolve({
      data: [
        dailyRow('u1', 'sh-manha', 'Manhã', 6, 5),
        dailyRow('u2', 'sh-manha', 'Manhã', 4, 3),
        dailyRow('u1', 'sh-noite', 'Noite', 2, 2),
        dailyRow('u1', null, null, 3, 1),
      ],
      error: null,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Por unidade (como sempre): 2 unidades.
    expect(result.current.data).toHaveLength(2);
    // Por turno: 3 buckets — o turno repetido em duas unidades foi somado UMA vez.
    const byShift = Object.fromEntries(
      result.current.shiftData.map((r) => [r.shiftId ?? 'null', r]),
    );
    expect(Object.keys(byShift).sort()).toEqual(['null', 'sh-manha', 'sh-noite']);
    expect(byShift['sh-manha'].totalScheduledTasks).toBe(10);
    expect(byShift['sh-manha'].completedTasks).toBe(8);
    expect(byShift['null'].shiftId).toBeNull();
    expect(byShift['null'].totalScheduledTasks).toBe(3);

    // Invariável: as duas agregações fecham o mesmo total.
    const shiftScheduled = result.current.shiftData.reduce((a, r) => a + r.totalScheduledTasks, 0);
    const unitScheduled = result.current.data.reduce((a, r) => a + r.totalScheduledTasks, 0);
    expect(shiftScheduled).toBe(unitScheduled);
  });

  it('o refresh (que é o que o realtime dispara) recalcula as DUAS agregações juntas', async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    let call = 0;
    vi.mocked(supabase.from).mockImplementation((() => gatedBuilder(++call <= 1 ? gateA : gateB)) as never);

    const { result } = renderHook(() => useUnitCompliance(baseParams));
    gateA.resolve({ data: [dailyRow('u1', 'sh-manha', 'Manhã', 6, 5)], error: null });
    await waitFor(() => expect(result.current.shiftData).toHaveLength(1));
    expect(result.current.shiftData[0].completedTasks).toBe(5);

    await act(async () => {
      void result.current.refresh();
      await drain();
    });

    gateB.resolve({
      data: [dailyRow('u1', 'sh-manha', 'Manhã', 6, 6), dailyRow('u2', 'sh-noite', 'Noite', 4, 1)],
      error: null,
    });
    await waitFor(() => expect(result.current.shiftData).toHaveLength(2));

    // As duas dimensões mudaram no MESMO update — nenhum estado assíncrono paralelo.
    expect(result.current.shiftData.map((r) => r.shiftId)).toEqual(['sh-manha', 'sh-noite']);
    expect(result.current.shiftData[0].completedTasks).toBe(6);
    expect(result.current.data).toHaveLength(2);
    expect(vi.mocked(supabase.from).mock.calls.length).toBe(2);
  });

  it('sem workspace: shiftData também é neutro e nenhuma consulta sai', async () => {
    const { result } = renderHook(() => useUnitCompliance({ ...baseParams, organizationId: null }));
    await act(async () => {});

    expect(supabase.from).not.toHaveBeenCalled();
    expect(result.current.shiftData).toEqual([]);
  });

  it('falha de leitura limpa data E shiftData (sem sobra da resposta anterior)', async () => {
    const gateA = deferred<QResult>();
    const gateB = deferred<QResult>();
    let call = 0;
    vi.mocked(supabase.from).mockImplementation((() => gatedBuilder(++call <= 1 ? gateA : gateB)) as never);

    const { result } = renderHook(() => useUnitCompliance(baseParams));
    gateA.resolve({ data: [dailyRow('u1', 'sh-manha', 'Manhã', 6, 5)], error: null });
    await waitFor(() => expect(result.current.shiftData).toHaveLength(1));

    await act(async () => {
      void result.current.refresh();
      await drain();
    });
    gateB.resolve({ data: null, error: { message: 'boom' } });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.data).toEqual([]);
    expect(result.current.shiftData).toEqual([]);
  });
});
