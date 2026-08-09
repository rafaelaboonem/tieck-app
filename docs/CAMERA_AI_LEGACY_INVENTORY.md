# Inventário de Legado da Camera AI (V2, V3, V4)

Este documento registra os componentes e estruturas de IA que foram removidos do runtime, mas cujas referências no banco de dados foram mantidas para auditoria e rollback.

## Arquivos Removidos do Runtime
- `src/lib/camera-v4.condition-gate.ts`
- `src/lib/camera-v4.functions.js`
- `src/lib/camera-v4.functions.ts`
- `src/lib/camera-v4.identity-gate.ts`
- `src/lib/camera-v4.sanitize.ts`
- `src/lib/camera-v4.types.ts`
- `src/routes/api/public/verify-camera-v4.ts`
- `src/components/padrao/CameraStandardStatus.tsx` (Desativado/Removido do Editor)
- `src/components/padrao/CameraV3Preview.tsx`
- `src/components/padrao/LabTab.tsx` (Removido)
- `src/components/padrao/PerformanceTab.tsx` (Removido)

## Endpoints e Edge Functions Desativados
- `verify-camera-v4` (Server Route)
- `vision-benchmark` (Edge Function - Referências removidas)
- `analyze-checklist-evidence` (Edge Function - Lógica de análise removida no frontend)

## Resíduos Mantidos no Banco de Dados (Temporário)
- Tabela `public.camera_v4_attempts`
- Tabela `public.visual_standards` e `public.visual_standard_references`
- Colunas `verified_at`, `provider`, `model_id` em tabelas de resposta/evidência.
- Buckets de storage `visual-standards`.

## Secrets a serem removidas (após validação)
- `GEMINI_API_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DIAG_VISION_TOKEN`
- `LAB_DIAG_TOKEN`
- `CAMERA_V4_MODE`

