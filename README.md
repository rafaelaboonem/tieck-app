# Tieck

Plataforma de checklists operacionais, evidências e revisão manual de padrões visuais.

## Status da Camera AI

A Camera AI está em fase de **baseline neutra**.

*   **Baseline atual**: Captura fotográfica pura com upload direto para o Supabase Storage.
*   **Endpoint de Verificação**: A rota `/api/camera-ai/verify` está implementada mas retorna `503 camera_ai_disabled` por padrão.
*   **Modo de Operação**: `CAMERA_AI_MODE` deve permanecer como `disabled` até a próxima fase de integração.
*   **Motores Legados**: Implementações anteriores baseadas em Gemini ou Moondream foram arquivadas em `archive/camera-ai-legacy/` e não possuem consumidores ativos no runtime.

## Stack

- TanStack Start (React 19, Vite 7) — SSR + server functions.
- Tailwind CSS v4 + shadcn/ui + Tremor Raw + Apache ECharts.
- Lovable Cloud (Supabase gerenciado) — Auth, Postgres com RLS, Storage privado, Realtime.
- Lovable AI Gateway para análise textual/imagem futura (`OPENAI_*`).

## Desenvolvimento

Padronizado para **npm**.

```bash
npm install
npm run dev
```

### Testes de Rota

```bash
npm run test:routes
```
