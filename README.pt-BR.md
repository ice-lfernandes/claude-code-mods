# Claude Code mods

[English](README.md) | **Português (Brasil)**

Mods para o dia a dia no Claude Code. Um mod é um plugin do Claude Code feito de function hooks:
ele pode desenhar uma faixa acima do prompt, um painel, uma entrada na status line ou um toast.
Requer Claude Code 2.1.287 ou mais recente.

| Mod | Comando | O que faz |
| --- | --- | --- |
| [limits-meter](limits-meter/) | `/limits` | Limites do plano e contexto acima do prompt: janelas de 5 horas e semanal com horário de reset, ocupação do contexto, taxa de acerto do cache, tokens por turno |
| [allowlist-coach](allowlist-coach/) | `/allowlist` | Conta os diálogos de permissão por regra; depois de 5 aprovações sem nenhuma recusa, oferece adicionar a regra a `permissions.allow`, perguntando antes de gravar |
| [agent-watch](agent-watch/) | `/watch` | Subagentes num relance: tokens por agente, um toast quando um trava e um resumo com o agente mais pesado quando terminam |
| [test-hud](test-hud/) | `/test-hud` | Execuções de teste num relance: aprovados sobre o total na status line, um sparkline das falhas entre execuções, os testes que falham e um toast quando a suíte fica verde |
| [launchpad](launchpad/) | `/pad` | Um menu de ações de um clique sob o cabeçalho, acima do prompt ou num painel: cada botão roda um comando, skill ou agente instalado. `◆ pad` abre um painel de controle: modelo e esforço em um clique, os mods desta coleção, os atalhos. Escolha e ordene até 8 em `/pad configuration`, ou distribua os de um time no repositório |
| [plain-view](plain-view/) | `/plain-view` | Transcript sem ruído: as linhas de tool saem da frente e o plano do agente aparece num cartão acima do prompt, com o passo atual, barras de progresso e um resumo no fim do turno |

## Usando os mods

As imagens abaixo vêm da saída real de cada mod: `scripts/screenshots/run.sh` roda o mod com
dados de exemplo via `claude plugin test` e renderiza o que ele desenhou.

### limits-meter

A faixa aparece sozinha depois da primeira resposta. Comandos:

```
/limits          abre o painel: janelas do plano, contexto em tokens, os últimos 20 turnos
/limits hide     esconde a faixa acima do prompt, também nas próximas sessões
/limits show     traz a faixa de volta
/limits help     lista os comandos
```

A partir de 85% de contexto, a faixa e o painel mostram `compact`, que coloca `/compact [focus]`
no prompt e não roda nada. `details` na faixa abre o painel. O painel também diz quando uma
janela chega a 100% no ritmo atual, antes do reset, e desenha a ocupação do contexto turno a
turno.

![limits-meter: faixa acima do prompt, o painel /limits e seus toasts](screenshots/limits-meter.svg)

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

A status line e os toasts aparecem sozinhos enquanto subagentes rodam. Comandos:

```
/watch              abre o painel: árvore de agentes com tokens, tool calls e o que cada um está fazendo
/watch demo         adiciona três agentes falsos, um deles travado, para ver o painel
/watch clear        remove agentes terminados e de demo
/watch clear done   remove só os agentes terminados
/watch clear demo   remove só os agentes de demo
/watch help         lista os comandos
```

Agentes terminados se recolhem numa linha no painel; clique nela para abri-los. Uma barra mostra
a fatia de tokens de cada agente, o nome abre as últimas tool calls dele, e um agente travado tem
um botão `investigate` que pergunta sobre ele no prompt.

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
/test-hud help      lista os comandos
```

No painel, clique num teste que falha para pedir uma correção ao Claude, ou em `run again` para
pedir o mesmo comando: os dois colocam o pedido no prompt e não rodam nada. Clique numa execução
da lista para vê-la; testes que falharam, passaram e falharam de novo são marcados `flaky?`. Com a
opção `keepHistory`, as execuções seguem para a próxima sessão no mesmo projeto.

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
amarelos quando a janela de 5h passa de 70%), um botão para cada mod desta coleção instalado e
os atalhos. Comandos:

```
/pad                                        mostra o menu de novo
/pad panel                                  abre o painel de controle, como o ◆ pad
/pad configuration                          painel para ordenar, remover e adicionar botões, até 8, e os mods para instalar
/pad list                                   cada botão com o que ele roda
/pad add 🔎 Revisão | /code-review          adiciona um botão para um comando, skill ou @agente instalado
/pad remove 3                               remove o botão 3
/pad reset                                  volta aos botões padrão
/pad place header | prompt | pane           onde o menu aparece: sob o cabeçalho, logo acima do prompt ou num painel
/pad off | on                               desliga o menu ou liga de novo
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
rodando · code-review · 3m 12s`, com o `/watch` do agent-watch quando ele está instalado), e sem
lista de tarefas o cartão espera por eles (`Esperando 1 agente`). Um turno sem lista que chamou
tools ou agentes termina num cartão verde pequeno (`✓ Pronto`, o tempo, os arquivos e os
agentes); uma conversa simples não deixa cartão.

Duas opções mudam o que você vê, as duas em `/config`:

- `agentText`, o que fica das mensagens do agente: `final` (padrão: as mensagens escritas antes
  de chamar uma tool saem, a resposta final fica), `none`, `card` (a primeira frase da resposta no cartão do fim)
  ou `all`. Falhas, diálogos de permissão e perguntas do agente sempre aparecem.
- `askForTasks` (ligada por padrão): uma linha no system prompt pede ao modelo que mantenha uma
  lista de tarefas em trabalho de mais de dois passos, ou um checklist na resposta quando a sessão
  não tem tool de tarefas, para o cartão mostrar cada passo; custa
  alguns tokens por pedido. Desligada, o cartão lê a lista que o agente mantém sozinho, ou um
  checklist na resposta.

```
/plain-view on | off          mostra ou esconde o cartão e as linhas de tool
/plain-view demo              um plano de exemplo no cartão por 12 segundos
/plain-view palette           as 8 paletas das barras com amostra, e um botão para trocar
/plain-view palette aurora    troca para uma pelo nome
/plain-view help              lista os comandos
```

As barras são um degradê das cores da opção `palette` (padrão `claude`), com um brilho que corre
enquanto o agente trabalha. Cada paleta tem uma versão escura e uma clara, escolhida pelo seu
tema. `animation: off` deixa as barras paradas, nas cores do próprio tema.

![plain-view: o cartão enquanto o agente trabalha, no fim do turno, esperando um agente, e as paletas](screenshots/plain-view.svg)

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
| limits-meter | Não | Não | Não | Não | Não |
| allowlist-coach | Não | Não | Lê e grava `.claude/settings.local.json`, ou `.claude/settings.json` quando você escolhe, depois da sua confirmação | Não | Não |
| agent-watch | Não | Não | Não | Não | Não |
| test-hud | Não | Não | Lê a cópia salva pelo Bash de uma saída longa demais para mostrar inteira | Não | Não |
| launchpad | Não | Não | Lê `.claude/launchpad.json` e os arquivos de agente em `.claude/agents/`, no projeto e na sua pasta home | Não | Não |
| plain-view | Não | Não | Não (grava as próprias opções pelo `/config` quando você roda `on`, `off` ou `palette`) | Não | Não |

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

## Licença

MIT. Veja [LICENSE](LICENSE).
