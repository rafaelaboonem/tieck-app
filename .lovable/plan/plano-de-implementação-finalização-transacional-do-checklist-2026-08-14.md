# Plano de Implementação: Finalização Transacional do Checklist Público

Este plano descreve a correção da regressão onde o checklist público era considerado "enviado" no frontend sem que o registro no banco de dados fosse finalizado (permanecendo como `in_progress`).

## Alterações

### 1. Banco de Dados (Supabase)
- **Nova RPC `finalize_public_response`**: Implementar uma função transacional que:
  - Valida o token da sessão pública (SHA-256).
  - Garante que a resposta pertence ao checklist correto e que este ainda está publicado.
  - Valida as evidências da Camera AI vinculadas (se houver) para evitar uso de IDs de outras sessões.
  - Atualiza o registro existente de `in_progress` para `submitted` e preenche `submitted_at`.
  - É idempotente: retorna sucesso imediato se a resposta já estiver finalizada.

### 2. Frontend (Public Checklist)
- **Refatoração do `handleSubmit` em `src/routes/c.$id.tsx`**:
  - Alterar a ordem das operações: a chamada à RPC de finalização deve ocorrer **antes** de e-mails, analytics ou redirecionamento.
  - Se a finalização falhar, a sessão local **não** é limpa, permitindo retries sem perda de dados ou novas inferências OpenAI.
  - Utilizar o token da sessão existente gerenciado por `ensureResponseSession`.

## Detalhes Técnicos

- **Segurança**: A RPC utiliza `SECURITY DEFINER` com `search_path` restrito e autorização baseada exclusivamente no token opaco (hash SHA-256), sem aceitar IDs diretos.
- **Integridade**: Validação server-side de `evidenceId` nos blocos de Camera AI, garantindo que a foto aprovada pertence exatamente àquela tentativa de checklist.
- **UX**: Em caso de falha de rede ou erro na finalização, o botão "Enviar" permanece habilitado para nova tentativa, mantendo o estado atual do formulário.

## Verificação e Testes

- **Teste de Fluxo**: Criar sessão -> Aprovar foto Camera AI -> Enviar -> Verificar transição de `in_progress` para `submitted` no mesmo ID.
- **Teste de Idempotência**: Clicar duas vezes no botão de envio e confirmar que apenas um registro é finalizado.
- **Teste de Segurança**: Tentar finalizar com token inválido ou `evidenceId` de outro checklist (deve falhar).
- **Zero Inferência**: Confirmar via logs que retries de finalização não consomem tokens OpenAI extras.
