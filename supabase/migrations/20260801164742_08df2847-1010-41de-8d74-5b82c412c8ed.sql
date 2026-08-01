-- ============ 1. Sessões do laboratório criadas pelo servidor ============
CREATE TABLE IF NOT EXISTS public.vision_lab_sessions (
  session_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  standard_id uuid REFERENCES public.visual_standards(id) ON DELETE CASCADE,
  response_id uuid,
  block_id text,
  live_calls integer NOT NULL DEFAULT 0,
  final_calls integer NOT NULL DEFAULT 0,
  attempts_created integer NOT NULL DEFAULT 0,
  last_live_at timestamptz,
  last_call_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vision_lab_sessions TO authenticated;
GRANT ALL ON public.vision_lab_sessions TO service_role;
ALTER TABLE public.vision_lab_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab sessions readable by owner" ON public.vision_lab_sessions;
CREATE POLICY "lab sessions readable by owner"
  ON public.vision_lab_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS vision_lab_sessions_user_std_idx
  ON public.vision_lab_sessions (user_id, standard_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS vision_lab_sessions_created_idx
  ON public.vision_lab_sessions (user_id, created_at DESC);

-- ============ 2. Tentativas (uma decisão final por tentativa) ============
CREATE TABLE IF NOT EXISTS public.vision_lab_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL REFERENCES public.vision_lab_sessions(session_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  standard_id uuid,
  status text NOT NULL DEFAULT 'open',
  result jsonb,
  failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vision_lab_attempts TO authenticated;
GRANT ALL ON public.vision_lab_attempts TO service_role;
ALTER TABLE public.vision_lab_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab attempts readable by owner" ON public.vision_lab_attempts;
CREATE POLICY "lab attempts readable by owner"
  ON public.vision_lab_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS vision_lab_attempts_session_idx
  ON public.vision_lab_attempts (session_id, created_at DESC);

-- ============ 3. Gate conservador + verificabilidade no padrão ============
ALTER TABLE public.visual_standards
  ADD COLUMN IF NOT EXISTS confidence_threshold numeric NOT NULL DEFAULT 0.80,
  ADD COLUMN IF NOT EXISTS visual_verifiability text,
  ADD COLUMN IF NOT EXISTS required_evidence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unverifiable_conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reformulation_suggestion jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ============ 4. Telemetria honesta (usage ausente = null) ============
ALTER TABLE public.vision_usage_events
  ALTER COLUMN input_tokens DROP NOT NULL,
  ALTER COLUMN output_tokens DROP NOT NULL,
  ALTER COLUMN estimated_neurons DROP NOT NULL;

ALTER TABLE public.vision_usage_events
  ADD COLUMN IF NOT EXISTS usage_missing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attempt_id uuid;

CREATE INDEX IF NOT EXISTS vision_usage_events_created_idx
  ON public.vision_usage_events (created_at);

-- métricas diárias agregadas (sem imagens, prompts ou dados sensíveis)
CREATE TABLE IF NOT EXISTS public.vision_usage_daily (
  day date NOT NULL,
  workspace_id uuid NOT NULL,
  model_id text NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  calls_without_usage integer NOT NULL DEFAULT 0,
  input_tokens bigint,
  output_tokens bigint,
  estimated_neurons numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, workspace_id, model_id)
);

GRANT SELECT ON public.vision_usage_daily TO authenticated;
GRANT ALL ON public.vision_usage_daily TO service_role;
ALTER TABLE public.vision_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily usage readable by workspace owner" ON public.vision_usage_daily;
CREATE POLICY "daily usage readable by workspace owner"
  ON public.vision_usage_daily FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspaces w
     WHERE w.id = vision_usage_daily.workspace_id AND w.owner_id = auth.uid()
  ));

