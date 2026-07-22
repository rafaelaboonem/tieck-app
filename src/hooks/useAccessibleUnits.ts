import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AccessibleUnit {
  id: string;
  name: string;
  is_active: boolean;
  workspace_id: string;
}

// Lista somente as unidades acessíveis ao usuário autenticado — RLS já filtra
// por workspace/organização. Retorna somente unidades ativas por padrão.
export function useAccessibleUnits(includeInactive = false) {
  const [units, setUnits] = useState<AccessibleUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase.from("units").select("id,name,is_active,workspace_id").order("name");
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error: err } = await q;
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setUnits([]);
      } else {
        setUnits((data ?? []) as AccessibleUnit[]);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [includeInactive]);

  return { units, loading, error };
}
