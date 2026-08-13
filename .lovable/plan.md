# Plano de Correção da Camera AI (Fase 1 Auditada)

Implementação das correções críticas da Camera AI conforme a auditoria do commit c6eaa92.

## Mudanças do Usuário
- Substituição do motor OpenAI pela Responses API real (Structured Outputs).
- Remoção de `as any` e tipos obsoletos.
- Criação de migration SQL para RPCs e tabelas necessárias.
- Implementação de cliente Supabase exclusivamente server-side.
- Validação real de tokens e idempotência persistente.
- Expansão da suíte de testes (26+ casos).

## Detalhes Técnicos
- **OpenAI**: Uso de `client.responses.parse` com `zodTextFormat`.
- **Autorização**: Hashing de tokens e resolução via RPC `resolve_public_response`.
- **Idempotência**: Tabela `camera_ai_attempts` com estados `processing`, `completed`, `failed`.
- **Rate Limit**: Uso da RPC `hit_public_rate_limit` com cliente admin.
- **Segurança**: Validação de magic bytes (JPEG/PNG/WebP) e limite de 3MB.
- **Testes**: Vitest com mocks para evitar chamadas de rede e tokens reais.

## Próximos Passos
1. Validar SQL da migration.
2. Aplicar correções no `openai-provider.ts` (corrigindo erros de tipagem).
3. Atualizar endpoint `/api/camera-ai/verify`.
4. Executar suíte de testes completa.
