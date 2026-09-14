# Tieck — direção visual permanente

Referência **complementar** de composição, caráter de produto e intenção estética.
As **regras** continuam em `../SKILL.md` (tokens, tipografia, tabelas, estados,
anti AI-slop). Este arquivo responde a uma pergunta diferente:

> **Não "quais classes usar?", mas "o que o Tieck deve parecer — e por quê?"**

---

## 1. Princípio central

**Operational precision. Quiet confidence. Structured density. Designed, not decorated.**

Em português conceitual:

> O Tieck é uma ferramenta operacional de precisão.
> A interface deve parecer um **instrumento de trabalho profissional**,
> não um painel decorativo.

O usuário do Tieck está no meio do turno, resolvendo ocorrências reais. A interface
deve transmitir **controle e confiabilidade**, não impressionar. Uma tela bem-feita
some e deixa o trabalho acontecer; uma tela decorada compete com o trabalho.

Três consequências diretas:

1. **Precisão** — alinhamentos rigorosos, hierarquia explícita, nada aproximado.
2. **Confiança silenciosa** — o produto não precisa gritar para parecer sério.
3. **Densidade estruturada** — informação útil próxima, organizada por arquitetura,
   não escondida atrás de espaço vazio.

---

## 2. Papel das referências visuais

As referências visuais fornecidas pelo usuário/produto **NÃO são especificações de
layout** e **não representam marcas externas** que o Tieck deva imitar. Elas servem
exclusivamente para **extrair princípios estruturais e visuais**.

Regra explícita:

> **Never reproduce a reference layout verbatim.**
> Extract structural and visual principles and reinterpret them using Tieck's brand,
> information architecture, product needs and existing design system.

Aplicação prática:

- nunca copiar grid, navegação, densidade ou estética de uma referência como se fosse
  um molde — sempre reinterpretar com a IA de informação real do Tieck
  (unidades, turnos, checklists, ocorrências, execuções, evidências);
- nunca citar marcas externas como direção estética permanente em decisões de design;
- referência que conflite com `../SKILL.md` (tokens, densidade, anti AI-slop) **perde**:
  a Skill é a régua, a referência é inspiração.

---

## 3. Características visuais extraídas

Direção preferencial para qualquer trabalho visual novo no Tieck:

- **Shell com presença estrutural forte** — a moldura do produto tem identidade própria
  e não parece um wrapper neutro em volta do conteúdo.
- **Clara separação entre navegação e área de trabalho** — o usuário sabe onde termina
  o "onde eu estou" e começa o "o que eu estou fazendo".
- **Alta legibilidade** — contraste de texto é decisão, não consequência.
- **Boa densidade de informação** — SaaS operacional não é museu.
- **Composição mais arquitetônica do que decorativa** — estrutura visível (alinhamento,
  grid, separação de planos) em vez de ornamento.
- **Uso controlado de superfícies** — poucas superfícies, cada uma justificada.
- **Bordas finas** — hairline é o separador padrão.
- **Sombras apenas quando existe elevação real** — flutuantes, nunca decoração.
- **Radius moderado** — geometria sóbria.
- **Alinhamentos rigorosos** — o olho deve conseguir descer uma coluna sem obstáculo.
- **Tipografia objetiva** — título curto, label claro, metadata discreta.
- **Accent usado como sinal** — cor de marca indica posição/ação, não enfeita.
- **Contraste forte entre níveis de informação** — o que importa é visivelmente
  diferente do que é secundário.
- **Navegação com identidade própria** — não uma lista de links default.
- **Dashboards compostos como uma página** — e não como uma coleção de cards soltos.

---

## 4. Application Shell

O shell é a **arquitetura visível do produto**.

Direção:

- o shell deve **enquadrar visualmente** o produto — quem olha entende que é uma
  aplicação única, coesa e proprietária;
- a navegação **não deve parecer uma lista padrão de template**: precisa ter ritmo,
  hierarquia, agrupamento e estado ativo próprios;
- **contexto global** (quem sou eu / onde estou no produto) e **contexto de workspace**
  (qual organização estou operando) são informações diferentes e **podem ser separados**
  visualmente **dentro da mesma sidebar** (zonas), não por multiplicação de painéis;
