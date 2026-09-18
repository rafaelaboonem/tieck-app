/**
 * "Últimas execuções" do /painel — leitura REAL e workspace-scoped (6B.2E).
 *
 * Uma só consulta resolve o recorte inteiro (período + unidade opcional + turno
 * opcional + limite): não existe fan-out por unidade, então o card não degrada o
 * painel para se preencher. A autorização é resolvida DENTRO do banco
 * (`has_role_in_workspace(..., 'admin')` — dono do workspace ou membro ATIVO
 * com papel administrativo, o mesmo gate do /painel; unidade/turno precisam
 * pertencer ao workspace pedido).
 *
 * Fonte: apenas occurrences de ROTINAS AGENDADAS concluídas
 * (`completed_at IS NOT NULL AND response_id IS NOT NULL`). Resposta avulsa/
 * pública não tem executor identificável e NÃO é fonte desta seção.
 *
 * Invariantes herdadas do `useScopedQuery` (as mesmas dos hooks analíticos do
 * painel):
 *   1. resultado de escopo anterior nunca é publicado (troca de período,
 *      unidade ou turno devolve estado neutro — não vaza linha da unidade
 *      anterior);
 *   2. resposta antiga que termina por último é descartada (sequência monotônica);
 *   3. callback do ciclo abandonado (A→B→A) permanece inerte;
 *   4. nada publica depois do unmount;
 *   5. sem workspace válido, ZERO consulta (nem canal, nem promessa);
 *   6. loading e error são canais separados — falha nunca é apresentada como
 *      "sem execuções".
 *
 * Se o contrato não existir no ambiente (RPC ausente ou indisponível), a chamada
 * falha e o card mostra o estado de ERRO (com retry) — deliberadamente diferente
 * do estado vazio, para que a ausência do contrato nunca seja lida como "nada
 * aconteceu na operação".
 */
import { useCallback, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecentExecution } from "@/components/dashboard/real/RealRecentExecutions";
import { supabase } from "@/integrations/supabase/client";
import { useScopedQuery, type UseScopedQueryResult } from "@/hooks/useScopedQuery";
import {
  buildRecentExecutions,
  parseRecentChecklistExecutions,
  RECENT_EXECUTION_DEFAULT_LIMIT,
  RECENT_EXECUTION_MAX_LIMIT,
  type RecentExecutionsDatabase,
} from "@/lib/recent-executions";

/** Fronteira única de cast (types.ts continua intocado, como nos 6B.2B/2C/2D). */
const recentExecutionsClient = supabase as unknown as SupabaseClient<RecentExecutionsDatabase>;

export type RecentChecklistExecutionsParams = {
  /** workspaces.id === organization_id (defesa em profundidade além da RLS). */
  organizationId?: string | null;
  startDate: string; // YYYY-MM-DD inclusivo
  endDate: string; // YYYY-MM-DD inclusivo
  unitId?: string | null;
  shiftId?: string | null;
  /** Default 6; capado em 20 (o backend também capa). */
  limit?: number;
  enabled?: boolean;
};

export type UseRecentChecklistExecutionsResult = UseScopedQueryResult<RecentExecution[]>;

type RecentExecutionsQueryParams = {
  organizationId: string;
  startDate: string;
  endDate: string;
  unitId: string | null;
  shiftId: string | null;
  limit: number;
};

const EMPTY_EXECUTIONS: RecentExecution[] = [];

/** Limite saneado: nunca 0/negativo/Infinity e nunca acima do teto do backend. */
export function normalizeRecentExecutionsLimit(limit?: number | null): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return RECENT_EXECUTION_DEFAULT_LIMIT;
  }
  const floored = Math.floor(limit);
  if (floored < 1) return 1;
  return Math.min(floored, RECENT_EXECUTION_MAX_LIMIT);
}

export function useRecentChecklistExecutions(
  params: RecentChecklistExecutionsParams,
): UseRecentChecklistExecutionsResult {
  const { organizationId, startDate, endDate, unitId, shiftId, limit, enabled = true } = params;
  const effectiveLimit = normalizeRecentExecutionsLimit(limit);
  const canQuery = !!enabled && !!organizationId;
  // O escopo inclui unidade, turno e limite: qualquer um deles invalida o
  // resultado publicado (nunca uma linha da unidade/turno anterior).
  const scope = `${organizationId ?? ""}|${startDate}|${endDate}|${unitId ?? ""}|${shiftId ?? ""}|${effectiveLimit}`;

  const queryParams = useMemo<RecentExecutionsQueryParams>(
    () => ({
      organizationId: organizationId ?? "",
      startDate,
      endDate,
      unitId: unitId ?? null,
      shiftId: shiftId ?? null,
      limit: effectiveLimit,
    }),
    [organizationId, startDate, endDate, unitId, shiftId, effectiveLimit],
  );

  const fetcher = useCallback(async (p: RecentExecutionsQueryParams): Promise<RecentExecution[]> => {
    const { data, error } = await recentExecutionsClient.rpc(
      "list_workspace_recent_checklist_executions",
      {
        p_workspace_id: p.organizationId,
        p_start_date: p.startDate,
        p_end_date: p.endDate,
        // Ausente = todas as unidades / todos os turnos (sem filtro).
        ...(p.unitId ? { p_unit_id: p.unitId } : {}),
        ...(p.shiftId ? { p_shift_id: p.shiftId } : {}),
        p_limit: p.limit,
      },
    );
    // Falha genérica apenas: nenhum detalhe de SQL/schema/policy chega à UI.
    if (error) throw new Error("recent_executions_query_failed");

    return buildRecentExecutions(parseRecentChecklistExecutions(data));
  }, []);

  return useScopedQuery<RecentExecutionsQueryParams, RecentExecution[]>({
    scope,
    enabled: canQuery,
    params: queryParams,
    fetcher,
    initial: EMPTY_EXECUTIONS,
    errorMessage: "Falha ao carregar as últimas execuções.",
    label: "useRecentChecklistExecutions",
  });
}
