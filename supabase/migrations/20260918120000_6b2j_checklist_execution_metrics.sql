-- =========================================================================
-- 6B.2J — EXECUÇÃO POR CHECKLIST: contrato analítico do domínio ROTINAS
-- =========================================================================
--
-- Pergunta atendida: "como cada checklist de rotina está sendo executado no
-- período selecionado?" A identidade estatística é a OCCURRENCE — uma
-- occurrence é uma obrigação real (5E.2A: UNIQUE(schedule_id,
-- occurrence_date)). A agregação é sempre por checklist_id: NUNCA por título,
-- nunca deduplicada por checklist+dia, schedule_id ou response_id.
--
-- Este contrato pertence EXCLUSIVAMENTE às rotinas agendadas. NÃO mistura com
-- task_executions / analytics_unit_daily_compliance (domínio de TAREFAS, que
-- alimenta os KPIs do /painel), com checklist_responses avulsos/públicos
-- (visitor_id não é identidade) nem com a RPC da 6B.2E, que é uma LISTA
-- limitada de execuções individuais — nunca fonte estatística de período.
--
-- -------------------------------------------------------------------------
-- 1) Recorte (o MESMO do /painel para este domínio)
-- -------------------------------------------------------------------------
--   • período: occurrence_date BETWEEN p_start_date AND p_end_date — a data
--     civil da obrigação, comparada como date e nunca reconvertida para UTC
--     (mesma regra da 6B.2A/6B.2D/6B.2E; recortar por due_at::date
--     reintroduziria o erro de fuso já corrigido);
--   • unidade ausente → TODAS as unidades do workspace; informada → somente
--     aquela unidade, que precisa pertencer ao MESMO workspace;
--   • turno ausente → todos os turnos, INCLUSIVE rotinas com shift_id NULL
--     (LEFT JOIN; nenhum id fake de "Sem turno" é criado); informado →
--     somente aquele turno, que precisa pertencer ao workspace.
--
-- -------------------------------------------------------------------------
-- 2) Contadores (semântica canônica do domínio, 5E.2A)
-- -------------------------------------------------------------------------
--   completed            → completed_at IS NOT NULL
--   completed_on_time    → completed_at IS NOT NULL AND completed_at <= due_at
--   completed_late       → completed_at IS NOT NULL AND completed_at >  due_at
--   overdue_open         → completed_at IS NULL  AND due_at <  now()
--   pending_open         → completed_at IS NULL  AND due_at >= now()
--
--   total = completed + overdue_open + pending_open
--   completed = completed_on_time + completed_late
--
-- Devidas (para a TAXA DE EXECUÇÃO DAS OCORRÊNCIAS DEVIDAS, calculada na
-- camada TypeScript — o banco devolve CONTADORES, nunca percentual):
--   due_occurrences          → due_at <= now()
--   due_completed_occurrences→ due_at <= now() AND completed_at IS NOT NULL
--
-- dueExecutionRate = due_completed / due × 100; com due = 0 o resultado é
-- NULL e nunca 0%: obrigação ainda futura dentro do recorte não pode reduzir
-- artificialmente a performance do checklist. O banco não calcula a taxa —
-- manter a fórmula fora do SQL mantém a semântica explícita e testável.
--
-- -------------------------------------------------------------------------
-- 3) Autorização (o MESMO padrão canônico das RPCs do painel; fail-closed)
-- -------------------------------------------------------------------------
--   * auth.uid() obrigatório;
--   * public.has_role_in_workspace(uid, workspace, 'admin') — a regra
--     CANÔNICA do projeto (dono do workspace OU membro ATIVO administrativo),
--     o mesmo gate do /painel e da 6B.2E: a RPC não pode ser mais larga que a
--     página que a hospedará;
--   * p_workspace_id NÃO é autorização por si só: sem papel, exceção;
--   * p_unit_id / p_shift_id, quando presentes, precisam pertencer ao
--     workspace pedido — id de outro tenant levanta exceção em vez de
--     devolver zero linhas silenciosas.
--
-- Uma linha POR checklist_id no recorte (GROUP BY c.id): dois checklists com
-- o mesmo título permanecem SEPARADOS, e um mesmo checklist com várias
-- occurrences soma normalmente.
--
-- Não altera tabela, coluna, FK, índice, trigger, policy, RLS ou cron.
-- Zero DML. Não substitui nem edita as RPCs da 6B.2D/6B.2E.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.list_workspace_checklist_execution_metrics(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_unit_id uuid DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL
)
RETURNS TABLE (
  checklist_id uuid,
  checklist_title text,
  unit_id uuid,
  unit_name text,
  shift_id uuid,
  shift_name text,
  total_occurrences bigint,
  completed_occurrences bigint,
  completed_on_time bigint,
  completed_late bigint,
  overdue_open_occurrences bigint,
  pending_open_occurrences bigint,
  due_occurrences bigint,
  due_completed_occurrences bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $checklist_metrics$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'checklist_metrics_actor_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'checklist_metrics_scope_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'checklist_metrics_period_invalid' USING ERRCODE = 'P0001';
  END IF;

  -- Gate do /painel: regra canônica (dono do workspace OU membro ATIVO com
  -- papel administrativo). Nada mais é aceito.
  IF NOT public.has_role_in_workspace(v_user_id, p_workspace_id, 'admin') THEN
    RAISE EXCEPTION 'checklist_metrics_forbidden' USING ERRCODE = 'P0001';
  END IF;

  -- Unidade pedida precisa pertencer ao MESMO workspace (fail-closed).
  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units u
    WHERE u.id = p_unit_id
      AND u.workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'checklist_metrics_unit_forbidden' USING ERRCODE = 'P0001';
  END IF;

  -- Turno pedido precisa pertencer ao MESMO workspace (fail-closed).
  IF p_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.shifts sh
    WHERE sh.id = p_shift_id
      AND sh.workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'checklist_metrics_shift_forbidden' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.title,
    c.unit_id,
    u.name,
    c.shift_id,
    sh.name,
    COUNT(*),
    -- Concluídas (lifecycle 5E.2A), com decomposição no prazo / com atraso.
    COUNT(*) FILTER (WHERE o.completed_at IS NOT NULL),
    COUNT(*) FILTER (WHERE o.completed_at IS NOT NULL AND o.completed_at <= o.due_at),
    COUNT(*) FILTER (WHERE o.completed_at IS NOT NULL AND o.completed_at > o.due_at),
    -- Abertas: em atraso x ainda pendentes. Juntas fecham o total com as
    -- concluídas — nenhuma occurrence do recorte fica fora das duas.
    COUNT(*) FILTER (WHERE o.completed_at IS NULL AND o.due_at < now()),
    COUNT(*) FILTER (WHERE o.completed_at IS NULL AND o.due_at >= now()),
    -- Base da taxa de execução: só o que JÁ era devido (due_at <= now()).
    -- Ocorrência futura do período entra no total, mas NUNCA no denominador.
    COUNT(*) FILTER (WHERE o.due_at <= now()),
    COUNT(*) FILTER (WHERE o.due_at <= now() AND o.completed_at IS NOT NULL)
  FROM public.checklist_execution_occurrences o
  JOIN public.checklist_execution_schedules s ON s.id = o.schedule_id
  JOIN public.checklists c ON c.id = s.checklist_id
  LEFT JOIN public.units u ON u.id = c.unit_id
  LEFT JOIN public.shifts sh ON sh.id = c.shift_id
  WHERE c.workspace_id = p_workspace_id
    AND o.occurrence_date >= p_start_date
    AND o.occurrence_date <= p_end_date
    AND (p_unit_id IS NULL OR c.unit_id = p_unit_id)
    AND (p_shift_id IS NULL OR c.shift_id = p_shift_id)
  GROUP BY c.id, c.title, c.unit_id, u.name, c.shift_id, sh.name
  ORDER BY c.title, c.id;
END;
$checklist_metrics$;

-- Superfície de privilégio: só um administrador autenticado alcança a função;
-- `anon` não recebe nada e nenhum privilégio de tabela é concedido aqui.
REVOKE ALL ON FUNCTION
  public.list_workspace_checklist_execution_metrics(
    uuid, date, date, uuid, uuid
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.list_workspace_checklist_execution_metrics(
    uuid, date, date, uuid, uuid
  )
TO authenticated, service_role;
