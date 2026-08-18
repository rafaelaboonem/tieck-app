# Plano de Implementação - FASE 5B.6 — VIEWER DEVE VER SOMENTE CHECKLISTS ATRIBUÍDOS

Este plano visa restringir a visibilidade de checklists para usuários com o papel `Viewer` dentro de um Workspace. Viewers devem ver apenas checklists explicitamente atribuídos a eles, enquanto Owners, Admins e Editors continuam vendo todos os checklists do workspace.

## Alterações Propostas

### 1. Rota `/inicio` (`src/routes/inicio.tsx`)
- Modificar o `fetchChecklists` para detectar se o usuário é um `Viewer` no contexto de workspace.
- Se for `Viewer`, a query deve filtrar por checklists que possuam um registro em `checklist_assignments` associado ao `workspace_member_id` do usuário atual.
- Se não houver atribuições, exibir um estado vazio específico: "Nenhum checklist atribuído" com subtexto informativo.
- Remover o botão "Novo checklist" no workspace quando o usuário for `Viewer`.
- Garantir que o clique no checklist leve para `/executar` (ou passe pelo `ChecklistAuthGuard` que já trata isso).

### 2. Layout do Dashboard (`src/components/DashboardLayout.tsx`)
- **Recentes**: Filtrar a lista de checklists recentes para Viewers, exibindo apenas os atribuídos.
- **Busca / CommandDialog**: Restringir os resultados da busca global para Viewers, garantindo que não descubram checklists não atribuídos.
- **Resolução de `workspace_member_id`**: Implementar uma busca eficiente do ID de membro do workspace para o usuário logado para fundamentar os filtros.

### 3. Testes
- Adicionar casos de teste no Vitest para validar:
  - Viewer sem assignments -> zero resultados.
  - Viewer com assignment A -> vê A, não vê B.
  - Viewer com assignment concluído -> continua visível.
  - Owner/Admin/Editor -> continuam vendo tudo no workspace.

## Detalhes Técnicos
- Utilizar `useWorkspaceRBAC` para obter o status de `isViewer`.
- A query de checklists para Viewer usará um filtro `.in('id', assignmentIds)` após resolver os IDs de checklists atribuídos via `checklist_assignments`.
- Manter o isolamento do contexto "Pessoal", onde Viewers continuam podendo ver e criar seus próprios checklists.
- Não alterar RLS, cron ou lógica de deadlines da Fase 4C.

## Verificação
- `npm run build` para garantir integridade.
- `bunx vitest` para validar a lógica de filtragem.
- Verificação visual no mobile e desktop.
