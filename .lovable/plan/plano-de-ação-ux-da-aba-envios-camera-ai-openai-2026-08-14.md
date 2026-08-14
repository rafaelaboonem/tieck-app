# Plano de Ação - UX da Aba Envios (Camera AI OpenAI)

Este plano alinha a interface de administração de "Envios" à nova arquitetura da Camera AI baseada em OpenAI, removendo elementos legados de curadoria manual e exibindo os resultados reais da verificação automática.

## Alterações Propostas

### 1. Limpeza de Legado e Mocks
- Remover imports e tipos de `curated-images` e `vision-datasets`.
- Eliminar estados e funções relacionados a datasets, selos de revisão pendente e modal de treinamento.
- Remover o carregamento de dados de treinamento (`hydrateTrainingData`).

### 2. Enriquecimento de Dados
- Atualizar `fetchSubmissions` para buscar dados da tabela `camera_ai_attempts` via join ou consulta paralela.
- Estender `ResponseRow` para incluir metadados de IA (decisão, evidência, modelo, duração).

### 3. Nova Lógica de Sumarização (UX)
- Refatorar `summarizePhotos` e `photoBadge`:
  - **1 foto aprovada pela IA**: Tentativa `completed` + `approved` + `evidence_id`.
  - **1 foto recebida**: Foto presente mas sem tentativa de análise.
  - **Verificação não localizada**: Inconsistência nos dados.
  - **Rejeitada pela IA**: Tentativa `completed` + `rejected`.

### 4. Interface da Resposta do Bloco Camera
- Substituir o "Card de Curadoria" pelo "Card de Verificação IA":
  - Badge verde/vermelho com o status da IA.
  - Exibição da justificativa técnica (`evidence`) salva pela OpenAI.
  - Seção "Detalhes" (discreta) com Modelo, Duração e Data da verificação.
  - Manter preview da imagem e botão "Ampliar".

### 5. Segurança e Integridade
- Garantir que selos de aprovação só apareçam se o `evidence_id` da tentativa coincidir com a imagem.
- Consultas respeitando RLS (sem Service Role no frontend).

## Detalhes Técnicos

- **Join Eficiente**: Buscar `camera_ai_attempts` filtrando por `response_id` dos envios carregados.
- **Tipagem**:
```typescript
type CameraAIAttempt = {
  id: string;
  response_id: string;
  decision: 'approved' | 'rejected' | 'not_observable' | 'error';
  evidence: string; // Justificativa da IA
  model: string;
  duration_ms: number;
  completed_at: string;
  code: string;
  evidence_id: string;
};
```
- **Componentes**: Refatorar `renderAnswerValue` para injetar o objeto de tentativa correspondente ao `evidenceId` contido no JSON da resposta.

## Validação

- Testar com o envio real `b2615ef0-5f77-4ba9-b1cc-95ab61cb5b17` (deve mostrar "Aprovada pela IA" e justificativa).
- Verificar se selos legados ("Revisão pendente") desapareceram.
- Confirmar zero chamadas extras à OpenAI (apenas leitura de banco).
- Build e Typecheck completo.
