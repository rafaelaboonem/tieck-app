---
name: design-review
description: Auditoria independente de uma tela ou PR de UI — acessibilidade, consistência de sistema, hierarquia, espaçamento, densidade, estados e padrões de "AI slop" — com achados classificados por severidade e evidência concreta. Use para criticar/revisar UI já implementada, sem redesenhar. Compõe com tieck-ui-review (crítico de identidade do Tieck); esta skill é o auditor estrutural.
---

# design-review — auditoria independente de UI

> **Status deste arquivo: adaptador local, NÃO vendorizado.** Ver "Proveniência" no fim.
> Em qualquer conflito, `tieck-ui` e `references/visual-direction.md` vencem.

**Esta skill audita. Ela não redesenha, não implementa e não "dá uma polida".**
O produto da skill é um **relatório de achados** — não um diff.

Se o pedido for "deixe mais bonito", o output correto é: auditar, listar, classificar e
pedir autorização de escopo. Alterar código durante uma auditoria transforma a auditoria
em redesign e destrói a evidência.

---

## 1. Pré-condições

- Uma superfície concreta: rota, componente, PR ou screenshot.
- Um baseline: como a tela era antes (ou o estado atual, se a auditoria é inicial).
- Acesso ao código real, não só ao screenshot — **achado sem âncora no código é opinião**.

## 2. Dimensões auditadas (nesta ordem)

1. **Hierarquia** — existe um ponto de entrada claro? Os níveis são poucos e distintos?
2. **Ação principal** — ela é identificável em <2s? É única?
3. **Consistência de sistema** — radius, borda, sombra, espaçamento e tipografia seguem
   uma escala, ou cada bloco inventou a sua?
4. **Densidade** — a primeira dobra entrega decisão? Há vazio por padding?
5. **Tipografia** — níveis do Tieck (`tieck-ui` §2), números tabulares, alinhamento.
6. **Espaçamento** — ritmo vertical entre seções vs. dentro de seções.
7. **Cor** — cada cor tem função? Status é semântico e estável?
8. **Cards/superfícies** — Card onde é apropriado, ou cardificação por reflexo?
9. **Estados** — loading, empty, error, permission denied, partial data, disabled.
10. **Acessibilidade** — contraste, foco visível, teclado, `aria-*`, não depender só de cor.
11. **Responsividade** — desktop/tablet/mobile; mobile não é desktop empilhado.
12. **AI slop** — padrões genéricos *sem intenção* (não "quantidade de elementos").
13. **Componentes novos desnecessários** — primitives existentes foram reutilizadas?

## 3. AI slop: o critério correto

AI slop é **falta de intenção e coerência**, não excesso de elementos.

É slop:
- o mesmo radius e a mesma sombra em tudo, independentemente da hierarquia;
- rótulo uppercase acima de todo título só porque "dashboards fazem isso";
- gradiente/glow/glassmorphism como decoração;
- terceira variante visual de um componente que já existia em duas;
- tela que poderia pertencer a qualquer SaaS sem mudar uma palavra.

**Não é slop** (e não deve ser penalizado): tabela densa, filtro, informação secundária
útil, status colorido com semântica, hint numérico, divisor que separa domínios.

Minimalismo **não** é critério de aprovação. "Tem muitos elementos" não é um achado;
"estes três elementos competem pelo mesmo papel" é.

## 4. Formato obrigatório de cada achado

```
### [SEVERIDADE] Título curto e específico
- **Categoria:** hierarquia | consistência | densidade | tipografia | espaçamento | cor |
  cards | estados | acessibilidade | responsividade | ai-slop | componente-redundante
- **Evidência:** arquivo:linha / classe / elemento observado (concreto e verificável)
- **Impacto:** o que o usuário perde, espera ou faz errado por causa disso
- **Recomendação mínima:** a menor mudança que resolve — conceitual, não um diff
```

**Severidade**

| Nível | Significado |
|---|---|
| `CRITICAL` | Impede a tarefa, esconde informação de decisão ou quebra acessibilidade básica/negócio. |
| `HIGH` | Usuário erra, hesita ou perde orientação de forma recorrente. |
| `MEDIUM` | Atrito real, mas contornável; inconsistência perceptível entre telas. |
| `LOW` | Polimento; não muda decisão nem compreensão. |

