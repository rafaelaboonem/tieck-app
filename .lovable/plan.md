# Plano de Implementação - Fase 4B: Envio de Convites Real

Implementação do envio real de e-mails de convite utilizando a infraestrutura Resend existente, com segurança server-side e fluxo de UX aprimorado.

## 1. Infraestrutura Server-side (Supabase Edge Function)
- Criar a Edge Function `send-workspace-invitation`.
- Implementar lógica de segurança:
    - Apenas chamadas autenticadas com `service_role`.
    - Busca de dados reais no banco (`workspace_invitations`, `workspaces`).
    - Validação de expiração e integridade (SHA-256 do token).
    - Template responsivo alinhado à marca Tieck (HTML e Texto).
    - Uso do `FROM_ADDRESS` canônico: `Tieck <suporte@tieck.com.br>`.
- Configurar montagem da URL usando `PUBLIC_URL` dos secrets.

## 2. Refatoração de Endpoints (API Routes)
- `POST /api/public/invitations/create`:
    - Integrar chamada à Edge Function após criação bem-sucedida no banco.
    - Implementar compensação: se o e-mail falhar, o convite deve ser revogado.
    - Ocultar token e segredos na resposta de sucesso.
- `POST /api/team/invitations/resend`:
    - Integrar chamada à Edge Function após rotação do token.
    - Implementar compensação em caso de falha no envio.
    - Ocultar token na resposta.

## 3. Ajustes na Interface de Equipe (`/equipe`)
- Atualizar mensagens de sucesso.
- Remover comportamento de cópia automática do link (segurança).
- Tratar erro `email_delivery_failed` especificamente.
- Bloquear botões durante o processamento.

## 4. Fluxo de Aceite e Autenticação (`/convite/$token`)
- Permitir visualização segura do convite sem autenticação (endpoint `inspect`).
- Exibir botões "Entrar para aceitar" e "Criar conta" quando deslogado.
- Garantir persistência do redirecionamento: `redirect=/convite/{token}`.
- Tratar `email_mismatch` com opção de troca de conta.

## 5. Segurança e Validação
- Validar que chaves e service role não vazam para o bundle.
- Verificar rate limits e isolamento de workspace.
- Criar script de teste mockando o connector Resend.
- Executar typecheck e build final.

## Detalhes Técnicos
- Tecnologia: TanStack Start, Supabase Edge Functions, Resend Connector.
- Hashing: SHA-256 para tokens.
- Template: HTML moderno com Tailwind-like inline styles para compatibilidade.
