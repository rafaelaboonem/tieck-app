
-- =========================================================================
-- 1) VIEW analytics_unit_daily_compliance com métricas due_* e sem canceladas
-- =========================================================================
DROP VIEW IF EXISTS public.analytics_unit_daily_compliance;

CREATE VIEW public.analytics_unit_daily_compliance
WITH (security_invoker = true) AS
WITH daily AS (
  SELECT
    te.organization_id,
    te.unit_id,
    (date_trunc('day', te.scheduled_at AT TIME ZONE u.timezone))::date AS reference_date,

    -- planejamento completo (exclui canceladas)
    COUNT(*)::int
      AS total_scheduled_tasks,
    COUNT(*) FILTER (WHERE te.status = 'done')::int
      AS completed_tasks,
    COUNT(*) FILTER (WHERE te.status = 'done' AND te.executed_at IS NOT NULL AND te.executed_at <= te.scheduled_at)::int
      AS completed_on_time,
    COUNT(*) FILTER (WHERE te.status = 'done' AND te.executed_at IS NOT NULL AND te.executed_at >  te.scheduled_at)::int
      AS completed_late,
    COUNT(*) FILTER (WHERE te.status IN ('pending','late') AND te.scheduled_at < now())::int
      AS overdue_open_tasks,
    (
      COUNT(*) FILTER (WHERE te.status = 'done' AND te.executed_at > te.scheduled_at)
      + COUNT(*) FILTER (WHERE te.status IN ('pending','late') AND te.scheduled_at < now())
    )::int AS delayed_tasks,
    COUNT(*) FILTER (
      WHERE t.weight = 'critica'
        AND te.status NOT IN ('done','cancelled')
        AND te.scheduled_at < now()
    )::int AS critical_failures,

    SUM(CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END)::int
      AS weight_total,
    SUM(CASE WHEN te.status = 'done'
             THEN CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END
             ELSE 0 END)::int
      AS weight_done,
    SUM(CASE WHEN te.status = 'done' AND te.executed_at IS NOT NULL AND te.executed_at <= te.scheduled_at
             THEN CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END
             ELSE 0 END)::int
      AS weight_done_on_time,

    -- métricas "vencidas até o momento atual" (due_*)
    COUNT(*) FILTER (WHERE te.scheduled_at <= now())::int
      AS total_due_tasks,
    COUNT(*) FILTER (WHERE te.scheduled_at <= now() AND te.status = 'done')::int
      AS due_completed_tasks,
    COALESCE(SUM(CASE WHEN te.scheduled_at <= now()
             THEN CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END
             ELSE 0 END), 0)::int
      AS due_weight_total,
    COALESCE(SUM(CASE WHEN te.scheduled_at <= now() AND te.status = 'done'
             THEN CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END
             ELSE 0 END), 0)::int
      AS due_weight_done
  FROM public.task_executions te
  JOIN public.tasks t ON t.id = te.task_id
  JOIN public.units u ON u.id = te.unit_id
  WHERE te.status <> 'cancelled'
  GROUP BY te.organization_id, te.unit_id,
           (date_trunc('day', te.scheduled_at AT TIME ZONE u.timezone))::date
),
ev AS (
  SELECT
    e.organization_id,
    e.unit_id,
    (date_trunc('day', e.submitted_at AT TIME ZONE u.timezone))::date AS reference_date,
    COUNT(*)::int AS pending_evidence_reviews
  FROM public.evidences e
  JOIN public.units u ON u.id = e.unit_id
  WHERE e.status = 'pending'
  GROUP BY e.organization_id, e.unit_id,
           (date_trunc('day', e.submitted_at AT TIME ZONE u.timezone))::date
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
  COALESCE(ev.pending_evidence_reviews, 0) AS pending_evidences,
  COALESCE(ev.pending_evidence_reviews, 0) AS pending_evidence_reviews,
  d.weight_total,
  d.weight_done,
  d.weight_done_on_time,
  ROUND(100.0 * d.weight_done::numeric / NULLIF(d.weight_total, 0), 1)
    AS compliance_percentage,
  ROUND(100.0 * d.weight_done_on_time::numeric / NULLIF(d.weight_total, 0), 1)
    AS on_time_compliance_percentage,
  d.total_due_tasks,
  d.due_completed_tasks,
  d.due_weight_total,
  d.due_weight_done,
  ROUND(100.0 * d.due_weight_done::numeric / NULLIF(d.due_weight_total, 0), 1)
    AS due_compliance_percentage
FROM daily d
JOIN public.units u ON u.id = d.unit_id
LEFT JOIN ev
  ON ev.organization_id = d.organization_id
 AND ev.unit_id = d.unit_id
 AND ev.reference_date = d.reference_date;

GRANT SELECT ON public.analytics_unit_daily_compliance TO authenticated;
GRANT SELECT ON public.analytics_unit_daily_compliance TO service_role;

-- =========================================================================
-- 2) materialize_task_executions endurecida
-- =========================================================================
CREATE OR REPLACE FUNCTION public.materialize_task_executions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
      (
        (((now() AT TIME ZONE u.timezone)::date + days.d)::text
         || ' ' || t.scheduled_time::text)::timestamp
      ) AT TIME ZONE u.timezone AS scheduled_at,
      COALESCE(t.active_from, t.created_at) AS active_from
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
    SELECT p.task_id, p.organization_id, p.unit_id, p.shift_id, p.scheduled_at, 'pending'::public.execution_status
    FROM planned p
    WHERE p.scheduled_at >= p.active_from
    ON CONFLICT (task_id, unit_id, scheduled_at) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

