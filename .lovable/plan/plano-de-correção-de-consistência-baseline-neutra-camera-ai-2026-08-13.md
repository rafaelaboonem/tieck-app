# Plano de Correção de Consistência - Baseline Neutra Camera AI

Executar a limpeza final e padronização do repositório para garantir uma baseline neutra e segura antes da integração com OpenAI.

## 1. Padronização npm
* Remover `bun.lock`.
* Adicionar `tsx` como `devDependency` no `package.json`.
* Alterar o script `test:routes` no `package.json` para usar `tsx`.
* Executar `npm install` para garantir o `package-lock.json` atualizado.

## 2. Limpeza de Código e Arquivamento
* Remover diretório `src/lib/camera-ai` (implementação incompleta).
* Mover funções legadas do Supabase para um diretório de histórico:
    * `supabase/functions/analyze-checklist-evidence` -> `archive/camera-ai-legacy/supabase/functions/analyze-checklist-evidence`
    * `supabase/functions/vision-benchmark` -> `archive/camera-ai-legacy/supabase/functions/vision-benchmark`
* Criar diretório `archive/camera-ai-legacy` se não existir.

## 3. Endpoint Neutro `/api/camera-ai/verify`
* Refatorar `src/routes/api/camera-ai/verify.ts`:
    * Garantir que `OPTIONS` retorne `204`.
    * Retornar `503` se `CAMERA_AI_MODE !== 'enabled'`.
    * Retornar `501` se `CAMERA_AI_MODE === 'enabled'` (ainda não implementado).
    * Retornar `405` para outros métodos HTTP.
    * Garantir `Content-Type: application/json` e ausência de inicialização do SDK OpenAI.

## 4. Checklist Público (`PublicCameraBlock.tsx`)
* Remover estado `analyzing`.
* Garantir que não haja chamadas ao endpoint `/api/camera-ai/verify` ou polling.
* Exibir apenas mensagens neutras como "Foto recebida".

## 5. Documentação e Testes
* Atualizar `README.md` com a nova baseline.
* Criar `tests/camera_ai_neutral.test.ts` para validar o comportamento do endpoint sem rede/inferência.
* Atualizar `.env.example`.

## Detalhes Técnicos
* Uso de `npm ci` para validação.
* `npx tsc --noEmit` para typecheck.
* `npm run build` para garantir integridade.
