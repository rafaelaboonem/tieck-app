# Estabilização Final da Fase 4A - Equipe e Permissões

Este plano visa concluir a Fase 4A do Tieck, focando na estabilização técnica, segurança RBAC e funcionalidade completa da gestão de equipe.

## Mudanças Técnicas

### 1. Banco de Dados (Migrations)
- Criar migration `20260815090000_phase4a_final_stabilization.sql`:
  - Depreciar o papel 'owner' no enum `app_role` (via comentário, pois remover valores de enum é complexo).
  - Converter qualquer membro com `role = 'owner'` para `admin`.
  - Garantir que a autorização de proprietário seja verificada via `workspaces.owner_id`.
  - Atualizar a função `user_has_workspace_access` para ter uma única assinatura canônica de 3 argumentos: `(p_workspace_id uuid, p_user_id uuid, p_min_role text DEFAULT 'viewer')`.
  - Implementar prioridades de papel: Proprietário (4), Admin (3), Editor (2), Viewer (1).
  - Adicionar restrição (check ou trigger) em `checklist_assignments` para impedir atribuições cruzadas de workspaces.
  - Remover sobrecargas antigas da função de acesso.

### 2. Backend (Server Functions e API)
- **Convites (`/api/public/invitations/create`):**
  - Substituir `upsert` por operação transacional (limpar pendentes anteriores, criar novo).
  - Retornar o link completo `/convite/{token}`.
  - Implementar envio de e-mail (usando template com nome do workspace, papel e validade).
  - Tratar falha de envio sem invalidar o convite (retornar `emailSent: false`).
- **Inspeção (`/api/public/invitations/inspect`):**
  - Validar token (64 hex chars).
  - Aplicar rate limit real.
  - Retornar metadados mascarados (sem IDs internos ou e-mail completo).
  - Remover casts de `any`.
- **Gestão de Equipe (Novas Server Functions):**
  - Implementar `updateMemberRole`, `removeMember`, `revokeInvitation`, `resendInvitation` com validação de token Bearer e RBAC.

### 3. Frontend (UI e Integração)
- **Página de Equipe (`src/routes/equipe.tsx`):**
  - Corrigir busca de perfis (buscar membros -> extrair IDs -> buscar perfis via `.in`).
  - Detectar proprietário via `currentWorkspace.owner_id`.
  - Implementar handlers para todos os botões (Convidar, Remover, Revogar, Alterar Permissão) com Dialogs de confirmação.
  - Adicionar estados de loading e tratamento de erro global.
  - Remover `any` e tipar com `WorkspaceMemberView` etc.
- **Página de Organização (`src/routes/organizar.tsx`):**
  - Substituir `DELETE` direto em atribuições pela RPC `update_checklist_assignments`.
  - Completar a aba de Atribuições com filtros, busca e painel de edição para membros autorizados.
- **Navegação:**
  - Atualizar busca global no `DashboardLayout.tsx`.
  - Garantir que "Meu Plano" aponte para `/membros` e "Equipe" para `/equipe`.

## Verificação
- Executar `npx tsc --noEmit` e `npm run build`.
- Testar fluxos ponta a ponta: convite -> inspeção -> aceite -> atribuição -> revogação/remoção.
- Validar isolamento entre workspaces (tentar atribuir membro de outro WS).
- Validar restrições de Viewer (sem botões de escrita).
