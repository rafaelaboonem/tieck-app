-- =========================================================================
-- 6B.2D — Lifecycle das occurrences no dashboard operacional
-- =========================================================================
-- O ciclo operacional da 5E agora existe ponta a ponta:
--
--   checklist_execution_schedules
--     -> checklist_execution_occurrences (materializadas)
--     -> Home do responsável (6B.2C)
--     -> executor occurrence-aware (6B.2B)
--     -> occurrence concluída
--
-- Falta o gestor enxergar esse lifecycle. Esta migration adiciona uma
-- superfície PARALELA — nunca fusionada com task_executions:
--
--   task_executions                -> analytics_unit_daily_compliance -> KPIs de tarefas
--   checklist_execution_occurrences -> analytics_unit_daily_occurrences -> "Rotinas agendadas"
--
-- Motivo: os dois domínios são entidades diferentes. Uma rotina recorrente
-- materializa UMA occurrence por obrigação (concluir ontem não conclui hoje) e
-- um checklist pode ter várias occurrences no mesmo dia; task_executions
-- descrevem a execução programada de uma tarefa. Somar os dois num mesmo KPI
-- seria double count conceitual, e deduplicar por heurística seria pior.
--
-- -------------------------------------------------------------------------
-- 1) View: analytics_unit_daily_occurrences
-- -------------------------------------------------------------------------
-- Grão: organization (workspace do checklist) + unidade + occurrence_date.
--
-- A referência temporal é o.occurrence_date, e NÃO due_at::date: occurrence_date
-- já É o dia civil da obrigação no timezone da rotina (5E.2A). Reagrupar pelo
-- dia UTC de due_at reintroduziria exatamente o erro de fuso corrigido na
-- 6B.2A, em que o card e o drill-down contavam conjuntos diferentes.
--
-- Origem: checklist_execution_occurrences -> checklist_execution_schedules ->
-- checklists -> units. O organization_id é o workspace do checklist, porque
-- `workspaces` são as organizações no schema atual.
--
-- Só entram occurrences cujo checklist possui unidade: esta é uma agregação
-- POR UNIDADE, e inventar um balde "Sem unidade" dentro dela seria afirmar uma
-- unidade que não existe. Uma rotina sem unit_id continua válida na Home do
-- responsável e continua executável — ela apenas não participa desta agregação.
--
-- Métricas (identidades que a view garante):
--   total    = completed + overdue_open + pending_open
--   completed = completed_on_time + completed_late
--
-- "Aberta em atraso" (completed_at IS NULL AND now() > due_at) e "concluída com
-- atraso" (completed_at > due_at) são categorias DIFERENTES: a primeira ainda
-- exige ação; a segunda é história. started_at não significa concluída.
-- Mesma regra de src/lib/occurrence-lifecycle.ts.
--
-- security_invoker = true: a view roda com os privilégios de QUEM consulta, de
-- modo que as policies de RLS das tabelas de base continuam valendo. A view não
-- é um caminho de escalonamento de privilégio.
--
-- Não altera tabela, coluna, FK, índice, trigger, policy ou cron.
-- Zero DML no nível superior.
-- -------------------------------------------------------------------------

DROP VIEW IF EXISTS public.analytics_unit_daily_occurrences;

CREATE VIEW public.analytics_unit_daily_occurrences
WITH (security_invoker = true) AS
SELECT
  c.workspace_id                             AS organization_id,
  c.unit_id                                  AS unit_id,
  u.name                                     AS unit_name,
  o.occurrence_date                          AS reference_date,

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
WHERE c.unit_id IS NOT NULL
  AND c.workspace_id IS NOT NULL
GROUP BY c.workspace_id, c.unit_id, u.name, o.occurrence_date;

GRANT SELECT ON public.analytics_unit_daily_occurrences TO authenticated;
GRANT SELECT ON public.analytics_unit_daily_occurrences TO service_role;

