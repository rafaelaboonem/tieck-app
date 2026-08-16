# Plan - Correção da Integração Resend via Connector Gateway

O objetivo é diagnosticar e corrigir a falha de envio de e-mails de convite através do conector Resend, garantindo o uso correto do `connector-gateway` e a segurança das credenciais.

## Diagnóstico da Causa Raiz
O conector Resend do Lovable via `connector-gateway` utiliza um contrato específico. A implementação atual em `invitation-email.server.ts` utiliza `RESEND_API_URL = "https://connector-gateway.lovable.dev/resend/emails"`, que é o endpoint de proxy. 
As evidências indicam que a chamada está falhando antes de chegar ao Resend. 

Causas prováveis:
1. **Endpoint/Método incorreto**: O Gateway pode esperar um caminho diferente ou apenas redirecionar para a API oficial do Resend.
2. **Ambiente de Runtime**: Verificação se `LOVABLE_API_KEY` e `RESEND_API_KEY` (injetada pelo conector) estão presentes no runtime do Cloudflare Workers.
3. **Mecanismo de Autenticação**: O Gateway exige `Authorization: Bearer $LOVABLE_API_KEY` para identificar o projeto e `X-Connection-Api-Key: $RESEND_API_KEY` para a conexão específica.

## Ações de Implementação

### 1. Refatoração do Helper de E-mail
- **Local**: `src/server/team/invitation-email.server.ts`
- **Mudanças**: 
    - Melhorar o log de erro para capturar `status`, `requestId` e o corpo da resposta (se não for sensível).
    - Validar explicitamente a presença das chaves no momento da chamada.
    - Ajustar o endpoint se necessário (confirmado via documentação do conector).

### 2. Estabilização e Testes
- **Local**: `src/server/team/invitation-email.server.test.ts`
- **Mudanças**:
    - Adicionar um teste de integração (mockado) que simule a resposta do gateway para validar o tratamento de erros.

## Detalhes Técnicos
- Uso de `fetch` nativo no ambiente Worker.
- Manutenção da idempotência e compensação atômica já existente nos endpoints de API.
- **Segurança**: Não logar o conteúdo do link de convite ou tokens.

## Verificação
1. Executar `vitest` para garantir que o helper processa respostas do gateway corretamente.
2. `tsc --noEmit` para integridade de tipos.
3. `npm run build` para validar o bundling final.
