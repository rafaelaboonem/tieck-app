# anthropic-frontend-design — proveniência

**Skill externa vendorizada.** Não é uma skill do Tieck. Em qualquer conflito, o Tieck vence
(ver a seção "Prioridade de regras" em [`../tieck-ui/SKILL.md`](../tieck-ui/SKILL.md)).

| Campo | Valor |
|---|---|
| Origem | repositório oficial Anthropic — <https://github.com/anthropics/skills> |
| Caminho upstream | `skills/frontend-design/` |
| SKILL.md upstream | <https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md> |
| Licença | **Apache License 2.0** (`LICENSE.txt` neste diretório, cópia do upstream) |
| Formato | Agent Skills (`SKILL.md` + frontmatter `name`/`description`) — compatível |
| Vendorização | **integral** (SKILL.md copiado byte a byte) |

## Adaptação aplicada (única)

O campo `name` do frontmatter foi alterado de `frontend-design` para
`anthropic-frontend-design`, para satisfazer a regra do Agent Skills de que o `name`
deve corresponder ao nome da pasta (evita colisão com uma eventual skill local
`frontend-design`).

```
-name: frontend-design
+name: anthropic-frontend-design
```

Nenhum outro caractere do arquivo foi alterado — nenhuma seção, frase ou exemplo.
O campo `description` e o campo `license` permanecem exatamente como no upstream.
Alteração registrada aqui conforme exigido pela Apache License 2.0, seção 4(b).

## Como usar no Tieck

Consultar [`../README.md`](../README.md) para a matriz de uso. Em resumo: use junto de
`tieck-ui` **apenas** para direção visual, composição, hierarquia e fuga de layout
genérico — nunca para redefinir paleta, tipografia do produto, tokens ou arquitetura.
