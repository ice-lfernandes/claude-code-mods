# limits-meter

Plan limits and context above the prompt, in tokens and percent. Never money.

![limits-meter: band above the prompt, the /limits pane and its toasts](../screenshots/limits-meter.svg)

- **Band above the prompt:** the 5-hour and weekly plan windows with their reset times, the
  context window's fill, and the last turn's cache hit rate. Colors follow the theme: warning
  at 70%, error at 90% (the `warnAt` and `dangerAt` options). Below 90 columns each bar
  shrinks to one cell. `details` opens the pane, `hide` hides
  the band, and from 85% context `compact` puts `/compact [focus]` in the prompt, with the
  blank marked: nothing runs until you send it.
- **`/limits`** opens a pane with the same figures at full width, context in tokens
  (`116k of 200k`), and the last main-thread turns that fit, under column heads: input,
  output, cache hit, duration, model. The turn with the most input stands out. Its footer has
  the verbs and a close button. The command runs mid-turn.
  - **Pace:** each window's readings since it last reset draw a line; when that line reaches
    100% before the reset, the pane says so: `at this pace, 5h reaches 100% in ~1h20, before
    it resets`.
  - **Context trend:** a sparkline of the context fill at the end of each turn.
- **Toasts**, once each: a window at 80, 90 and 100% (re-armed when the window resets), and
  context at 85% with a hint to `/compact` (re-armed once it drops below 50%).

```
/limits          open the pane
/limits hide     hide the band above the prompt, in later sessions too
/limits show     bring the band back
/limits help     list the commands
```

## Options

Set them in `/config`, under the plugin.

| Option | Values | Default |
| --- | --- | --- |
| `language` | `auto`, `pt-BR`, `en`. `auto` follows the system's `LANG`: Portuguese for `pt_*`, English otherwise | `auto` |
| `cells` | The band's cells, comma-separated, from `5h`, `wk`, `spend`, `ctx`, `cache`. `all` shows them all | `all` |
| `density` | `auto` sizes the bars to the terminal and shrinks each to one cell (`▁` to `█`) below 90 columns; `bars` always draws 10 cells; `mini` always one; `numbers` no bar | `auto` |
| `warnAt` | Percent from which a window or the context turns to the warning color | `70` |
| `dangerAt` | Percent from which it turns to the error color | `90` |

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
the band is hidden, and which alerts fired). Across sessions it keeps one value in the plugin's
store: whether you hid the band.
