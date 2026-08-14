# Plano de Correção Definitiva da Camera AI (Produção)

Este plano resolve inconsistências críticas na persistência e replay da Camera AI, garantindo integridade atômica e recuperação de dados sem consumo extra de OpenAI.

## Problemas Identificados
- **Migration Inválida**: Tentativa de alterar `RETURNS TABLE` de uma função existente no PostgreSQL (causa erro em prod).
- **Recuperação Incompleta**: Registros legados sem `decision` explícita não são recuperados.
- **Não Atômico**: `markCompleted` é usado para anexar evidências em registros já finalizados, o que falha devido ao filtro de `status = 'processing'`.
- **Risco no Storage**: `persistEvidence` pode apagar objetos válidos em caso de erro no banco.
- **UI Lags**: O botão "Enviar" não bloqueia visualmente se evidências obrigatórias estiverem ausentes.

## Alterações Propostas

### A. Banco de Dados (Migration Corretiva)
1. Criar nova migration `20260814045000_camera_ai_recovery_v2.sql`.
2. Remover a função `claim_camera_ai_attempt` antes de recriá-la com a nova assinatura.
3. Criar RPC `attach_camera_ai_evidence` para vinculação atômica de `evidence_id`.
4. Backfill: Recuperar registros `failed/storage_failure` mesmo com `decision` NULL.

### B. Backend (Node.js/TypeScript)
1. **Verify Handler**:
   - Refatorar para tratar `storage_pending` e `failed/storage_failure` como replays puros.
   - Substituir `markCompleted` por `attach_camera_ai_evidence` no fluxo de persistência de registros já concluídos.
   - Garantir que `persisted: true` só ocorra após confirmação no banco.
2. **Storage Service**:
   - Ajustar `persistEvidence` para não deletar objetos preexistentes em falhas de banco.
   - Tornar a criação de `checklist_evidences` estritamente idempotente por `storage_path`.

### C. Frontend (React)
1. **PublicChecklist**:
   - Implementar `hasBlockingCamera` para desabilitar o botão "Enviar" imediatamente se houver blocos de câmera obrigatórios sem `evidenceId`.
2. **PublicCameraBlock**:
   - Melhorar os rótulos de carregamento durante retries de salvamento.
   - Garantir que a `idempotencyKey` e a foto sejam preservadas em erros de storage.

### D. Testes
1. Adicionar testes para os 10 cenários obrigatórios, focando em integridade e não-duplicação de inferências OpenAI.

## Detalhes Técnicos
- **Assinatura da RPC**: `attach_camera_ai_evidence(p_response_id, p_block_id, p_idempotency_key, p_evidence_id)`.
- **Filtro de Integridade**: `status = 'completed' AND decision = 'approved' AND evidence_id IS NOT NULL`.
- **Rate Limit**: Ignorado em replays detectados no backend.
- **Storage Path**: `${checklistId}/${responseId}/${blockId}/${idempotencyKey}.${ext}`.
