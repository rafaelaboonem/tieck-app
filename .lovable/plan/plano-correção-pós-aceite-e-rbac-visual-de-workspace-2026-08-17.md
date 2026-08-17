# Plano: Correção Pós-Aceite e RBAC Visual de Workspace

Este plano aborda a correção cirúrgica do fluxo pós-aceite de convites e a aplicação de restrições de interface (RBAC) para membros com papel de "Visualizador" (Viewer), garantindo que eles não vejam controles administrativos.

## Alterações

### 1. Pós-Aceite de Convite
- **Arquivo:** `src/routes/convite.$token.tsx`
- **Ação:** No sucesso do aceite (`handleAccept`), disparar a invalidação do cache de workspaces via `refreshWorkspaces` (do `WorkspaceContext`) antes de navegar. Isso garante que o novo workspace apareça imediatamente na barra lateral e que o papel do usuário seja carregado corretamente.

### 2. RBAC Visual (Interface Segura)
- **Arquivo:** `src/routes/organizar.tsx` e `src/components/DashboardLayout.tsx`
- **Ação:** Ocultar botões de criação ("Novo", "Nova Categoria", "Nova Página", "Novo Workspace") e menus de edição/exclusão quando o papel do usuário for `viewer`.
- **Lógica:** Utilizar a flag `canManage` (já existente em `organizar.tsx`) e implementar verificações similares no `DashboardLayout.tsx` baseadas no papel do membro no workspace atual.

### 3. Correção do Estado Vazio
- **Arquivo:** `src/routes/inicio.tsx` e `src/routes/organizar.tsx`
- **Ação:** Garantir que se o usuário for apenas `viewer`, a mensagem de "Nenhum checklist ainda" não incentive a criação de um novo (ou oculte o botão de criação), já que ele não tem permissão para tal.

## Detalhes Técnicos

- **Fail-closed:** Se o papel do usuário ainda estiver carregando, os controles administrativos permanecerão ocultos.
- **Cache Invalidation:** Uso do `WorkspaceContext` para forçar o recarregamento da lista de workspaces após o aceite do convite.
- **Consistência:** Aplicação de `canManage` em todos os pontos de entrada de criação de conteúdo no workspace.

## Verificação

- Testar fluxo de aceite: o workspace deve aparecer na sidebar sem F5.
- Testar como Viewer: os botões "Novo" e "Nova Categoria" devem desaparecer.
- Testar como Viewer: o botão "Novo Espaço de Trabalho" na sidebar deve ser restrito (ou oculto se o plano/papel exigir).
