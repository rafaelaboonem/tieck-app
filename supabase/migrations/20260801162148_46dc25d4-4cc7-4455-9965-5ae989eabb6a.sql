CREATE TABLE public.vision_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  session_id text NOT NULL,
  standard_id uuid,
  action text NOT NULL,
  step text NOT NULL,
  provider text NOT NULL DEFAULT 'cloudflare',
  model_id text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_neurons numeric NOT NULL DEFAULT 0,
  inference_ms integer NOT NULL DEFAULT 0,
  decision text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vision_usage_events_ws_created_idx ON public.vision_usage_events (workspace_id, created_at DESC);
CREATE INDEX vision_usage_events_session_idx ON public.vision_usage_events (session_id);

GRANT SELECT ON public.vision_usage_events TO authenticated;
GRANT ALL ON public.vision_usage_events TO service_role;

ALTER TABLE public.vision_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their workspace vision usage"
ON public.vision_usage_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workspaces w
  WHERE w.id = vision_usage_events.workspace_id AND w.owner_id = auth.uid()
));

CREATE TABLE public.vision_session_usage (
  session_id text NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  live_calls integer NOT NULL DEFAULT 0,
  final_calls integer NOT NULL DEFAULT 0,
  last_call_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id)
);

CREATE INDEX vision_session_usage_ws_idx ON public.vision_session_usage (workspace_id, created_at DESC);

GRANT SELECT ON public.vision_session_usage TO authenticated;
GRANT ALL ON public.vision_session_usage TO service_role;

ALTER TABLE public.vision_session_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their workspace vision sessions"
ON public.vision_session_usage FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workspaces w
  WHERE w.id = vision_session_usage.workspace_id AND w.owner_id = auth.uid()
));

CREATE TRIGGER vision_session_usage_updated_at
BEFORE UPDATE ON public.vision_session_usage
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.vision_session_consume(
  p_session_id text,
  p_workspace_id uuid,
  p_user_id uuid,
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
  v_row public.vision_session_usage%ROWTYPE;
  v_used integer := 0;
  v_gap_ms integer;
BEGIN
  IF coalesce(btrim(p_session_id), '') = '' THEN
    RETURN QUERY SELECT false, 0, 0, 'session_required';
    RETURN;
  END IF;

  -- limpeza best-effort de sessões antigas
  DELETE FROM public.vision_session_usage WHERE created_at < now() - interval '24 hours';

  INSERT INTO public.vision_session_usage (session_id, workspace_id, user_id)
  VALUES (p_session_id, p_workspace_id, p_user_id)
  ON CONFLICT (session_id) DO NOTHING;

  SELECT * INTO v_row FROM public.vision_session_usage
   WHERE session_id = p_session_id FOR UPDATE;

  IF v_row.user_id IS DISTINCT FROM p_user_id
     OR v_row.workspace_id IS DISTINCT FROM p_workspace_id THEN
    RETURN QUERY SELECT false, 0, 0, 'session_mismatch';
    RETURN;
  END IF;

  v_used := CASE WHEN p_kind = 'live' THEN v_row.live_calls ELSE v_row.final_calls END;

  IF v_used >= p_limit THEN
    RETURN QUERY SELECT false, v_used, 0, 'session_limit_reached';
    RETURN;
  END IF;

  IF p_min_interval_ms > 0 AND v_row.last_call_at IS NOT NULL THEN
    v_gap_ms := (EXTRACT(EPOCH FROM (now() - v_row.last_call_at)) * 1000)::int;
    IF v_gap_ms < p_min_interval_ms THEN
      RETURN QUERY SELECT false, v_used, GREATEST(p_limit - v_used, 0), 'cooldown';
      RETURN;
    END IF;
  END IF;

  UPDATE public.vision_session_usage
     SET live_calls  = live_calls  + CASE WHEN p_kind = 'live' THEN 1 ELSE 0 END,
         final_calls = final_calls + CASE WHEN p_kind = 'live' THEN 0 ELSE 1 END,
         last_call_at = now()
   WHERE session_id = p_session_id;

  v_used := v_used + 1;
  RETURN QUERY SELECT true, v_used, GREATEST(p_limit - v_used, 0), 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION public.vision_session_consume(text, uuid, uuid, text, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.vision_session_consume(text, uuid, uuid, text, integer, integer) FROM anon, authenticated;