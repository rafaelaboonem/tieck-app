# Plano de Correção Fase 4B.5: Desacoplamento e Identidade do Workspace

## Objetivo
Desacoplar o fluxo de convites do módulo `/organizar`, corrigir a exibição de "Visitante" para usuários autenticados e implementar a rota `/inicio` contextual para checklists pessoais e de equipe.

## 1. Correção da Identidade "Visitante"
- **Diagnóstico:** O `DashboardLayout` usa `(profile || user)` para renderizar o menu, mas exibe "Usuário" (estático no template) ou "Visitante" (inferido por ausência de dados). A dependência do carregamento do `profile` no `DashboardLayout` bloqueia a exibição correta.
- **Correção:** 
    - No `DashboardLayout.tsx`, exibir o e-mail do `user` como fallback imediato enquanto o `profile` carrega.
    - Garantir que `authLoading` seja respeitado para mostrar um skeleton/loading em vez do estado de visitante.
    - Remover a lógica que forçava "Visitante" para usuários sem profile completo.

## 2. Desacoplamento do Fluxo de Convites
- **Alteração em `src/routes/convite.$token.tsx`:**
    - Mudar redirecionamento pós-aceite de `/organizar?id={workspace_id}` para `/inicio?workspace={workspace_id}`.
- **Alteração em `src/contexts/WorkspaceContext.tsx`:**
    - Implementar suporte para detectar o `workspace` na query string da URL e defini-lo como `currentWorkspace` de forma prioritária e persistente.
    - Garantir que `refreshWorkspaces` invalide o cache do React Query corretamente.

## 3. Home Canônica (`/inicio`) Contextual
- **Alteração em `src/routes/inicio.tsx`:**
    - Dividir a lógica de busca de checklists:
        - **Contexto Pessoal:** `workspace_id IS NULL` (quando nenhum workspace está selecionado).
        - **Contexto de Equipe:** `workspace_id = currentWorkspace.id` (quando um workspace está selecionado).
    - **Interface RBAC:**
        - Ocultar botões de "Novo Checklist", "Editar" e "Excluir" para usuários com role `viewer` no workspace ativo usando o hook `useWorkspaceRBAC`.
        - Adicionar indicação visual clara do nome do workspace no cabeçalho.

## 4. Menu Lateral Universal
- **Alteração em `src/components/DashboardLayout.tsx`:**
    - Garantir que o seletor de workspace e os itens de menu reflitam a role do usuário.
    - Ocultar o item "Equipe" para `viewer` se necessário (será auditado durante a implementação).

## Detalhes Técnicos
- **Consultas SQL:** Utilizar filtros estritos `is('workspace_id', null)` ou `eq('workspace_id', uuid)`. Nunca `OR`.
- **Navegação:** Uso de `useNavigate` e `useSearch` do TanStack Router.
- **Segurança:** RBAC validado via `useWorkspaceRBAC` (que consulta `workspace_members`).

## Validação
- Teste manual com Owner (acesso total).
- Teste manual com Viewer (somente leitura, sem acesso ao módulo notion-like, sem redirecionamento para `/organizar`).
