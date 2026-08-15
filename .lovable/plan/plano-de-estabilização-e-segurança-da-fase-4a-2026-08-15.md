# Plano de Estabilização e Segurança da Fase 4A

Patch corretivo e cirúrgico para sanar vulnerabilidades de segurança nas RPCs, consolidar a autorização de membros e refinar a interface de equipe/atribuições.

## Alterações de Banco de Dados (Supabase)

### 1. Migração Corretiva de Segurança
- Criar `supabase/migrations/20260815100000_phase4a_security_hardening.sql`.
- **Privilégios**: Revogar `PUBLIC`, `anon`, `authenticated` de `update_workspace_member_status`, `resend_workspace_invitation`, `create_workspace_invitation_safe` e `accept_workspace_invitation_service`. Conceder apenas a `service_role`.
- **Fortalecimento Interno**: 
    - `create_workspace_invitation_safe`: Rejeitar convites para `owner`. Validar que `admin` convida apenas `editor`/`viewer`.
    - `update_workspace_member_status`: Rejeitar `role = owner`. Validar que `p_member_id` pertence ao workspace. Bloquear alteração de proprietário ou rebaixamento. `admin` não pode modificar `admin`.
    - `resend_workspace_invitation`: Exigir `owner` se o convite for para `admin`.
- **Consolidação `user_has_workspace_access`**:
    - Manter apenas a assinatura `(uuid, uuid, text)`.
    - Remover versões sobrecarregadas antigas via `DROP FUNCTION` (sem `CASCADE`).
    - Garantir que papéis desconhecidos retornem `false`.
- **Políticas RLS**:
    - Corrigir `workspace_categories`, `units` e `shifts`: `viewer` apenas `SELECT`. `editor`/`admin`/`owner` com permissões totais.

## Alterações no Backend (TanStack Server Functions/Routes)

### 1. Endpoints de Equipe (`/api/team/*` e `/api/public/invitations/*`)
- Mapear erros para códigos controlados (`unauthorized`, `forbidden`, `not_found`, `conflict`, `rate_limit`).
- Remover `rpcError.message` do retorno ao cliente.
- Aplicar rate limit fail-closed em `create`, `resend` e `inspect`.
- Garantir que `revoke` para `admin` exija privilégios de `owner`.
- Substituir "Reenviar" por "Gerar novo link" e tratar `emailSent: false`.

### 2. Funções de Servidor (`src/lib/team.functions.ts`)
- Reforçar validações antes de chamar as RPCs.
- Garantir que `Authorization: Bearer` nunca seja `undefined`.

## Alterações no Frontend (UI/UX)

### 1. Tela de Equipe (`src/routes/equipe.tsx`)
- Derivar papel do usuário e aplicar matriz de controles (esconder ações de admin para viewers/editors).
- Ocultar opção de criar outro `owner`.
- Substituir `any` por tipos explícitos e type guards.
- Validar dados do Supabase com schemas Zod.

### 2. Tela de Organizar (`src/routes/organizar.tsx`)
- Ajustar `update_checklist_assignments` para enviar `p_primary_member_id: null` na remoção.
- Remover `any` de assignments e members.
- Garantir que `viewer` não visualize controles de atribuição.
- Filtrar apenas membros ativos para atribuição.

## Verificação e Testes

- **Typecheck**: `npx tsc --noEmit`.
- **Build**: `npm run build`.
- **Inventário**: Documentar `pg_policies` e privilégios de RPCs no relatório final.
- **Testes de Segurança**: Validar que RPCs `service-role-only` falham para usuários autenticados comuns.