- priorizar **arquitetura visual clara**: o usuário deve conseguir varrer o shell em
  uma passada de olho;
- a direção do Tieck no desktop é **uma sidebar única que se adapta** (§5, §6, §7).
  Dois níveis laterais permanentes não são a direção do produto (§9).

O shell NÃO deve: virar uma faixa colorida, ganhar decoração, competir com o conteúdo
ou introduzir densidade diferente da área de trabalho.

---

## 5. Desktop Navigation — sidebar única

A direção principal do Tieck no desktop é **uma sidebar única**, desenhada como **uma
peça só**: marca, contexto de workspace, navegação e sessão convivem na mesma coluna,
separados por zonas, ritmo e hierarquia — nunca por painéis laterais extras.

- **faixa inicial de estudo: ~220–248px**; a largura final é definida pelo **conteúdo
  real** (labels completos, nome do workspace, e-mail), não pelo número;
- **forte presença estrutural** — a sidebar é arquitetura do produto, não um menu
  anexado ao lado do conteúdo;
- **navegação bem hierarquizada** — destino principal, destinos contextuais (RBAC) e
  zona secundária são legíveis em uma varredura;
- **contexto de workspace integrado** — identidade + nome + troca pertencem à mesma
  peça (zona de contexto), não a um control avulso;
- **densidade alta e útil**, alinhamento rigoroso, labels curtas.

Evitar:

- lista de links genérica (ícone + label empilhados sem hierarquia);
- **labels de seção redundantes** — só existem quando ajudam orientação (§10);
- **card dentro da sidebar** (caixa branca com borda para "destacar" o workspace);
- ativo padrão **"pill cinza"** (`bg-neutral-100 rounded-md` como único sinal);
- **sidebar branca neutra sem identidade** — o plano do shell precisa ser reconhecível;
- **multiplicar painéis laterais** para resolver hierarquia que a peça única resolve (§9).

---

## 6. Collapsed Navigation

A **mesma** sidebar pode entrar em **estado compacto**: é variação responsiva da mesma
navegação, **não** uma segunda sidebar obrigatória no desktop.

- largura aproximada: **52–60px**;
- **ícones alinhados** na mesma coluna óptica da versão expandida;
- logo/símbolo oficial **apenas se o asset funcionar nessa escala** — se não funcionar,
  registrar a limitação (§11) em vez de desenhar marca nova;
- **tooltip + `aria-label`** em todo item sem label visível;
- **preservar o active state** — a posição continua reconhecível sem o texto;
- **não colapsar para 0px** no desktop, salvo comportamento existente e deliberado;
- a transição deve parecer **contínua**, nunca troca brusca de layout (§8).

Leia o **rail estreito com ícones** das referências visuais como este estado: o mesmo
shell em modo compacto/tablet — não como convite a manter dois níveis laterais no
desktop.

---

## 7. Mobile Navigation

- **Mobile não é dual-rail** e não mantém duas colunas laterais simultâneas.
- Pode usar **drawer/overlay** (ou rail compacto temporário), conforme a arquitetura
  existente do produto.
- Priorizar **navegação essencial + contexto atual**; o resto desce na hierarquia.
- O **conteúdo continua dominante** — o shell não rouba a tela.
- **Evitar encolher o desktop**: reordenar prioridades (ação → status → execução →
  conteúdo essencial) em vez de apenas reduzir larguras.
- Mecânica de breakpoints, grids e tabelas: `../SKILL.md` §12.

---

## 8. Motion de navegação

Motion de navegação **explica mudança de estado**, não decora a transição.

- duração preferencial: **180–220ms**;
- easing **suave / ease-out**;
- largura e labels transicionam **de forma coordenada** (uma única mudança percebida);
- labels podem usar **opacity + translate pequeno**;
- **ícones permanecem visualmente estáveis** — não deslizam nem pulam;
- sem bounce, sem overshoot, sem stagger longo;
- respeitar `prefers-reduced-motion`;
- **a animação nunca atrasa a navegação** — o clique navega imediatamente.

---

## 9. Dual-rail — padrão possível, **não** a direção do Tieck

Dois níveis laterais persistentes (rail global estreito + painel contextual) existem em
produtos cuja hierarquia **realmente exige** dois níveis simultâneos. Para o Tieck:

