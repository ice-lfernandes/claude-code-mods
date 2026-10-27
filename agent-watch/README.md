# agent-watch

Subagents at a glance: a card for each one with its mascot, its step and its tokens, which one
stalled, and which one used the most once they all finish.

![agent-watch: the /watch pane, the status line and its toasts](../screenshots/agent-watch.svg)

- **Tokens per agent**, counted from the usage of each model request, so the count moves while
  the agent runs. The count is input (uncached, cache read and cache written) plus output. The
  lead row is the main conversation. Tokens from loops that are not agents (compaction, memory)
  show as "other loops".
- **Stall alert:** a running agent with no model request and no tool call for 5 minutes gets
  one toast. The toast says what the agent is stuck on: thinking, a tool call, or nothing.
  When the agent does something again, the alert re-arms. Teammates between turns (`idle`) and
  agents held on their own background work (`waiting`) never count as stalled.
- **Summary:** when the last active agent ends, a toast gives the agents, the tokens, the wall
  time and the heaviest agent with its share. On a subscription, it also says how much of the
  5-hour window the wave used (`Used ~6% of the 5h window`). The pane keeps it as "Last run".
- **Band above the prompt** while agents run: `Agents 2/5`, a gradient bar of how many have
  finished, and what one is doing now (a stalled one first). `open` opens the pane and `hide` is
  `/watch hide`. When the last agent ends it says `✓ 5 agents done · 900k · 1m 54s` until your
  next prompt. It stacks above the other mods' rows, and a survey takes the row. With plain-view
  on and its card showing an agents row, the same message (the progress, the agent in focus, the
  stalled warning and the summary) moves there, as a child of `◇ N agents running`, and the band
  above the prompt goes away. Without plain-view, or with it hidden, off or quiet, the band stays.
  The pane does not change either way.
- **Status line** while agents run: `◇ 2 agents · 365k · ⚠ 1 stalled`. It clears when they
  finish.
- **`/watch`** opens the pane. The top row is the summary: agents, tokens, time, the 5-hour
  window the wave moved (measured) and the week (estimated). Under it the lead row and the
  agents, in two groups, **Running** and **Finished**. Each group has a bar across the pane
  that folds it, and `clear finished` sits at the end of the Finished one. The command runs
  mid-turn.
  - A **card** has the agent's mascot and color (five looks, in the order agents appeared, then
    they start over), its name, type and model, its step (`Step 4 · Writing pre-outline.md`: the
    model requests so far, never "of N", since nothing says how many it will take), the two calls
    before it, a bar of its tokens against the heaviest agent's, and its share of the plan.
    A finished card says `Done · 6 steps`. A call that failed is marked in red.
  - **Share of the plan:** `~1% of the 5h window · ~0.1% of the week` is an estimate. Claude
    Code gives the whole account's windows in whole percents, so the mod splits what a wave
    moved them by between its agents by tokens, at a rate (points per token) it keeps from the
    last ten waves. Until it has seen a wave move a window it shows `—`. Under 1% it says `<1%`;
    the week is given to a tenth. Cache reads weigh less than the plain sum of tokens says, so
    read the tenths as a hint.
  - From `compactAt` agents (five by default) each is one boxed line: mascot, the name as a
    button, what it is doing, and tokens and time at the right edge. Press a name to open its
    card, and `▾ close` to go back. A boxed line takes three rows, so a long list scrolls sooner.
  - A stalled agent has an `investigate` button that puts a request about it in the prompt.
    Nothing stops the agent: Claude Code gives mods no way to.
  - `⇅ by start` switches each group's order to `by tokens` and back. A long list scrolls.
  - On a desktop the mascot is an SVG; on the terminal it is four columns of block characters.
    Both use the colors of your theme (dark or light).

```
/watch              open the pane: a card per agent with step, latest actions and tokens
/watch demo         add three fake agents, one of them stalled
/watch clear        drop finished and demo agents
/watch clear done   drop finished agents only
/watch clear demo   drop demo agents only
/watch hide         keep tracking, with no toast or status line (kept across sessions)
/watch show         bring them back
/watch off | on     turn the mod off or on in every conversation
/watch help         list the commands
```

A cleared agent stays out of the pane even while Claude Code still lists it.

## Settings

Set them in `/config`, or under `pluginConfigs` in `settings.json`.

| Option | Default | What it does |
| --- | --- | --- |
| `enabled` | on | Off keeps only the mod's command, which turns it back on. `/watch on` and `off` change it too |
| `stallMinutes` | 5 | Minutes of no model request and no tool call before a running agent counts as stalled |
| `compactAt` | 5 | With this many agents or more the pane draws one line each |
| `language` | `auto` | `auto`, `pt-BR` or `en`. `auto` follows the system's `LANG`: Portuguese for `pt_*`, English otherwise |
| `icons` | `auto` | `emoji` draws the stall warning as `⚠`, `symbol` as `!`. `auto` uses `symbol` in a JetBrains IDE's terminal and `emoji` elsewhere |

## Install

```
/plugin install agent-watch --marketplace ice-lfernandes/claude-code-mods
```

Or for one session: `claude --plugin-dir ./agent-watch`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| agent-watch | No | No | No | No | No |

It reads agent state through `$.agent.list` and the `agent.spawn`, `turn.step`, `tool.call`
and `turn.complete` events, the plan's windows through `$.session.usage` (at the start of a wave,
while it runs and at its end), and the theme's name through `$.config.list`. Its `agent.spawn`,
`tool.call` and `prompt.submit` hooks only observe: if a hook fails, the spawn, the call or the
prompt goes on. It keeps its values in the session's plugin state. Across
sessions it keeps only the `hide` flag and, for the share-of-the-plan estimate, the tokens and
the points each window moved in its last ten waves (`$.store`); nothing leaves the machine.

It writes the band's message to its own `message` state value, which plain-view reads, and reads
two values of plain-view's (`cardOn` and `agents`, through `$.state.get`) to know whether the
message lives in the card. With plain-view not installed those reads answer nothing and the band
draws as usual.

The `turn.step` hook passes every model response through unchanged to read its usage. That
adds a small cost to each request, main conversation included.
