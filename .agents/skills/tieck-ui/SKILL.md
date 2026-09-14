---
name: tieck-ui
description: Sistema de design e regras de UI do Tieck (SaaS B2B operacional de checklists, rotinas, evidências e inteligência operacional). Use ao criar ou alterar qualquer componente, rota ou superfície visual do frontend Tieck — garante consistência com os tokens, componentes e padrões reais do projeto e evita estética genérica de dashboard gerado por IA.
---

# Tieck UI — fundação de design operacional

**Personalidade visual: "Operational SaaS — calm, precise, dense and trustworthy."**

A UI do Tieck comunica controle, clareza, hierarquia, confiabilidade e eficiência
operacional. NÃO comunica marketing exagerado, gamificação, visual futurista, UI
experimental, efeitos decorativos ou landing page dentro do produto.

> **Composição, caráter de produto e direção visual:** consulte
> [`references/visual-direction.md`](references/visual-direction.md)
> (shell e **sidebar única**, estados colapsado/mobile, motion de navegação,
> superfícies, densidade, brand, "Not Tieck" e o checklist de 10 perguntas antes de
> criar uma UI).
> Esta Skill continua sendo a **fonte de regras**; aquele arquivo é a fonte de
> **direção estética/compositiva**. Em conflito, as regras daqui prevalecem.

Esta Skill descreve o Tieck REAL. Antes de criar qualquer componente novo:

1. **Procure componente existente** (`src/components/ui/`, `src/components/tremor/ui/`,
   `src/components/dashboard/`, `src/components/home/`, `src/components/operations/`).
2. **Verifique se consegue compor primitives existentes** em vez de criar variante nova.
3. **Reutilize os tokens existentes** (`src/styles.css`) — nunca introduza cor, radius
   ou sombra fora do sistema.
4. **Evite variante visual nova sem motivo** — se um Card/Badge/Button já resolve,
   use-o como está.
5. **Mantenha consistência com telas adjacentes** — `/painel`, `/inicio` e o detalhe
   operacional são a referência de densidade e hierarquia.

**Consistência > novidade.** Uma mudança só é justificável se melhora a tarefa
operacional do usuário; "ficar mais bonito/moderno" sozinho não é motivo.

**Regras existem para preservar coerência, não para impedir soluções melhores.**
Uma exceção a qualquer regra desta skill é aceitável quando:

- resolve um problema real de UX;
- tem justificativa clara;
- não introduz deriva arbitrária (outra tela não copiaria o desvio);
- é documentada na implementação (comentário/PR explicando o porquê).

### Invocação

Embora Agent Skills possam ser descobertas automaticamente pela `description`,
durante o processo de redesign do Tieck preferimos **invocação explícita**:

- `/skill:tieck-ui` — ao criar ou alterar qualquer UI do Tieck;
- `/skill:tieck-ui-review` — ao revisar/auditar uma tela (crítico independente).

Se o emissor não suportar o comando, referencie a skill relevante no prompt.

---

## 1. Tokens reais (fonte de verdade: `src/styles.css`)

Tailwind v4 (`@theme inline`), cores em oklch, tema claro e escuro definidos
(a aplicação roda em claro; o dark existe como variáveis, não como feature ativa).

| Token | Valor real | Uso |
|---|---|---|
| `--radius` | `0.625rem` (10px) | base do sistema; `rounded-md` 8px · `rounded-lg` 10px · `rounded-xl` 14px |
| `--background` | oklch(1 0 0) | fundo da página (branco) |
| `--foreground` | oklch(0.129 0.042 264.7) | texto principal (quase-preto azulado) |
| `--primary` | oklch(0.208 0.042 265.8) | ação/foco (shadcn default) |
| `--muted` / `--muted-foreground` | oklch(0.968…) / oklch(0.554…) | superfícies e texto secundário |
| `--destructive` | oklch(0.577 0.245 27.3) | erro/destrutivo |
| `--border` | oklch(0.929 0.013 255.5) | bordas (neutras, discretas) |
| `--ring` | oklch(0.704 0.04 256.8) | foco de teclado |
| chart-1..5 | oklch variados | paleta de gráficos (usar em ordem, não à escolha) |

