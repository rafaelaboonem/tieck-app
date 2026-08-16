# Auditoria da Fase 4B.1: Autenticação por E-mail (OTP) via Supabase

## Diagnóstico do Fluxo Atual
1. **Ponto de Falha:** O arquivo `src/components/AuthPage.tsx` utiliza a função `invokeSignupFn` que faz chamadas para endpoints em `supabase/functions/v1/signup-*`. Estes endpoints (gerenciados pelo Lovable Cloud via connector-gateway) estão retornando 401 ou falhando.
2. **Dependência de Infraestrutura:** O fluxo depende de Edge Functions customizadas que não são necessárias se usarmos o `signInWithOtp` nativo do Supabase.
3. **Google Auth:** A chamada para `lovable.auth.signInWithOAuth` em `AuthPage.tsx` está resultando em 404 porque a configuração de provider no Supabase/Google Cloud não foi concluída.
4. **Segurança:** O mapeamento de erros em `src/utils/auth-errors.ts` é básico e o `AuthPage` às vezes exibe o erro bruto em caso de falha nas Edge Functions.

## Plano de Ação (Arquivos a Alterar)

### 1. `src/components/AuthPage.tsx`
- **Remover:** `invokeSignupFn`, `SIGNUP_FUNCTIONS_URL`, `SIGNUP_FUNCTIONS_KEY`.
- **Alterar `handleSendCode`:** Substituir a chamada para a Edge Function por `supabase.auth.signInWithOtp`. Usar `shouldCreateUser: true` no modo signup.
- **Alterar `handleVerifyCode`:** Substituir a chamada para a Edge Function por `supabase.auth.verifyOtp`.
- **Remover Step 3 do Signup:** Como o Supabase Auth OTP cria o usuário e a sessão imediatamente após a verificação do código, a etapa de "Definir Senha" (Step 3) será removida/simplificada para apenas coletar o `displayName` (via perfil) se for o primeiro acesso, ou simplesmente redirecionar.
- **Ocultar Google Auth:** Comentar ou remover o botão de Google Auth até que `VITE_GOOGLE_AUTH_ENABLED` seja true (ou remover temporariamente como solicitado).
- **Sanitização:** Garantir que todos os `catch` usem `mapAuthError` e não exponham detalhes técnicos.

### 2. `src/utils/auth-errors.ts`
- **Melhorar o mapeamento:** Adicionar códigos de erro específicos do OTP do Supabase (`otp_expired`, `invalid_otp`, etc.) com mensagens amigáveis em português.

### 3. `src/routes/convite.$token.tsx`
- **Ajuste de Redirect:** Garantir que o parâmetro `redirect` enviado para `/login` ou `/cadastro` inclua o token corretamente e seja respeitado após a autenticação OTP.

### 4. `src/server/team/invitation-email.server.ts` (Opcional/Se necessário)
- Verificar se o link de convite aponta para a rota correta que agora usará o fluxo OTP. (Instrução: "Não altere o helper de envio", então apenas auditoria).

### 5. Testes
- Criar `src/components/auth/AuthPage.test.tsx` (ou similar) para validar o novo fluxo sem disparar e-mails reais (usando mocks do Supabase client).

---
Estou pronto para implementar após sua confirmação.
