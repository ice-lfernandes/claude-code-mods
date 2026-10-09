# limits-meter

Plan limits and context above the prompt, in tokens and percent. Never money.

![limits-meter: band above the prompt, the /limits pane and its toasts](../screenshots/limits-meter.svg)

- **Band above the prompt:** the main thread's model, in the accent color, and its effort as a
  five-step gauge, `opus 5.5 ▰▰▰▱▱ high` (low to max, `max` in the warning color),
  the 5-hour and weekly plan windows with their reset times, the context window's fill, and
  the last turn's cache hit rate. With `format: compact` it is one line of numbers:
  `sonnet 5.5 ▰▰▰▱▱ high · ctx 8% · 5h 34% · wk 31%`. The effort comes from each request, else
  the turn's end on the main thread, else `/config` at the start; a weaker source never
  overwrites a stronger one, so the band does not flip between `max` and its downgrade.
  Colors follow the theme: warning at 70%, error at 90% (the `warnAt` and `dangerAt` options).
  Below 90 columns each bar shrinks to one cell. `details` opens the pane, `hide` hides the
  band, and from 85% context `compact` puts `/compact [focus]` in the prompt, with the
  blank marked: nothing runs until you send it.
- **`/limits`** opens a pane with the same figures at full width, context in tokens
  (`116k of 200k`), and the last main-thread turns that fit, under column heads: input,
  output, cache hit, duration, model. The turn with the most input stands out. Its footer has
  the verbs and a close button. The command runs mid-turn.
  - **Pace:** each window's readings since it last reset draw a line; when that line reaches
    100% before the reset, the pane says so: `at this pace, 5h reaches 100% in ~1h20, before
    it resets`.
  - **Context trend:** a sparkline of the context fill at the end of each turn.
  - **Model** and its effort gauge.
  - **Costly switch warning:** the threshold for the toast below, `50% · 60% · 70% · 80% ·
    90%`, one click each; the choice is kept for later sessions.
- **Toasts**, once each: a window at 80, 90 and 100% (re-armed when the window resets), and
  context at 85% with a hint to `/compact` (re-armed once it drops below 50%). And once per
  costly switch, a model up `haiku < sonnet < opus < fable` or effort turning to `max`, with
  the 5-hour window at the threshold or more (70% by default):
  - `5h at 82%: at this pace the window runs out in ~18 min · /limits`, from the window's
    readings since the first of the last 3 turns started;
  - `5h at 85%: resets in 12m, before it runs out · /limits` when the window resets first;
  - `5h at 82%: opus uses the window faster · /limits` with fewer than 3 turns, no number.

  The effort is read as each request goes out, so the `max` warning comes with the first
  request after `/effort max`. A resumed session's model is no switch. The pace comes from
  turns at the previous model, so right after a switch it tends to be optimistic. If the hook
  fails, the switch goes on (fail-open): it is a warning, not a guard.

```
/limits          open the pane
/limits hide     hide the band above the prompt, in later sessions too
/limits show     bring the band back
/limits warn N   warn on a costly switch with the 5-hour window from N%, 1 to 100 (default 70)
/limits help     list the commands
```

## Options

Set them in `/config`, under the plugin.

| Option | Values | Default |
| --- | --- | --- |
| `language` | `auto`, `pt-BR`, `en`. `auto` follows the system's `LANG`: Portuguese for `pt_*`, English otherwise | `auto` |
| `format` | `full` draws the band with bars; `compact` one line of numbers: model · effort · ctx · 5h · wk | `full` |
| `cells` | The band's cells, comma-separated, from `model`, `5h`, `wk`, `spend`, `ctx`, `cache`. `all` shows them all | `all` |
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

It stores these values in the session's plugin state: the latest figures, recent turns, whether
the band is hidden, which alerts fired, each window's readings for the pace, the model, the
effort and the costly-switch threshold. Across sessions it keeps two values in the plugin's
store: whether you hid the band, and the costly-switch threshold.
