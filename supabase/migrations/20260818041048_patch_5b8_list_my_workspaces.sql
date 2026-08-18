-- PATCH 5B.8 — RESTAURAR DESCOBERTA SEGURA DE WORKSPACES COMPARTILHADOS
-- Cria a RPC list_my_workspaces para descoberta segura sem depender de RLS aberto.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_my_workspaces()
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  name text,
  icon text,
  icon_url text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 
    w.id,
    w.owner_id,
    w.name,
    w.icon,
    w.icon_url,
    w.created_at,
    w.updated_at
  FROM public.workspaces w
  WHERE 
    w.owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 
      FROM public.workspace_members wm 
      WHERE wm.workspace_id = w.id 
        AND wm.user_id = auth.uid() 
        AND wm.status = 'active'
    )
  ORDER BY w.created_at ASC;
$$;

-- Segurança: Revogar de todos e conceder apenas para autenticados e service_role
REVOKE ALL ON FUNCTION public.list_my_workspaces() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_workspaces() TO authenticated, service_role;

COMMIT;