-- ============ 5. RPCs de sessão ============
CREATE OR REPLACE FUNCTION public.vision_lab_session_start(
  p_user_id uuid,
  p_workspace_id uuid,
  p_standard_id uuid,
  p_ttl_seconds integer DEFAULT 900,
  p_hourly_limit integer DEFAULT 12
)
RETURNS TABLE(session_id text, expires_at timestamptz, live_used integer, final_used integer,
              attempts_used integer, reused boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.vision_lab_sessions%ROWTYPE;
  v_recent integer;
  v_id text;
  v_ttl integer := LEAST(GREATEST(COALESCE(p_ttl_seconds, 900), 600), 900);
BEGIN
  DELETE FROM public.vision_lab_sessions WHERE expires_at < now() - interval '1 hour';

  SELECT * INTO v_row
    FROM public.vision_lab_sessions s
   WHERE s.user_id = p_user_id
     AND s.workspace_id = p_workspace_id
     AND s.standard_id IS NOT DISTINCT FROM p_standard_id
     AND s.expires_at > now()
   ORDER BY s.created_at DESC
   LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_row.session_id, v_row.expires_at, v_row.live_calls,
                        v_row.final_calls, v_row.attempts_created, true, 'ok'::text;
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_recent
    FROM public.vision_lab_sessions s
   WHERE s.user_id = p_user_id
     AND s.created_at > now() - interval '1 hour';

  IF v_recent >= GREATEST(p_hourly_limit, 1) THEN
    RETURN QUERY SELECT NULL::text, NULL::timestamptz, 0, 0, 0, false, 'hourly_limit'::text;
    RETURN;
  END IF;

  v_id := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.vision_lab_sessions (session_id, user_id, workspace_id, standard_id, expires_at)
  VALUES (v_id, p_user_id, p_workspace_id, p_standard_id, now() + make_interval(secs => v_ttl));

  RETURN QUERY SELECT v_id, now() + make_interval(secs => v_ttl), 0, 0, 0, false, 'ok'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.vision_lab_session_consume(
  p_session_id text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_kind text,
  p_limit integer,
  p_min_interval_ms integer DEFAULT 0
)
RETURNS TABLE(allowed boolean, used integer, remaining integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.vision_lab_sessions%ROWTYPE;
  v_used integer;
  v_gap_ms integer;
BEGIN
  SELECT * INTO v_row FROM public.vision_lab_sessions s
   WHERE s.session_id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0, 'session_unknown'::text;
    RETURN;
  END IF;
  IF v_row.user_id IS DISTINCT FROM p_user_id
     OR v_row.workspace_id IS DISTINCT FROM p_workspace_id THEN
    RETURN QUERY SELECT false, 0, 0, 'session_mismatch'::text;
    RETURN;
  END IF;
  IF v_row.expires_at <= now() THEN
    RETURN QUERY SELECT false, 0, 0, 'session_expired'::text;
    RETURN;
  END IF;

  v_used := CASE WHEN p_kind = 'live' THEN v_row.live_calls ELSE v_row.final_calls END;

  IF v_used >= p_limit THEN
    RETURN QUERY SELECT false, v_used, 0, 'budget_exhausted'::text;
    RETURN;
  END IF;

  IF p_min_interval_ms > 0 AND v_row.last_live_at IS NOT NULL AND p_kind = 'live' THEN
    v_gap_ms := (EXTRACT(EPOCH FROM (now() - v_row.last_live_at)) * 1000)::int;
    IF v_gap_ms < p_min_interval_ms THEN
      RETURN QUERY SELECT false, v_used, GREATEST(p_limit - v_used, 0), 'cooldown'::text;
      RETURN;
    END IF;
  END IF;

  UPDATE public.vision_lab_sessions
     SET live_calls   = live_calls  + CASE WHEN p_kind = 'live' THEN 1 ELSE 0 END,
         final_calls  = final_calls + CASE WHEN p_kind = 'live' THEN 0 ELSE 1 END,
         last_live_at = CASE WHEN p_kind = 'live' THEN now() ELSE last_live_at END,
         last_call_at = now(),
         updated_at   = now()
   WHERE session_id = p_session_id;

  v_used := v_used + 1;
  RETURN QUERY SELECT true, v_used, GREATEST(p_limit - v_used, 0), 'ok'::text;
END;
$$;

-- ============ 6. RPCs de tentativa ============
CREATE OR REPLACE FUNCTION public.vision_lab_attempt_create(
  p_session_id text,
  p_user_id uuid,
  p_max_attempts integer DEFAULT 5
)
RETURNS TABLE(attempt_id uuid, attempts_used integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.vision_lab_sessions%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_row FROM public.vision_lab_sessions s
   WHERE s.session_id = p_session_id FOR UPDATE;

  IF NOT FOUND OR v_row.user_id IS DISTINCT FROM p_user_id THEN
    RETURN QUERY SELECT NULL::uuid, 0, 'session_mismatch'::text;
    RETURN;
  END IF;
  IF v_row.expires_at <= now() THEN
    RETURN QUERY SELECT NULL::uuid, v_row.attempts_created, 'session_expired'::text;
    RETURN;
  END IF;
  IF v_row.attempts_created >= GREATEST(p_max_attempts, 1) THEN
    RETURN QUERY SELECT NULL::uuid, v_row.attempts_created, 'attempt_limit_reached'::text;
    RETURN;
  END IF;

  INSERT INTO public.vision_lab_attempts (session_id, user_id, workspace_id, standard_id)
  VALUES (p_session_id, p_user_id, v_row.workspace_id, v_row.standard_id)
  RETURNING id INTO v_id;

  UPDATE public.vision_lab_sessions
     SET attempts_created = attempts_created + 1, updated_at = now()
   WHERE session_id = p_session_id;

  RETURN QUERY SELECT v_id, v_row.attempts_created + 1, 'ok'::text;
END;
$$;

-- Reserva a tentativa para análise: devolve resultado existente sem nova inferência.
CREATE OR REPLACE FUNCTION public.vision_lab_attempt_claim(
  p_attempt_id uuid,
  p_user_id uuid,
  p_max_failures integer DEFAULT 3
)
RETURNS TABLE(claimed boolean, cached jsonb, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.vision_lab_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.vision_lab_attempts a
   WHERE a.id = p_attempt_id FOR UPDATE;

  IF NOT FOUND OR v_row.user_id IS DISTINCT FROM p_user_id THEN
    RETURN QUERY SELECT false, NULL::jsonb, 'attempt_unknown'::text;
    RETURN;
  END IF;
  IF v_row.status = 'completed' THEN
    RETURN QUERY SELECT false, v_row.result, 'already_completed'::text;
    RETURN;
  END IF;
  IF v_row.status = 'running' THEN
    RETURN QUERY SELECT false, NULL::jsonb, 'already_running'::text;
    RETURN;
  END IF;
  IF v_row.failures >= GREATEST(p_max_failures, 1) THEN
    RETURN QUERY SELECT false, NULL::jsonb, 'too_many_failures'::text;
    RETURN;
  END IF;

  UPDATE public.vision_lab_attempts
     SET status = 'running', updated_at = now()
   WHERE id = p_attempt_id;

  RETURN QUERY SELECT true, NULL::jsonb, 'ok'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.vision_lab_attempt_finish(
  p_attempt_id uuid,
  p_user_id uuid,
  p_result jsonb,
  p_technical_failure boolean DEFAULT false
)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vision_lab_attempts a
                  WHERE a.id = p_attempt_id AND a.user_id = p_user_id) THEN
    RETURN QUERY SELECT false, 'attempt_unknown'::text;
    RETURN;
  END IF;

  IF p_technical_failure THEN
    -- falha técnica não consome a tentativa do usuário, mas conta contra abuso
    UPDATE public.vision_lab_attempts
       SET status = 'open', failures = failures + 1, updated_at = now()
     WHERE id = p_attempt_id;
    RETURN QUERY SELECT true, 'retryable'::text;
    RETURN;
  END IF;

  UPDATE public.vision_lab_attempts
     SET status = 'completed', result = p_result, updated_at = now()
   WHERE id = p_attempt_id;
  RETURN QUERY SELECT true, 'ok'::text;
END;
$$;

-- ============ 7. Retenção de 90 dias (agrega antes de remover) ============
CREATE OR REPLACE FUNCTION public.vision_telemetry_retention(p_days integer DEFAULT 90)
RETURNS TABLE(aggregated integer, deleted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cut timestamptz := now() - make_interval(days => GREATEST(p_days, 30));
  v_agg integer := 0;
  v_del integer := 0;
BEGIN
  WITH src AS (
    SELECT date_trunc('day', created_at)::date AS day,
           workspace_id, model_id,
           count(*)::int AS calls,
           count(*) FILTER (WHERE usage_missing)::int AS calls_without_usage,
           sum(input_tokens)::bigint AS input_tokens,
           sum(output_tokens)::bigint AS output_tokens,
           sum(estimated_neurons)::numeric AS estimated_neurons
      FROM public.vision_usage_events
     WHERE created_at < v_cut
     GROUP BY 1, 2, 3
  ), ins AS (
    INSERT INTO public.vision_usage_daily AS d
      (day, workspace_id, model_id, calls, calls_without_usage, input_tokens, output_tokens, estimated_neurons)
    SELECT day, workspace_id, model_id, calls, calls_without_usage, input_tokens, output_tokens, estimated_neurons
      FROM src
    ON CONFLICT (day, workspace_id, model_id) DO UPDATE
      SET calls = d.calls + EXCLUDED.calls,
          calls_without_usage = d.calls_without_usage + EXCLUDED.calls_without_usage,
          input_tokens = COALESCE(d.input_tokens, 0) + COALESCE(EXCLUDED.input_tokens, 0),
          output_tokens = COALESCE(d.output_tokens, 0) + COALESCE(EXCLUDED.output_tokens, 0),
          estimated_neurons = COALESCE(d.estimated_neurons, 0) + COALESCE(EXCLUDED.estimated_neurons, 0)
    RETURNING 1
  )
  SELECT count(*)::int INTO v_agg FROM ins;

  DELETE FROM public.vision_usage_events WHERE created_at < v_cut;
  GET DIAGNOSTICS v_del = ROW_COUNT;

  DELETE FROM public.vision_lab_attempts WHERE created_at < now() - interval '30 days';

  RETURN QUERY SELECT v_agg, v_del;
END;
$$;

REVOKE ALL ON FUNCTION public.vision_lab_session_start(uuid, uuid, uuid, integer, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.vision_lab_session_consume(text, uuid, uuid, text, integer, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.vision_lab_attempt_create(text, uuid, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.vision_lab_attempt_claim(uuid, uuid, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.vision_lab_attempt_finish(uuid, uuid, jsonb, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.vision_telemetry_retention(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vision_lab_session_start(uuid, uuid, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.vision_lab_session_consume(text, uuid, uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.vision_lab_attempt_create(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.vision_lab_attempt_claim(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.vision_lab_attempt_finish(uuid, uuid, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.vision_telemetry_retention(integer) TO service_role;