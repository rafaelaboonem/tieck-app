-- =========================================================================
-- 6B.3 — Filtro global de turno no Intelligence Dashboard
-- =========================================================================
-- O filtro global do /painel tinha apenas período e unidade. O detalhe da
-- unidade já filtrava por turno, mas os números do painel não podiam ser
-- recortados por turno de forma consistente.
--
-- Esta migration adiciona APENAS a dimensão de turno ao grão das duas views
-- analíticas, mantendo intacta toda a semântica certificada na 6B.2A e na
-- 6B.2D:
--
--   analytics_unit_daily_compliance   → organização + unidade + TURNO + dia
--   analytics_unit_daily_occurrences  → organização + unidade + TURNO + dia
--
-- Origem do turno em cada domínio (nunca derivada por engano):
--   * tarefas      → task_executions.shift_id (a execução já possui o turno;
--                    NÃO derivar do checklist);
--   * occurrences  → checklists.shift_id (a occurrence pertence ao schedule do
--                    checklist, e o turno é herdado dele).
--
-- Turno ausente (shift_id IS NULL) é um valor de grão como qualquer outro:
-- continua entrando quando o filtro é "todos os turnos" e NÃO aparece quando um
-- turno específico é selecionado. Nenhum turno fictício ("Sem turno") é criado.
--
-- Equivalência obrigatória (testada): com o filtro ausente, somar todas as
-- linhas por unidade reproduz EXATAMENTE os números anteriores — o grão ficou
-- mais fino, mas a particionamento por turno é exaustivo (inclusive o NULL), e
-- o join de evidências casa o turno com igualdade null-safe
-- (IS NOT DISTINCT FROM), de modo que execuções sem turno não perdem nem
-- duplicam evidências.
--
-- Nenhuma tabela, coluna, FK, índice, trigger, policy, RLS, RPC ou cron é
-- tocada: apenas as duas views são recriadas com os GRANTs de leitura
-- reaplicados. Zero DML no nível superior. Nenhuma migration anterior é
-- alterada.
-- =========================================================================

DROP VIEW IF EXISTS public.analytics_unit_daily_compliance;

CREATE VIEW public.analytics_unit_daily_compliance
WITH (security_invoker = true) AS
WITH daily AS (
  SELECT
    te.organization_id,
    te.unit_id,
    te.shift_id,
    sh.name AS shift_name,
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
  LEFT JOIN public.shifts sh ON sh.id = te.shift_id
  WHERE te.status <> 'cancelled'
  GROUP BY te.organization_id, te.unit_id, te.shift_id, sh.name,
           (date_trunc('day', te.scheduled_at AT TIME ZONE u.timezone))::date
),
ev AS (
  -- Contagem de OCORRÊNCIAS: execuções distintas com pelo menos uma evidência
  -- pendente, no MESMO grão de `daily` (organização + unidade + turno + dia civil
  -- da execução). O turno vem da própria execução, como em `daily`.
  SELECT
    te.organization_id,
    te.unit_id,
    te.shift_id,
    (date_trunc('day', te.scheduled_at AT TIME ZONE u.timezone))::date AS reference_date,
    COUNT(DISTINCT te.id)::int AS pending_evidence_executions
  FROM public.evidences e
  JOIN public.task_executions te ON te.id = e.task_execution_id
  JOIN public.units u ON u.id = te.unit_id
  WHERE e.status = 'pending'
    AND te.status <> 'cancelled'
  GROUP BY te.organization_id, te.unit_id, te.shift_id,
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
    AS due_compliance_percentage,
  -- Dimensão de turno (6B.3). NULL é um valor de grão válido e continua
  -- entrando em "todos os turnos".
  d.shift_id,
  d.shift_name
FROM daily d
JOIN public.units u ON u.id = d.unit_id
LEFT JOIN ev
  ON ev.organization_id = d.organization_id
 AND ev.unit_id = d.unit_id
 AND ev.reference_date = d.reference_date
 -- Igualdade null-safe: uma execução sem turno casa com a contagem de
 -- evidências da própria execução (ambos NULL), sem perder nem duplicar.
 AND ev.shift_id IS NOT DISTINCT FROM d.shift_id;

GRANT SELECT ON public.analytics_unit_daily_compliance TO authenticated;
GRANT SELECT ON public.analytics_unit_daily_compliance TO service_role;

-- -------------------------------------------------------------------------
-- Rotinas agendadas — mesmo grão, com o turno herdado do CHECKLIST
-- -------------------------------------------------------------------------
-- A occurrence pertence ao schedule do checklist, então o turno exibido e
-- filtrado é checklists.shift_id. Toda a semântica da 6B.2D é preservada:
-- reference_date é occurrence_date (nunca due_at::date), "aberta em atraso" e
-- "concluída com atraso" continuam categorias diferentes, e checklists sem
-- unidade continuam fora de uma agregação POR unidade.
-- -------------------------------------------------------------------------

DROP VIEW IF EXISTS public.analytics_unit_daily_occurrences;

CREATE VIEW public.analytics_unit_daily_occurrences
WITH (security_invoker = true) AS
SELECT
  c.workspace_id                             AS organization_id,
  c.unit_id                                  AS unit_id,
  u.name                                     AS unit_name,
  o.occurrence_date                          AS reference_date,
  c.shift_id                                 AS shift_id,
  sh.name                                    AS shift_name,

  COUNT(*)::int                              AS total_occurrences,
  COUNT(*) FILTER (WHERE o.completed_at IS NOT NULL)::int
                                             AS completed_occurrences,
  COUNT(*) FILTER (
    WHERE o.completed_at IS NOT NULL AND o.completed_at <= o.due_at
  )::int                                     AS completed_on_time,
  COUNT(*) FILTER (
    WHERE o.completed_at IS NOT NULL AND o.completed_at > o.due_at
  )::int                                     AS completed_late,
  -- Aberta em atraso: ainda exige ação.
  COUNT(*) FILTER (
    WHERE o.completed_at IS NULL AND o.due_at < now()
  )::int                                     AS overdue_open_occurrences,
  -- Aberta dentro do prazo (iniciada ou não) — started_at nunca conclui.
  COUNT(*) FILTER (
    WHERE o.completed_at IS NULL AND o.due_at >= now()
  )::int                                     AS pending_open_occurrences,
  -- Vencidas até agora (concluídas ou não): "deveriam ter ocorrido".
  COUNT(*) FILTER (WHERE o.due_at <= now())::int
                                             AS due_occurrences
FROM public.checklist_execution_occurrences o
JOIN public.checklist_execution_schedules s ON s.id = o.schedule_id
JOIN public.checklists c ON c.id = s.checklist_id
JOIN public.units u ON u.id = c.unit_id
LEFT JOIN public.shifts sh ON sh.id = c.shift_id
WHERE c.unit_id IS NOT NULL
  AND c.workspace_id IS NOT NULL
GROUP BY c.workspace_id, c.unit_id, u.name, o.occurrence_date, c.shift_id, sh.name;

GRANT SELECT ON public.analytics_unit_daily_occurrences TO authenticated;
GRANT SELECT ON public.analytics_unit_daily_occurrences TO service_role;
