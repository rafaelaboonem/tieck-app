---
name: calm-ui
description: Redução de ruído e sobriedade em interfaces B2B densas — densidade útil, hierarquia calma, uso disciplinado de cor e superfície, e ausência de ornamentação gratuita. Use ao polir uma tela operacional do Tieck (densidade, ruído visual, hierarquia, excesso de decoração, legibilidade sob uso diário), sempre em conjunto com tieck-ui.
---

# calm-ui — sobriedade e densidade em UI operacional

> **Status deste arquivo: referência local, NÃO vendorizada.**
> Não é cópia de uma skill upstream. Ver "Proveniência" no fim do arquivo.
> Em qualquer conflito, `tieck-ui` e `references/visual-direction.md` vencem.

Objetivo desta skill: uma tela **calma** é uma tela que o usuário consegue operar no
sexto uso do dia, não no primeiro. Calma não é vazio, é **ausência de concorrência**.

**Regra de ouro: menos elementos não é automaticamente melhor UX.** Densidade útil é
desejada em SaaS operacional. Esta skill remove *ruído*, não *informação*.

---

## 1. O que é ruído (e o que não é)

Ruído é um elemento que **compete por atenção sem entregar decisão**:

- decoração (gradiente, glow, ilustração, emoji, ícone ao lado de todo título);
- variação sem função (terceiro tamanho de fonte para o mesmo nível, quarto radius,
  segunda cor de accent usada como tinta de hover);
- repetição (o mesmo rótulo em três lugares, badge redundante ao lado de um status já
  escrito, subtítulo que repete o título);
- **movimento não solicitado** (animação de entrada, stagger, hover que desloca).

**Não é ruído:** tabela densa, filtro, coluna numérica, hint secundário sob um KPI,
rótulo de seção que orienta, divisor que separa domínios, status colorido com significado.
Se ajuda a decidir, ficou.

## 2. Hierarquia calma

Uma tela calma tem **um** ponto de entrada para o olho, não cinco.

- Um nível de destaque por tela (o número/título principal). Tudo o mais é um degrau
  abaixo — não três coisas "grandes" disputando.
- Escala tipográfica curta: **se você precisa de um quarto tamanho para expressar um
  nível, a hierarquia não está clara na composição.**
- Contraste alto entre níveis, contraste baixo dentro do mesmo nível.
- A posição comunica hierarquia antes do tamanho: o que é global vive no topo, o que é
  local vive junto ao conteúdo.

## 3. Densidade operacional

- Conteúdo relacionado fica **próximo**. Espaço separa domínios distintos, não decora.
- Não use padding para fabricar premium: vazio grande com um número pequeno no meio é
  desperdício vertical, não respiro.
- Não compacte a ponto de prejudicar leitura: alvo de toque e linha de texto continuam
  legíveis.
- Em listas e tabelas, prefira **linha a espaço**.
- O teste: quantas decisões cabem na primeira dobra sem rolagem?

## 4. Superfície e cor

- **Uma** superfície de fundo + camadas por contraste tonal/`border`. Sombra só quando há
  elevação real.
- Um accent, com função. Se a cor de marca aparece em hover de item de navegação **e** em
  ação primária **e** em status, ela deixou de ser sinal.
- Cor de status é semântica estável (sucesso/atenção/perigo/informação/neutro). Nunca
  "colorir para variar".
- Neutro é a maior parte da tela. Uma tela calma é predominantemente neutra.

## 5. Microcopy e estados

- Texto de interface diz o que acontece: "Salvar alterações", não "Enviar". Erro não se
  desculpa e não é vago. Vazio é convite à ação, não propaganda.
- Estado vazio **não** parece campanha: sem emoji, sem ilustração festiva, sem CTA
  gigante. Título curto + uma linha de contexto.
- Uma frase, um trabalho. Sem filler ("Tudo sob controle!", "Vamos lá!").