- **não é a direção padrão** e não deve ser implementado sem necessidade real;
- antes de considerar, é preciso nomear exatamente **qual ambiguidade de hierarquia**
  ele resolveria e por que a sidebar única (§5) não resolve;
- se algum dia for adotado, preserva **100% do comportamento** existente (rotas, RBAC,
  workspace, auth, busca, collapse — §16 de `../SKILL.md`) e mantém o total das colunas
  laterais próximo ao da sidebar única, para não consumir a área de trabalho.

Um protótipo anterior tratou esse padrão como direção do desktop — **isso foi um erro
interpretativo** e não deve ser repetido.

---

## 10. Navegação

- A navegação deve parecer **estrutural** — parte da arquitetura, não um menu anexado.
- **Estado ativo**: composição de **contraste + tipografia + superfície + accent mínimo**.
  Um sinal só raramente basta.
- **Evitar** o active state genérico de "pill cinza" (`bg-neutral-100 rounded-md` sozinho).
- **Evitar** a barra lateral rosa como padrão automático — ela funciona quando o
  sistema de navegação já é intencional; como solução única, virou template (foi
  exatamente o achado do piloto 7A).
- **Evitar** cor como único indicador de estado.
- Ícones formam **um sistema**: mesmo tamanho, mesmo stroke, mesmo alinhamento óptico,
  mesma relação com o label.
- Grupos são separados por **ritmo e contexto** (espaço, tipografia, divisor quando há
  mudança de zona) — não por linhas decorativas em todo grupo.

---

## 11. Brand

