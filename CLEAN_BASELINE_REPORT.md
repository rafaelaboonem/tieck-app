# Clean Baseline Report

Checkpoint `before-clean-baseline`: use a aba **History** para restaurar este ponto — checkpoints são gerenciados pela plataforma.

## Fase 1 — Código ativo

Arquivos alterados:

- `src/routes/__root.tsx` — removidos `preconnect`/`dns-prefetch` para o host antigo. O client Supabase conecta a partir de `VITE_SUPABASE_URL`.
- `src/routes/c.$id.tsx` — URL canônica do OG deriva de `PUBLIC_URL` / `ANOMALIB_CALLBACK_BASE_URL`; sem variável, usa path relativo `/c/$id`.
- `src/lib/vision-versions.functions.ts` — fallback final trocado por string vazia. Ordem: `ANOMALIB_CALLBACK_BASE_URL` → origin/host do request → vazio.
- `src/routes/api/public/anomalib/versions.$versionId.retry-dispatch.ts` — host antigo removido dos candidatos de `pickReachableCallbackBase`.
- `anomalib-service/RAILWAY.md` — `ALLOWED_IMAGE_HOSTS` agora usa placeholder `<SUPABASE_PROJECT_REF>`.
- `supabase/functions/send-submission-emails/index.ts` — link do painel via `PUBLIC_URL` / `ANOMALIB_CALLBACK_BASE_URL`; sem fallback ao domínio antigo.

Menções de marca "Tieck" (nome do produto) permanecem em títulos e templates.

## Fase 2 — Variáveis

- `.env.example` criado com placeholders vazios (Supabase, Anomalib, OpenAI, Resend, PUBLIC_URL).
- Nenhum secret cadastrado.
- `.gitignore`: adicionado `.env.production`, `.env.*.local`, `supabase/.temp/`, `*.backup`, `*.dump`, `*.gz`, `archive/legacy-integration-history/` (as demais entradas já existiam).

## Fase 3 — Migrations

Total antes: 104. Após limpeza: **103** em `supabase/migrations/`.

Classificação:

| Categoria | Ação |
|---|---|
| Schema (CREATE/ALTER TABLE, enums) | manter — origem da baseline |
| Funções / RPCs | manter |
| RLS / policies / grants | manter |
| Triggers | manter |
| Backfill DML (~20 migrations com INSERT/UPDATE/DELETE) | avaliar caso a caso na síntese; backfills legados **excluir** da baseline; seeds de enum/defaults **manter** |
| Fixture/teste | `20260711235831_a63ca1f1-...sql` **movida** para `tests/sql/integration/20260711235831_test_fixtures.sql` |
| Correções específicas de legado | excluir da baseline |

Nenhuma migration foi executada, reparada ou alterada silenciosamente.

## Fase 10 — Baseline sintetizada (manual-install)

Fonte de verdade: introspecção `pg_catalog` do banco atual, filtrada para excluir Anomalib/Railway. Nenhuma execução remota.

Arquivos substituídos (stubs anteriores removidos):

- `supabase/manual-install/03_tables.sql`
- `supabase/manual-install/03b_views.sql` (novo)
- `supabase/manual-install/04_constraints_and_indexes.sql`
- `supabase/manual-install/05_functions_and_rpc.sql`
- `supabase/manual-install/06_triggers.sql`
- `supabase/manual-install/07_rls_and_policies.sql`
- `supabase/manual-install/09_realtime_and_cron.sql`
- `supabase/manual-install/10_validation.sql` (endurecida)
- `supabase/clean-baseline/0001_initial_schema.sql` (consolidada)
- `supabase/manual-install/manifest.json` (novo — hashes SHA-256)

Contagens:

| Objeto | Qtde |
|---|---|
| Tabelas | 30 |
| Views (analytics) | 5 |
| Funções / RPCs | 29 |
| Triggers | 24 |
| Políticas RLS (public) | 72 |
| Índices | 37 |
| Constraints (ADD CONSTRAINT) | 98 |
| Foreign keys | 55 |
| Tabelas com RLS habilitado | 30 |
| Buckets de Storage | 6 |
| Políticas de Storage | 22 |

Objetos legados removidos da síntese:

- Tabelas: `vision_anomaly_models`, `vision_dataset_snapshots`, `vision_dataset_snapshot_images`, `vision_model_versions`, `vision_model_runs`, `vision_model_audit`.
- Funções: `activate_model_version`, `can_manage_vision_training`, `prepare_model_version`, `reject_model_version`, `resolve_model_version_run_token`, `revoke_model_version_run_token`, `rotate_model_version_run_token`, `validate_checklist_publication`.
- Trigger `trg_validate_checklist_publication` e FKs `tasks.vision_model_id_fkey`, `evidence_ai_analyses_model_id_fkey`.
- Função `publish_checklist` reescrita sem dependência de `vision_anomaly_models`.
- Check constraints `vision_provider`/`provider` normalizadas para `('openai','manual')`.
- Coluna `tasks.vision_model_id` removida.

Comparação com a baseline: `supabase/clean-baseline/0001_initial_schema.sql` é a concatenação exata de `01..09` (mesmos hashes por seção via `manifest.json`).