## 6. Processo ao aplicar calm-ui

1. **Inventarie**: liste o que está na tela e qual decisão cada bloco permite tomar.
2. **Marque o que sobra** — o que não muda decisão nenhuma.
3. **Remova na ordem**: decoração → variação sem função → repetição → movimento gratuito.
   **Só depois** considere mexer em densidade.
4. **Nunca remova informação de decisão** (um filtro, uma coluna, um status).
5. **Não misture com redesign.** Se a mudança exige alterar comportamento, layout de
   página ou contrato de dados, é outra tarefa — registre separadamente.

## 7. Anti-padrões (o que esta skill recusa)

- Glassmorphism, blur decorativo, glow, neon, gradiente ornamental.
- Card dentro de card; card para agrupar dois itens; card em volta de uma única frase.
- Sombra em toda superfície; `rounded-xl` em todo agrupamento; pill em tudo.
- Rótulo uppercase em todo grupo como solução automática de hierarquia.
- Ilustração/emoji em estado vazio de produto operacional.
- Números gigantes para impressionar; gráfico sem pergunta que responda.
- Animação que atrasa a tarefa (o operador faz isso dezenas de vezes por dia).

## 8. Checklist rápido

- [ ] Existe **um** ponto de entrada óbvio para o olho?
- [ ] Cada elemento visível ajuda a tomar uma decisão?
- [ ] Os níveis tipográficos são poucos e claramente distintos?
- [ ] A cor tem função em todos os lugares onde aparece?
- [ ] A densidade foi medida (primeira dobra) e não entregue por acidente?
- [ ] Nada foi removido por parecer "menos", só por ser ruído?
- [ ] O estado vazio continua honesto e útil?
- [ ] Nenhum comportamento, contagem, filtro ou permissão mudou?

---

## Proveniência

**Não vendorizada — referência local escrita para o Tieck.** Uma busca pelas origens
oficiais **não** localizou nenhuma skill canônica chamada `calm-ui`:

- busca no repositório oficial Anthropic (`anthropics/skills`) — a pasta
  `skills/frontend-design` existe e está vendorizada em
  [`../anthropic-frontend-design/`](../anthropic-frontend-design/); **não** existe `calm-ui`;
- busca em `wshobson/agents` (183 skills, índice em `docs/agent-skills.md`) — existe
  `tailwind-design-system` (vendorizada em [`../tailwind-design-system/`](../tailwind-design-system/)),
  e o plugin *UI Design* contém `design-system-patterns`, `visual-design-foundations`,
  `interaction-design` etc., mas **não** existe `calm-ui`;
- busca em coleções agregadoras e índices de skills (sickn33/agentic-awesome-skills,
  agenticskills.io, skills-hub.ai, awesomeskill.ai, mcpservers.org) — nenhuma skill
  canônica com esse nome.

Fontes consultadas e usadas apenas como **base conceitual**, sempre parafraseadas e
resumidas (nenhum trecho copiado):

| Fonte | Licença | O que foi aproveitado |
|---|---|---|
| [`anthropics/skills` → `skills/frontend-design`](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | Apache-2.0 | Restraint ("spend your boldness in one place"), estrutura visual como informação, motion não solicitado, disciplina de microcopy. |
| [`wshobson/agents` → `tailwind-design-system`](https://github.com/wshobson/agents/tree/main/plugins/frontend-mobile-development/skills/tailwind-design-system) | MIT | Hierarquia de tokens, `bg-primary` em vez de cor crua, "don't use arbitrary values". |
| [`garrytan/gstack` → `design-review`](https://github.com/garrytan/gstack/tree/main/design-review) | MIT | A ideia de auditar espaçamento, hierarquia e padrões de "AI slop". |

Regras próprias desta skill (`tieck-ui` §14 já cobre grande parte do terreno):
este arquivo é a versão **focada em densidade e ruído** desse mesmo corpo de regras.
