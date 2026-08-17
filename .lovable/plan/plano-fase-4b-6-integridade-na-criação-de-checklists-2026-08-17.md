# Plano: Fase 4B.6 — Integridade na Criação de Checklists

Este plano visa garantir que novos checklists criados a partir da rota `/inicio` (Dashboard) herdem corretamente o contexto do workspace ativo, prevenindo que checklists de equipe sejam criados erroneamente como checklists pessoais (com `workspace_id` nulo).

## Alterações

### 1. Rota de Início (`src/routes/inicio.tsx`)
- Atualizar a função `handleNew` para capturar o `id` do workspace ativo (`currentWorkspace`).
- Passar o `id` do workspace como parâmetro de busca (`search: { workspace: id }`) na navegação para a rota `/checklist`.

### 2. Editor de Checklist (`src/routes/checklist.tsx`)
- Garantir que a lógica de criação de novo checklist (`insert`) utilize o parâmetro `workspace` presente na URL para definir o campo `workspace_id`.
- Sincronizar o estado do `currentWorkspace` com o checklist recém-criado caso ele tenha sido aberto via convite ou link direto com parâmetro de workspace.

### 3. Contexto de Workspace (`src/contexts/WorkspaceContext.tsx`)
- Ajustar a limpeza do parâmetro `workspace` na URL para ocorrer apenas após garantir que o editor ou a view de destino tenha consumido o valor.

## Detalhes Técnicos
- **Fluxo de Dados:** O parâmetro `workspace` na query string servirá como o "contrato" de contexto entre o Dashboard e o Editor.
- **Fallbacks:** Caso nenhum workspace esteja ativo ou o usuário esteja no contexto pessoal, o comportamento atual de `workspace_id = null` será mantido.
- **Integridade:** Evita a "perda" de checklists que, ao serem criados sem workspace, ficam invisíveis na aba de equipe de um workspace compartilhado.
