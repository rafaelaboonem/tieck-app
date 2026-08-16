# Plano de Hotfix: Fase 4B - Estabilização e Segurança

Este hotfix aborda vulnerabilidades e inconsistências no fluxo de convites da Fase 4B, garantindo que a experiência do usuário seja fluida e a infraestrutura de envio de e-mail seja resiliente e segura.

## Alterações Propostas

### 1. Interface de Convite (Frontend)
- **Correção de Redirecionamento:** Atualizar os links de "Entrar" e "Criar conta" para usarem a API do TanStack Router, preservando o parâmetro `redirect=/convite/{token}` corretamente.
- **Limpeza de UI:** Remover duplicidade de botões. Se logado, mostra "Aceitar Convite". Se deslogado, mostra "Entrar" e "Criar conta".
- **Tipagem Supabase:** Substituir `any` pela tipagem correta `Session | null` no estado da sessão.
- **Estado de Carregamento:** Garantir que a página só seja renderizada após a sessão e os dados do convite estarem carregados.

### 2. Infraestrutura de E-mail (Server-side)
- **PUBLIC_URL Fail-Closed:** Tornar o segredo `PUBLIC_URL` obrigatório no runtime. Adicionar validação estrita com `new URL()` (apenas HTTPS, sem query/fragmento).
- **Logs Seguros:** Remover o registro de corpos brutos de erro do Resend e dados sensíveis (tokens, e-mails, HTML). Registrar apenas status HTTP e IDs operacionais.
- **Sanitização de Assunto:** Limpar o nome do workspace no assunto do e-mail para evitar quebras de linha ou caracteres de controle.

### 3. Compensação Atômica (API)
- **Revogação Verificada:** Nos endpoints de criação e reenvio, a compensação por falha de e-mail agora exige o status `pending` e valida se exatamente uma linha foi alterada.
- **Proteção de Reenvio:** Garantir que um convite já aceito não seja revogado acidentalmente se o envio de e-mail falhar durante uma tentativa de reenvio concorrente.

### 4. Arquitetura e Segurança
- **Verificação de Secrets:** Confirmar a disponibilidade de `LOVABLE_API_KEY`, `RESEND_API_KEY` e `PUBLIC_URL` no runtime do TanStack Start.
- **Isolamento de Módulos:** Garantir que o helper de e-mail permaneça estritamente no servidor e não vaze para o bundle do navegador.

## Detalhes Técnicos
- **Localização:** `src/routes/convite.$token.tsx`, `src/server/team/invitation-email.server.ts`, `src/routes/api/public/invitations/create.ts`, `src/routes/api/team/invitations/resend.ts`.
- **Validação:** Testes unitários focados cobrindo redirecionamento, validação de URL, compensação atômica e logs seguros.
- **Integridade:** `npx tsc --noEmit` e `npm run build` para confirmar estabilidade.
