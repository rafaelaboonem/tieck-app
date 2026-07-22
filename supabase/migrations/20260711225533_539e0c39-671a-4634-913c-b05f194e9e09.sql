
DROP VIEW IF EXISTS public.analytics_unit_daily_compliance;

/*
  View: public.analytics_unit_daily_compliance
  Granularidade: uma linha por (organization_id, unit_id, reference_date)

  Origem das tarefas programadas:
    task_executions — assumida como a fonte oficial de "tarefas programadas para o dia".
    (O modelo atual NÃO possui uma tabela de agendamento diário derivada de tasks.scheduled_time;
     por isso uma tarefa em `tasks` que nunca teve uma linha criada em `task_executions`
     NÃO aparece aqui. Ver limitações no relatório.)

  Data operacional (reference_date):
    date_trunc('day', te.scheduled_at AT TIME ZONE u.timezone)::date
    — timezone lido de units.timezone (default 'America/Sao_Paulo').

  Estratégia contra duplicação:
    A base é task_executions ⋈ tasks (relação 1:1 via FK), portanto cada execução aparece
    exatamente uma vez. Evidências são agregadas ANTES do join, num CTE separado (ev),
    também com granularidade unit/dia — nunca multiplicam contagem de tarefas.

  Pontualidade:
    Como o schema atual NÃO possui coluna dedicada de prazo/deadline nem tolerância,
    scheduled_at é tratado como o prazo final. "No prazo" = status='done' AND executed_at <= scheduled_at.
    Ver limitações — quando o modelo de janela for definido, esta regra deve ser revisitada.
*/
CREATE VIEW public.analytics_unit_daily_compliance
WITH (security_invoker = true) AS
WITH daily AS (
  SELECT
    te.organization_id,
    te.unit_id,
    -- data operacional no timezone da unidade
    date_trunc('day', te.scheduled_at AT TIME ZONE u.timezone)::date AS reference_date,

    COUNT(*)::int AS total_scheduled_tasks,

    -- concluídas (independente de pontualidade)
    COUNT(*) FILTER (WHERE te.status = 'done')::int AS completed_tasks,

    -- concluídas no prazo (executed_at <= scheduled_at)
    COUNT(*) FILTER (
      WHERE te.status = 'done'
        AND te.executed_at IS NOT NULL
        AND te.executed_at <= te.scheduled_at
    )::int AS completed_on_time,

    -- concluídas com atraso (executed_at > scheduled_at)
    COUNT(*) FILTER (
      WHERE te.status = 'done'
        AND te.executed_at IS NOT NULL
        AND te.executed_at >  te.scheduled_at
    )::int AS completed_late,

    -- ainda abertas (não concluídas) depois do prazo
    COUNT(*) FILTER (
      WHERE te.status IN ('pending','late')
        AND te.scheduled_at < now()
    )::int AS overdue_open_tasks,

    -- soma histórica (compatibilidade): abertas atrasadas + concluídas atrasadas
    (
      COUNT(*) FILTER (WHERE te.status = 'done' AND te.executed_at > te.scheduled_at)
    + COUNT(*) FILTER (WHERE te.status IN ('pending','late') AND te.scheduled_at < now())
    )::int AS delayed_tasks,

    COUNT(*) FILTER (WHERE t.weight = 'critica' AND te.status <> 'done')::int AS critical_failures,

    -- pesos ponderados (comum=1, importante=2, critica=5)
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
    -- quantidade de FOTOS aguardando análise (evidence reviews).
    -- NÃO é "quantidade de tarefas sem evidência" — o schema atual não tem
    -- coluna de "evidência obrigatória" em tasks, então essa métrica não é derivável.
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
  -- mantido: fotos pendentes de análise (compatibilidade com hook atual)
  COALESCE(ev.pending_evidence_reviews, 0)::int AS pending_evidences,
  COALESCE(ev.pending_evidence_reviews, 0)::int AS pending_evidence_reviews,
  d.weight_total,
  d.weight_done,
  d.weight_done_on_time,
  ROUND(100.0 * d.weight_done::numeric        / NULLIF(d.weight_total, 0), 1) AS compliance_percentage,
  ROUND(100.0 * d.weight_done_on_time::numeric / NULLIF(d.weight_total, 0), 1) AS on_time_compliance_percentage
FROM daily d
JOIN public.units u ON u.id = d.unit_id
LEFT JOIN ev
  ON ev.organization_id = d.organization_id
 AND ev.unit_id = d.unit_id
 AND ev.reference_date = d.reference_date;

GRANT SELECT ON public.analytics_unit_daily_compliance TO authenticated;
