-- =========================================================================
-- 6B.2E — "Últimas execuções" do /painel: contrato GLOBAL do workspace
-- =========================================================================
--
-- O card "Últimas execuções" mostra CHECKLISTS REALMENTE RESPONDIDOS. Até
-- agora ele recebia `items={[]}` porque não existia contrato eficiente para o
-- painel global: a RPC existente (6B.2D)
--   list_workspace_execution_occurrences(p_workspace_id, p_unit_id, …)
-- exige uma unidade concreta, e preencher o card por unidade exigiria um
-- fan-out N+1 (uma chamada por unidade) — degradar o painel para preencher um
-- card é pior do que dizer honestamente que não há dado.
--
-- Esta migration adiciona UM contrato workspace-scoped, do mesmo tipo dos
-- demais contratos analíticos do painel: o banco resolve o recorte inteiro
-- (período + unidade opcional + turno opcional + limite) numa consulta só.
--
-- -------------------------------------------------------------------------
-- 0) Por que o RESPONSÁVEL ATRIBUÍDO pode ser exibido como EXECUTOR
-- -------------------------------------------------------------------------
-- Uma occurrence materializada pertence a UM schedule, e o schedule aponta
-- para UM workspace_member (5E.2A). Quem pode concluí-la é decidido dentro do
-- banco, em public.checklist_occurrence_execution_context (6B.2B), executado
-- por open_checklist_execution_occurrence e complete_checklist_execution_
-- occurrence — os ÚNICOS dois caminhos que escrevem started_at/completed_at/
-- response_id nesta tabela:
--
--   IF v_member_id IS NULL
--      OR v_member_workspace_id IS DISTINCT FROM v_checklist_workspace_id
--      OR v_member_user_id IS DISTINCT FROM v_user_id      -- auth.uid()
--      OR v_member_status IS DISTINCT FROM 'active'
--   THEN RAISE EXCEPTION 'occurrence_not_assignee';
--
-- Ou seja: o membro atribuído (e somente ele, com membership ATIVA) consegue
-- iniciar/concluir a sua occurrence — um gestor é rejeitado explicitamente. A
-- tabela não tem policy de INSERT/UPDATE/DELETE e o browser não recebe
-- privilégio de escrita (REVOKE ALL ... FROM anon, authenticated): não existe
-- caminho legítimo em que atribuído != executor real da occurrence.
--
-- Por isso a projeção usa a identidade do MEMBRO ATRIBUÍDO como executor, e o
-- drawer continua exibindo "Responsável atribuído" e "Executado por" como
-- conceitos SEPARADOS (hoje resolvem para a mesma pessoa, mas o contrato não
-- os funde). Resposta avulsa/pública continua sem executor identificável:
-- `visitor_id` em checklist_responses NÃO é identidade de perfil e nunca entra
-- aqui — esta RPC lê APENAS occurrences com response_id vinculado.
--
-- -------------------------------------------------------------------------
-- 1) Recorte (o MESMO do /painel)
-- -------------------------------------------------------------------------
--   • período: occurrence_date BETWEEN p_start_date AND p_end_date — a data
--     civil da obrigação, comparada como date e nunca reconvertida para UTC
--     (mesma regra da 6B.2A/6B.2D; reagrupar pelo dia UTC de due_at
--     reintroduziria o erro de fuso já corrigido);
--   • unidade ausente → TODAS as unidades do workspace; unidade informada →
--     somente aquela unidade (e ela precisa pertencer ao MESMO workspace);
--   • turno ausente → todos os turnos (inclusive rotinas sem turno); turno
--     informado → somente aquele turno (e ele precisa pertencer ao workspace).
--
-- Só entram occurrences CONCLUÍDAS de verdade:
--     completed_at IS NOT NULL AND response_id IS NOT NULL
-- Ocorrência pendente, futura ou aberta em atraso pertence a "Rotinas
-- agendadas" / "Pontos de atenção" — nunca a este card.
--
-- Ordenação: completed_at DESC (o que acabou de acontecer primeiro), com
-- desempate determinístico por occurrence_id DESC. Limite pequeno e capado:
-- default 6, teto defensivo 20.
--
-- -------------------------------------------------------------------------
-- 2) Autorização (tudo resolvido DENTRO do banco, fail-closed)
-- -------------------------------------------------------------------------
--   * auth.uid() obrigatório;
--   * public.has_role_in_workspace(uid, workspace, 'admin') — a regra
--     CANÔNICA do projeto. Ela já resolve, na mesma chamada, o dono do
--     workspace (workspaces.owner_id), a membership ATIVA (status 'active') e o
--     papel do membro. 'admin' aqui é o gate do PRÓPRIO /painel (owner|admin,
--     o mesmo `isAdmin` do useWorkspaceRBAC): a RPC não pode ser mais larga que
--     a página que a hospeda — por isso ela é mais estreita que a regra
--     'editor' usada pelos contratos de detalhe de unidade (6B.2D);
--   * p_workspace_id NÃO é autorização por si só: sem papel, exceção;
--   * p_unit_id / p_shift_id precisam pertencer ao workspace pedido — um id de
--     outro tenant levanta exceção em vez de retornar zero linhas silenciosas.
--
-- -------------------------------------------------------------------------
-- 3) Superfície de dados (mínima)
-- -------------------------------------------------------------------------
-- Para a pessoa retornamos apenas o necessário para renderizar identidade:
-- nome já projetado (mesma precedência do produto: display_name →
-- first_name + last_name → e-mail → 'Membro'), papel, id do membro, user_id,
-- foto e — de profiles.settings — SOMENTE as duas chaves de preferência de
-- avatar, extraídas com `->>` (o objeto settings inteiro nunca sai daqui).
-- Nenhum dado contratual/score é inventado: resultado e conformidade não são
-- devolvidos porque a occurrence não possui esse contrato.
--
-- Não altera tabela, coluna, FK, índice, trigger, policy, RLS ou cron.
-- Zero DML. Não substitui nem edita a RPC da 6B.2D.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.list_workspace_recent_checklist_executions(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_unit_id uuid DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL,
  p_limit int DEFAULT 6
)
RETURNS TABLE (
  occurrence_id uuid,
  checklist_id uuid,
  checklist_title text,
  response_id uuid,
  occurrence_date date,
  due_at timestamptz,
  completed_at timestamptz,
  unit_id uuid,
  unit_name text,
  shift_id uuid,
  shift_name text,
  workspace_member_id uuid,
  user_id uuid,
  responsible_name text,
  role text,
  avatar_url text,
  avatar_display_mode text,
  illustrated_avatar_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $recent_executions$
DECLARE
  v_user_id uuid;
  v_limit int;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'recent_executions_actor_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'recent_executions_scope_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'recent_executions_period_invalid' USING ERRCODE = 'P0001';
  END IF;

  -- Gate do /painel: regra canônica (dono do workspace OU membro ATIVO com
  -- papel administrativo). Nada mais é aceito.
  IF NOT public.has_role_in_workspace(v_user_id, p_workspace_id, 'admin') THEN
    RAISE EXCEPTION 'recent_executions_forbidden' USING ERRCODE = 'P0001';
  END IF;

  -- Unidade pedida precisa pertencer ao MESMO workspace (fail-closed).
  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.units u
    WHERE u.id = p_unit_id
      AND u.workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'recent_executions_unit_forbidden' USING ERRCODE = 'P0001';
  END IF;

  -- Turno pedido precisa pertencer ao MESMO workspace (fail-closed).
  IF p_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.shifts sh
    WHERE sh.id = p_shift_id
      AND sh.workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'recent_executions_shift_forbidden' USING ERRCODE = 'P0001';
  END IF;

  -- Limite pequeno e capado: o card precisa só das mais recentes.
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 6), 20));

  RETURN QUERY
  SELECT
    o.id,
    c.id,
    c.title,
    o.response_id,
    o.occurrence_date,
    o.due_at,
    o.completed_at,
    c.unit_id,
    u.name,
    c.shift_id,
    sh.name,
    s.workspace_member_id,
    wm.user_id,
    -- Mesma precedência de nome do produto (getMemberNameSource). O e-mail só
    -- vira rótulo quando é a única informação humana disponível.
    COALESCE(
      NULLIF(BTRIM(p.display_name), ''),
      NULLIF(
        BTRIM(
          CONCAT_WS(
            ' ',
            NULLIF(BTRIM(p.first_name), ''),
            NULLIF(BTRIM(p.last_name), '')
          )
        ),
        ''
      ),
      -- A coluna legada `workspace_members.email` NÃO existe mais no schema
      -- (a normalização da fase 4A deixou só `email_normalized`, NOT NULL):
      -- referenciar `email` fazia a função falhar no caminho de sucesso.
      NULLIF(BTRIM(wm.email_normalized), ''),
      'Membro'
    ),
    -- Papel do membro no workspace (owner|admin|editor|viewer). É "papel",
    -- não "cargo": o schema não possui job title.
    wm.role::text,
    NULLIF(BTRIM(p.avatar_url), ''),
    -- Somente as duas chaves de preferência de avatar, nunca o objeto inteiro.
    p.settings ->> 'avatar_display_mode',
    p.settings ->> 'illustrated_avatar_id'
  FROM public.checklist_execution_occurrences o
  JOIN public.checklist_execution_schedules s ON s.id = o.schedule_id
  JOIN public.checklists c ON c.id = s.checklist_id
  LEFT JOIN public.units u ON u.id = c.unit_id
  LEFT JOIN public.shifts sh ON sh.id = c.shift_id
  LEFT JOIN public.workspace_members wm ON wm.id = s.workspace_member_id
  LEFT JOIN public.profiles p ON p.id = wm.user_id
  WHERE c.workspace_id = p_workspace_id
    AND o.occurrence_date >= p_start_date
    AND o.occurrence_date <= p_end_date
    -- Só execuções REALMENTE concluídas: resposta vinculada e conclusão.
    AND o.completed_at IS NOT NULL
    AND o.response_id IS NOT NULL
    AND (p_unit_id IS NULL OR c.unit_id = p_unit_id)
    AND (p_shift_id IS NULL OR c.shift_id = p_shift_id)
  ORDER BY o.completed_at DESC, o.id DESC
  LIMIT v_limit;
END;
$recent_executions$;

-- Superfície de privilégio: só um administrador autenticado alcança a função;
-- `anon` não recebe nada e nenhum privilégio de tabela é concedido aqui.
REVOKE ALL ON FUNCTION
  public.list_workspace_recent_checklist_executions(
    uuid, date, date, uuid, uuid, int
  )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.list_workspace_recent_checklist_executions(
    uuid, date, date, uuid, uuid, int
  )
TO authenticated, service_role;