-- -------------------------------------------------------------------------
-- 2) Leitura detalhada do gestor: list_workspace_execution_occurrences
-- -------------------------------------------------------------------------
-- A aba "Rotinas" do detalhe da unidade precisa das occurrences CONCRETAS do
-- período, não de números agregados.
--
-- Antes de criar esta RPC foi verificado se o SELECT já concedido bastaria. A
-- policy "Executors and managers can view occurrences" (5E.2A) realmente já
-- permite ao gestor ler as linhas — mas o browser teria de compor, sozinho,
-- o join occurrence -> schedule -> checklist -> unidade -> responsável, e
-- receberia colunas de configuração do schedule (timezone, is_active) que não
-- são necessárias. A RPC devolve uma projeção mínima e já recortada pelo
-- período, mantendo a superfície do navegador menor do que a policy permite.
--
-- Autorização (toda resolvida DENTRO do banco):
--   * auth.uid() obrigatório;
--   * p_workspace_id não é autorização por si só — exige membership ATIVA;
--   * exige papel administrativo pela regra CANÔNICA do projeto,
--     public.has_role_in_workspace(uid, workspace, 'editor') — a MESMA regra da
--     policy da 5E.2A e das RPCs de gestão. Nenhum conceito novo de autorização;
--   * a unidade precisa pertencer ao workspace solicitado;
--   * a occurrence precisa pertencer a checklist daquele workspace E daquela
--     unidade.
--
-- Fail-closed: sem ator, sem workspace, sem membership ativa, sem papel
-- administrativo ou unidade fora do workspace, a função levanta exceção e não
-- retorna linha alguma.
--
-- Período: occurrence_date BETWEEN p_start_date AND p_end_date, comparado
-- diretamente na data civil da occurrence — nunca reconvertendo para UTC.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_workspace_execution_occurrences(
  p_workspace_id uuid,
  p_unit_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  occurrence_id uuid,
  schedule_id uuid,
  checklist_id uuid,
  checklist_title text,
  occurrence_date date,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  response_id uuid,
  unit_id uuid,
  shift_id uuid,
  shift_name text,
  workspace_member_id uuid,
  responsible_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $workspace_occurrences$
DECLARE
  v_user_id uuid;
  v_member_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_actor_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_workspace_id IS NULL OR p_unit_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_scope_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'occurrence_period_invalid' USING ERRCODE = 'P0001';
  END IF;

  -- Membership ATIVA do chamador no workspace pedido.
  SELECT wm.id
    INTO v_member_id
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = v_user_id
    AND wm.status = 'active'::public.member_status;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'occurrence_not_member' USING ERRCODE = 'P0001';
  END IF;

  -- Papel administrativo pela regra canônica. A unidade pedida precisa
  -- pertencer ao MESMO workspace: um unit_id de outro tenant não retorna nada.
  IF NOT public.has_role_in_workspace(v_user_id, p_workspace_id, 'editor')
     OR NOT EXISTS (
       SELECT 1
       FROM public.units u
       WHERE u.id = p_unit_id
         AND u.workspace_id = p_workspace_id
     )
  THEN
    RAISE EXCEPTION 'occurrence_forbidden' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.schedule_id,
    c.id,
    c.title,
    o.occurrence_date,
    o.due_at,
    o.started_at,
    o.completed_at,
    o.response_id,
    c.unit_id,
    c.shift_id,
    sh.name,
    s.workspace_member_id,
    p.display_name
  FROM public.checklist_execution_occurrences o
  JOIN public.checklist_execution_schedules s ON s.id = o.schedule_id
  JOIN public.checklists c ON c.id = s.checklist_id
  LEFT JOIN public.shifts sh ON sh.id = c.shift_id
  LEFT JOIN public.workspace_members wm ON wm.id = s.workspace_member_id
  LEFT JOIN public.profiles p ON p.id = wm.user_id
  WHERE c.workspace_id = p_workspace_id
    AND c.unit_id = p_unit_id
    AND o.occurrence_date >= p_start_date
    AND o.occurrence_date <= p_end_date
  ORDER BY o.occurrence_date ASC, o.due_at ASC, o.id ASC;
END;
$workspace_occurrences$;

-- Privilege surface: only an authenticated manager reaches it; `anon` gets
-- nothing and no table privilege is granted here.
REVOKE ALL ON FUNCTION
  public.list_workspace_execution_occurrences(uuid, uuid, date, date)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.list_workspace_execution_occurrences(uuid, uuid, date, date)
TO authenticated, service_role;
