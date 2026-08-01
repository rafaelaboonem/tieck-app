DROP FUNCTION IF EXISTS public.acquire_vision_lock(uuid, uuid, text, integer);

CREATE FUNCTION public.acquire_vision_lock(p_user_id uuid, p_workspace_id uuid, p_operation text, p_ttl_seconds integer DEFAULT 60)
RETURNS TABLE(acquired boolean, key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_key text := p_operation || ':' || p_user_id::text || ':' || COALESCE(p_workspace_id::text, '-');
  v_ok boolean := false;
BEGIN
  DELETE FROM public.vision_locks vl WHERE vl.expires_at < now();

  INSERT INTO public.vision_locks AS l (lock_key, user_id, workspace_id, operation, acquired_at, expires_at)
  VALUES (v_key, p_user_id, p_workspace_id, p_operation, now(), now() + make_interval(secs => GREATEST(p_ttl_seconds, 5)))
  ON CONFLICT (lock_key) DO UPDATE
     SET acquired_at = now(),
         expires_at = now() + make_interval(secs => GREATEST(p_ttl_seconds, 5))
   WHERE l.expires_at < now()
  RETURNING true INTO v_ok;

  RETURN QUERY SELECT COALESCE(v_ok, false), v_key;
END;
$function$;

REVOKE ALL ON FUNCTION public.acquire_vision_lock(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_vision_lock(uuid, uuid, text, integer) TO service_role;