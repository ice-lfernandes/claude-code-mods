# limits-meter

Plan limits and context above the prompt, in tokens and percent. Never money.

![limits-meter: band above the prompt, the /limits pane and its toasts](../screenshots/limits-meter.svg)

- **Band above the prompt:** the 5-hour and weekly plan windows with their reset times, the
  context window's fill, and the last turn's cache hit rate. Colors turn yellow at 70% and red
  at 90%. Bars drop on narrow terminals.
- **`/limits`** opens a pane with the same figures at full width, context in tokens
  (`116k of 200k`), and the last 20 main-thread turns: input, output, cache hit, duration,
  model. `/limits hide` and `/limits show` toggle the band. The command runs mid-turn.
- **Toasts**, once each: a window at 80, 90 and 100% (re-armed when the window resets), and
  context at 85% with a hint to `/compact` (re-armed once it drops below 50%).

Figures come from the engine's `session.measure` event, pushed after each turn, so nothing
polls. Plan windows appear on a subscription after the first response; with an API key the band
shows context only.

## Install

```
/plugin install limits-meter --marketplace ice-lfernandes/claude-code-mods
```

Or for one session: `claude --plugin-dir ./limits-meter`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| limits-meter | No | No | No | No | No |

It stores four values in the session's plugin state (the latest figures, recent turns, whether
the band is hidden, and which alerts fired) and nothing across sessions.
