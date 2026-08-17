# Plano de Correção: Acesso Viewer e Shell Autenticado

Este plano corrige o ciclo de vida do usuário Viewer, garantindo que perfis sejam criados corretamente, o shell do dashboard seja exibido para qualquer usuário autenticado e os workspaces compartilhados sejam visíveis sem depender de ownership.

## Problemas Identificados
1. **Perfil Ausente:** Usuários que entram via OTP (convidados) podem ficar sem registro na tabela `profiles`, o que bloqueia o `DashboardLayout`.
2. **Filtragem de Workspaces:** A lógica de carregamento favorecia a criação de um "Meu Workspace" pessoal em vez de reconhecer acessos via membership.
3. **Shell Invisível:** O `DashboardLayout` ocultava o menu lateral se o perfil não estivesse carregado, mesmo que a sessão estivesse ativa.
4. **Resiliência na Rota:** A rota `/organizar` possuía falhas no tratamento de erros de carregamento e na avaliação de permissões do Viewer.

## Alterações Propostas

### 1. Backend e Identidade
- Criar utilitário `ensureUserProfile` para garantir bootstrap de perfil no login/session restore.
- Integrar `ensureUserProfile` ao `AuthContext` para cobrir o fluxo OTP.

### 2. Contexto de Workspace
- Ajustar `WorkspaceContext` para não criar automaticamente um workspace padrão se o usuário já for membro de algum.
- Refinar `fetchWorkspacesQuery` para buscar todos os workspaces acessíveis via RLS.

### 3. Interface e Shell (Dashboard)
- Permitir renderização do menu lateral se houver uma sessão (`user`), mesmo que o `profile` demore a carregar.
- Restaurar o botão "Novo Workspace" para usuários sem workspaces (incluindo Viewers convidados que queiram criar o seu próprio).

### 4. Rota /organizar
- Refatorar a inicialização da rota para ser mais resiliente.
- Validar `role` explicitamente (Owner vs Member) antes de carregar dados.
- Tipagem rigorosa para evitar erros de compilação TS.

## Detalhes Técnicos
- **Migração:** Nenhuma migração de banco necessária (RLS já está correto).
- **Testes:** Novo suíte `RBAC Lifecycle` cobrindo desde o login OTP até a visualização do checklist compartilhado.
- **Segurança:** Mantido o princípio de `fail-closed` para ações administrativas.
