# Resumo: brainstorm de UX/UI dos mods

## Contexto

Pedido: usar o mod **launchpad** (`/pad`) como referência de qualidade e fazer um brainstorm
de melhorias de UX e UI para os outros mods do repositório. O pedido falava em 3 mods, mas
existem 4 além do launchpad, e o brainstorm cobre todos:

| Mod | Comando | O que faz |
| --- | --- | --- |
| limits-meter | `/limits` | Janelas de 5h e semanal, contexto e cache, numa banda acima do prompt |
| allowlist-coach | `/allowlist` | Conta aprovações por regra e oferece adicioná-la a `permissions.allow` |
| agent-watch | `/watch` | Tokens por subagente, alerta de agente travado e resumo ao final |
| test-hud | `/tests` | Execuções de teste, sparkline de falhas e testes falhando |

Este documento só registra o brainstorm: nenhum código foi alterado.

## O que faz o `/pad` ser a referência

| # | Padrão do `/pad` | limits | allowlist | watch | tests |
|---|---|:-:|:-:|:-:|:-:|
| 1 | i18n (`WORDS` + `langOf`: pt-BR/en pelo `LANG`) | ✗ | ✗ | ✗ | ✗ |
| 2 | Opções no `/config` | ✗ | ✗ | só `stallMinutes` | ✗ |
| 3 | Linha de verbos clicável (`padRow`) | ✗ | ✗ | ✗ | ✗ |
| 4 | `argumentHint` + verbo `help` | ✗ | ✗ | ✗ | ✗ |
| 5 | Cores semânticas (`claude`, `warning`, `subtle`) em vez de `red/yellow/green` | ✗ | ✗ | ✗ | ✗ |
| 6 | Hover (borda e label no acento, tile tingido) | ✗ | ✗ | ✗ | ✗ |
| 7 | Rolagem no painel (`ui.scroll` + `windowOf` + indicador de intervalo) | corta | corta calado | ✗ | ✗ |
| 8 | Filtro com `Input` no painel | — | ✗ | — | ✗ |
| 9 | Ação segura pelo prompt (`$.prompt.fill` com `[lacuna]` marcada) | ✗ | `reset` executa direto | ✗ | ✗ |
| 10 | Superfície desktop com botões nativos | ✗ | ✗ | ✗ | ✗ |
| 11 | Fallback de ícones (símbolo no JetBrains) | — | — | ✗ | ✗ |
| 12 | Preferência que persiste entre sessões (`$.store`) | `hide` se perde | ✓ | — | — |

## Ideias por mod

### limits-meter

Ganhos rápidos:
- Com o contexto a ≥85%, um botão `[🗜️ compactar]` na banda e no painel, que preenche
  `/compact [foco]` no prompt.
- Clicar na banda abre o painel.
- Rodapé `/limits hide · show · help` clicável.
- `hide` persistente com `$.store`.
- Cores semânticas no lugar de `tone()` com `red/yellow/green`.

Ideias maiores:
- Projeção de ritmo: "no ritmo atual, a janela de 5h chega a 100% em ~1h20".
- Sparkline do contexto por turno.
- Destaque do turno mais pesado e cabeçalho de colunas na tabela de turnos.
- Opções: limites de cor, densidade da banda, quais células mostrar.
- Mini-barra de 1 célula em terminais estreitos.

### allowlist-coach

Ganhos rápidos:
- Referenciar regras por número (`/allowlist allow 2`).
- Exibir o `example` e o `lastAt`, que o mod já guarda e nunca mostra.
- Notice com progresso visual: `●●●○○ 3/5`.
- `reset` seguro, pelo prompt ou com confirmação.
- Mostrar "+N regras" quando a lista é cortada.

Ideias maiores:
- Abas ou filtro de status, e filtro de texto com `Input`.
- Explicar por que uma regra é "risky" (qual padrão casou).
- Prévia antes de gravar e escolha de escopo (`settings.local.json` ou `settings.json`).
- Desfazer: remover uma regra do allow.
- Ações em todas as linhas (dispensar, zerar contagem).
- Opção `threshold` configurável.

### agent-watch

Ganhos rápidos:
- Agentes finalizados recolhidos por padrão (`✓ 5 concluídos ▸`).
- Spinner animado com o `tick` que já existe (`◐◓◑◒`).
- Botões separados para limpar a demo e os concluídos, e um selo `demo`.
- Fallback de símbolos e i18n.

Ideias maiores:
- Barra empilhada com a participação de cada agente nos tokens.
- Expandir uma linha ao clicar (últimas ferramentas, erros).
- Ação em agente travado: `[investigar]` preenche o prompt. Um botão para parar o agente
  depende de existir uma API como `$.agent.kill`.
- Ordenação e rolagem.
- Tokens do lote como % da janela de 5h, cruzando com o limits-meter.

### test-hud

Ganhos rápidos:
- Cada teste falhando vira um botão que preenche "Investigue e corrija a falha em …" no prompt.
- Botão `rodar de novo`, que preenche o comando no prompt sem executá-lo.
- Lista de testes corrigidos (`✓ corrigido`).
- Toast opcional de regressão (verde → vermelho).

Ideias maiores:
- Detectar testes instáveis (selo `instável?`).
- Clicar numa execução para ver as falhas dela.
- Abas por runner.
- Tendência de duração da suíte.
- Histórico opcional por projeto entre sessões.

## Transversal

1. Mesmo esqueleto de painel: dica no topo, seções em negrito, estado vazio com a próxima
   ação, rodapé com verbos clicáveis e `Fechar`.
2. Utilitários compartilhados extraídos do `/pad`: `WORDS`/`langOf`, `styleOf`/`glyph`,
   `windowOf` + `ui.scroll`, `fill()`, `padRow`. Hoje `tokens()`, `elapsed()` e `clip()`
   estão duplicados entre os mods.
3. Integração entre mods via `$.command.list()`: por exemplo, o `/pad` sugere botões para
   `/tests` e `/watch` quando esses mods estão instalados.
4. Testes de render para os elementos novos e screenshots regenerados.

## Prioridade sugerida (impacto ÷ esforço)

1. test-hud: falhas clicáveis que preenchem o prompt
2. allowlist-coach: regras por número, `example` visível e `reset` seguro
3. limits-meter: botão de compactar, banda clicável e `hide` persistente
4. Os quatro mods: linha de verbos clicável, `help`/`argumentHint` e cores semânticas
5. Os quatro mods: i18n pt-BR/en
6. agent-watch: barra de participação e finalizados recolhidos

## Pendências

- Confirmar se a API de mods permite parar um agente e ter ações dentro de toasts.
- Escolher quais ideias implementar primeiro.
