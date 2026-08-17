# Plano de Hotfix Emergencial — Regressão de Carregamento 4B.8

Este plano corrige o travamento "Verificando permissões" e o erro subsequente no editor de checklists, implementando uma máquina de estados robusta e desacoplando a autorização do workspace ativo.

## Diagnóstico
A causa raiz identificada é a dependência circular e síncrona do `useWorkspaceRBAC` com o `activeWorkspace` do `WorkspaceContext`. Quando um checklist é aberto diretamente, o contexto pode ainda não ter carregado o workspace correto, resultando em loading infinito ou erro de RLS (406 Not Acceptable ou 403) por falha na resolução do ID do workspace.

## Etapas de Implementação

### 1. Desacoplamento da Autorização
Modificar o fluxo de autorização no editor para ser **autocontido** por registro.
- Consultar metadados mínimos do checklist (`id`, `user_id`, `workspace_id`, `is_published`) assim que a sessão estiver disponível.
- Usar o `workspace_id` do próprio registro para verificar o papel do usuário.

### 2. Máquina de Estados Determinística
Implementar um estado exclusivo (`authStatus`) no componente `NovoChecklistPage`:
- `session_loading`: Aguardando `auth.getSession()`.
- `metadata_loading`: Consultando metadados do checklist.
- `authorization_loading`: Verificando papéis no workspace (se aplicável).
- `editor_allowed`: Acesso total concedido.
- `execution_only`: Redirecionar para `/c/{id}`.
- `forbidden`: Acesso negado.
- `not_found`: Registro não existe.
- `technical_error`: Falha crítica (ex: rede).

### 3. Regras de Acesso (RBAC)
- **Checklist Pessoal**: `user_id === auth.uid()` -> `editor_allowed`.
- **Checklist de Workspace**:
  - `owner_id === auth.uid()` -> `editor_allowed` (independente de membership).
  - Membership `admin` ou `editor` -> `editor_allowed`.
  - Membership `viewer` -> `execution_only`.
- **Timeout**: Adicionar um tempo limite de 10s para resolução automática de estados de loading.

### 4. Correção Visual e Navegação
- Remover o loading centralizado que depende do `useWorkspaceRBAC` genérico.
- Garantir que Viewers sejam redirecionados instantaneamente para a rota pública.
- Impedir qualquer flash de conteúdo do editor antes de `editor_allowed`.

## Detalhes Técnicos
- **Arquivos**: `src/routes/checklist.tsx`.
- **Queries**: Usar `maybeSingle()` com tratamento explícito para evitar erros de "Cannot coerce result".
- **RLS**: Nenhuma alteração de política será necessária se a consulta for feita com os IDs corretos.
