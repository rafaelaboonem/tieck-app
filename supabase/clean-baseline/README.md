# Clean Baseline (não ativa)

Especificação da baseline mínima do banco após a remoção de
Anomalib e Railway. A **forma executável** desta baseline está em
`supabase/manual-install/` (00_preflight → 10_validation).

`0001_initial_schema.sql` neste diretório é apenas um marcador
histórico e não é executado. A síntese única final (um único arquivo
SQL) será extraída do banco em etapa dedicada, sem execução
automática.

## Escopo removido (não recriar)

- **Sistema de papéis (`app_role` + `user_roles`)**: substituído por
  acesso owner-only via `workspaces.owner_id` (+ `workspace_members`
  ativo, sem hierarquia de papel). Funções removidas: `has_role`,
  `is_reviewer`, `can_access_unit`, `can_manage_vision_training`,
  `user_has_workspace_access`, `validate_checklist_publication`.
  Nova função central: `is_workspace_member(workspace_id, user_id)`.
- **Envio público sem conta**: substitui INSERT anônimo direto por
  RPC SECURITY DEFINER `submit_public_response(public_id, answers)`
  concedida a `anon, authenticated`.
- Tabelas: `vision_anomaly_models`, `vision_model_versions`,
  `vision_model_runs`, `vision_model_audit`,
  `vision_dataset_snapshots`, `vision_dataset_snapshot_images`.
- Funções: `prepare_model_version`, `activate_model_version`,
  `reject_model_version`, `rotate_model_version_run_token`,
  `resolve_model_version_run_token`, `dispatch_model_version_run`,
  `claim_checklist_analysis` (dispatcher) e qualquer função que
  referencie as tabelas acima.
- Enums / CHECKs com valores `anomalib`, `patchcore`, `efficientad`,
  `queued`, `training`, `awaiting_approval`, `ready_to_prepare`.
- Run tokens, callbacks de treinamento, `retry-dispatch`.
- Fixtures `__test_*`, dados de negócio, sessões, OTPs, rate limits,
  logs, backfills legados, paths de Storage antigos.

## Escopo preservado

- **Biblioteca manual de padrões**: `vision_datasets` e
  `vision_curated_images` (sem colunas de treinamento automático).
- Todas as demais tabelas de negócio do runtime vivo (checklists,
  evidences, tasks, task_executions, units, profiles, workspaces,
  user_roles, etc.).

## Buckets

- Públicos: `avatars`, `checklist-assets`, `workspace-assets`
- Privados: `evidences`, `checklist-evidences`, `vision-datasets`

## Status

**Não ativa.** `supabase/migrations/` continua sendo a fonte atual do
banco em uso. Para instalar em um Supabase novo, use
`supabase/manual-install/`.