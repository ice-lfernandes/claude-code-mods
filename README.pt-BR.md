# Claude Code mods

[English](README.md) | **Português (Brasil)**

[![CI](https://github.com/ice-lfernandes/claude-code-mods/actions/workflows/ci.yml/badge.svg)](https://github.com/ice-lfernandes/claude-code-mods/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ice-lfernandes/claude-code-mods)](https://github.com/ice-lfernandes/claude-code-mods/releases/latest)
[![Claude Code 2.1.287 ou mais recente](https://img.shields.io/badge/Claude%20Code-2.1.287%2B-d97757)](#instalação)
[![License: MIT](https://img.shields.io/github/license/ice-lfernandes/claude-code-mods)](LICENSE)

**Os limites do plano, o contexto e o que o agente está fazendo, logo acima do prompt.** Seis
mods para o Claude Code, instalados de um único marketplace.

![limits-meter: a faixa acima do prompt durante um pedido, o painel /limits e o toast numa troca cara para o opus](screenshots/limits-meter-demo.gif)

O limits-meter durante um pedido, o painel `/limits` e uma troca cara perto do limite
([mp4](screenshots/limits-meter-demo.mp4)). Desenhado a partir da saída real do mod por
`scripts/screenshots/limits-meter-demo.sh`.

Mods para o dia a dia no Claude Code. Um mod é um plugin do Claude Code feito de function hooks:
ele pode desenhar uma faixa acima do prompt, um painel, uma entrada na status line ou um toast.
Requer Claude Code 2.1.287 ou mais recente.

| Mod | Comando | O que faz |
| --- | --- | --- |
| [limits-meter](limits-meter/) | `/limits` | Limites do plano, relógio do cache e contexto acima do prompt: modelo e effort, janelas de 5 horas e semanal com horário de reset, contagem regressiva do cache do prompt com um manter-quente opcional que gasta plano, contexto dividido por grupo (sistema, MCP, mensagens), tokens por turno, e um toast na troca cara de modelo perto do limite |
| [allowlist-coach](allowlist-coach/) | `/allowlist` | Conta os diálogos de permissão por regra; depois de 5 aprovações sem nenhuma recusa, oferece adicionar a regra a `permissions.allow`, perguntando antes de gravar |
| [agent-watch](agent-watch/) | `/watch` | Subagentes num relance: um cartão por agente com mascote, passo e tokens, uma faixa acima do prompt, um toast quando um trava e um resumo com o agente mais pesado quando terminam |
| [test-hud](test-hud/) | `/test-hud` | Execuções de teste num relance: aprovados sobre o total na status line, um sparkline das falhas entre execuções, os testes que falham agrupados por arquivo e toasts quando a suíte fica verde ou um teste fica instável |
| [launchpad](launchpad/) | `/pad` | Um menu de ações de um clique sob o cabeçalho, acima do prompt ou num painel: cada botão roda um comando, skill ou agente instalado. `◆ pad` abre um painel de controle: modelo e esforço em um clique, os mods desta coleção, os atalhos. Escolha e ordene até 8 em `/pad configuration`, ou distribua os de um time no repositório |
| [plain-view](plain-view/) | `/plain-view` | Transcript sem ruído: as linhas de tool saem da frente e o plano do agente aparece num cartão acima do prompt, com o passo atual, barras de progresso e um resumo no fim do turno |

## Usando os mods

As imagens abaixo vêm da saída real de cada mod: `scripts/screenshots/run.sh` roda o mod com
dados de exemplo via `claude plugin test` e renderiza o que ele desenhou.

Todo mod responde às mesmas quatro palavras, além dos comandos próprios: `/x on` e `/x off` ligam e
desligam o mod em todas as conversas (a opção `enabled`, a mesma do `/config`; desligado, só o
comando continua, para o `/x on` trazer o mod de volta), e `/x hide` e `/x show` mantêm o mod ligado
mas tiram o que ele desenha sozinho (a faixa, os toasts, a linha de status, o cartão). O painel e o
comando continuam abrindo. `/x help` lista o resto. O `hide` de um mod vale também nas próximas sessões.

### limits-meter

A faixa aparece sozinha depois da primeira resposta. Comandos:

```
/limits          abre o painel: janelas do plano, contexto em tokens, os últimos 20 turnos
/limits hide     esconde a faixa acima do prompt, também nas próximas sessões
/limits show     traz a faixa de volta
/limits off | on  desliga ou liga o mod em todas as conversas
/limits keep-warm on|off  mantém o cache do prompt quente (pergunta antes, gasta plano)
/limits warn N   avisa na troca cara com a janela de 5h a partir de N% (padrão 70)
/limits help     lista os comandos
```

A faixa começa com o modelo e o effort; `format: compact` a desenha numa linha só de números.

A partir de 85% de contexto, a faixa e o painel mostram `compact`, que coloca `/compact [focus]`
no prompt e não roda nada. `details` na faixa abre o painel. O painel também diz quando uma
janela chega a 100% no ritmo atual, antes do reset, e desenha a ocupação do contexto turno a
turno. Trocar para um modelo maior (haiku < sonnet < opus < fable) ou para effort `max` com a
janela de 5h em 70% ou mais mostra um toast com os minutos que restam no ritmo dos últimos 3
turnos.

A célula `cache` conta o tempo do cache do prompt (`⏱ 52:10`), passa para a cor de aviso nos
últimos 10 minutos (no último minuto, num cache de 5 minutos) e vira `❄ frio` quando ele
esgota, com um toast. Ela precisa do TTL do cache, que o engine informa numa troca de modelo e
que o mod também lê de um turno de uma só chamada depois de uma pausa; enquanto não sabe, a
célula mantém a taxa de acerto do último turno. `manter quente` (ou `/limits keep-warm on`)
pergunta antes e então envia uma mensagem curta logo antes de o cache esfriar: é um turno de
verdade, desenhado como uma linha dim. Para no seu próximo prompt ou depois de 2 horas. Gasta
plano: é o único jeito de este mod chamar um modelo, e só se você ligar. A barra de contexto é
dividida pelas categorias do engine (sistema, MCP, mensagens), com uma legenda sob a faixa; o
painel lista cada categoria e cada servidor MCP.

![limits-meter: faixa acima do prompt, o painel /limits e seus toasts](screenshots/limits-meter.svg)

**O relógio do cache e o keep warm** ([mp4](screenshots/limits-meter-cache.mp4)): a contagem regressiva depois de uma resposta, a barra de contexto por grupo, o painel `/limits` e o keep warm avisando antes de o cache esfriar. Desenhado a partir da saída real do mod por `scripts/screenshots/limits-meter-demo.sh`.

![limits-meter: a contagem do cache, a barra de contexto por grupo, o painel /limits e o keep warm](screenshots/limits-meter-cache.gif)

#### Instalação

```
/plugin install limits-meter --marketplace ice-lfernandes/claude-code-mods
```

Ou para uma sessão, a partir de um clone: `claude --plugin-dir ./limits-meter`.

### allowlist-coach

Ele conta sozinho cada vez que você responde a um diálogo de permissão. Comandos:

```
/allowlist             abre o painel: cada regra contada, numerada, as prontas primeiro
/allowlist allow 1     adiciona a regra 1 a permissions.allow (pergunta antes, e em qual arquivo)
/allowlist dismiss 2   para de oferecer a regra 2
/allowlist remove 1    tira a regra 1 de allow, quando foi o coach que a adicionou (pergunta antes)
/allowlist reset 2     zera a contagem da regra 2 (pergunta antes)
/allowlist reset       apaga as contagens deste projeto (pergunta antes)
/allowlist hide        segue contando, sem toast nem nota no diálogo
/allowlist show        traz os avisos de volta
/allowlist off | on    desliga ou liga o mod em todas as conversas
/allowlist help        lista os comandos
```

O painel tem abas por status, um filtro e uma lista com rolagem. Uma regra arriscada diz por que
nunca é oferecida.

![allowlist-coach: a linha sob o diálogo de permissão, o toast e o painel /allowlist](screenshots/allowlist-coach.svg)

#### Instalação

```
/plugin install allowlist-coach --marketplace ice-lfernandes/claude-code-mods
```

Ou para uma sessão, a partir de um clone: `claude --plugin-dir ./allowlist-coach`.

### agent-watch

A faixa acima do prompt, a status line e os toasts aparecem sozinhos enquanto subagentes rodam. Comandos:

```
/watch              abre o painel: um cartão por agente com passo, últimas ações e tokens
/watch demo         adiciona três agentes falsos, um deles travado, para ver o painel
/watch clear        remove agentes terminados e de demo
/watch clear done   remove só os agentes terminados
/watch clear demo   remove só os agentes de demo
/watch hide         segue acompanhando, sem toast nem linha de status
/watch show         traz os avisos de volta
/watch off | on     desliga ou liga o mod em todas as conversas
/watch help         lista os comandos
```

Cada agente tem um cartão com mascote e cor, o passo em que está, as duas chamadas anteriores, uma
barra dos tokens dele contra o agente mais pesado e uma estimativa da fatia dele na janela de 5h e
na semana. Os cartões ficam em dois grupos, Rodando e Concluídos; uma barra que vai até a borda do painel
recolhe o grupo. A partir de cinco agentes (opção `compactAt`) cada um vira uma linha em caixa, e
o nome abre o cartão. Um
agente travado tem um botão `investigate` que pergunta sobre ele no prompt.

![agent-watch: o painel /watch, a status line e seus toasts](screenshots/agent-watch.svg)

#### Instalação

```
/plugin install agent-watch --marketplace ice-lfernandes/claude-code-mods
```

Ou para uma sessão, a partir de um clone: `claude --plugin-dir ./agent-watch`.

### test-hud

A status line e o toast aparecem sozinhos cada vez que um test runner roda no Bash. Comandos:

```
/test-hud           abre o painel: última execução, testes que falham (os novos marcados),
                    testes corrigidos, sparkline, últimas 10 execuções
/test-hud demo      adiciona seis execuções falsas que vão de vermelho a verde
/test-hud clear     remove as execuções
/test-hud hide      segue contando, sem linha de status nem toast
/test-hud show      traz os avisos de volta
/test-hud off | on  desliga ou liga o mod em todas as conversas
/test-hud help      lista os comandos
```

No painel, os testes que falham vêm agrupados por arquivo (por classe no Maven e no Gradle, por
suite no jest e no bun, por módulo no cargo; go e rspec seguem em lista plana). O primeiro grupo
vem aberto; clique no cabeçalho para abrir ou fechar. `ver` coloca o arquivo no prompt
(`@src/a.test.ts`), só onde o grupo é um caminho de verdade (vitest, pytest); `rodar` pede só os
testes daquele grupo, com o mesmo runner. Clique num teste que falha para pedir uma correção ao
Claude, ou em `run again` para pedir o mesmo comando: todos colocam o pedido no prompt e não rodam
nada. Clique numa execução da lista para vê-la; testes que falharam, passaram e falharam de novo
são marcados `flaky?`, e um toast os nomeia, uma vez por teste (opção `flakyToast`, ligada por
padrão). Com a opção `keepHistory`, as execuções seguem para a próxima sessão no mesmo projeto.

![test-hud: o painel /test-hud, a status line e o toast verde](screenshots/test-hud.svg)

#### Instalação

```
/plugin install test-hud --marketplace ice-lfernandes/claude-code-mods
```

Ou para uma sessão, a partir de um clone: `claude --plugin-dir ./test-hud`.

### launchpad

O menu aparece sozinho quando uma sessão começa e depois de `/clear`, até o primeiro prompt.
`◆ pad`, sob a linha de dica abaixo do prompt, abre o painel de controle: o modelo e o
esforço da sessão como botões (um clique roda `/model` ou `/effort`; `opus` e `max` ficam
amarelos quando a janela de 5h passa de 70%), e duas abas: Mods, um switchboard com toggle
(`/x on` e `off`) e olho (`/x hide` e `show`) para cada mod desta coleção, e os atalhos. Os
rótulos seguem a opção `language`. Comandos:

```
/pad                                        mostra o menu de novo
/pad panel                                  abre o painel de controle, como o ◆ pad
/pad configuration                          painel para ordenar, remover e adicionar botões, até 8, e os mods para instalar
/pad list                                   cada botão com o que ele roda
/pad add 🔎 Revisão | /code-review          adiciona um botão para um comando, skill ou @agente instalado
/pad remove 3                               remove o botão 3
/pad reset                                  volta aos botões padrão
/pad place header | prompt | pane           onde o menu aparece: sob o cabeçalho, logo acima do prompt ou num painel
/pad hide | show                            esconde o menu ou mostra de novo
/pad off | on                               desliga ou liga o launchpad em todas as conversas
/pad quiet [on | off]                       modo discreto: nenhum mod desenha nada sozinho; um chip na linha de dica traz tudo de volta
```

![launchpad: o menu de boas-vindas sob o cabeçalho, a linha acima do prompt, o ◆ pad e o painel de controle](screenshots/launchpad.svg)

#### Instalação

```
/plugin install launchpad --marketplace ice-lfernandes/claude-code-mods
```

Ou para uma sessão, a partir de um clone: `claude --plugin-dir ./launchpad`.

### plain-view

Fica desligado até você ligar (`/plain-view on`, a opção `enabled` ou o interruptor no painel do
launchpad). Ligado, o transcript mantém a conversa e tira as linhas de tool que deram certo;
uma chamada que falhou ou foi interrompida, o diálogo de permissão e as perguntas do agente
sempre aparecem inteiros. Acima do prompt, um cartão acompanha o pedido: o título, `Passo 2 de
4` com uma barra, uma linha por tarefa da lista do agente com a sua própria barra (`Feito`,
`~40%` no passo atual, `Próximo`, `Depois`). O % do passo atual é uma estimativa pelas chamadas
de tool, por isso o `~`. No fim do turno o cartão fica verde, com o tempo que levou e os
arquivos mudados e lidos, ou cinza no Esc; o próximo pedido começa um novo, e o `[-]` recolhe.
Os agentes a quem o turno principal passa trabalho aparecem numa linha do cartão (`◇ 1 agente
rodando · code-review · 3m 12s`, com o `/watch` do agent-watch quando ele está instalado, e a
mensagem da faixa do agent-watch embaixo: `└ Agentes 0/3 ░░░░░░░░░░ · ▲ Pré-roteiro · Escrevendo
pre-outline.md`), e sem
lista de tarefas o cartão espera por eles (`Esperando 1 agente`). Um turno sem lista que chamou
tools ou agentes termina num cartão verde pequeno (`✓ Pronto`, o tempo, os arquivos e os
agentes); uma conversa simples não deixa cartão.

Três opções mudam o que você vê, todas em `/config`:

- `agentText`, o que fica das mensagens do agente: `final` (padrão: as mensagens escritas antes
  de chamar uma tool saem, a resposta final fica), `none`, `card` (a primeira frase da resposta no cartão do fim)
  ou `all`. Falhas, diálogos de permissão e perguntas do agente sempre aparecem. O thinking do
  agente é desenhado fora do alcance de qualquer mod; `"showThinkingSummaries": false` no
  `~/.claude/settings.json` esconde ele em todo lugar, ctrl+o incluído.
- `askForTasks` (ligada por padrão): uma linha no system prompt pede ao modelo que mantenha uma
  lista de tarefas em trabalho de mais de dois passos, ou um checklist na resposta quando a sessão
  não tem tool de tarefas, para o cartão mostrar cada passo; custa
  alguns tokens por pedido. Quando um checklist no texto para de andar, o cartão diz
  `lista parada` e o modelo recebe um lembrete curto junto de um resultado de tool. Desligada, o cartão lê a lista que o agente mantém sozinho, ou um
  checklist na resposta.
- `request`, quanto de um pedido de várias linhas o título do cartão mostra: `line` (padrão: a
  primeira linha e `+5 linhas`), `joined`, `auto` (a primeira linha de texto corrido) ou `all`. O
  botão `ver pedido` do cartão abre o pedido inteiro.

```
/plain-view                   o painel de configuração: as opções em três abas, um clique cada
/plain-view on | off          mostra ou esconde o cartão e as linhas de tool
/plain-view hide | show       mantém as linhas recolhidas, sem o cartão acima do prompt
/plain-view demo              um plano de exemplo no cartão por 12 segundos
/plain-view palette           as 8 paletas das barras com amostra, e um botão para trocar
/plain-view palette aurora    troca para uma pelo nome
/plain-view help              lista os comandos
```

As barras são um degradê das cores da opção `palette` (padrão `claude`), com um brilho que corre
enquanto o agente trabalha. Cada paleta tem uma versão escura e uma clara, escolhida pelo seu
tema. `animation: off` deixa as barras paradas, nas cores do próprio tema.

![plain-view: o cartão enquanto o agente trabalha, no fim do turno, esperando um agente, e as paletas](screenshots/plain-view.svg)

Quatro cenários curtos, cada um desenhado pelo próprio mod:

**Uma lista de tarefas** ([mp4](screenshots/plain-view-tasks.mp4))

![plain-view: a task list](screenshots/plain-view-tasks.gif)

**Sem ferramenta de tarefas: um checklist na resposta** ([mp4](screenshots/plain-view-checklist.mp4))

![plain-view: no task tool: a checklist in the answer](screenshots/plain-view-checklist.gif)

**Esc interrompe o turno** ([mp4](screenshots/plain-view-interrupted.mp4))

![plain-view: esc interrupts the turn](screenshots/plain-view-interrupted.gif)

**Um agente em segundo plano** ([mp4](screenshots/plain-view-agents.mp4))

![plain-view: a background agent](screenshots/plain-view-agents.gif)

#### Instalação

```
/plugin install plain-view --marketplace ice-lfernandes/claude-code-mods
```

Ou para uma sessão, a partir de um clone: `claude --plugin-dir ./plain-view`.

## Instalação

A seção de cada mod acima tem sua própria linha de instalação. Numa sessão do Claude Code no
terminal:

```
/plugin install limits-meter --marketplace ice-lfernandes/claude-code-mods
```

Responda `y` para adicionar o marketplace e escolha um escopo.

Para testar um mod numa sessão a partir de um clone:

```bash
claude --plugin-dir ./limits-meter
```

## O que cada mod acessa

Um mod roda dentro do Claude Code com as suas permissões e não fica em sandbox. Leia o código
antes de carregá-lo e rode `claude plugin validate <folder>` para listar cada evento em que ele
se conecta e cada chamada que faz.

| Mod | Rede | Roda processos | Arquivos | Chama um modelo | Envia dados para algum lugar |
| --- | --- | --- | --- | --- | --- |
| limits-meter | Não | Não | Não (`on` e `off` gravam a própria opção pelo `/config`) | Só se você ligar o manter-quente: uma mensagem curta por volta do cache, até o seu próximo prompt ou 2 horas | Não |
| allowlist-coach | Não | Não | Lê e grava `.claude/settings.local.json`, ou `.claude/settings.json` quando você escolhe, depois da sua confirmação. `on` e `off` gravam a própria opção pelo `/config` | Não | Não |
| agent-watch | Não | Não | Não (`on` e `off` gravam a própria opção pelo `/config`) | Não | Não |
| test-hud | Não | Não | Lê a cópia salva pelo Bash de uma saída longa demais para mostrar inteira. `on` e `off` gravam a própria opção pelo `/config` | Não | Não |
| launchpad | Não | Não | Lê `.claude/launchpad.json` e os arquivos de agente em `.claude/agents/`, no projeto e na sua pasta home. `on` e `off` gravam a própria opção pelo `/config` | Não | Não |
| plain-view | Não | Não | Não (grava as próprias opções pelo `/config` quando você roda `on`, `off` ou `palette`, ou clica numa delas no painel de configuração) | Não | Não |

## Desenvolvimento

```bash
claude plugin validate ./limits-meter
claude plugin test ./limits-meter
claude plugin validate ./allowlist-coach
claude plugin test ./allowlist-coach
claude plugin validate ./agent-watch
claude plugin test ./agent-watch
claude plugin validate ./test-hud
claude plugin test ./test-hud
claude plugin validate ./launchpad
claude plugin test ./launchpad
claude plugin validate ./plain-view
claude plugin test ./plain-view
```

Cada mod vem com testes, incluindo um teste de render nas superfícies `terminal` e `desktop`.

### Verificações antes de um merge

O GitHub Actions (`.github/workflows/ci.yml`) roda em cada pull request e em cada push na
`main`, sem login no Claude e sem chamada a modelo:

- `claude plugin validate` e `claude plugin test` para cada mod, numa versão fixa do Claude Code;
- `scripts/check-shared.sh`: os arquivos compartilhados são iguais em todos os mods;
- `scripts/check-manifests.py`: todo arquivo JSON é válido, o marketplace lista todos os mods, e o
  nome e a descrição de cada entrada batem com o `plugin.json` do mod;
- `scripts/check-versions.sh <base>`: um mod alterado no pull request subiu a versão, já que o
  Claude Code só atualiza um plugin instalado quando a versão muda;
- os screenshots batem com o que os mods desenham agora (`scripts/screenshots/run.sh`, depois
  nenhum diff);
- `shellcheck` nos scripts.

Rode as mesmas verificações localmente antes de um push:

```bash
./scripts/check-shared.sh
python3 scripts/check-manifests.py
./scripts/check-versions.sh origin/main
./scripts/screenshots/run.sh && git diff --stat screenshots
```

### Helpers compartilhados

Um mod é instalado sozinho e não pode importar código de outro mod. Os helpers de que todo mod
precisa ficam em `hooks/ui.tsx`, testados por `tests/ui.test.ts`, e os dois arquivos são cópias,
iguais em cada mod: idioma e estilo de ícone a partir das opções, um preenchimento de prompt com
o `[blank]` marcado, a janela de uma lista longa, uma linha de verbos clicáveis e os formatos de
número. Nada nele recebe `$`: o engine segue `$` só nas funções do arquivo que o usa, então as
chamadas em `$` ficam no `register.tsx` de cada mod. Um mod que descreve chamadas de ferramenta
também leva `hooks/phrases.ts` e `tests/phrases.test.ts`: uma chamada de ferramenta em poucas
palavras, nos dois idiomas (`lendo routes.ts`, `buscando "fatura"`). Altere uma cópia, copie para
os outros mods e verifique:

```bash
./scripts/check-shared.sh
```

### Layout dos painéis

Todo painel segue o mesmo esboço, a partir do `/pad configuration` do launchpad:

1. Uma dica esmaecida no topo: o que o painel mostra e de onde vêm os números.
2. Seções, cada uma sob um título em negrito.
3. Um estado vazio que indica o próximo passo (`/test-hud demo shows what this looks like`).
4. Um rodapé: os verbos do comando como botões clicáveis (`/test-hud clear · demo · help`), depois
   um botão de fechar.

Um botão que roda algo de fora do mod, ou que desfaz dados da pessoa, coloca o texto no prompt em
vez de rodá-lo.

### Faixas compartilhadas

Vários mods podem desenhar na mesma linha: `AbovePrompt` (limits-meter, plain-view, e o
launchpad com `/pad place prompt`) e `PromptHint` (o `◆ pad` do launchpad). Cada hook `ui.render` ali chama
`next(e)` e empilha a própria linha com o que voltou, nunca no lugar dele, para que a linha de
cada mod apareça:

- `AbovePrompt`: a linha do mod primeiro, depois as linhas dos mods abaixo dele. A exceção é o
  launchpad, cuja linha vai por último para ficar colada na caixa do prompt.
- `PromptHint`: a dica do engine primeiro, depois a linha ou o botão do mod.
- Um mod sem nada para mostrar, ou desligado, devolve `next(e)` como veio.

Fora isso, a ordem entre os mods segue a ordem em que o Claude Code os carrega; um mod não
consegue defini-la.

Depois de uma mudança no que um mod desenha, gere as imagens de novo:

```bash
./scripts/screenshots/run.sh
```

## Mods, skills e agents sob medida

Precisa de um mod, skill ou agent feito para o seu fluxo ou o seu time? Faço trabalhos sob
medida: hooks, painéis, status lines, slash commands, skills e subagents para o Claude Code.

- Email: [lucas.rj.fernandes@gmail.com](mailto:lucas.rj.fernandes@gmail.com)

## YouTube

Meu canal, **Java + AI**: [youtube.com/@JavaPlusAI](https://www.youtube.com/@JavaPlusAI)

## Licença

MIT. Veja [LICENSE](LICENSE).
