# Plano de Implementação: PATCH CAMERA AI 5C.3.1 — REFERENCE MODE FAIL-CLOSED + STORAGE/RBAC HARDENING

Este plano visa endurecer a implementação do modo de referência da Câmera AI, garantindo integridade dos dados, segurança de acesso e comportamento fail-closed em caso de erro.

## Alterações Propostas

### 1. Hardening do Backend (verify-handler)
- **Fail-Closed no Modo Referência**: Se `mode === 'reference'`, o sistema exigirá obrigatoriamente um `cameraReference` válido. Se ausente ou inválido, retornará erro `reference_unavailable` em vez de fallback silencioso para `auto`.
- **Validação de Metadata (Zod)**: Implementar validação rigorosa do objeto `cameraReference` usando `CameraReferenceImageV1Schema` antes de qualquer processamento.
- **Validação Binária e Integridade**: Após o download da referência, validar `magic bytes`, `mimeType`, `sizeBytes` e o hash `SHA-256` contra o metadata. Qualquer divergência causará falha imediata (`reference_corrupted`).
- **Segregação de Erros**: Diferenciar falhas de storage (`reference_unavailable`) de falhas do provedor de IA (`provider_failure`).

### 2. Integridade no Frontend (Checklist Editor)
- **Final Block Assert**: Adicionar validação no fluxo de publicação para garantir que blocos em modo `reference` possuam metadados válidos.
- **Limpeza de Draft**: Ao alternar de `reference` para `auto`, limpar o metadado `cameraReference` do bloco atual para evitar ruído.
- **Segurança de Preview**: Endurecer o endpoint de preview para validar que o `storagePath` pertence exatamente ao bloco solicitado.

### 3. Banco de Dados e Segurança
- **Configuração do Bucket**: Migration para reconciliar o bucket `camera-references` (privado, limite 3MB, mimes controlados).
- **Hardening da RPC `get_checklist_access`**: Revogar acesso público/autenticado direto à RPC, permitindo execução apenas via `service_role` no servidor, onde o `user_id` é extraído de forma confiável do token.

### 4. Testes e Validação
- **Testes de Regressão**: Adicionar cenários para SHA mismatch, MIME mismatch, magic bytes inválidos e ausência de referência.
- **Teste de Verificação**: Atualizar o endpoint de teste para espelhar rigorosamente o comportamento de produção.

## Detalhes Técnicos

### Arquivos afetados:
- `src/server/camera-ai/schema.ts`: Melhorar o schema Zod para hashes e mimes.
- `src/server/camera-ai/verify-handler.ts`: Lógica principal de fail-closed e validação binária.
- `src/routes/checklist.tsx`: Adição do assert de publicação.
- `src/components/camera-ai/CameraSettingsPanel.tsx`: Limpeza de draft.
- `src/routes/api/camera-ai/reference-image/preview.ts`: Hardening de acesso.
- `src/routes/api/camera-ai/verify.ts` e `test-verification.ts`: Integração das novas regras.
- `supabase/migrations/...`: Reconciliação do bucket e revogação de permissões da RPC.

### Segurança:
- O sistema deixará de aceitar referências que não passem na verificação de hash SHA-256, protegendo contra substituições maliciosas no storage.
- A RPC de acesso não será mais abusável via browser enviando IDs de outros usuários.