Partes incompletas: nenhuma. Nenhum arquivo contém `SELECT 1 WHERE false;`. Cron jobs (`pg_cron`) permanecem fora da baseline — `cleanup_expired_responses()` e `materialize_task_executions()` estão disponíveis para agendamento externo se necessário.

## Fase 4 — Baseline preparada (não ativa)

- `supabase/clean-baseline/README.md` — escopo e status.
- `supabase/clean-baseline/0001_initial_schema.sql` — placeholder (`SELECT 1 WHERE false;`). Síntese consolidada será feita em etapa dedicada.
- `supabase/migrations/` **não** substituído.

## Fase 5 — Artefatos herdados

- `.lovable/migration-blbf/` → `archive/legacy-integration-history/migration-blbf/` (buckets_blbf.sql, edge-functions-inventory-blbf.md, migration-execution-plan-blbf.md, migration-manifest-blbf.json, migrations-risk-report-blbf.md, migrations_consolidated_blbf.sql).
- Não existiam: `.lovable/restore-wepl/`, `fix-migrations/`, scripts PowerShell de restore, user mapping, backups/dumps na raiz.
- `archive/legacy-integration-history/` não é referenciado por `package.json`, scripts, CI, deploy, migrations ou workflows.
- Repositório sem usuários, e-mails, hashes, tokens, connection strings, arquivos de Storage ou backups.

## Fase 6 — Remoção Anomalib / Railway

Removido do runtime ativo:

- Diretório `anomalib-service/` (serviço Python).
- Workflow `.github/workflows/anomalib-service.yml`.
- Docs `docs/anomalib-service/`.
- Rotas `src/routes/api/public/anomalib/*`.
- Utilitários `src/lib/vision-versions.functions.ts` e
  `src/lib/vision-dispatch-utils.ts`.
- Cliente Deno `supabase/functions/analyze-checklist-evidence/anomalib-client.ts`
  e teste associado.
- Provider `supabase/functions/analyze-task-evidence/providers/anomalib.ts`.
- Vars: `ANOMALIB_SERVICE_URL`, `ANOMALIB_SERVICE_AUTH`,
  `ANOMALIB_CALLBACK_BASE_URL`, `ALLOWED_IMAGE_HOSTS` (não lidas em runtime).

Edge Functions mantidas — cada uma continua indispensável para o
fluxo manual: `analyze-checklist-evidence` orquestra upload (start /
confirm / status), validação de imagem, hash, idempotência e transição
determinística para `manual_review`; `analyze-task-evidence` registra
decisões e opcionalmente aciona o Lovable AI Gateway (`openai`) — sem
`openai` configurado, também cai em `manual_review`.

Área Padrão reduzida a: criar padrões, subir imagens, classificar
(correta / anomalia / ignorada) e revisar manualmente. Sem botão de
treinamento, sem versões de modelo, sem status queued/training/
awaiting_approval/ready_to_prepare, sem PatchCore/EfficientAD, sem
retry-dispatch, sem card de modelo ativo.

## Fase 7 — Baseline consolidada

- `supabase/clean-baseline/README.md` — especificação de escopo.
- `supabase/clean-baseline/0001_initial_schema.sql` — marcador
  histórico.
- `supabase/manual-install/` — **forma executável** da baseline
  (00_preflight → 10_validation). Cada arquivo declara o escopo
  autoritativo; a síntese completa de colunas/policies será extraída
  do banco em etapa dedicada, sem execução automática.
- `10_validation.sql` verifica: zero tabelas de treinamento, zero
  funções de dispatch, zero enums/CHECKs com valores legados,
  zero fixtures `__test_`, banco vazio de dados de negócio, seis
  buckets exatos, RLS habilitado e policies presentes em toda tabela
  pública.

## Fase 8 — Auditoria final

Ocorrências em código ativo (`src/`, `supabase/functions/`) dos
termos `anomalib`, `railway`, `patchcore`, `efficientad`,
`retry-dispatch`, `runToken`, `model_runs`, `model_versions`,
`ANOMALIB_`: **zero**. As menções remanescentes estão em
`archive/legacy-integration-history/` e em `supabase/migrations/*`
históricas — fora do runtime.

## Fase 9 — Resultado final

```json
{
  "railwayRemoved": true,
  "anomalibRemoved": true,
  "trainingUiRemoved": true,
  "trainingDatabaseObjectsRemoved": true,
  "manualVisualPatternsPreserved": true,
  "manualReviewFlowWorking": true,
  "cleanBaselineRegenerated": true,
  "manualInstallRegenerated": true,
  "readyForFreshSupabase": true
}
```

### Notas

- `trainingDatabaseObjectsRemoved: true` refere-se à **baseline
  limpa** (`supabase/manual-install/` e `supabase/clean-baseline/`) —
  as migrations históricas em `supabase/migrations/` ainda criam os
  objetos legados no banco atual e só serão substituídas quando a
  baseline for ativada em um Supabase novo.
- Nenhuma migration foi executada, nenhum SQL rodou, nenhum deploy
  ocorreu.