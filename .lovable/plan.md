# Fase 4C — Prazos de Atribuição, Conclusão e Alerta Automático de Atraso

Implementação de controle de prazos (due_at), conclusão segura (completed_at) e sistema de notificação de atraso para membros atribuídos a checklists.

## Banco de Dados e RPCs

- **Migration**: Adicionar colunas `due_at`, `completed_at` e `overdue_notified_at` na tabela `checklist_assignments`.
- **update_checklist_assignments**: Refatorar para upsert diferencial (preserva metadados de ciclo de vida de membros que permanecem atribuídos).
- **set_assignment_deadline**: Novo RPC para definir prazo (somente Editor+).
- **complete_assignment**: Novo RPC para marcação segura de conclusão (deriva `auth.uid()`, idempotente).

## Interface do Usuário

- **Organizar**: Adicionar campos de data e hora no popover de atribuição de responsáveis. Exibir badges de status (Pendente, Atrasado, Concluído).
- **Início**: Exibir prazos e status para Viewers atribuídos.
- **Executar**: Exibir prazo da atribuição atual.
- **ExecutionEngine**: Vincular chamada do RPC `complete_assignment` após o sucesso real da submissão em modo autenticado.

## Automação de Atrasos (Server-side)

- **API Endpoint**: `POST /api/cron/overdue-assignments` protegido por `CRON_SECRET`.
- **Lógica de Atraso**: Selecionar atribuições onde `due_at < now()`, `completed_at` é nulo ou posterior ao prazo, e `overdue_notified_at` é nulo.
- **Notificação**: E-mail via Resend para o Owner do workspace (destinatário derivado no servidor).
- **pg_cron**: Configurar trigger de 5 minutos chamando o endpoint.

## Cronograma de Execução

1. **Schema**: Aplicar migration e RPCs.
2. **Interface (Edição)**: Implementar definição de prazos em `/organizar`.
3. **Interface (Visualização)**: Exibir badges e prazos em `/inicio` e `/executar`.
4. **Backend (Conclusão)**: Integrar marcação de `completed_at` no `ExecutionEngine`.
5. **Automação**: Criar endpoint de cron e helper de e-mail para atrasos.
6. **Validar**: Executar testes obrigatórios e build.

