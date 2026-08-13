# Fase 2: Correção de Integridade e UX da Camera AI

A Fase 2 requer a estabilização completa do frontend da Camera AI, eliminando dívidas técnicas de testes e garantindo que o gerenciamento de estado e requisições seja atômico e seguro contra concorrência.

## 1. Infraestrutura e Dependências
- Sincronizar `package-lock.json` com `package.json` para garantir `npm ci` limpo.
- Remover mocks globais artificiais de `import.meta.env` em `tests/setup.ts`.
- Remover `VITE_CAMERA_AI_ENABLED_FORCE` e qualquer acesso a `process.env` no frontend.

## 2. Refatoração do PublicCameraBlock.tsx
- **Controle de Requisição**: Substituir refs globais por um descritor local (sequence, idempotencyKey, AbortController) dentro de `processVerification`.
- **Segurança de Sequência**: Garantir que uma resposta antiga nunca altere o estado da UI se uma nova requisição já tiver sido iniciada.
- **Gerenciamento de Abort**: Abortar o controller local em caso de timeout ou nova captura.
- **Limpeza de Estado**: Chamar `onAnswer(id, "")` no início de cada nova captura para invalidar resultados anteriores.
- **Tipagem**: Remover todos os `any`, `as any` e `@ts-ignore`.

## 3. Estabilização de Testes (UI)
- **Testes Reais**: Garantir que todos os testes em `tests/camera-ai/ui.test.tsx` possuam assertions válidas.
- **Teste de Concorrência**: Validar que entre duas requisições (A e B), se B finalizar primeiro, o resultado de A (finalizado depois) seja ignorado.
- **Teste de Timeout**: Usar `vi.useFakeTimers()` para avançar 35s e validar o abort do controller e a transição para `technical_failure`.
- **Teste de Duplo Clique**: Validar `expect(fetch).toHaveBeenCalledTimes(1)`.
- **Tipagem**: Eliminar tipagem `any` nos mocks e utilitários de teste.

## 4. Validação Técnica
- `npm ci` bem sucedido.
- 16/16 testes de backend aprovados.
- 15/15 testes de UI aprovados.
- Build de produção e Typecheck (`tsc --noEmit`) sem erros.
- `CAMERA_AI_MODE=disabled` e `VITE_CAMERA_AI_ENABLED=false` mantidos.

## Detalhes Técnicos

```text
Atômico: const currentRequest = { sequence, controller, idempotencyKey };
Sequência: requestSequenceRef.current++;
Bypass: Apenas import.meta.env.VITE_CAMERA_AI_ENABLED.
```