**Accent de marca (legado controlado):** `#FF007F` (rosa Tieck) existe em 166
pontos do código — é o accent de ação primária em execução/auth/checklists (ex.:
`bg-[#FF007F] text-white`, `hover:text-[#FF007F]`). Não invente um segundo accent;
reutilize-o onde já é usado e nunca como cor de status. Política:

- **não introduza novos hardcodes desnecessários** em código novo;
- quando houver infraestrutura adequada (token semântico de marca), **prefira o token**;
- **NÃO faça substituição massiva** das ocorrências existentes durante uma tarefa
  visual comum — toque apenas no que a tarefa exige;
- a migração de `#FF007F` para token de marca é uma **tarefa específica e
  controlada**, planejada à parte (nunca incidental).

**Fontes** (carregadas em `src/routes/__root.tsx` via Google Fonts):
- `--font-display: "Space Grotesk"` (500–700) → títulos.
- `--font-body: "DM Sans"` (400–700) → interface, labels, dados, formulários.

**Tipografia do produto × tipografia do conteúdo.** Space Grotesk + DM Sans
governam a **interface do produto Tieck**. Fontes adicionais usadas pelo
editor/checklist são **recurso legítimo de personalização do conteúdo do cliente**
— não são dívida visual e não devem ser "corrigidas" automaticamente. Uma revisão
só deve apontar problema quando fontes externas **vazarem para a UI
administrativa/operacional** (painel, filtros, tabelas, navegação) sem intenção.

**Ícones:** `lucide-react`. Tamanho padrão `w-4 h-4`; em listas densas `w-3.5 h-3.5`.
Stroke herdado (não engrossar).

**Bibliotecas de UI em uso:**
- `src/components/ui/` — shadcn/Radix completo (button, badge, card, dialog, sheet,
  drawer, dropdown-menu, select, checkbox, switch, tabs, skeleton, table, tooltip,
  sonner, etc.). Preferir sempre estes.
- `src/components/tremor/ui/` — Tremor bruto (`Card` = `rounded-lg border p-6
  shadow-xs`, `Badge` com variantes `default/neutral/success/error/warning`,
  `TabNavigation`, gráficos).

**Política shadcn/Radix × Tremor:**

- **shadcn/Radix é a primitive preferencial para UI nova**;
- componentes Tremor existentes **podem permanecer** quando estáveis — não migre
  Tremor para shadcn apenas por estética em tarefas não relacionadas;
- quando as duas variantes coexistirem na mesma tela, **busque consistência visual**
  (alinhar radius/borda/spacing entre elas) antes de pensar em reescrever arquitetura;
- **nova dependência visual exige justificativa** — nenhuma biblioteca nova sem
  motivo concreto que os componentes existentes não atendem.

**Toasts:** `sonner` (`toast.error`, `toast.success`).

---

## 2. Tipografia (níveis recomendados — não invente mais)

| Nível | Classes reais usadas no projeto | Onde |
|---|---|---|
| Page title | `text-2xl md:text-3xl font-bold tracking-tight text-neutral-900` (+ `font-display` quando destaque) | `/painel`, detalhe operação |
| Section title | `text-sm font-semibold text-neutral-700` | títulos de seção/gráfico/tabela |
| Card metric | `text-2xl font-bold text-neutral-900` | KpiCard/MetricCard |
| Body | `text-sm text-neutral-700` | conteúdo, listas, formulários |
| Label | `text-xs font-medium text-neutral-500` ou `text-xs font-semibold uppercase text-neutral-500` | labels de filtro/métrica |
| Helper/caption | `text-xs text-neutral-500` / `text-[11px] text-neutral-400` | hints sob números |
| Table header | `text-xs uppercase tracking-wide text-neutral-500` | `<thead>` |

Regras: números importantes são **maiores**, não gigantes (`text-2xl` é o teto de
KPI); display font só em títulos de página e hero de execução; nada de `text-4xl+`
fora do momento de conclusão de execução.

---

## 3. Espaçamento, radius, borders

Escala observada no código (usar estes, nesta ordem de preferência):

- **Padding de página:** `p-4 sm:p-8` (painel) · container `max-w-6xl`/`max-w-7xl mx-auto`.
- **Gap entre elementos:** `gap-2` (relacionados) · `gap-3` (padrão) · `gap-4` (grupos).
- **Entre seções:** `space-y-6`; blocos maiores `space-y-8`.
- **Padding interno de card:** `p-4` (KPI compacto) · `p-6` (Card de conteúdo).
- **Radius:** `rounded-md` (itens pequenos, chips) · `rounded-lg` (botões, inputs,
  Cards Tremor) · `rounded-xl` (Cards shadcn, superfícies) · `rounded-full` (badges
  pill e avatares). Não usar `rounded-2xl/3xl` em superfícies de produto.
