# Plano de Implementação: Câmera AI OpenAI - Fase 1 (Configuração Avançada)

Implementar a geração automática de políticas visuais para o bloco `/Camera` usando OpenAI Structured Outputs. Este sistema substituirá a análise genérica por uma orientada a critérios específicos gerados a partir da pergunta do usuário.

## 1. Schema e Contrato (Server-only)
- Criar `CameraVerificationPolicyV1` em `src/server/camera-ai/schema.ts` usando Zod.
- Campos: `version` (1), `questionHash` (sha256), `verifiability` (visual|partially_visual|not_visual), `target`, `condition`, `requiredEvidence[]`, `rejectionSignals[]`, `unverifiableWhen[]`, `summary`, `source` (generated|owner_edited).
- Garantir que o schema seja exportado para uso no compilador e no handler de verificação.

## 2. Compilador de Política (Server-side)
- Criar a rota `src/routes/api/camera-ai/compile-policy.ts`.
- **Segurança**: Validar JWT do proprietário, conferir acesso ao checklist/workspace e carregar a pergunta diretamente do banco via Supabase Admin (não confiar no input do cliente).
- **Integração OpenAI**: Usar `openai.responses.parse` com `gpt-4o-mini` e Structured Output estrito.
- **Cache**: Implementar lógica de `questionHash` para evitar chamadas repetidas para a mesma pergunta.
- **Tratamento de Verificabilidade**: Retornar status de erro ou aviso para perguntas não visuais.

## 3. Persistência e Snapshots
- Atualizar o estado do bloco no editor para incluir `cameraAiPolicy`.
- Modificar o fluxo de salvamento do editor para persistir a política gerada.
- Garantir que `publish_checklist` RPC inclua a política no snapshot publicado.
- Manter compatibilidade: checklists sem política continuam usando o fluxo genérico atual.

## 4. Integração no Runtime de Verificação
- Atualizar `src/server/camera-ai/verify-handler.ts` para injetar a política no prompt da OpenAI caso ela exista e o hash seja válido.
- Adaptar o prompt do `openai-provider.ts` para consumir os campos da política (`target`, `condition`, etc).
- Manter o gate determinístico atual em `gate.ts` inalterado.

## 5. Interface do Editor (UX)
- Reconstruir a configuração do bloco `/Camera` em `src/routes/checklist.tsx`.
- Adicionar selo "Verificação por IA".
- Implementar seção "O que será verificado" com resumo automático.
- Criar painel "Configuração avançada" recolhível para edição manual dos critérios.
- Lógica de atualização: Gerar nova política apenas após salvamento ou debounce longo após alteração da pergunta.

## 6. Testes Isolados
- Criar `src/server/camera-ai/policy.test.ts` com mocks da OpenAI.
- Validar: geração de política, cache por hash, detecção de perguntas não visuais, e persistência no snapshot.

## Restrições Técnicas
- **Não** realizar inferências reais em produção.
- **Não** alterar threshold, Storage ou o modelo gpt-4o-mini.
- **Não** quebrar o fluxo público atual para checklists legados.
