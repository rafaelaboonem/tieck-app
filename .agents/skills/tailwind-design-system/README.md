# tailwind-design-system — proveniência

**Skill externa vendorizada.** Não é uma skill do Tieck. Em qualquer conflito, o Tieck vence
(ver a seção "Prioridade de regras" em [`../tieck-ui/SKILL.md`](../tieck-ui/SKILL.md)).

| Campo | Valor |
|---|---|
| Origem | <https://github.com/wshobson/agents> (Seth Hobson) |
| Caminho upstream | `plugins/frontend-mobile-development/skills/tailwind-design-system/` |
| SKILL.md upstream | <https://raw.githubusercontent.com/wshobson/agents/main/plugins/frontend-mobile-development/skills/tailwind-design-system/SKILL.md> |
| Licença | **MIT** (`LICENSE` neste diretório, cópia do upstream — Copyright (c) 2024 Seth Hobson) |
| Formato | Agent Skills (`SKILL.md` + frontmatter `name`/`description`) — compatível |
| Vendorização | **integral** (SKILL.md + `references/details.md` + `references/advanced-patterns.md`) |

## Adaptação aplicada

**Nenhuma.** O campo `name` do upstream já é `tailwind-design-system`, igual ao nome da
pasta; `references/` foi copiado com a estrutura original. Os três arquivos são cópias
byte a byte.

## Conflitos conhecidos com o Tieck (a resolver sempre a favor do Tieck)

Esta skill descreve um caminho de adoção "do zero" de Tailwind v4. Ela **não** conhece o
Tieck. Ao usá-la:

1. **Não recrie o `@theme`.** `src/styles.css` é a fonte de verdade dos tokens; os valores
   do exemplo (`--radius-md: 0.375rem`, `h-10`, `shadow-sm` em Card, `oklch` de exemplo)
   **não** são os tokens do Tieck nem devem substituí-los.
2. **Não adote `@theme { --color-*: initial }`** nem namespace overrides — apagaria a
   paleta real do produto.
3. **Não trate `shadow-sm` em toda superfície como padrão** — no Tieck, sombra é para
   elementos flutuantes e a borda é a estrutura (ver `tieck-ui` §4).
4. **Não migre shadcn/Radix → Tremor** (nem o contrário) por causa desta skill.
5. **Dark mode segue fora de prioridade** — o tema escuro existe como variáveis, não como
   feature ativa; convertê-lo é tarefa própria.
6. A skill assume React 19 (`ref` como prop, sem `forwardRef`) — verifique a versão real do
   projeto antes de aplicar qualquer padrão de componente.

O uso seguro é como **referência de sistema** (hierarquia de tokens, composição com CVA,
`@theme`/`@utility`, container queries, acessibilidade de primitives), sempre aplicada
sobre a infraestrutura existente do Tieck.
