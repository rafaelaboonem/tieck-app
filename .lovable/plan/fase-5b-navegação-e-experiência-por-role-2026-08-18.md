# Fase 5B - Navegação e Experiência por Role

Implementação de RBAC visual no frontend para garantir que a experiência de navegação (sidebar, header, comandos) reflita as permissões reais do usuário no workspace.

## Objetivos
- Filtrar itens da Sidebar por role (Owner, Admin, Editor, Viewer).
- Restringir acesso a ferramentas administrativas no Header e CommandDialog para Viewers.
- Corrigir a condição de criação de novos workspaces.
- Hardening de rotas administrativas com guards de permissão.

## Alterações Técnicas

### 1. DashboardLayout (`src/components/DashboardLayout.tsx`)
- Importar e utilizar `useWorkspaceRBAC(currentWorkspace?.id)` para obter o estado de permissão do contexto atual.
- Refatorar a lista de navegação principal (`NavItem[]`) para incluir uma flag `requiredPermission` ou lógica de filtro baseada em `isAdmin`, `canManage`, `isViewer`.
- **Filtro de Sidebar:**
  - `Painel`, `Domínios`, `Meu Plano`, `Equipe`: Visíveis apenas para `isAdmin` (Owner/Admin).
  - `Espaço de Trabalho` (Organizar): Visível para `canManage` (Owner/Admin/Editor).
  - `Início`, `Buscar`: Visíveis para todos.
- **Header:** Esconder "Configurações" (ícone Sparkles/Settings) para Viewers.
- **CommandDialog:** Filtrar comandos administrativos (Equipe, Domínios, Membros, Criar Workspace) baseando-se no RBAC.
- **Novo Workspace:** Substituir a condição tautológica por `profile?.is_admin || workspaces.length === 0`. *Nota: A regra atual permite criação se for admin global ou se não tiver workspaces, manteremos a integridade disso sem inventar regras.*

### 2. Guards de Rota (`src/routes/*.tsx`)
- Adicionar ou reforçar guards em `/dominios`, `/equipe`, `/membros` (Meu Plano) e `/painel` usando `useWorkspaceRBAC`.
- Caso um Viewer tente acessar via URL: Redirecionar para `/inicio` ou exibir estado de acesso negado consistente.

### 3. Checklist Editor (`src/routes/checklist.tsx`)
- O Header do editor já possui botões de Configuração e Publicar.
- Garantir que `useWorkspaceRBAC` oculte esses botões se o usuário for Viewer no workspace do checklist.

## Matriz de Navegação (Workspace Context)

| Item | Viewer | Editor | Admin | Owner |
| :--- | :---: | :---: | :---: | :---: |
| Início | Sim | Sim | Sim | Sim |
| Buscar | Sim | Sim | Sim | Sim |
| Painel | Não | Não | Sim | Sim |
| Domínios | Não | Não | Sim | Sim |
| Configurações | Não | Não | Sim | Sim |
| Equipe | Não | Não | Sim | Sim |
| Meu Plano | Não | Não | Sim | Sim |
| Espaço de Trabalho | Não | Sim | Sim | Sim |
| Criar WS | Não* | Não* | Sim | Sim |

*\*Baseado na regra global de criação.*

## Verificação
- Executar `npm run build` para garantir integridade de tipos.
- Rodar `src/hooks/useWorkspaceRBAC.test.ts` (Vitest).
- Teste manual em preview simulando diferentes roles (mockando `useWorkspaceRBAC` se necessário para validação visual rápida).
