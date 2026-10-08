# launchpad

A welcome menu of one-click actions under the Claude Code header, so nobody has to know a
`/command` before they can get something done. Each button runs a command, a skill or an agent
that this session has installed.

![launchpad: the welcome menu under the header, and an agent request waiting in the prompt with its blank marked](../screenshots/launchpad.svg)

- **Shows when a session starts** with an empty conversation, and after `/clear`: a framed card
  under the header, each button an icon and an action in a bordered tile, in columns that fit the
  window. The card is the output of `/pad`, which the mod runs for you, so it sits in the
  conversation and scrolls up as the conversation grows. `/pad` draws a fresh one at any time.
- **Two kinds of button,** told from the text:
  - `/name` runs that command or skill: `🗜️ Compactar conversa` runs `/compact`.
  - `/name [blank]` puts the command in the prompt with the blank marked, for you to fill in and
    send: `/code-review [level]` waits for the level. Arguments with no brackets
    (`/code-review high`) run as written.
  - `@name` calls that agent: `🔍 Explorar código` puts `Use o agente Explore para [tarefa]` in
    the prompt with the blank marked, for you to say what to explore.
- **Only what is installed.** A button shows, and can be added, only when this session has its
  command, skill or agent: the commands and skills Claude Code lists, the built-in agents
  (`general-purpose`, `Explore`, `Plan`) and the agent files in `.claude/agents/` of the project
  and of your home folder. A button whose command another session has (`/limits` comes with
  [limits-meter](../limits-meter/)) stays in your list and shows where it works.
- **A row of /pad's own arguments** under the buttons: `configuration · list · add · remove ·
  reset · off · help`. `configuration` opens the pane, `list` and `help` print as a dim line in
  the conversation (Claude does not read it), `off` turns the menu off. `add`, `remove` and
  `reset` wait in the prompt (`/pad add [nome] | [/comando ou @agente]`), so a stray click changes
  nothing.
- **Up to 8 buttons** that work here. The defaults: compact the chat, see context, see limits,
  resume a chat, edit memory, switch model, explore the code, help.

## Commands

```
/pad                                  show the menu again
/pad configuration                    pane to order, remove and add buttons
/pad list                             every button, numbered, with what it runs
/pad add 🔎 Revisão | /code-review    a button that runs a command or skill
/pad add Revisor | @revisor           a button that calls an agent
/pad remove 3                         drop button 3
/pad reset                            back to the default buttons
/pad off                              turn the menu off: no card at the start, after /clear or on /pad
/pad on                               turn it back on
```

`/pad configuration` (or `/pad config`) opens a pane with your buttons, each with `↑`, `↓` and
`remover`, and below them every installed command, skill and agent not yet in the menu, with a
filter to type into and `+ adicionar` on each. Enter in the filter adds the first match. A
command that takes an argument comes in with it as a blank (`/code-review [level]`), from the hint
Claude Code shows for it in the `/` menu. The mod learns the hints as that menu lists the
commands, so one you have not yet seen there in this session comes in bare: add the blank with
`/pad add`. An optional argument counts too: `/model` added from the pane would wait in the prompt
rather than open the model picker. Once 8
buttons work, the pane says the menu is full until you remove one.

`/pad off` is kept across sessions and hides the cards already in the conversation too. The
other commands and the pane go on working, so you can set the menu up before `/pad on`. The
`showOnStart` option below only stops the card at the start and after `/clear`.

The icon in `/pad add` is optional. It can be any emoji or symbol, or one of the built-in names:
`folder`, `doc`, `pen`, `search`, `compress`, `gauge`, `chart`, `table`, `mail`, `undo`, `spark`,
`brain`, `sliders`, `help`, `agent`, `tool`, `plug`. Your list is kept across sessions.

## Buttons for a whole team

A project can ship its own buttons in `.claude/launchpad.json`:

```json
{
  "buttons": [
    { "icon": "🧾", "label": "Fechamento do mês", "text": "/fechamento" },
    { "icon": "chart", "label": "Revisor", "text": "@revisor" }
  ]
}
```

Each text is a `/command` or an `@agent`, and the button shows only when the session has it.
They show after your own, up to 8 in the menu. Their text comes from the repository, so a project
button never runs a command on its own: a press only puts its text in the prompt, and you read it
before pressing Enter. To remove one, edit the file.

## Options

Set them in `/config` or under `pluginConfigs.launchpad` in settings.

| Option | Values | Default |
| --- | --- | --- |
| `language` | `auto`, `pt-BR`, `en`: the default buttons and the messages. `auto` follows the system's `LANG`: Portuguese for `pt_*`, English otherwise and when `LANG` is unset | `auto` |
| `icons` | `auto`, `emoji`, or `symbol` (`⇲ ▥ ◔`) for terminals that draw emoji at odd widths. `auto` uses symbols in a JetBrains IDE's terminal (IntelliJ, PyCharm, ...: `TERMINAL_EMULATOR=JetBrains-JediTerm`), which gives many emoji one column, and emoji elsewhere | `auto` |
| `showOnStart` | `false` shows the menu only on `/pad` | `true` |

In the desktop app the buttons are native buttons and always use emoji.

## Install

```
/plugin install launchpad --marketplace ice-lfernandes/claude-code-mods
```

Or for one session: `claude --plugin-dir ./launchpad`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| launchpad | No | No | Reads `.claude/launchpad.json`, and the agent files in `.claude/agents/` of the session's folder and of `$HOME` | No | No |

A pressed button does what typing would do: it runs a slash command or fills the prompt box.
Those go through Claude Code and every other mod's hooks as usual, so permission dialogs and other
guards still apply. The mod keeps your list of buttons in its plugin store, on this machine.
