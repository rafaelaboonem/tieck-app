
-- 1. Enum de peso de tarefa
DO $$ BEGIN
  CREATE TYPE public.task_weight AS ENUM ('comum','importante','critica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.execution_status AS ENUM ('pending','done','late','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. tasks
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  code text,
  title text NOT NULL,
  description text,
  weight public.task_weight NOT NULL DEFAULT 'comum',
  scheduled_time time,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select_scope" ON public.tasks
  FOR SELECT TO authenticated
  USING (public.can_access_unit(auth.uid(), organization_id, unit_id));

CREATE POLICY "tasks_write_reviewer" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_reviewer(auth.uid())
    AND public.can_access_unit(auth.uid(), organization_id, unit_id)
  );

CREATE POLICY "tasks_update_reviewer" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    public.is_reviewer(auth.uid())
    AND public.can_access_unit(auth.uid(), organization_id, unit_id)
  );

CREATE POLICY "tasks_delete_reviewer" ON public.tasks
  FOR DELETE TO authenticated
  USING (
    public.is_reviewer(auth.uid())
    AND public.can_access_unit(auth.uid(), organization_id, unit_id)
  );

CREATE INDEX IF NOT EXISTS tasks_unit_shift_idx ON public.tasks(unit_id, shift_id) WHERE is_active;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. task_executions
CREATE TABLE IF NOT EXISTS public.task_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  executed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  executed_at timestamptz,
  status public.execution_status NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_executions TO authenticated;
GRANT ALL ON public.task_executions TO service_role;

ALTER TABLE public.task_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exec_select_scope" ON public.task_executions
  FOR SELECT TO authenticated
  USING (public.can_access_unit(auth.uid(), organization_id, unit_id));

CREATE POLICY "exec_insert_self" ON public.task_executions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_unit(auth.uid(), organization_id, unit_id)
    AND (executed_by IS NULL OR executed_by = auth.uid() OR public.is_reviewer(auth.uid()))
  );

CREATE POLICY "exec_update_reviewer" ON public.task_executions
  FOR UPDATE TO authenticated
  USING (
    public.is_reviewer(auth.uid())
    AND public.can_access_unit(auth.uid(), organization_id, unit_id)
  );

CREATE POLICY "exec_delete_reviewer" ON public.task_executions
  FOR DELETE TO authenticated
  USING (
    public.is_reviewer(auth.uid())
    AND public.can_access_unit(auth.uid(), organization_id, unit_id)
  );

CREATE INDEX IF NOT EXISTS exec_unit_scheduled_idx ON public.task_executions(unit_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS exec_status_idx ON public.task_executions(status, scheduled_at DESC);

CREATE TRIGGER task_executions_updated_at
  BEFORE UPDATE ON public.task_executions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Views analíticas (herdam RLS das tabelas base)
CREATE OR REPLACE VIEW public.analytics_daily_compliance
WITH (security_invoker = true) AS
SELECT
  te.organization_id,
  te.unit_id,
  te.shift_id,
  date_trunc('day', te.scheduled_at)::date AS day,
  SUM(CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END)::int AS weight_total,
  SUM(CASE WHEN te.status = 'done'
           THEN CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END
           ELSE 0 END)::int AS weight_done,
  ROUND(
    100.0 * SUM(CASE WHEN te.status = 'done'
                     THEN CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END
                     ELSE 0 END)
    / NULLIF(SUM(CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END), 0),
    1
  ) AS compliance_pct,
  COUNT(*) FILTER (WHERE te.status = 'late') AS overdue_count,
  COUNT(*) FILTER (WHERE t.weight = 'critica' AND te.status <> 'done') AS critical_missed
FROM public.task_executions te
JOIN public.tasks t ON t.id = te.task_id
GROUP BY 1,2,3,4;

GRANT SELECT ON public.analytics_daily_compliance TO authenticated;

CREATE OR REPLACE VIEW public.analytics_overdue_tasks
WITH (security_invoker = true) AS
SELECT te.id, te.organization_id, te.unit_id, te.shift_id, te.task_id,
       t.title, t.weight, te.scheduled_at, te.status
FROM public.task_executions te
JOIN public.tasks t ON t.id = te.task_id
WHERE te.status IN ('late','pending')
  AND te.scheduled_at < now();

GRANT SELECT ON public.analytics_overdue_tasks TO authenticated;

CREATE OR REPLACE VIEW public.analytics_critical_failures
WITH (security_invoker = true) AS
SELECT te.id, te.organization_id, te.unit_id, te.shift_id, te.task_id,
       t.title, te.scheduled_at, te.status
FROM public.task_executions te
JOIN public.tasks t ON t.id = te.task_id
WHERE t.weight = 'critica'
  AND te.status <> 'done'
  AND te.scheduled_at::date = current_date;

GRANT SELECT ON public.analytics_critical_failures TO authenticated;

CREATE OR REPLACE VIEW public.analytics_unit_ranking
WITH (security_invoker = true) AS
SELECT
  te.organization_id,
  te.unit_id,
  u.name AS unit_name,
  ROUND(
    100.0 * SUM(CASE WHEN te.status = 'done'
                     THEN CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END
                     ELSE 0 END)
    / NULLIF(SUM(CASE t.weight WHEN 'comum' THEN 1 WHEN 'importante' THEN 2 WHEN 'critica' THEN 5 END), 0),
    1
  ) AS compliance_pct,
  COUNT(*) FILTER (WHERE te.status = 'late') AS overdue_count,
  COUNT(*) FILTER (WHERE t.weight = 'critica' AND te.status <> 'done') AS critical_missed
FROM public.task_executions te
JOIN public.tasks t ON t.id = te.task_id
JOIN public.units u ON u.id = te.unit_id
WHERE te.scheduled_at > now() - interval '24 hours'
GROUP BY 1,2,3;

GRANT SELECT ON public.analytics_unit_ranking TO authenticated;

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_executions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.evidences;