-- Segurança: schema public sem CREATE aberto; execução restrita a service_role/postgres
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON FUNCTION public.materialize_task_executions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_task_executions() TO service_role;

-- =========================================================================
-- 3) Trigger: tasks (desativação, reativação, alteração de horário)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_task_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Desativação: cancela slots futuros pendentes
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE public.task_executions
       SET status = 'cancelled'::public.execution_status,
           cancelled_at = now(),
           cancellation_reason = 'task_deactivated'
     WHERE task_id = NEW.id
       AND status = 'pending'
       AND scheduled_at > now();
  END IF;

  -- Reativação: reinicia active_from para não gerar atraso retroativo
  IF OLD.is_active = false AND NEW.is_active = true THEN
    NEW.active_from := now();
  END IF;

  -- Alteração de horário: cancela slot antigo pendente futuro
  IF NEW.is_active = true
     AND OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time THEN
    UPDATE public.task_executions
       SET status = 'cancelled'::public.execution_status,
           cancelled_at = now(),
           cancellation_reason = 'schedule_changed'
     WHERE task_id = NEW.id
       AND status = 'pending'
       AND scheduled_at > now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_lifecycle ON public.tasks;
CREATE TRIGGER trg_task_lifecycle
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.handle_task_lifecycle();

-- Após um UPDATE em tasks, roda a materialização para refletir o novo horário / reativação
CREATE OR REPLACE FUNCTION public.rematerialize_after_task_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time)
     OR (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    PERFORM public.materialize_task_executions();
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_rematerialize ON public.tasks;
CREATE TRIGGER trg_task_rematerialize
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.rematerialize_after_task_change();

-- =========================================================================
-- 4) Trigger: units (desativação)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_unit_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE public.task_executions
       SET status = 'cancelled'::public.execution_status,
           cancelled_at = now(),
           cancellation_reason = 'unit_deactivated'
     WHERE unit_id = NEW.id
       AND status = 'pending'
       AND scheduled_at > now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unit_lifecycle ON public.units;
CREATE TRIGGER trg_unit_lifecycle
BEFORE UPDATE ON public.units
FOR EACH ROW
EXECUTE FUNCTION public.handle_unit_lifecycle();
