
DROP VIEW IF EXISTS public.analytics_unit_daily_compliance;

CREATE VIEW public.analytics_unit_daily_compliance
WITH (security_invoker = true) AS
WITH daily AS (
  SELECT
    te.organization_id,
    te.unit_id,
    date_trunc('day', te.scheduled_at)::date AS reference_date,
    COUNT(*)::int AS total_scheduled_tasks,
    COUNT(*) FILTER (WHERE te.status = 'done')::int AS completed_tasks,
    COUNT(*) FILTER (
      WHERE te.status = 'done'
        AND te.executed_at IS NOT NULL
        AND te.executed_at <= te.scheduled_at
    )::int AS completed_on_time,
    COUNT(*) FILTER (WHERE te.status = 'late')::int AS delayed_tasks,
    COUNT(*) FILTER (WHERE t.weight = 'critica' AND te.status <> 'done')::int AS critical_failures,
    SUM(CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END)::int AS weight_total,
    SUM(CASE WHEN te.status = 'done'
             THEN CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END
             ELSE 0 END)::int AS weight_done
  FROM public.task_executions te
  JOIN public.tasks t ON t.id = te.task_id
  GROUP BY te.organization_id, te.unit_id, date_trunc('day', te.scheduled_at)::date
),
ev AS (
  SELECT
    e.organization_id,
    e.unit_id,
    date_trunc('day', e.submitted_at)::date AS reference_date,
    COUNT(*)::int AS pending_evidences
  FROM public.evidences e
  WHERE e.status = 'pending'
  GROUP BY e.organization_id, e.unit_id, date_trunc('day', e.submitted_at)::date
)
SELECT
  d.organization_id,
  d.unit_id,
  u.name AS unit_name,
  d.reference_date,
  d.total_scheduled_tasks,
  d.completed_tasks,
  d.completed_on_time,
  d.delayed_tasks,
  d.critical_failures,
  COALESCE(ev.pending_evidences, 0)::int AS pending_evidences,
  d.weight_total,
  d.weight_done,
  ROUND(100.0 * d.weight_done::numeric / NULLIF(d.weight_total, 0), 1) AS compliance_percentage
FROM daily d
JOIN public.units u ON u.id = d.unit_id
LEFT JOIN ev
  ON ev.organization_id = d.organization_id
 AND ev.unit_id = d.unit_id
 AND ev.reference_date = d.reference_date;

GRANT SELECT ON public.analytics_unit_daily_compliance TO authenticated;