Separe sempre as três naturezas: **bug de UX** · **inconsistência visual** · **polish opcional**.

## 5. Linguagem proibida

Nunca produza um achado cujo conteúdo seja:

- "parece antigo" / "poderia ficar mais moderno" / "ficaria mais bonito";
- "deixar mais premium" / "mais clean" / "mais sofisticado";
- qualquer recomendação sem impacto declarado no usuário;
- qualquer achado cuja evidência seja apenas preferência pessoal.

Se um achado não sobrevive à pergunta "qual decisão do usuário isso piora?", ele não
existe. Descarte-o em vez de rebaixá-lo para `LOW`.

## 6. Escopo e preservação

Esteja atento, durante a auditoria, a qualquer mudança que altere silenciosamente:
permissões, comportamento de rota, filtros, contagens, status, lifecycle, contratos de
dados, ações destrutivas ou responsividade funcional. **Isso é `CRITICAL`, não `LOW`** —
e é uma mudança de comportamento, que deve ser tratada separadamente da mudança visual.

## 7. Composição com as skills do Tieck

| Skill | Papel |
|---|---|
| `tieck-ui` | Fonte de regras (tokens, tipografia, superfícies, cor, estados, anti slop). |
| `references/visual-direction.md` | Direção estética/compositiva e "Not Tieck". |
| `tieck-ui-review` | Crítico de **identidade e direção** do Tieck. |
| `design-review` (esta) | Auditor **estrutural**: hierarquia, consistência, densidade, a11y, slop. |
| `calm-ui` | Foco específico em **ruído e densidade**. |

Use `tieck-ui-review` **e** `design-review` numa revisão completa; não substitua um pelo
outro. Havendo divergência de severidade, prevalece a mais alta. Não invente uma escala de
severidade paralela — a de §4 é a mesma usada por `tieck-ui-review`.

## 8. Checklist final de auditoria

- [ ] Todos os 13 eixos de §2 foram percorridos (inclusive os que passaram).
- [ ] Todo achado tem evidência ancorada em arquivo/linha ou elemento observado.
- [ ] Todo achado tem impacto declarado no usuário.
- [ ] Nenhuma recomendação é "deixar diferente".
- [ ] Bugs de UX foram separados de inconsistência visual e de polish.
- [ ] Mudanças de comportamento foram isoladas e marcadas `CRITICAL`.
- [ ] Nada foi alterado no código durante a auditoria.
- [ ] O veredito não premiou minimalismo nem penalizou densidade útil.

---

## Proveniência

**Adaptador local — não é cópia de uma skill upstream.** A origem mais próxima
identificada foi vendorizada? Não, deliberadamente. Registro honesto:

| Fonte | Licença | Situação |
|---|---|---|
| [`garrytan/gstack` → `design-review`](https://github.com/garrytan/gstack/tree/main/design-review) | MIT | **Origem localizada, mas incompatível para vendorização.** O `SKILL.md` upstream declara `preamble-tier`, `triggers` e `allowed-tools` (frontmatter não previsto pelo Agent Skills) e depende, em tempo de execução, de um CLI externo (`gstack-skill-start`, telemetria, `~/.claude/skills/gstack/bin/*`) com pontos de parada e telemetria próprios. Vendorizar esse arquivo injetaria esse runtime no Tieck. |
| [`anthropics/skills` → `skills/frontend-design`](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | Apache-2.0 | Base conceitual (restraint, autocrítica, "AI slop" por padrão e não por quantidade) — parafraseada. Vendorizada separadamente em [`../anthropic-frontend-design/`](../anthropic-frontend-design/). |
| [`vercel-labs/agent-skills` → `web-design-guidelines`](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) | verificar antes de reusar | Referência de skill de revisão de UI. **Não copiada nem resumida aqui** — citada apenas como direção de pesquisa futura. |

Como o upstream utilizável é MIT, a extração de princípios seria permitida com atribuição;
a opção por um adaptador local se deve **à incompatibilidade de formato/runtime**, não à
licença. O texto de §1–§8 é original, escrito para o Tieck. Nenhum trecho foi copiado.

Para adotar o comportamento completo do `gstack`, instale-o como skill própria fora deste
repositório — não adapte este arquivo para chamar o CLI dele.
