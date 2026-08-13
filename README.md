# Tieck

Plataforma de checklists operacionais e evidências fotográficas.

## Status da Camera AI

A Camera AI está em fase de **baseline neutra**.

*   **Baseline atual**: Captura fotográfica pura com upload direto para o Supabase Storage.
*   **Endpoint de Verificação**: A rota `/api/camera-ai/verify` está implementada mas retorna `503 camera_ai_disabled` por padrão.
*   **Modo de Operação**: `CAMERA_AI_MODE` deve permanecer como `disabled` até a próxima fase de integração.

## Stack

- TanStack Start (React 19, Vite 7) — SSR + server functions.
- Tailwind CSS v4 + shadcn/ui + Tremor Raw + Apache ECharts.
- Vercel — Hosting e Edge Runtime.
- Supabase (txqfdscdlltohpkkznwa) — Auth, Postgres com RLS, Storage.

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
