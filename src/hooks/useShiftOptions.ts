import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScopedQuery } from "@/hooks/useScopedQuery";

/**
 * 6B.3 — turnos disponíveis para o filtro global do painel.
 *
 * Duas fontes, cada uma autorizada pelas policies já existentes (nenhuma
 * autorização paralela é criada):
 *
 *   * COM unidade selecionada → os turnos daquela unidade, lidos do próprio
 *     recorte analítico (`analytics_unit_daily_compliance`, security_invoker).
 *     Isso responde exatamente "esta unidade possui este turno?" — a pergunta
 *     que precisa ser feita para limpar uma combinação impossível (unidade B
 *     sem o turno X da unidade A). A leitura NÃO é limitada pelo período: o
 *     turno é uma propriedade da unidade, não da janela escolhida, então
 *     estreitar as datas não pode fazer o turno selecionado sumir.
 *
 *   * SEM unidade → todos os turnos do workspace (`shifts`, RLS por workspace).
 *     A tabela `shifts` não possui flag de ativo; "todos os turnos acessíveis
 *     do workspace" é, portanto, todos os turnos do workspace.
 *
 * Turnos sem nome caem no próprio id e turnos nulos nunca viram opção: não
 * existe a opção "Sem turno" (turno ausente só é alcançado por "Todos os
 * turnos", como manda a 6B.3).
 *
 * O hook herda as garantias de escopo da 6B.1B via useScopedQuery: trocar de
 * workspace/unidade invalida respostas em voo e `resolved` só é verdadeiro
 * quando as opções do escopo ATUAL estão conhecidas.
 */
export type ShiftOption = { id: string; name: string };

type ShiftRow = { id?: unknown; name?: unknown };
type UnitShiftRow = { shift_id?: unknown; shift_name?: unknown };

/** Builder estrutural mínimo para a view analítica (fora de supabase/types.ts). */
type ViewQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  eq: (column: string, value: string) => ViewQuery;
  limit: (count: number) => ViewQuery;
};
type ViewClient = {
  from: (table: "analytics_unit_daily_compliance") => {
    select: (columns: string) => ViewQuery;
  };
};

const viewClient = supabase as unknown as ViewClient;

export type UseShiftOptionsParams = {
  organizationId?: string | null;
  /** Quando informado, lista apenas os turnos daquela unidade. */
  unitId?: string | null;
  enabled?: boolean;
};

export type UseShiftOptionsResult = {
  shifts: ShiftOption[];
  loading: boolean;
  /** As opções do escopo ATUAL já são conhecidas (nem toda opção é válida). */
  resolved: boolean;
};

type ShiftQueryParams = { organizationId: string; unitId: string | null };

const EMPTY_SHIFTS: ShiftOption[] = [];

function byName(a: ShiftOption, b: ShiftOption): number {
  return a.name.localeCompare(b.name);
}

export function useShiftOptions(params: UseShiftOptionsParams): UseShiftOptionsResult {
  const { organizationId, unitId, enabled = true } = params;
  const canQuery = !!enabled && !!organizationId;
  const scope = `${organizationId ?? ""}|${unitId ?? "all"}`;

  const queryParams = useMemo<ShiftQueryParams>(
    () => ({ organizationId: organizationId ?? "", unitId: unitId ?? null }),
    [organizationId, unitId],
  );

  const fetcher = useCallback(async (p: ShiftQueryParams): Promise<ShiftOption[]> => {
    if (p.unitId) {
      const { data, error } = await viewClient
        .from("analytics_unit_daily_compliance")
        .select("shift_id,shift_name")
        .eq("organization_id", p.organizationId)
        .eq("unit_id", p.unitId)
        .limit(2000);
      if (error) throw new Error("shift_options_query_failed");

      const map = new Map<string, string>();
      for (const row of (Array.isArray(data) ? data : []) as UnitShiftRow[]) {
        const id =
          typeof row?.shift_id === "string" && row.shift_id.length > 0 ? row.shift_id : null;
        if (!id) continue;
        const name =
          typeof row?.shift_name === "string" && row.shift_name.length > 0 ? row.shift_name : id;
        map.set(id, name);
      }
      return Array.from(map, ([id, name]) => ({ id, name })).sort(byName);
    }

    const { data, error } = await supabase
      .from("shifts")
      .select("id,name")
      .eq("workspace_id", p.organizationId);
    if (error) throw new Error("shift_options_query_failed");

    const map = new Map<string, string>();
    for (const row of (Array.isArray(data) ? data : []) as ShiftRow[]) {
      const id = typeof row?.id === "string" && row.id.length > 0 ? row.id : null;
      if (!id) continue;
      const name = typeof row?.name === "string" && row.name.length > 0 ? row.name : id;
      map.set(id, name);
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort(byName);
  }, []);

  const result = useScopedQuery<ShiftQueryParams, ShiftOption[]>({
    scope,
    enabled: canQuery,
    params: queryParams,
    fetcher,
    initial: EMPTY_SHIFTS,
    errorMessage: "Falha ao carregar os turnos.",
    label: "useShiftOptions",
  });

  return {
    shifts: result.data,
    loading: canQuery && result.loading,
    // Sem escopo consultável não há opções a resolver (e nada pode ser
    // declarado inválido) — o consumidor decide o que fazer nesse estado.
    resolved: canQuery && !result.loading,
  };
}
