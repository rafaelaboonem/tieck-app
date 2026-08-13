# Tieck

Plataforma de checklists operacionais, evidências e revisão manual de
padrões visuais. Este remix é uma base **limpa** — sem integrações de
treinamento visual externo (Anomalib) e sem Railway.

## Stack

- TanStack Start (React 19, Vite 7) — SSR + server functions.
- Tailwind CSS v4 + shadcn/ui + Tremor Raw + Apache ECharts.
- Lovable Cloud (Supabase gerenciado) — Auth, Postgres com RLS,
  Storage privado, Realtime.
- Lovable AI Gateway para análise textual/imagem opcional (`OPENAI_*`).

## Módulos

- **Checklists** — criação, publicação, respostas e evidências.
- **Operação** — execução de tarefas por unidade/turno.
- **Padrão** — biblioteca **manual** de padrões visuais: cadastrar
  padrões, subir imagens, classificar (correta / anomalia / ignorada)
  e revisar manualmente. Não há treinamento automático nem inferência
  externa.
- **Insights** — dashboards operacionais (Tremor + ECharts).

## Ambiente

Copie `.env.example` e preencha somente os campos do Supabase do
projeto. Nenhuma variável do antigo serviço de visão é lida em
runtime.

```bash
cp .env.example .env
bun install
bun run dev
```

## Instalação em um Supabase novo

Scripts SQL em `supabase/manual-install/` reproduzem o schema mínimo
da baseline limpa (sem tabelas de treinamento visual, sem funções de
dispatch e sem fixtures `__test_*`). Execute-os na ordem numérica.
Ver `supabase/clean-baseline/README.md` para o escopo.

## Histórico legado

Todo o material da integração Anomalib/Railway removida está em
`archive/legacy-integration-history/`. Nenhum arquivo desse diretório
é importado pelo runtime.