- **Border padrão:** `border border-neutral-200` (ou `border-neutral-200/70` em
  superfícies sutis). **Border é a estrutura principal** — separa seções e linhas.
- **Separator:** `border-b border-neutral-200` (tabela) ou `border-b border-neutral-100`
  (linhas internas). Prefira linha a espaço em listas densas.

---

## 4. Superfícies e hierarquia

Ordem de elevação:

1. **background** (página, `bg-white` / `bg-neutral-50/50`);
2. **page section** (agrupamento por espaçamento + título de seção, sem caixa);
3. **bordered surface** (`border bg-white rounded-xl`) quando o grupo é uma unidade
   independente (KPI, tabela, filtros);
4. **elevated surface** (sombra) **somente para elementos flutuantes**: popover,
   dropdown, dialog, sheet/drawer, toast.

Sombras reais do projeto: `shadow-sm` em cards; `shadow-xs` no Card Tremor;
`shadow-xl shadow-neutral-200/20` apenas na sidebar. **Não use sombra como
separador padrão entre seções** — isso é trabalho da border/espaçamento.

---

## 5. Cor com função

- **Neutro = estrutura** (fundos, bordas, texto).
- **Primary/#FF007F = ação e foco** — nunca decoração.
- **Status = semântica operacional estável** (já definida em
  `src/lib/operational-status.ts` e no Badge Tremor):

| Semântica | Dot (usado no projeto) | Badge Tremor | Uso |
|---|---|---|---|
| success | `bg-emerald-500` | `success` | concluído, no padrão, no prazo |
| warning | `bg-amber-500` | `warning` | atenção, atraso iminente |
| danger/error | `bg-rose-500` · texto `text-rose-600` | `error` | crítico, aberto em atraso, falha |
| information | `bg-blue-50 text-blue-600` | `default` (azul) | informativo, contagem |
| neutral | `bg-neutral-300` | `neutral` | sem atividade, desativado |

**Não colora elemento só para "ficar mais interessante".** Se não há significado
operacional, é neutro. Status corrigido distingue sempre: **aberto em atraso** (exige
ação) ≠ **concluído com atraso** (histórico) — cores diferentes, labels diferentes.

---

## 6. Cards — quando usar

Card é apropriado para: **KPI**, **unidade de conteúdo independente**, agrupamento
realmente necessário (filtros, formulário em dialog).

NÃO use Card apenas porque existe espaço. Listas, tabelas e seções costumam viver
diretamente na superfície da página (é o padrão do `/painel`: a tabela de unidades
tem título de seção + Card só como moldura da tabela).

Nunca: card dentro de card. O drawer/sheet de detalhe é a exceção estrutural
(conteúdo rolável dentro do Sheet), não um convite.

---

## 7. Dashboards

- Informação prioritária primeiro (KPIs → gráfico → tabela → seções secundárias).
- Diferencie **KPI** (número), **tendência** (gráfico) e **detalhe** (tabela/drill-down).
- Preserve a relação filtro ↔ conteúdo: filtros no topo, resultados refletindo-os
  (o `/painel` é a referência: período + unidade + turno em uma linha de filtros).
- Sem arco-íris de métricas: cada acento de cor precisa significar algo.
- Números importantes maiores, não gigantes; hints secundários em `text-[11px] text-neutral-400`.
- **Todo gráfico deve responder: "Que decisão este gráfico ajuda o usuário a tomar?"**
  Se não houver resposta, questione a presença dele. Gráficos do projeto usam
  `echarts` (UnitComplianceChart) ou Recharts/Tremor — reutilize o padrão existente.

---

## 8. Tabelas

Padrão real (`UnitPerformanceTable`, `ScheduledOccurrencesSection`):

- header: `text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-200`;
- densidade: células `py-2 px-3`; linha `border-b border-neutral-100 last:border-b-0`;
- alinhamento: texto à esquerda, **números à direita com `tabular-nums`**;
- hover de linha clicável: `cursor-pointer hover:bg-neutral-50 focus:bg-neutral-50
  focus:outline-none focus:ring-2 focus:ring-[#FF007F]/40`;
