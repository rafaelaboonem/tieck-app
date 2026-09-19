import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Home 6B.2L — perfil do usuário logado para o cabeçalho da Home.
 *
 * É a MESMA leitura que o shell já faz (`DashboardLayout` lê a tabela
 * `profiles`), exposta como hook porque a Home precisa de dois dados dela:
 * o nome exibido (saudação) e `is_admin` (gate da ação "Novo workspace").
 * Sem consulta nova de negócio, sem RPC, sem coluna nova.
 *
 * Fail-quiet: qualquer falha vira `null` — a Home nunca inventa nome nem
 * permissão a partir de um erro. `displayName` null → saudação neutra.
 */
export type HomeUserProfile = {
  displayName: string | null;
  isAdmin: boolean;
};

export function useUserProfile(userId?: string | null): HomeUserProfile | null {
  const [profile, setProfile] = useState<HomeUserProfile | null>(null);

  useEffect(() => {
    let active = true;

    if (!userId) {
      setProfile(null);
      return;
    }

    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("display_name, is_admin")
          .eq("id", userId)
          .maybeSingle();

        if (!active) return;
        setProfile({
          displayName: (data as { display_name?: string | null } | null)?.display_name ?? null,
          isAdmin: Boolean((data as { is_admin?: boolean | null } | null)?.is_admin),
        });
      } catch {
        if (active) setProfile(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  return profile;
}
