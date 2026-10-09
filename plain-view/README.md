# plain-view

A quiet transcript. The tool rows step aside, and the agent's plan shows as a card above the
prompt: the current step, a bar for the request and one for each task, and a summary when the
turn ends.

![plain-view: the card while the agent works, when the turn ends, and the palettes](../screenshots/plain-view.svg)

- **Off until you turn it on:** `/plain-view on`, the `enabled` option in `/config`, or the
  switch in launchpad's panel (`◆ pad`). The hint line under the prompt ends in `plain view`
  while it is on.
- **Tool rows:** a call that worked draws nothing, its result neither, and a folded run of reads
  and searches neither. A failed or interrupted call draws in full, as Claude Code draws it.
  The permission dialog, the agent's questions (`AskUserQuestion`), its plan (`ExitPlanMode`)
  and its helpers (`Agent`) are never touched.
- **The agent's words** (`agentText`), while the mod is on:

  | Value | What the transcript keeps |
  | --- | --- |
  | `final` (A, default) | Only the turn's final answer. The messages in between (a checklist, `Checking:`) step aside; the answer shows when the turn ends, since Claude Code says which text is final only then |
  | `none` (B) | No message of the agent: your requests and the card |
  | `card` (C) | No message; the end card carries the answer's first sentence (`Answer: …`) until the next request |
  | `all` (D) | Every message, as Claude Code draws it |

  A hidden message stays in the session: ctrl+o shows it, and `all` or `/plain-view off` draw
  it again. Failures, permission dialogs and the agent's questions show in every value.
- **The card**, above the prompt:
  - the request's first line, and the time since it was sent;
  - `Step 2 of 4` with a bar for the whole request and its percentage;
  - one row per task of the agent's list (`TaskCreate`/`TaskUpdate` or `TodoWrite`) with its
    own bar: `Done`, `~40%` on the current step and what it is doing (`reading weather.ts`, a
    shell command's own description, `using the artifact-design skill`),
    `Next`, `Up next`. A list longer than 6 shows the 5 tasks around the current one, with a
    count of the rest;
  - with no task tool, the last checklist the agent writes in its answer (`1. [ ] Read the API`,
    `- [x] Build the page`) is the list;
  - before the agent writes a list: `Understand your request` and `Plan the steps`; with no
    list at all, the tool in flight.
- **Ask for a list** (`askForTasks`, on by default): the agent does not always keep a task list;
  in a live test it wrote its plan as a checklist in its answer. While the mod is on, one line in
  the system prompt asks it to keep one with `TodoWrite` or `TaskCreate` for work of more than two
  steps, so the card shows each step. It costs a few tokens per request, and the model may not
  always follow it. Turn it off in `/config`; the card then reads the list the agent keeps on its
  own, or its checklist.
- **The estimate:** the current step's percentage compares its tool calls with the average of
  the steps already done (4 calls before any), and stops at 95% until the task is marked done.
  It is a guess, hence the `~`. The request's bar counts done steps plus that estimate.
- **When the turn ends:** the card turns green, `✓ All done`, `took 1m 47s`, 100%, and a line
  with the files changed and read (`changed 2 files · read 3 files`). On Esc it turns grey,
  `■ Interrupted`, with the step it left. A turn with no task list leaves no card. The next
  request starts a fresh card; the engine's `[-]` folds it.

```
/plain-view on | off          show or hide the card and the tool rows
/plain-view demo              a sample plan in the card for 15 seconds, even when off
/plain-view palette           the 8 bar palettes with a sample, and a button to switch
/plain-view palette aurora    switch to one by name
/plain-view help              list the commands, with a button for each
```

## Bar colors

The bars and the request's title are a gradient of the `palette` option's colors. While the
agent works a bright cell runs along each bar; the percentages take the color of the bar's end.
Each palette has a dark and a light set: the light one when your theme's name says `light`, the
dark one otherwise. To change it, run `/plain-view palette` and press `use`, run
`/plain-view palette <name>`, or set `palette` in `/config`.

| Palette | Working | Done |
| --- | --- | --- |
| `claude` (default) | terracotta → amber → cream | olive green |
| `clean` | orange → pink → violet | green |
| `sunset` | yellow → orange → red | green |
| `aurora` | teal → blue → violet | teal |
| `ocean` | cyan → blue → indigo | sea green |
| `neon` | hot pink → purple → cyan | neon green |
| `forest` | deep green → leaf → lime | green |
| `calm` | grey → text, no strong color | green |

On the terminal each bar is a grid of colored cells. A terminal without truecolor rounds the
colors to its 256, so the gradient shows in bands. On the desktop app the bars are plain, in the
theme's colors. `animation: off` keeps the bars still, in the theme's colors, with no gradient.

## Settings

Set them in `/config`, or under `pluginConfigs` in `settings.json`.

| Option | Default | What it does |
| --- | --- | --- |
| `enabled` | `false` | Hide the tool rows that worked and show the card |
| `palette` | `claude` | The bar colors: `claude`, `clean`, `sunset`, `aurora`, `ocean`, `neon`, `forest`, `calm` |
| `animation` | `true` | The shine on the bars and the gradient. Off: still bars in theme colors |
| `agentText` | `final` | What stays of the agent's messages: `final` (the final answer), `none`, `card` (the answer's first sentence in the end card), `all` |
| `askForTasks` | `true` | One line in the system prompt asks the model to keep a task list for work of more than two steps. Off: no change to the prompt |
| `language` | `auto` | `auto`, `pt-BR` or `en`. `auto` follows the system's `LANG`: Portuguese for `pt_*`, English otherwise |
| `icons` | `auto` | `emoji` draws the steps as `✅ 🟠 ⚪`, `symbol` as `✓ ● ○`. `auto` uses `symbol` in a JetBrains IDE's terminal and `emoji` elsewhere |

## Install

```
/plugin install plain-view --marketplace ice-lfernandes/claude-code-mods
```

Or for one session: `claude --plugin-dir ./plain-view`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| plain-view | No | No | No | No | No |

It reads the agent's task list and the files it touches from the `tool.call` event, the
request from `turn.start`, and the agent's answer at the end of each step from `turn.step`, for
a checklist. That hook passes every response through unchanged. With `askForTasks` on (the
default), its `prompt.compose` hook adds one line to the system prompt while the mod is on. Under
`agentText` it hides the agent's messages from the drawing only; the session keeps them. Its `tool.call` hook only observes: if it fails, the call goes on, and
nothing after the call can make it run twice. The only thing it writes is its own options
(`enabled`, `palette`) through `$.config.set`, when you run `on`, `off` or `palette`. It keeps
its values in the session's plugin state and nothing across sessions.

While the agent works, the card redraws 10 times a second for the shine. `animation: off` stops
that.
