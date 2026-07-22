
-- 1) Unicidade real no banco para bloquear duplicações de slot programado
CREATE UNIQUE INDEX IF NOT EXISTS task_executions_unique_slot
  ON public.task_executions (task_id, unit_id, scheduled_at);

-- 2) Função materializadora — SECURITY DEFINER, search_path fixo, idempotente
CREATE OR REPLACE FUNCTION public.materialize_task_executions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  WITH days AS (
    SELECT 0 AS d UNION ALL SELECT 1
  ),
  planned AS (
    SELECT
      t.id              AS task_id,
      t.organization_id AS organization_id,
      t.unit_id         AS unit_id,
      t.shift_id        AS shift_id,
      -- combina a DATA LOCAL da unidade com tasks.scheduled_time e devolve timestamptz
      (
        (((now() AT TIME ZONE u.timezone)::date + days.d)::text
         || ' ' || t.scheduled_time::text)::timestamp
      ) AT TIME ZONE u.timezone AS scheduled_at
    FROM public.tasks t
    JOIN public.units u ON u.id = t.unit_id
    CROSS JOIN days
    WHERE t.is_active = true
      AND u.is_active = true
      AND t.scheduled_time IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.task_executions
      (task_id, organization_id, unit_id, shift_id, scheduled_at, status)
    SELECT p.task_id, p.organization_id, p.unit_id, p.shift_id, p.scheduled_at, 'pending'::execution_status
    FROM planned p
    ON CONFLICT (task_id, unit_id, scheduled_at) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

-- Restringir execução: nunca ao anon; somente cron/service_role
REVOKE ALL ON FUNCTION public.materialize_task_executions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.materialize_task_executions() FROM anon;
REVOKE ALL ON FUNCTION public.materialize_task_executions() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.materialize_task_executions() TO service_role;
GRANT  EXECUTE ON FUNCTION public.materialize_task_executions() TO postgres;

-- 3) pg_cron: garantir que o job existe (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'materialize-daily-task-executions') THEN
    PERFORM cron.unschedule('materialize-daily-task-executions');
  END IF;
  PERFORM cron.schedule(
    'materialize-daily-task-executions',
    '*/15 * * * *',
    $cron$ SELECT public.materialize_task_executions(); $cron$
  );
END $$;

-- 4) View: corrigir critical_failures para NÃO marcar tarefas críticas futuras como falha
DROP VIEW IF EXISTS public.analytics_unit_daily_compliance;

CREATE VIEW public.analytics_unit_daily_compliance
WITH (security_invoker = true) AS
WITH daily AS (
  SELECT
    te.organization_id,
    te.unit_id,
    date_trunc('day', te.scheduled_at AT TIME ZONE u.timezone)::date AS reference_date,

    COUNT(*)::int AS total_scheduled_tasks,

    COUNT(*) FILTER (WHERE te.status = 'done')::int AS completed_tasks,

    COUNT(*) FILTER (
      WHERE te.status = 'done'
        AND te.executed_at IS NOT NULL
        AND te.executed_at <= te.scheduled_at
    )::int AS completed_on_time,

    COUNT(*) FILTER (
      WHERE te.status = 'done'
        AND te.executed_at IS NOT NULL
        AND te.executed_at >  te.scheduled_at
    )::int AS completed_late,

    COUNT(*) FILTER (
      WHERE te.status IN ('pending','late')
        AND te.scheduled_at < now()
    )::int AS overdue_open_tasks,

    (
      COUNT(*) FILTER (WHERE te.status = 'done' AND te.executed_at > te.scheduled_at)
    + COUNT(*) FILTER (WHERE te.status IN ('pending','late') AND te.scheduled_at < now())
    )::int AS delayed_tasks,

    -- Crítica só entra como falha se JÁ passou do horário sem estar 'done'
    COUNT(*) FILTER (
      WHERE t.weight = 'critica'
        AND te.status <> 'done'
        AND te.scheduled_at < now()
    )::int AS critical_failures,

    SUM(CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END)::int AS weight_total,

    SUM(CASE WHEN te.status = 'done'
             THEN CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END
             ELSE 0 END)::int AS weight_done,

    SUM(CASE WHEN te.status = 'done'
                  AND te.executed_at IS NOT NULL
                  AND te.executed_at <= te.scheduled_at
             THEN CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END
             ELSE 0 END)::int AS weight_done_on_time
  FROM public.task_executions te
  JOIN public.tasks t ON t.id = te.task_id
  JOIN public.units u ON u.id = te.unit_id
  GROUP BY te.organization_id, te.unit_id,
           date_trunc('day', te.scheduled_at AT TIME ZONE u.timezone)::date
),
ev AS (
  SELECT
    e.organization_id,
    e.unit_id,
    date_trunc('day', e.submitted_at AT TIME ZONE u.timezone)::date AS reference_date,
    COUNT(*)::int AS pending_evidence_reviews
  FROM public.evidences e
  JOIN public.units u ON u.id = e.unit_id
  WHERE e.status = 'pending'
  GROUP BY e.organization_id, e.unit_id,
           date_trunc('day', e.submitted_at AT TIME ZONE u.timezone)::date
)
SELECT
  d.organization_id,
  d.unit_id,
  u.name AS unit_name,
  d.reference_date,
  d.total_scheduled_tasks,
  d.completed_tasks,
  d.completed_on_time,
  d.completed_late,
  d.overdue_open_tasks,
  d.delayed_tasks,
  d.critical_failures,
  COALESCE(ev.pending_evidence_reviews, 0)::int AS pending_evidences,
  COALESCE(ev.pending_evidence_reviews, 0)::int AS pending_evidence_reviews,
  d.weight_total,
  d.weight_done,
  d.weight_done_on_time,
  ROUND(100.0 * d.weight_done::numeric         / NULLIF(d.weight_total, 0), 1) AS compliance_percentage,
  ROUND(100.0 * d.weight_done_on_time::numeric / NULLIF(d.weight_total, 0), 1) AS on_time_compliance_percentage
FROM daily d
JOIN public.units u ON u.id = d.unit_id
LEFT JOIN ev
  ON ev.organization_id = d.organization_id
 AND ev.unit_id = d.unit_id
 AND ev.reference_date = d.reference_date;

GRANT SELECT ON public.analytics_unit_daily_compliance TO authenticated;
