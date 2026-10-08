# Plano de ação: melhorias de UX/UI dos mods

Base: [`resume.md`](resume.md) (brainstorm) e a leitura do código atual de cada mod. O `/pad`
(launchpad 0.3.0) é a referência de padrão. Cada mod sai numa versão `0.2.0` própria, em PRs
separados, na ordem da seção [Ordem de execução](#ordem-de-execução).

## Pendências do brainstorm, já respondidas

Conferido nos tipos da API (`launchpad/.claude-plugin/types/claude-code/index.d.ts`):

- **Parar um agente:** não existe. `$.agent` só tem `spawn`, `list` e `register`. O botão
  "parar" do agent-watch fica fora; no lugar, `[investigar]` preenche o prompt.
- **Ações dentro de toast:** não existe. `ToastOptions` só aceita `timeoutMs`. Toda ação
  continua no painel ou no prompt; o toast só aponta o comando (`/test-hud`, `/watch`).
- **Cores semânticas disponíveis** (`ThemeKey`): `success`, `error`, `warning`, `claude`,
  `subtle`, `suggestion`, `inactive`. Elas trocam `green`, `red`, `yellow` e `cyan`.

## Fase 0: base comum (antes de qualquer mod)

Cada mod é um plugin instalado sozinho, então não dá para importar código de outro mod. A base
comum é um padrão copiado, não um pacote.

| # | Tarefa | Onde | Aceite |
|---|---|---|---|
| 0.1 | Criar `hooks/ui.ts` em cada mod com `WORDS`/`langOf`, `styleOf`/`glyph`, `windowOf`, `fill()` e um `verbRow()` genérico (o `padRow` sem o `/pad` fixo) | 4 mods | Mesmo código nos 4, copiado do `launchpad/hooks/pad.ts` |
| 0.2 | Mover para o `ui.ts` os utilitários hoje duplicados: `tokens()`, `elapsed()`, `clip()`, `shortModel()` | `meter.ts`, `watch.ts`, `hud.ts` | Os testes atuais continuam passando |
| 0.3 | Adicionar `language` e `icons` ao `userConfig` de cada `plugin.json`, iguais aos do launchpad | 4 mods | Opções aparecem no `/config` |
| 0.4 | Script `scripts/check-shared.sh` que compara o `ui.ts` dos mods e falha se divergir | `scripts/` | Roda local e no CI, se houver |
| 0.5 | Definir o esqueleto de painel: dica no topo, seções em negrito, estado vazio com a próxima ação, rodapé com verbos clicáveis e `Fechar` | Documentar no `README.md` | Todos os painéis da Fase 1 seguem o esqueleto |

Esforço: médio. Sem isso, cada mod reinventa i18n e a linha de verbos.

**Status (2026-10-08, branch `feat/shared-ui`):**

- 0.1 feito. O arquivo é `hooks/ui.tsx` (JSX por causa do `verbRow`), com teste em
  `tests/ui.test.ts`. Inclui também `glyph(style, { emoji, symbol })` e `linesOf()`. `WORDS`
  fica em cada mod, porque os textos são de cada um.
  Restrição do engine descoberta na Fase 1: `$` só pode ser passado para funções do próprio
  arquivo, nunca para uma importada. Por isso o `ui.tsx` não recebe `$`: ele dá os argumentos
  (`fillArgs()`, `linesOf()`), e `fill()` e `pressVerb()` ficam no `register.tsx` de cada mod,
  com poucas linhas.
- 0.2 feito. Mudança visível: o limits-meter passou a usar o `shortModel()` do agent-watch,
  então o painel mostra `opus 5.5` no lugar de `opus-5-5`. Screenshot do limits-meter
  regenerado.
- 0.3 adiado para a Etapa 1 de cada mod. Uma opção `language` no `/config` que ainda não muda
  nenhum texto confundiria quem usa. Ela entra junto com o i18n do mod.
- 0.4 feito. `scripts/check-shared.sh` compara as cópias e sai com erro se alguma divergir.
- 0.5 feito. Seções "Shared helpers" e "Pane layout" no `README.md`.

---

## 1. test-hud (`/test-hud`, antes `/tests`), prioridade 1

Estado atual: `test-hud/hooks/register.tsx` desenha as falhas como `Text`, sem ação. Textos
só em inglês. Cores `red`/`green`/`yellow` fixas. Não tem `argumentHint` nem `help`.

### Etapa 1: ganhos rápidos

| # | Tarefa | Detalhe técnico |
|---|---|---|
| 1.1 | Falha clicável | No `r.failures.map(...)` do painel, trocar `Text` por `Button plain`. O clique chama `fill($, "Investigue e corrija a falha em <teste>. Comando: <comando>")` |
| 1.2 | Guardar o comando inteiro | Hoje `commandLine()` corta em 60 caracteres antes de gravar o `Run`. Adicionar `fullCommand` ao tipo `Run` (`test-hud/types/index.d.ts`) e só cortar na hora de desenhar |
| 1.3 | Botão `rodar de novo` | Preenche `r.fullCommand` no prompt via `$.prompt.fill`, sem executar |
| 1.4 | Lista de corrigidos | Nova função `fixed(list, run)` em `hud.ts`, simétrica a `fresh()`: nomes que falhavam no run anterior do mesmo runner e não falham mais. Seção `✓ corrigido` no painel |
| 1.5 | Toast de regressão opcional | Nova `redText(list, run)` em `hud.ts` (verde → vermelho). Opção `regressionToast` (boolean, padrão `false`) no `plugin.json` |
| 1.6 | Padrões do `/pad` | `argumentHint: '[clear\|demo\|help]'`, verbo `help`, rodapé `/test-hud clear · demo · help` com `verbRow()`, i18n de todos os textos, cores `error`/`success`/`warning`, fallback de símbolos para `✗ ✓` e para a sparkline |

### Etapa 2: ideias maiores

| # | Tarefa | Detalhe técnico |
|---|---|---|
| 1.7 | Selo `instável?` | Em `hud.ts`, `flaky(list)`: teste que falhou, passou e falhou de novo nos últimos N runs do mesmo comando |
| 1.8 | Clicar num run da lista | Atom `selected: number \| null`. O cabeçalho e as falhas mostram o run selecionado; `Esc` ou `[último]` volta |
| 1.9 | Abas por runner | Só aparecem com 2 runners ou mais na sessão |
| 1.10 | Tendência de duração | Sparkline de `durationMs` ao lado da de falhas |
| 1.11 | Histórico por projeto | Opcional (`keepHistory`), em `$.store` com chave `runs:<root>`, como o allowlist-coach faz |

**Status da Etapa 1 (2026-10-08, branch `feat/shared-ui`):** feita, versão `0.2.0`.

- O comando passou de `/tests` para `/test-hud`: `/tests` é comum e conflita com skills e
  comandos do usuário.
- 1.3 decidido: `rodar de novo` preenche um pedido em texto ("Rode os testes de novo: …") e não
  `! comando`. Assim a execução passa pelo Bash e o painel a lê; um `!` no prompt talvez nem
  ative o modo bash quando vem de um mod.
- 1.6 sem opção `icons`: o test-hud não usa emoji, só símbolos de texto (`✗ ✓ ▁▃█ ↻`), que
  o terminal do JetBrains desenha com a largura certa.
- Textos em `hooks/words.ts`. `scripts/screenshots/render.py` aprendeu as cores do tema.

### Testes e aceite

- `tests/hud.test.ts`: `fixed()`, `redText()`, `flaky()`, comando inteiro preservado.
- `tests/render.test.tsx`: falha vira botão; clique chama `prompt.fill` com o texto certo;
  rodapé com verbos; render em pt-BR e en.
- Regenerar `screenshots/test-hud.svg` com `scripts/screenshots/run.sh`.
- Aceite: com `/test-hud demo`, clicar numa falha deixa o pedido de correção no prompt, sem
  executar nada.

---

## 2. allowlist-coach (`/allowlist`), prioridade 2

Estado atual: o comando exige a regra digitada por extenso. `example` e `lastAt` são gravados
em `Entry` e nunca aparecem. `reset` apaga tudo sem perguntar. A lista "Counted" corta em
`room` linhas sem avisar. `isRisky()` só devolve boolean.

### Etapa 1: ganhos rápidos

| # | Tarefa | Detalhe técnico |
|---|---|---|
| 2.1 | Regras por número | A ordem de `sorted()` define o número. `/allowlist allow 2` e `dismiss 2` aceitam `^\d+$`; o texto da regra continua valendo. Números visíveis no painel e no `summary()` |
| 2.2 | Mostrar `example` e `lastAt` | Linha dim sob cada regra: `ex.: ./mvnw test -pl core · há 2 h` |
| 2.3 | Progresso no aviso do diálogo | `noticeFor()` passa a mostrar `●●●○○ 3/5` até `THRESHOLD` |
| 2.4 | `reset` seguro | Pelo prompt: `/allowlist reset` pede confirmação com `$.ui.ask` (`Limpar` / `Cancelar`). No painel, o botão preenche `/allowlist reset` no prompt, como o `/pad` faz |
| 2.5 | Avisar o corte | Quando `rest.length > room`, mostrar `+N regras`. Na Etapa 2 isso vira rolagem |
| 2.6 | Padrões do `/pad` | `argumentHint: '[allow <n>\|dismiss <n>\|reset\|help]'`, `help`, rodapé com verbos, i18n (inclusive as opções do `$.ui.ask`), cores `success`/`warning` |

### Etapa 2: ideias maiores

| # | Tarefa | Detalhe técnico |
|---|---|---|
| 2.7 | Rolagem | `ui.scroll` + `windowOf` + indicador `11–20 de 34`, igual ao catálogo do `/pad` |
| 2.8 | Filtro de status e de texto | Abas `prontas · contando · recusadas · todas` e um `Input` de filtro |
| 2.9 | Por que é "risky" | Trocar `isRisky(rule): boolean` por `riskOf(rule): string \| null`, que devolve o padrão que casou (`rm`, `sudo`, `curl`...). O painel mostra o motivo |
| 2.10 | Prévia e escopo | O `$.ui.ask` de `allow()` mostra a linha que será adicionada e oferece `settings.local.json` (padrão) ou `settings.json` |
| 2.11 | Desfazer | Para regras com estado `added`: `removeAllow(text, rules)` em `tally.ts` e botão `remover do allow`, também com `$.ui.ask` |
| 2.12 | Ações por linha | `dispensar` e `zerar contagem` em toda linha, não só nas prontas |
| 2.13 | `threshold` configurável | Opção numérica no `plugin.json`; `THRESHOLD` vira o padrão |

**Status da Etapa 1 (2026-10-08, branch `feat/shared-ui`):** feita, versão `0.2.0`.

- 2.1: o número segue a ordem de `sorted()`, a mesma do painel e do resumo em texto.
  `keyAt()` em `tally.ts` traduz o número na regra; a regra escrita por extenso continua valendo.
- 2.4: o reset pergunta com `$.ui.ask`, `Cancelar` primeiro. Numa execução `-p`, onde não há
  quem responda, nada é apagado.
- O registro da contagem passou a usar `$.clock.now()` no lugar de `Date.now()`, o mesmo relógio
  do painel.
- 2.6 sem opção `icons`: o mod não usa emoji.
- Textos em `hooks/words.ts`.

### Testes e aceite

- `tests/tally.test.ts`: parse por número, `riskOf()`, `removeAllow()`, progresso do aviso.
- `tests/coach.test.tsx`: `reset` não apaga sem confirmação; `+N regras`; exemplo visível.
- Fazer o teste ao vivo que já está pendente em `notes/test-allowlist-coach.md`.
- Aceite: nenhum caminho grava ou apaga sem uma confirmação explícita.

---

## 3. limits-meter (`/limits`), prioridade 3

Estado atual: o `hide` vive num atom e se perde ao reiniciar. A banda não abre o painel. O
painel calcula as linhas pelo `viewport.rows`, não por `e.props.scroll.bodyRows`. `tone()` usa
`red`/`yellow`/`green`. Textos só em inglês, inclusive os toasts de `alerts()`.

### Etapa 1: ganhos rápidos

| # | Tarefa | Detalhe técnico |
|---|---|---|
| 3.1 | Botão compactar | Com `contextPercent >= CONTEXT_ALERT` (85), a banda e o painel mostram `[🗜️ compactar]`, que chama `fill($, '/compact [foco]')` com a lacuna marcada |
| 3.2 | Banda abre o painel | Um `Button plain` (`detalhes` ou `⋯`) na banda abre o painel `limits`, ao lado do `hide` |
| 3.3 | `hide` persistente | `$.store.set('hidden', ...)` no `hide`/`show`; leitura no `session.start` |
| 3.4 | Rodapé do painel | `/limits hide · show · help` clicável com `verbRow()` |
| 3.5 | Cores semânticas | `tone()` em `meter.ts` passa a devolver `error`/`warning`/`success`. O `yellow` do cache baixo vira `warning` |
| 3.6 | Padrões do `/pad` | `argumentHint: '[hide\|show\|help]'`, `help`, i18n de `label()`, `summary()`, `alerts()` e do painel; altura do painel por `e.props.scroll.bodyRows` |

### Etapa 2: ideias maiores

| # | Tarefa | Detalhe técnico |
|---|---|---|
| 3.7 | Projeção de ritmo | Guardar amostras `(now, percent)` por janela, com a mesma `resetsAt`, a cada `session.measure`. `pace(samples, now)` em `meter.ts` faz regressão linear e devolve minutos até 100%. Só mostra se o limite chega antes do reset: "no ritmo atual, 5h chega a 100% em ~1h20" |
| 3.8 | Sparkline do contexto | Adicionar `contextPercent` ao `Turn` no `turn.complete` (lido do snapshot) e desenhar a sparkline no painel |
| 3.9 | Tabela de turnos | Cabeçalho de colunas e destaque (`claude`, negrito) no turno com mais `input` |
| 3.10 | Opções | `warnAt` e `dangerAt` (limites de cor), `cells` (quais células a banda mostra) e `density` |
| 3.11 | Terminal estreito | Abaixo de 90 colunas, mini-barra de 1 célula (`▁▃▅▇█`) no lugar do percentual |

**Status da Etapa 1 (2026-10-08, branch `feat/shared-ui`):** feita, versão `0.2.0`.

- 3.1 sem emoji: o botão é só `compact` (pt `compactar`), na cor `warning`. Assim o limits-meter
  não precisa da opção `icons`. Preenche `/compact [focus]` (pt `[foco]`) com a lacuna marcada.
- 3.2 o botão da banda se chama `details` (pt `detalhes`) e abre o painel com foco.
- 3.3 `hide` grava `hidden` no `$.store`; o `session.start` lê e aplica. `show` grava `false`.
- 3.4 os três verbos do rodapé rodam direto: um desfaz o outro, nada se perde num clique.
- 3.6 o painel ganhou a dica no topo, como os outros. `label()`, `resetIn()`, `alerts()` e
  `summary()` recebem `lang`; textos em `hooks/words.ts`. A janela semanal vira `sem` em pt-BR.

### Testes e aceite

- `tests/meter.test.ts`: `pace()` com amostras fixas, `tone()` novo, textos em pt-BR.
- `tests/render.test.tsx`: botão compactar só aparece acima de 85%; `hide` sobrevive a um
  novo `session.start`.
- Aceite: com o contexto a 86%, um clique deixa `/compact [foco]` no prompt e não roda nada.

---

## 4. agent-watch (`/watch`), prioridade 4

Estado atual: agentes finalizados ocupam o painel inteiro. `/watch clear` e o botão
`clear finished` misturam demo e concluídos. O `tick` existe, mas só força o re-render. Glifos
`◇ ◆ ● ✓ × ! ⚠` sem fallback. Só `stallMinutes` está no `/config`.

### Etapa 1: ganhos rápidos

| # | Tarefa | Detalhe técnico |
|---|---|---|
| 4.1 | Finalizados recolhidos | Atom `showDone` (padrão `false`). Os concluídos viram uma linha `✓ 5 concluídos ▸`, um `Button` que alterna. Os ativos sempre aparecem |
| 4.2 | Spinner | Agente ativo usa `'◐◓◑◒'[tick % 4]` no lugar de `●`. Como o poll é de 5 s (`POLL_MS`), conferir se o ritmo fica bom; se não, só animar com o painel aberto |
| 4.3 | Limpeza separada | Botões `limpar concluídos` e `limpar demo`; `/watch clear` aceita `done` e `demo`. Selo `demo` nas linhas com prefixo `DEMO` |
| 4.4 | Padrões do `/pad` | `argumentHint: '[clear\|demo\|help]'`, `help`, rodapé com verbos, i18n (painel, status line, toasts), cores `claude`/`warning`/`error`/`success`, fallback de glifos |

### Etapa 2: ideias maiores

| # | Tarefa | Detalhe técnico |
|---|---|---|
| 4.5 | Barra de participação | Uma linha de `width` células com a fatia de tokens de cada agente, na cor dele, e legenda curta |
| 4.6 | Expandir linha | Adicionar `recent: string[]` (últimas 5 ferramentas) ao `Agent`, mantido por `toolStart`/`toolEnd`. Clicar no nome expande e mostra as ferramentas e os erros |
| 4.7 | `[investigar]` em agente travado | Preenche: "O agente <nome> parece travado em <doing> há <tempo>. Verifique o que aconteceu." Parar o agente fica fora: a API não tem `kill` |
| 4.8 | Ordenação e rolagem | Ordenar por tokens ou por início; `ui.scroll` + `windowOf` |
| 4.9 | Custo do lote na janela de 5h | Sem acoplar ao limits-meter: ler `five_hour.percentUsed` de `$.session.usage()` no início e no fim do lote. O resumo diz "este lote usou ~6% da janela de 5h" |

**Status da Etapa 1 (2026-10-08, branch `feat/shared-ui`):** feita, versão `0.2.0`.

- 4.1 o atom `showDone` guarda se os concluídos estão abertos. A linha `✓ N concluídos ▸`
  abre e fecha; `limpar concluídos` fica ao lado.
- 4.2 o spinner gira a cada poll (5 s), com o `tick`. É lento, mas mostra que o agente está vivo.
  O `tick` passou a andar também com agentes de demo ativos.
- 4.3 `clear done`, `clear demo` e `clear` (os dois). Bug antigo corrigido: um agente removido
  voltava no poll seguinte, com 0 tokens, porque o `agent.list` ainda o listava. Agora os ids
  removidos ficam no atom `dropped` e são ignorados enquanto o agente não volta a rodar.
- 4.4 opções `language` e `icons`. Só o `⚠` tem troca (`!` no modo symbol); os outros glifos
  são símbolos de texto. O `clear` do rodapé preenche `/watch clear` no prompt; os botões
  `limpar concluídos` e `limpar demo` rodam direto, porque já dizem o que removem. A descrição
  da ferramenta em uso (`lendo routes.ts`) também é traduzida.

### Testes e aceite

- `tests/watch.test.ts`: `recent` com no máximo 5 itens, ordenação, cálculo do delta da janela.
- `tests/render.test.tsx`: concluídos recolhidos por padrão; `limpar demo` não apaga agentes
  reais; render em pt-BR e en.
- Fazer o teste ao vivo com subagentes reais, que está pendente no roadmap.
- Aceite: com 10 agentes concluídos e 2 ativos, o painel mostra os 2 ativos e uma linha
  `✓ 10 concluídos ▸`.

---

## 5. Integração entre mods (depois dos quatro)

| # | Tarefa | Detalhe técnico |
|---|---|---|
| 5.1 | `/pad` sugere os outros mods | Se `$.command.list()` tiver `tests`, `watch`, `limits` ou `allowlist`, os padrões do launchpad incluem esses botões |
| 5.2 | Checagem visual geral | Regenerar todos os SVGs em `screenshots/` e revisar os 5 lado a lado |

## Ordem de execução

| Ordem | Entrega | Versão | Esforço |
|---|---|---|---|
| 1 | Fase 0: base comum | sem versão | M |
| 2 | test-hud Etapa 1 | 0.2.0 | P |
| 3 | allowlist-coach Etapa 1 | 0.2.0 | P |
| 4 | limits-meter Etapa 1 | 0.2.0 | P |
| 5 | agent-watch Etapa 1 | 0.2.0 | P |
| 6 | Etapas 2, uma por mod, na mesma ordem | 0.3.0 | M a G |
| 7 | Integração entre mods | launchpad 0.4.0 | P |

P = até meio dia, M = 1 a 2 dias, G = mais de 2 dias.

## Regras para todas as entregas

- Nada é executado a partir de um clique que não seja a própria ação do mod: comando externo,
  `reset` e texto vindo do repositório vão para o prompt, para a pessoa revisar.
- Toda escrita em arquivo passa por `$.ui.ask` antes.
- Cada PR atualiza o `README.md` do mod, os testes e o screenshot.