- ações: inline discretas (ícone `w-4 h-4`), não botões grandes por linha;
- empty: `py-10 text-center` com título `text-sm font-semibold` + detalhe `text-xs text-neutral-500`;
- loading: skeleton com a forma da linha (não spinner genérico no lugar da tabela);
- ordenação: quando houver, indicador discreto no header; sem sorting decorativo.
- **Não converta tabela operacional em grid de cards sem motivo** — o gestor compara
  linhas; cards escondem comparação.
- Overflow: `overflow-x-auto` + `min-w-[640px]`/`min-w-[900px]` (padrão já usado).

---

## 9. Formulários

- Label sempre visível (`Label` shadcn) — nunca placeholder como única label;
- required marcado discretamente; helper em `text-xs text-neutral-500`;
- erro: `text-sm text-rose-600` (padrão do projeto) próximo ao campo, nunca só toast;
- disabled/loading: estado visual do componente shadcn + sem ghost-click;
- grouping: seções com `text-base font-semibold` (padrão das Configurações);
- **progressive disclosure**: configuração avançada em collapsible/accordion/abas —
  nunca todas as opções de uma vez (padrão do executor e do checklist builder);
- ações destrutivas: botão `destructive` + confirmação em AlertDialog/Dialog
  (padrão de exclusão do `/inicio`), nunca destruição direta em linha.

---

## 10. Estados obrigatórios

Toda tela/componente relevante pensa em: **loading, empty, error, success (quando
fizer sentido), permission denied, disabled, partial data**.

Padrões reais do Tieck:

- **Loading:** `Skeleton` imitando o layout final (`Skeleton h-10 w-48`, cards
  `h-32 w-full`); em KPI, retângulo `animate-pulse` no lugar do número. Skeleton
  aproximado, não genérico.
- **Empty:** honesto e útil — `py-10 text-center`, título curto + uma linha de
  contexto ("Nenhum checklist atribuído", "Sem rotinas agendadas no período").
  Empty state NÃO é propaganda: sem emoji, sem ilustração chamativa, sem CTA festivo.
- **Error:** mensagem genérica sanitizada `text-sm text-rose-600` + ação
  ("Tentar novamente" com `Button variant="outline" size="sm"`). **Nunca** expor
  SQL, schema, stack ou mensagem técnica crua na UI.
