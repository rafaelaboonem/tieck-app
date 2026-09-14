# Skills de UI/UX do Tieck

Skills do projeto (`.agents/skills/`). O Tieck é a **autoridade principal**; as skills
externas são auxiliares e nunca redefinem branding, paleta, design system ou arquitetura.

## Inventário

| Skill | Origem | Licença | Como está aqui |
|---|---|---|---|
| `tieck-ui` | **Tieck** | — | própria (fonte de regras) |
| `tieck-ui-review` | **Tieck** | — | própria (crítico de identidade) |
| `tieck-ui/references/visual-direction.md` | **Tieck** | — | própria (direção visual) |
| `anthropic-frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) → `skills/frontend-design` | **Apache-2.0** | **vendorizada integral** (1 adaptação mecânica: `name`) |
| `tailwind-design-system` | [wshobson/agents](https://github.com/wshobson/agents) → `plugins/frontend-mobile-development/skills/tailwind-design-system` | **MIT** | **vendorizada integral** |
| `calm-ui` | — (sem original canônico localizado) | — | **referência local** (texto próprio) |
| `design-review` | [garrytan/gstack](https://github.com/garrytan/gstack) → `design-review` (origem consultada) | **MIT** (upstream) | **adaptador local** (upstream incompatível para vendorizar) |

Detalhes de adaptação e conflitos: `README.md` dentro de cada pasta externa.

## Prioridade de regras

1. `tieck-ui` — regras, tokens e padrões reais do projeto.
2. `tieck-ui/references/visual-direction.md` — direção estética/compositiva.
3. Skill externa relevante (no máximo **uma** por tarefa).
4. Preferência genérica do agente.

**Em conflito, o Tieck vence.** Nunca deixe uma skill externa sobrepor: sidebar única no
desktop (rail estreito é o *estado colapsado* da mesma sidebar), motion 180–220ms, rosa
`#FF007F` como **sinal**, cards com parcimônia, borda antes de sombra, zero
glass/neon/glow, densidade operacional, shadcn/Radix como primitive preferencial e Tremor
existente preservado quando estável.

## Matriz: tarefa → skills

| Tarefa | Skills recomendadas |
|---|---|
| **Criar UI / direção visual** (tela nova, composição, fugir de layout genérico) | `tieck-ui` + `anthropic-frontend-design` |
| **Polir densidade e ruído** (tela densa, poluição visual, hierarquia confusa) | `tieck-ui` + `calm-ui` |
| **Criar/refatorar componente ou token** (primitives, variantes, escala, spacing) | `tieck-ui` + `tailwind-design-system` |
| **Revisar / auditar** (crítica de tela ou PR, sem redesenhar) | `tieck-ui-review` + `design-review` |
| **Revisão completa** (tela nova antes de merge) | `tieck-ui-review` + `design-review` (com `visual-direction.md` como régua) |
| **Diagnóstico de slot de design** (o que está errado e por quê) | `tieck-ui` + `calm-ui` |

### Regra do especialista único

`tieck-ui` + `visual-direction.md` são a **base** de toda tarefa de UI. Além delas, use
**no máximo UMA** skill especialista. Não carregue quatro especialistas ao mesmo tempo:
elas têm direções diferentes e o agente passa a oscilar.

## Invocação

As skills são descobertas pela `description`, mas durante o redesign a preferência é
**invocação explícita**:

```
/skill:tieck-ui
/skill:tieck-ui-review
/skill:anthropic-frontend-design
/skill:calm-ui
/skill:tailwind-design-system
/skill:design-review
```

Se o emissor não suportar o comando, cite a skill pelo nome no prompt e anexe o arquivo.

## Registro anti-conflito

Conflitos conhecidos entre skills externas e a direção oficial do Tieck. **A skill externa
nunca é editada** — o conflito é resolvido a favor do Tieck e registrado aqui.

| Origem do conflito | O que ela propõe | O que o Tieck manda |
|---|---|---|
| `anthropic-frontend-design` | tipografia de display ousada, "tomar risco estético", "escolha typefaces deliberadamente" com 1–2 famílias próprias | manter **Space Grotesk** (display) + **DM Sans** (interface); a paleta e as fontes já estão definidas — risco estético não se aplica a branding estabelecido |
| `anthropic-frontend-design` | evitar rótulos em **caixa alta** e "eyebrows" acima de conteúdo | no Tieck, header de tabela e label de métrica já usam `uppercase tracking-wide`. **Coerência interna vence** — a regra externa não autoriza uma migração de labels |
| `anthropic-frontend-design` | "a hero é a primeira coisa que o viewer vê" / tratar cada página como peça de estúdio | o Tieck é **produto operacional**, não landing page. Hero e "momento orquestrado" não entram no app |
| `tailwind-design-system` | reescrever a configuração em `@theme` com os tokens de exemplo dela | `src/styles.css` é a fonte de verdade. **Nunca** recriar o `@theme`, nunca `--color-*: initial` |
| `tailwind-design-system` | `shadow-sm` em Card, `h-10` em input, `--radius-md: 0.375rem`, `rounded-lg` como padrão | usar a escala real do Tieck (`tieck-ui` §3); borda é estrutura, sombra é elevação |
| `tailwind-design-system` | React 19 (`ref` como prop, sem `forwardRef`) como pressuposto | verificar a versão real do projeto antes de aplicar qualquer padrão de componente |
| `design-review` (upstream gstack) | telemetria, CLI externo, pontos de parada e frontmatter não-padrão | **não vendorizada** por incompatibilidade; só os princípios de auditoria foram aproveitados |
| `calm-ui` | — | alinhada por construção (escrita para o Tieck) |

## Preservação obrigatória

Nenhuma skill (própria ou externa) autoriza alterar, em nome de estética: permissões ou
autorização, comportamento de rotas e navegação, filtros e seus efeitos nas consultas,
contagens e números exibidos, status e seus critérios, lifecycle, contratos de dados
(props, hooks, RPCs, views), ações destrutivas e suas confirmações, ou responsividade
funcional. Mudança que **exija** alteração de comportamento é uma tarefa separada,
com os testes correspondentes.