- Usar a **logo oficial** existente, sem texto redundante ao lado.
- A marca tem **presença**, mas não domina — ela identifica, não decora.
- O **accent rosa do Tieck funciona como sinal**, não como tinta de fundo.
- Não espalhar rosa decorativamente (sem bordas rosa, fundos rosa, ícones rosa "para
  combinar").
- **Estado compacto (§6):** use o asset oficial só se ele funcionar em 52–60px. O asset
  atual é um wordmark alongado (~2,9:1) com bastante margem transparente dentro de um
  quadrado — verifique a **legibilidade real** antes de aplicá-lo num rail estreito;
  se não funcionar, **registre a limitação** para revisão de identidade (política de
  marca em `../SKILL.md`) em vez de criar símbolo novo.

O accent serve principalmente para:

| Função | Exemplo |
|---|---|
| posição ativa | item atual de navegação, aba atual |
| ação principal | CTA de execução, submit primário |
| seleção | linha/estado escolhido |
| foco | `focus-visible:ring-[#FF007F]/40` |
| destaque operacional significativo | alerta/estado que exige ação |

Fora disso: neutro. A política de `#FF007F` (legado controlado, sem substituição
massiva incidental) está em `../SKILL.md`.

---

## 12. Superfícies

Preferir:

- **flat surfaces** — o plano padrão é a página;
- **subtle tonal separation** — diferença de tom discreta entre planos estruturais;
- **hairline borders** — `border-neutral-200/70` como separador primário;
- **contraste entre camadas estruturais** — shell × trabalho, seção × detalhe.

Evitar:

- cardificar cada seção;
- floating surfaces desnecessárias;
- `shadow-sm` em tudo;
- `rounded-xl` em todo agrupamento;
- wrappers visuais redundantes (caixa dentro de caixa com a mesma função).

---

## 13. Dashboard (direção para telas futuras)

- O dashboard é **uma composição única** — uma página que responde perguntas, não um
  mosaico de componentes independentes.
- **Nem toda métrica precisa de card.** Grid, tipografia, alinhamento e separadores
  frequentemente resolvem melhor e com menos ruído.
- KPIs possuem **hierarquia** entre si (o número que importa é maior; os outros não
  fingem ser iguais).
- Gráficos **respondem perguntas** — se não há decisão apoiada, questione a presença.
- **Tabelas podem ser a experiência central** — em operação, comparar linhas vale mais
  que visualizar cards.
- Evitar "mosaico de componentes": grade de blocos idênticos sem hierarquia.

---

## 14. Densidade

Tieck é SaaS operacional.

- Densidade **média-alta**.
- Conteúdo importante **próximo** de seu contexto.
- Pouco desperdício vertical.
- **Whitespace serve à hierarquia** — separa o que é diferente, agrupa o que é igual.
- **Não usar espaço vazio para simular premium.**
- **Não compactar** a ponto de prejudicar leitura, toque ou varredura.

Regra prática: se o operador precisa rolar para comparar duas informações que pertencem
à mesma decisão, a densidade está errada.

---

## 15. Tipografia

- Títulos **objetivos** — curto, direto, sem microcopy decorativa.
- **Forte contraste entre heading, label e metadata** — três alturas visuais distintas.
- **Números tabulares** quando o valor é comparado (`tabular-nums` já é padrão nas
  tabelas).
- Tamanho grande **apenas quando a informação merece**.
- **Evitar hero typography dentro do app** — nada de `text-4xl+` fora do momento de
  conclusão de execução.

Preservar o par tipográfico do produto: **Space Grotesk = display**, **DM Sans =
interface/body**. Fontes de conteúdo do cliente (editor/checklist) não são dívida
visual e não entram na UI administrativa.

---

## 16. Shapes / radius

- Radius **moderado** — geometria sóbria (`--radius: 0.625rem` é a base; escala e usos
  em `../SKILL.md` §3).
- Evitar **pill por padrão** — `rounded-full` só em badges de status, chips e avatares.
- Componentes **estruturais** têm geometria mais sóbria que componentes de conteúdo.
- **Consistência acima de variedade**: um radius novo por tela destrói o sistema.

---

## 17. Dark mode

As referências incluem dark mode — **isso não faz do dark uma prioridade automática**.

- **Não converter o Tieck para dark nesta fase.**
- Referências dark servem para **estudar contraste e composição** (separação de planos,
  legibilidade de metadata, hierarquia sem sombra).
- Futura implementação dark é **tarefa própria**, com auditoria de tokens, gráficos,
  estados e contraste — nunca um subproduto de uma tarefa visual comum.

---

## 18. Glass / futurismo

As referências incluem elementos glass/futuristas. **Não absorver como linguagem
principal.** Explicitamente fora do Tieck:

- glassmorphism pesado;
- blur decorativo;
- transparência extensa;
- glow;
- neon;
- interfaces holográficas;
- efeitos futuristas.

O que **pode** ser estudado nelas:

- **layering** — como separar planos hierarquicamente;
- **separação de planos** — o que é shell, o que é trabalho, o que é detalhe;
- **contraste** — como destacar sem cor.

A translação é sempre estrutural, nunca visual: aprende-se a *arquitetura*, não a
*aparência*.

---

## 19. Not Tieck — o que o produto NÃO deve parecer

Seção explícita, para uso em revisão:

- admin template genérico;
- dashboard shadcn montado automaticamente (componentes default empilhados);
- landing page dentro do produto;
- fintech gamificada (badges, streaks, confete, números gigantes);
- produto futurista conceitual (glass, glow, neon, gradiente);
- coleção de cards (cada seção uma caixa independente);
- **dois níveis de navegação lateral permanentes** sem necessidade real de hierarquia (§9);
- UI gerada por IA sem intenção (grid simétrico, ícone colorido por bloco, tudo
  `rounded-xl`, sombra suave em tudo).

Se uma tela se encaixa em qualquer item acima, é achado de design — não questão de
gosto.

---

## 20. Regras para agentes — antes de criar uma UI

Responder **todas** antes de escrever código. Se alguma resposta for vaga, o problema
não é visual ainda.

1. Qual é a **principal tarefa** do usuário nesta tela?
2. Qual **nível da arquitetura** essa tela ocupa (shell / página / seção / detalhe)?
3. O conteúdo **precisa de container**?
4. É **realmente necessário um card**?
5. Qual informação deve **dominar**?
6. Qual informação deve **desaparecer visualmente**?
7. O **accent possui função** (posição, ação, seleção, foco, alerta)?
8. O layout parece **uma única composição**?
9. Existe alguma **decisão estética genérica sem justificativa**?
10. Isso ainda parece **Tieck**?

Consequências operacionais (já obrigatórias na Skill):

- nenhuma mudança visual altera silenciosamente comportamento (§16 de `../SKILL.md`);
- se uma melhoria desejável exigir mudança de comportamento, **registre como sugestão
  separada** — não implemente embutido;
- toda exceção a uma regra é documentada na implementação.
