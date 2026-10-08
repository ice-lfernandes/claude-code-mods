# limits-meter

Plan limits and context above the prompt, in tokens and percent. Never money.

![limits-meter: band above the prompt, the /limits pane and its toasts](../screenshots/limits-meter.svg)

- **Band above the prompt:** the 5-hour and weekly plan windows with their reset times, the
  context window's fill, and the last turn's cache hit rate. Colors follow the theme: warning
  at 70%, error at 90%. Bars drop on narrow terminals. `details` opens the pane, `hide` hides
  the band, and from 85% context `compact` puts `/compact [focus]` in the prompt, with the
  blank marked: nothing runs until you send it.
- **`/limits`** opens a pane with the same figures at full width, context in tokens
  (`116k of 200k`), and the last main-thread turns that fit: input, output, cache hit,
  duration, model. Its footer has the verbs and a close button. The command runs mid-turn.
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
