# Plano de Ação - Fase 4C.5: Integridade da UX de Alertas de Prazo

Correção cirúrgica de regressões na configuração de alertas de prazo na aba E-mails do checklist, focando em Timezone, RBAC e Integridade de dados.

## 1. Refatoração de Helpers e Timezone
- Mover helpers de conversão de data de `AssignmentDeadlinePopover.tsx` para `src/utils/date-helpers.ts` para reuso.
- Atualizar `src/routes/checklist.tsx` para usar `toLocalISO` ao ler `due_at` (UTC) para os inputs locais e `fromLocalISO` ao salvar.

## 2. Correção de RBAC e Query PostgREST
- Em `src/routes/checklist.tsx`, substituir a query de `workspace_members` que usa nested profiles (causadora de erros 500) por duas queries separadas:
    1. Buscar membros ativos do workspace.
    2. Buscar perfis correspondentes aos membros via `.in('id', user_ids)`.
- Combinar os dados no frontend para exibição no seletor de responsáveis.

## 3. Mapeamento de Status e UI
- Substituir comparações manuais de status ('completed', 'overdue') pelo mapeamento centralizado em `src/utils/assignment-status.ts`.
- Garantir que os labels "Concluído", "Atrasado", etc., sigam o padrão do sistema.

## 4. Integridade de Atribuições ao Salvar
- Corrigir `saveDeadlineConfig` para preservar outros membros já atribuídos ao checklist.
- Ao atualizar o responsável, obter a lista de IDs atuais e garantir que o novo responsável seja incluído sem remover os antigos.
- Corrigir a lógica de "Desligar Alerta" para apenas limpar o `due_at` via `set_assignment_deadline(id, null)` sem remover a atribuição.

## 5. Testes Funcionais Reais
- Implementar assertions reais em `src/routes/checklist.test.tsx` cobrindo:
    - Conversão correta de Timezone (Local vs UTC).
    - Renderização da aba e campos baseada no switch.
    - RBAC (Viewers bloqueados).
    - Persistência de múltiplos membros.
    - Resolução de perfis sem nested join.

## Detalhes Técnicos
- **Timezone**: Garantir que `new Date(localISO)` seja usado para capturar o offset do navegador.
- **RPCs**: Utilizar `update_checklist_assignments` com a lista completa de membros e `set_assignment_deadline` para manipulação do prazo.
- **PostgREST**: Respeitar a ausência de FK entre `workspace_members` e `profiles` no banco.
