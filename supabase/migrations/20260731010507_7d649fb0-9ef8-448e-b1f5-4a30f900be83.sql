-- 1) Atomic single-use consumption of the signup verification token
CREATE OR REPLACE FUNCTION public.consume_signup_verification(p_email text, p_token text)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_row   public.signup_otp_codes%ROWTYPE;
BEGIN
  IF v_email = '' OR coalesce(p_token, '') = '' THEN
    RETURN QUERY SELECT 'invalid'::text;
    RETURN;
  END IF;

  -- best-effort cleanup of expired rows
  DELETE FROM public.signup_otp_codes WHERE expires_at < now() - interval '1 hour';

  SELECT * INTO v_row
    FROM public.signup_otp_codes
   WHERE email = v_email
     AND verification_token = p_token
     AND verified = true
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text;
    RETURN;
  END IF;

  IF v_row.expires_at < now() THEN
    DELETE FROM public.signup_otp_codes WHERE id = v_row.id;
    RETURN QUERY SELECT 'expired'::text;
    RETURN;
  END IF;

  -- single use: consume it now
  DELETE FROM public.signup_otp_codes WHERE id = v_row.id;
  RETURN QUERY SELECT 'ok'::text;
END;
$$;

-- 2) Server-side completeness gate
CREATE OR REPLACE FUNCTION public.signup_account_state(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id)
     AND EXISTS (SELECT 1 FROM public.workspaces w WHERE w.owner_id = p_user_id)
      THEN 'complete'
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id)
      OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.owner_id = p_user_id)
      THEN 'partial'
    ELSE 'none'
  END;
$$;

-- 3) Transactional provisioning of profile + workspace
CREATE OR REPLACE FUNCTION public.provision_signup_account(p_user_id uuid, p_display_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.profiles (id, display_name)
  VALUES (p_user_id, v_name)
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        updated_at = now();

  IF NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.owner_id = p_user_id) THEN
    INSERT INTO public.workspaces (owner_id, name, icon)
    VALUES (p_user_id, 'Meu Workspace', '📁');
  END IF;

  RETURN public.signup_account_state(p_user_id);
END;
$$;

-- 4) Expired OTP cleanup
CREATE OR REPLACE FUNCTION public.cleanup_expired_signup_otps()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  WITH d AS (
    DELETE FROM public.signup_otp_codes
     WHERE expires_at < now() - interval '1 hour'
    RETURNING 1
  )
  SELECT count(*)::int INTO v_deleted FROM d;
  RETURN v_deleted;
END;
$$;

-- Service-role only: these functions must never be callable from the browser.
REVOKE ALL ON FUNCTION public.consume_signup_verification(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signup_account_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provision_signup_account(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_signup_otps() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_signup_verification(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.signup_account_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_signup_account(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_signup_otps() TO service_role;