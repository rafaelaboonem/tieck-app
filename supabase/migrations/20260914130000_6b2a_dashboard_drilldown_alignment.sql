-- =========================================================================
-- 6B.2A — Alinhamento entre o indicador agregado e o detalhe operacional
-- =========================================================================
-- A view analytics_unit_daily_compliance alimenta os cards de /painel e do
-- detalhe da unidade. Duas divergências semânticas foram comprovadas no
-- 6B.2-PREFLIGHT: o mesmo número não era reproduzível no drill-down.
--
--   1) EVIDÊNCIAS PENDENTES
--      Antes: COUNT(*) de linhas de evidences com status='pending', baldeadas
--             por evidences.submitted_at.
--      Agora: uma ocorrência operacional = UMA task_execution com >= 1
--             evidence pendente (COUNT(DISTINCT te.id)), baldeada pelo dia
--             civil da PRÓPRIA execução (scheduled_at AT TIME ZONE u.timezone).
--      Motivo: a entidade que o gestor abre no drill-down é a execução. Uma
--      execução com duas imagens pendentes conta 1 ocorrência; o número de
--      arquivos continua visível dentro da execução.
--
--   2) FALHA CRÍTICA
--      Antes: weight='critica' AND status NOT IN ('done','cancelled')
--             AND scheduled_at < now()  -> contava 'skipped' como falha.
--      Agora: 'skipped' é ignorada (deriveTaskStatus -> "ignorada") e NÃO é
--             falha crítica, alinhando a view a isCriticalFailure(), que só
--             considera o status visual "atrasada".
--
-- A fronteira do período (dia civil da unidade) é resolvida no cliente em
-- src/lib/unit-day-range.ts e não exige mudança de schema.
--
-- Este arquivo NÃO altera tabelas, colunas, RLS, policies nem RPCs: apenas
-- recria a view com a semântica canônica e reaplica os GRANTs de leitura.
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
    -- Falha crítica: vencida, não concluída, não cancelada e NÃO ignorada.
    -- 'skipped' = ignorada (deriveTaskStatus) e por isso nunca é falha crítica.
    COUNT(*) FILTER (
      WHERE t.weight = 'critica'
        AND te.status NOT IN ('done','cancelled')
        AND te.status <> 'skipped'
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
  -- Contagem de OCORRÊNCIAS: execuções distintas com pelo menos uma evidência
  -- pendente. O balde é o dia civil da execução (mesmo dia usado por `daily`),
  -- nunca o submitted_at da evidência — assim o card e a aba do drill-down
  -- descrevem exatamente o mesmo conjunto sob os mesmos filtros.
  -- Execuções canceladas ficam de fora, como em `daily` e como no drill-down
  -- (as canceladas só aparecem com "Mostrar canceladas").
  SELECT
    te.organization_id,
    te.unit_id,
    (date_trunc('day', te.scheduled_at AT TIME ZONE u.timezone))::date AS reference_date,
    COUNT(DISTINCT te.id)::int AS pending_evidence_executions
  FROM public.evidences e
  JOIN public.task_executions te ON te.id = e.task_execution_id
  JOIN public.units u ON u.id = te.unit_id
  WHERE e.status = 'pending'
    AND te.status <> 'cancelled'
  GROUP BY te.organization_id, te.unit_id,
           (date_trunc('day', te.scheduled_at AT TIME ZONE u.timezone))::date
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
  COALESCE(ev.pending_evidence_executions, 0) AS pending_evidences,
  COALESCE(ev.pending_evidence_executions, 0) AS pending_evidence_reviews,
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