- **Permission denied:** estado neutro e honesto ("Unidade não encontrada ou sem
  permissão de acesso") — nunca revelar existência do recurso.
- **Partial data:** falha em parte dos dados marca somente aquela seção como erro,
  sem derrubar a página inteira nem mentir zero.

---

## 11. Motion

Motion **explica mudança**, não decora.

- Preferir: 150–250ms, fade/translate pequeno (`animate-in fade-in duration-200`,
  `transition-colors`, `transition-all duration-300` da sidebar), expand/collapse,
  feedback de interação (`active:scale-[0.98]` do auth — só em CTAs primários).
- Evitar: bounce, overshoot, parallax, deslocamentos grandes, stagger longo.
- Respeitar `prefers-reduced-motion` (não adicionar animação nova essencial à tarefa).

---

## 12. Responsividade

Desktop-first com breakpoints reais do projeto: `sm:` 640 · `md:` 768 · `lg:` 1024.

- KPIs: `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` (painel) — começa denso no mobile,
  não empilhado em coluna única gigante.
- Filtros: `flex flex-col md:flex-row md:items-end` (empilham no mobile sem virar
  gaveta escondida).
- Detalhes laterais: `Sheet side="right" w-full sm:max-w-lg` (padrão do drawer de
  execução).
- Mobile prioriza: **ação principal → status → execução → conteúdo essencial**.
  Tabela larga usa `overflow-x-auto` com min-width; considere colunas prioritárias
  antes de empilhar células.

---

## 13. Acessibilidade mínima

- Contraste: texto secundário no mínimo `text-neutral-500` sobre branco; nunca cinza
  claríssimo para informação operacional.
- Keyboard: todo elemento clicável é focável e operável; foco visível com
  `focus:ring-2 focus:ring-[#FF007F]/40` (padrão do projeto) ou o `--ring` do tema.
- `aria-label` em botões de ícone; `aria-labelledby` em seções (padrão do painel);
  `role="status"` em loading.
- Não depender só de cor: status tem label e/ou dot + texto (STATUS_META).
- Touch targets ≥ 40px em ações mobile (padrão dos botões do executor).
- `aria-label="Carregando"` em skeletons no lugar de números.

---

## 14. Anti AI-Slop

Proibições e desencorajamentos fortes. Nada disso entra no Tieck:

- **Card dentro de card** sem necessidade estrutural.
- **Transformar cada grupo em `rounded-xl`** — radius segue a escala (§3).
- **`shadow-sm` em toda superfície** — sombra é para flutuantes (§4).
- **Gradientes decorativos** (exceção: avatar placeholder
  `bg-gradient-to-br from-orange-300 to-pink-400`, que já existe).
- **Glow, glassmorphism, backdrop-blur decorativo** (`backdrop-blur-sm` só no
  overlay de modal, que já existe).
- **Ícones coloridos arbitrariamente** — ícone tem função; cor de ícone segue §5.
- **Emoji como elemento de UI profissional.**
- **Heading acompanhado de ícone só por decoração** — se o ícone não ajuda
  reconhecimento/navegação/ação/status, tire.
- **Excesso de badges/pills** — badge comunica estado; três badges decorativos em
  sequência comunicam nada.
- **Textos genéricos motivacionais** ("Tudo sob controle!", "Vamos lá!").
- **Gigantescos espaços vazios para parecer "clean"** e **cards enormes para mostrar
  um único número** (KPI fica em `p-4 text-2xl`, não em hero de 200px).
- **Excesso de centralização** — centralizar só empty states e confirmações.
- **Layout com todas as seções parecendo independentes** — seções do mesmo domínio
  compartilham superfície/rítmo (§4).
- **Border radius diferente sem sistema; novas cores sem função semântica.**
- **Animações que atrasam tarefas** — operador usa isso dezenas de vezes por dia.
- **Microcopy artificial ou excessivamente amigável** ("Ops! Deu ruim 😅").
- **"AI dashboard aesthetic"**: grid de cards idênticos sem hierarquia, ícone colorido
  em cada KPI só para variar, números gigantes, títulos com gradiente, tudo
  arredondado 24px, sombras suaves em tudo.

**Não proibido** (apropriado quando tem função): Card em KPI/unidade independente;
sombra em popover/dialog; badge de status real; ícone em ação reconhecível;
gradiente só no avatar placeholder existente; destaque `#FF007F` na ação primária.

---

## 15. Referência rápida de composição

| Tarefa | Use |
|---|---|
| KPI | `div` `bg-white border border-neutral-200/70 rounded-xl p-4` + label `text-xs` + valor `text-2xl font-bold` + hint `text-[11px]` |
| Seção de página | título `text-sm font-semibold text-neutral-700` + descrição `text-xs text-neutral-400` |
| Tabela | padrão do §8 (`UnitPerformanceTable` é a referência) |
| Filtros | `OperationalDashboardFilters` — Select shadcn com `aria-label`, labels `text-xs font-medium text-neutral-600` |
| Detalhe lateral | `Sheet side="right"` (TaskExecutionDetailDrawer é a referência) |
| Confirmação destrutiva | `Dialog`/`AlertDialog` com botão `bg-red-500` explícito |
| Status | `STATUS_META` (dot + label) ou Badge Tremor com a variante da §5 |
| Toast | `sonner`: `toast.error("Acesso restrito a administradores")` |
| Botão primário | `Button` shadcn ou `bg-[#FF007F]` em fluxo de execução/auth |
| Ação secundária | `Button variant="outline" size="sm"` |

---

## 16. Preservação de negócio (obrigatório)

Nenhuma melhoria visual pode alterar silenciosamente:

- permissões ou autorização;
- comportamento de rotas e navegação;
- filtros e seus efeitos nas consultas;
- contagens e números exibidos;
- status e seus critérios;
- lifecycle (ocorrências, execuções, tarefas);
- contratos de dados (props, hooks, RPCs, views);
- ações destrutivas e suas confirmações;
- responsividade funcional (o que funciona hoje precisa continuar funcionando).

Uma mudança de UX que **exija** alteração de comportamento deve ser explicitamente
separada da mudança visual: entregue/derive a parte visual primeiro e documente a
mudança comportamental como tarefa própria, com os testes correspondentes.
