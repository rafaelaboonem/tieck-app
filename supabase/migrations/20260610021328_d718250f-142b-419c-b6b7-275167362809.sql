CREATE OR REPLACE FUNCTION public.get_user_email_by_id(user_uuid UUID)
RETURNS TEXT AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Tenta buscar no auth.users (requer privilégios de service_role)
  -- Mas como estamos chamando via RPC, precisamos garantir que o search_path e permissões estejam ok
  SELECT email INTO user_email FROM auth.users WHERE id = user_uuid;
  
  -- Fallback para workspace_members se não encontrar
  IF user_email IS NULL THEN
    SELECT email INTO user_email FROM public.workspace_members WHERE user_id = user_uuid LIMIT 1;
  END IF;

  RETURN user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

GRANT EXECUTE ON FUNCTION public.get_user_email_by_id(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_email_by_id(UUID) TO authenticated;
