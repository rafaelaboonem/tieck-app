# Plano de Bloqueio Total do Editor para Viewers (Fase 4B.8)

Implementação de segurança rigorosa para garantir que membros com role `viewer` não acessem nem modifiquem checklists no editor, sendo redirecionados para a rota de execução.

## 1. Auditoria e Diagnóstico
*   **Factual:** O checklist "Casa 2" (`a050976c...`) foi auditado. O bloco "Câmera / Configuração pendente" **persistiu** no banco (`updated_at: 03:45:54`).
*   **Vulnerabilidade:** As políticas de `UPDATE` e `ALL` atuais (especialmente `checklists_editor_manage`) não estão validando corretamente a role `editor` no banco, ou a função `user_has_workspace_access` está retornando `true` para `viewer` em operações de escrita.
*   **Ação Imediata:** Endurecer as políticas de RLS e a proteção de rota.

## 2. Matriz de Autorização (Reforçada)
| Contexto | Role | SELECT | UPDATE/DELETE/INSERT | Rota /checklist | Rota /c/:id |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Pessoal | Autor | Sim | Sim | Editor | Execução |
| Pessoal | Outro | Não | Não | 404/Redirecionar | 404 |
| Workspace | Owner/Admin/Editor | Sim | Sim | Editor | Execução |
| Workspace | Viewer | Sim | **Não** | **Redirecionar** | Execução |
| Workspace | Não Membro | Não | Não | 404/Redirecionar | 404 |

## 3. Alterações Propostas

### Backend (RLS & RPCs)
*   **RLS `checklists`:**
    *   Revisar `checklists_editor_manage` para garantir que `user_has_workspace_access(..., 'editor')` seja estritamente para `editor` ou superior em comandos `ALL`/`UPDATE`.
    *   Garantir que não haja bypass em `checklists_owner_all`.
*   **RPC `publish_checklist`:** Adicionar validação interna de `canManage` (Owner/Admin/Editor).

### Frontend (Proteção de Rota & UI)
*   **`src/routes/checklist.tsx`:**
    *   Implementar `useWorkspaceRBAC` no topo.
    *   Enquanto carrega, mostrar loading neutro.
    *   Se `isViewer === true`, redirecionar imediatamente para `/c/${id}` com `replace: true`.
    *   Não renderizar nenhum componente do editor se não for autorizado.
*   **`src/routes/inicio.tsx` & `src/components/DashboardLayout.tsx`:**
    *   Alterar links dos cards e itens "Recentes".
    *   Se o usuário for `viewer`, o destino deve ser sempre `/c/${id}`.

### Validação
*   Testar acesso manual de um Viewer à URL do editor.
*   Verificar se o autosave é disparado (não deve ser).
*   Testar se o Owner continua com acesso total.

## Technical Details
*   **`user_has_workspace_access`:** Verificar se a função SQL está tratando corretamente a hierarquia (ex: pedir 'editor' deve aceitar 'admin'/'owner', mas rejeitar 'viewer').
*   **`useWorkspaceRBAC`:** Garantir que o hook seja reativo e preciso.
