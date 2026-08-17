---
name: Fase 4B.7 Plan
description: Fix data flashes, Owner RBAC, and contextual recents in Phase 4B.7.
type: feature
---
# Fase 4B.7 — Data Flash, Owner RBAC & Contextual Recents

## 1. Auditoria e Recuperação de "Casa 2"
- **Ação:** Identificar o checklist "Casa 2" via `supabase` no navegador (manual/inspecionado) ou via código se necessário, mas as instruções pedem auditoria explícita.
- **Correção:** Preencher `workspace_id` do checklist "Casa 2" com o ID do "Meu Workspace" se for NULL e o proprietário for o autor.

## 2. Eliminação do Flash de Dados em `/inicio`
- **Estados:** Introduzir `workspaceStatus: 'loading' | 'personal' | 'workspace'` no `WorkspaceContext`.
- **Renderização:** `/inicio` deve exibir skeleton enquanto `WorkspaceContext.isLoading` ou `workspaceStatus === 'loading'`.
- **Query Cache:** Chaves de cache no `TanStack Query` e queries no `useEffect` devem incluir o contexto explicitamente para evitar vazamentos.
- **Race Conditions:** Limpar estado local de checklists ao trocar de workspace/contexto.

## 3. RBAC do Proprietário (Owner)
- **Regra:** `useWorkspaceRBAC` deve retornar `role: 'owner'` e `canManage: true` se `currentWorkspace.owner_id === user.id`, mesmo sem registro em `workspace_members`.
- **Fallback:** Nunca retornar `isViewer` por padrão enquanto carrega.

## 4. Recentes Contextuais no `DashboardLayout`
- **Filtro:** A query de `recentChecklists` deve incluir `workspace_id` (NULL para pessoal, ID para equipe).
- **Cache:** Chave da query de recentes deve incluir o workspace ativo.

## 5. Criação no Workspace
- **Fluxo:** Garantir que `handleNew` em `/inicio` e o autosave inicial em `/checklist` respeitem e persistam o `workspace_id`.
