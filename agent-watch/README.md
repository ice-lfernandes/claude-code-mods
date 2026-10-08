# agent-watch

Subagents at a glance: how many tokens each one used, which one stalled, and which one used
the most once they all finish.

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
  time and the heaviest agent with its share. The pane keeps it as "Last run".
- **Status line** while agents run: `◇ 2 agents · 365k · ⚠ 1 stalled`. It clears when they
  finish.
- **`/watch`** opens the pane. `/watch clear` drops finished agents. `/watch demo` adds three
  fake agents, one of them stalled. The command runs mid-turn.

## Settings

| Option | Default | What it does |
| --- | --- | --- |
| `stallMinutes` | 5 | Minutes of no model request and no tool call before a running agent counts as stalled |

Change it in `/config`, or under `pluginConfigs` in `settings.json`.

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
and `turn.complete` events. Its `agent.spawn` and `tool.call` hooks only observe: if a hook
fails, the spawn or the call goes on. It keeps its values in the session's plugin state and
nothing across sessions.

The `turn.step` hook passes every model response through unchanged to read its usage. That
adds a small cost to each request, main conversation included.
