-- Hardening RPC get_checklist_access
REVOKE EXECUTE ON FUNCTION public.get_checklist_access(uuid, uuid) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_checklist_access(uuid, uuid) TO service_role;
