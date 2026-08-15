# Plano de Implementação: Fase 4A - Equipe e Atribuições

Implementação do sistema de equipe, permissões baseadas em papéis (RBAC) e atribuição operacional de checklists.

## 1. Banco de Dados e Segurança (Concluído/Ajustes)
- [x] Criação de `workspace_members`, `workspace_invitations` e `checklist_assignments`.
- [x] Função de segurança `has_role_in_workspace` (SECURITY DEFINER).
- [ ] Implementar RPC `accept_workspace_invitation` para processamento atômico de convites.
- [ ] Implementar RPC `manage_workspace_member` para alteração de papéis e status.
- [ ] Implementar RPC `update_checklist_assignments` para atribuição de responsáveis.

## 2. API e Endpoints
- [ ] `POST /api/public/invitations/create`: Endpoint autenticado (Bearer) para criar convites com rate limit.
- [ ] `POST /api/public/invitations/accept`: Endpoint para processar a aceitação de convites.
- [ ] Garantir validação Zod e sanitização de erros em todos os novos endpoints.

## 3. Interface de Equipe (/equipe)
- [ ] Criar `src/routes/equipe.tsx` com navegação por abas: Membros e Atribuições.
- [ ] Componente `TeamMemberTable`: Listagem, busca e ações (editar papel, desativar, reativar).
- [ ] Componente `InviteMemberDialog`: Modal para envio de convites com seleção de papel.
- [ ] Componente `AssignmentTable`: Listagem de checklists com seleção de responsáveis.

## 4. Integração e Layout
- [ ] Atualizar `DashboardLayout.tsx`:
    - Adicionar item "Equipe" ao menu.
    - Contagem real de membros ativos no rodapé da sidebar.
    - Busca global apontando para `/equipe`.
- [ ] Atualizar `/organizar`:
    - Mostrar avatar do responsável principal em cada card de checklist.
    - Adicionar ação "Atribuir responsável" no menu de opções.

## 5. Validação e Qualidade
- [ ] Testes automatizados (Vitest) para a matriz de autorização.
- [ ] Verificação de isolamento entre workspaces (RLS e filtros de API).
- [ ] Build e Typecheck (sem `any` nos novos arquivos).

## Detalhes Técnicos
- **Hashing**: SHA-256 para tokens de convite.
- **Autorização**: Acesso hierárquico (Proprietário > Admin > Editor > Viewer).
- **Normalização**: E-mails sempre em lowercase e sem espaços.
- **Idempotência**: Garantir que convites aceitos ou expirados não possam ser reutilizados.
