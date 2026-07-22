# Manual Install — Clean Baseline

Scripts SQL para instalar do zero o schema mínimo da baseline limpa
em um projeto Supabase novo. Execute na ordem numérica. Todos os
scripts são idempotentes (usam `IF NOT EXISTS` / `OR REPLACE`).

**Escopo removido nesta baseline** (não recriar):

- Tabelas `vision_anomaly_models`, `vision_model_versions`,
  `vision_model_runs`, `vision_model_audit`,
  `vision_dataset_snapshots`, `vision_dataset_snapshot_images`.
- Funções `prepare_model_version`, `activate_model_version`,
  `reject_model_version`, `rotate_model_version_run_token`,
  `claim_checklist_analysis` (dispatcher), `resolve_model_version_run_token`.
- Enums / checks com valores `anomalib`, `patchcore`, `efficientad`,
  `queued`, `training`, `awaiting_approval`, `ready_to_prepare`.
- Fixtures `__test_*` e dados de negócio.

**Preservado** (biblioteca manual de padrões):

- `vision_datasets` (metadados do padrão).
- `vision_curated_images` (imagens classificadas manualmente).

## Ordem

1. `00_preflight.sql`
2. `00_reset_partial_install.sql` — *opcional*, só rode se uma tentativa anterior deixou objetos parciais no banco.
3. `01_extensions.sql`
4. `02_enums_and_types.sql`
5. `02b_prereq_functions.sql` — funções usadas em `DEFAULT` de coluna (devem existir antes das tabelas).
6. `03_tables.sql`
7. `03b_views.sql`
8. `04_constraints_and_indexes.sql`
9. `05_functions_and_rpc.sql`
10. `06_triggers.sql`
11. `07_rls_and_policies.sql`
12. `08_storage.sql`
13. `09_realtime_and_cron.sql`
14. `10_validation.sql` — só assertivas, roda por último. **Não é incluído** em `clean-baseline/0001_initial_schema.sql`.

> **Status:** este pacote é a **especificação executável** da baseline
> limpa. Os scripts contêm o conjunto autoritativo de objetos que a
> baseline deve ter e assertivas de validação; o conteúdo detalhado
> (colunas exatas de cada tabela, corpo completo das funções, cada
> policy) é o mesmo já presente em `supabase/migrations/*.sql` filtrado
> pelas regras acima. A síntese final de cada arquivo será feita em
> etapa dedicada com acesso ao banco — nenhum SQL deve ser executado
> automaticamente aqui.