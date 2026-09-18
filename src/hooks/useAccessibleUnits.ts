import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScopedQuery, type UseScopedQueryResult } from "@/hooks/useScopedQuery";

export interface AccessibleUnit {
  id: string;
  name: string;
  is_active: boolean;
  workspace_id: string;
}

/**
 * Escopo do leitor de unidades.
 *
 * O recorte do workspace é OBRIGATÓRIO para consultar: a RLS já filtra por
 * organização, mas o painel trabalha com um workspace SELECIONADO, e "todas as
 * unidades acessíveis" (que poderia atravessar workspaces) não é o mesmo
 * conjunto que "as unidades deste workspace". Sem `workspaceId` não há consulta
 * — nenhum resultado antigo pode ser publicado como se fosse do workspace novo.
 */
export type UseAccessibleUnitsParams = {
  /** workspaces.id do contexto atual (workspaces.id === organization_id). */
  workspaceId?: string | null;
  /** Elegibilidade (auth/RBAC/contexto). Default: true. */
  enabled?: boolean;
  /** Inclui unidades inativas (telas administrativas). Default: false. */
  includeInactive?: boolean;
};

export type UseAccessibleUnitsResult = {
  units: AccessibleUnit[];
  loading: boolean;
  error: string | null;
  /** Recarrega o escopo atual (noop se o escopo/elegibilidade já mudou). */
  refresh: () => Promise<void>;
};

type UnitsQueryParams = { workspaceId: string; includeInactive: boolean };

const EMPTY_UNITS: AccessibleUnit[] = [];

/**
 * Unidades REAIS de um workspace.
 *
 * Duas garantias, nesta ordem:
 *   1. ESCOPO EXPLÍCITO — a consulta sempre carrega `.eq("workspace_id", …)`
 *      além da RLS (defesa em profundidade, como no resto do painel);
 *   2. TROCA DE WORKSPACE — o estado é publicado por escopo (via
 *      `useScopedQuery`): A → B devolve neutro sincronamente, resposta antiga
 *      não sobrescreve a nova, callback do ciclo abandonado fica inerte e nada
 *      publica depois do unmount.
 */
export function useAccessibleUnits(
  params: UseAccessibleUnitsParams = {},
): UseAccessibleUnitsResult {
  const { workspaceId, enabled = true, includeInactive = false } = params;
  const canQuery = !!enabled && !!workspaceId;
  // O flag de inativos também é escopo: é outro conjunto de linhas.
  const scope = `${workspaceId ?? ""}|${includeInactive ? "all" : "active"}`;

  const queryParams = useMemo<UnitsQueryParams>(
    () => ({ workspaceId: workspaceId ?? "", includeInactive }),
    [workspaceId, includeInactive],
  );

  const fetcher = useCallback(async (p: UnitsQueryParams): Promise<AccessibleUnit[]> => {
    let q = supabase
      .from("units")
      .select("id,name,is_active,workspace_id")
      .eq("workspace_id", p.workspaceId)
      .order("name");
    if (!p.includeInactive) q = q.eq("is_active", true);

    const { data, error } = await q;
    // Falha genérica apenas: nenhum detalhe de SQL/schema chega à UI.
    if (error) throw new Error("accessible_units_query_failed");
    return (data ?? []) as AccessibleUnit[];
  }, []);

  const result: UseScopedQueryResult<AccessibleUnit[]> = useScopedQuery<
    UnitsQueryParams,
    AccessibleUnit[]
  >({
    scope,
    enabled: canQuery,
    params: queryParams,
    fetcher,
    initial: EMPTY_UNITS,
    errorMessage: "Falha ao carregar as unidades.",
    label: "useAccessibleUnits",
  });

  return {
    units: result.data,
    loading: result.loading,
    error: result.error,
    refresh: result.refresh,
  };
}
