# Plano de Correção: Integridade de Contexto e RBAC (Fase 4B.2)

O Viewer aceitou o convite mas não visualiza os checklists de equipe porque a interface o direcionou para `/inicio` (exclusivamente pessoal) em vez de `/organizar` (workspace). Além disso, a DashboardLayout restringe a criação de workspaces indevidamente para usuários que já possuem um (mesmo sendo Viewers).

## Alterações

### 1. Navegação e Ativação Pós-Aceite
- **Arquivo:** `src/routes/convite.$token.tsx`
- **Ação:** Alterar o redirecionamento após `handleAccept` de `/inicio` para `/organizar?id={result.workspace_id}`.
- **Impacto:** Garante que o usuário entre no contexto correto imediatamente.

### 2. Correção de Governança no DashboardLayout
- **Arquivo:** `src/components/DashboardLayout.tsx`
- **Ação:** Remover a restrição `workspaces.length === 0` que impedia a criação de novos espaços de trabalho para quem já é membro de algum.
- **Justificativa:** Todo usuário deve poder criar seu próprio workspace (onde será Owner), independentemente de ser Viewer em workspaces de terceiros.

### 3. Ajuste de Busca de Checklists Pessoais
- **Arquivo:** `src/routes/inicio.tsx`
- **Ação:** Manter o isolamento estrito (`workspace_id IS NULL`), mas garantir que a UI reflita que aquela é a área pessoal.

### 4. Testes de Regressão
- **Arquivo:** `src/server/workspace/rbac-integrity.test.tsx` (Novo)
- **Cenários:**
    - Viewer sendo redirecionado para `/organizar` após aceite.
    - Viewer visualizando checklists de equipe na rota `/organizar`.
    - Checklists pessoais permanecendo isolados em `/inicio`.
    - Usuário com workspace de terceiros podendo criar um novo workspace próprio.

## Detalhes Técnicos
- O `WorkspaceProvider` já sincroniza o `currentWorkspaceId` via localStorage.
- A query em `organizar.tsx` já filtra por `workspace_id`.
- A RLS em `checklists` (`checklists_editor_manage`) permite leitura para qualquer membro do workspace.
