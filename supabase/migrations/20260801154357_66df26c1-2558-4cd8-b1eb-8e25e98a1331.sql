CREATE TABLE IF NOT EXISTS public.vision_locks (
  lock_key text PRIMARY KEY,
  user_id uuid NOT NULL,
  workspace_id uuid,
  operation text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

GRANT ALL ON public.vision_locks TO service_role;

ALTER TABLE public.vision_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vision_locks_owner_select" ON public.vision_locks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.acquire_vision_lock(
  p_user_id uuid,
  p_workspace_id uuid,
  p_operation text,
  p_ttl_seconds integer DEFAULT 60
)
RETURNS TABLE(acquired boolean, lock_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_key text := p_operation || ':' || p_user_id::text || ':' || COALESCE(p_workspace_id::text, '-');
  v_ok boolean := false;
BEGIN
  DELETE FROM public.vision_locks WHERE expires_at < now();

  INSERT INTO public.vision_locks (lock_key, user_id, workspace_id, operation, acquired_at, expires_at)
  VALUES (v_key, p_user_id, p_workspace_id, p_operation, now(), now() + make_interval(secs => GREATEST(p_ttl_seconds, 5)))
  ON CONFLICT (lock_key) DO UPDATE
     SET acquired_at = now(),
         expires_at = now() + make_interval(secs => GREATEST(p_ttl_seconds, 5))
   WHERE public.vision_locks.expires_at < now()
  RETURNING true INTO v_ok;

  RETURN QUERY SELECT COALESCE(v_ok, false), v_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_vision_lock(p_lock_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  DELETE FROM public.vision_locks WHERE lock_key = p_lock_key;
$$;