# Claude Code mods

Mods for everyday Claude Code UX. A mod is a Claude Code plugin made of function hooks: it can
draw a band above the prompt, a pane, a status line entry or a toast. Requires Claude Code
2.1.287 or later.

| Mod | Command | What it does |
| --- | --- | --- |
| [limits-meter](limits-meter/) | `/limits` | Plan limits and context above the prompt: 5-hour and weekly windows with reset times, context fill, cache hit rate, tokens per turn |
| [allowlist-coach](allowlist-coach/) | `/allowlist` | Counts permission dialogs per rule; after 5 approvals with no refusal, offers to add the rule to `permissions.allow`, asking before it writes |
| [agent-watch](agent-watch/) | `/watch` | Subagents at a glance: tokens per agent, a toast when one stalls, and a summary naming the heaviest agent when they finish |
| [test-hud](test-hud/) | `/tests` | Test runs at a glance: passing over total in the status line, a sparkline of failures across runs, the failing tests, and a toast when the suite turns green |
| [launchpad](launchpad/) | `/pad` | A welcome menu of one-click actions under the header: each button runs an installed command, skill or agent. Pick and order up to 8 in `/pad configuration`, or ship a team's in the repository |

## Using the mods

The images below are drawn from each mod's real output: `scripts/screenshots/run.sh` drives the
mod with sample data through `claude plugin test` and renders what it drew.

### limits-meter

The band shows on its own after the first response. Commands:

```
/limits          open the pane: plan windows, context in tokens, the last 20 turns
/limits hide     hide the band above the prompt
/limits show     bring the band back
```

![limits-meter: band above the prompt, the /limits pane and its toasts](screenshots/limits-meter.svg)

### allowlist-coach

It counts on its own each time you answer a permission dialog. Commands:

```
/allowlist                             open the pane: rules ready to allow, then every counted rule
/allowlist allow Bash(./mvnw test:*)   add a rule to permissions.allow (asks first)
/allowlist dismiss Bash(npm run lint)  stop offering a rule
/allowlist reset                       clear this project's counts
```

![allowlist-coach: the line under the permission dialog, the toast and the /allowlist pane](screenshots/allowlist-coach.svg)

### agent-watch

The status line and the toasts show on their own while subagents run. Commands:

```
/watch           open the pane: agent tree with tokens, tool calls and what each one is doing
/watch demo      add three fake agents, one of them stalled, to see the pane
/watch clear     drop finished and demo agents
```

![agent-watch: the /watch pane, the status line and its toasts](screenshots/agent-watch.svg)

### test-hud

The status line and the toast show on their own each time a test runner runs in Bash. Commands:

```
/tests           open the pane: last run, failing tests (new ones marked), sparkline, last 10 runs
/tests demo      add six fake runs that go from red to green
/tests clear     drop the runs
```

![test-hud: the /tests pane, the status line and the green toast](screenshots/test-hud.svg)

### launchpad

The menu shows on its own when a session starts and after `/clear`, until the first prompt.
Commands:

```
/pad                                        show the menu again
/pad configuration                          pane to order, remove and add buttons, up to 8
/pad list                                   every button with what it runs
/pad add 🔎 Revisão | /code-review          add a button for an installed command, skill or @agent
/pad remove 3                               drop button 3
/pad reset                                  back to the defaults
/pad off | on                               turn the menu off or back on
```

![launchpad: the welcome menu under the header, and an agent request waiting in the prompt](screenshots/launchpad.svg)

## Install

In a Claude Code terminal session:

```
/plugin install limits-meter --marketplace ice-lfernandes/claude-code-mods
```

Answer `y` to add the marketplace, then pick a scope.

To try a mod for one session from a clone:

```bash
claude --plugin-dir ./limits-meter
```

## What each mod reaches

A mod runs inside Claude Code with your permissions and is not sandboxed. Read it before you
load it, and run `claude plugin validate <folder>` to list every event it hooks and every call
it makes.

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| limits-meter | No | No | No | No | No |
| allowlist-coach | No | No | Reads and writes `.claude/settings.local.json`, after you confirm | No | No |
| agent-watch | No | No | No | No | No |
| test-hud | No | No | Reads Bash's saved copy of an output too long to show whole | No | No |

## Developing

```bash
claude plugin validate ./limits-meter
claude plugin test ./limits-meter
claude plugin validate ./allowlist-coach
claude plugin test ./allowlist-coach
claude plugin validate ./agent-watch
claude plugin test ./agent-watch
claude plugin validate ./test-hud
claude plugin test ./test-hud
```

Every mod ships tests, including a render test on the `terminal` and `desktop` surfaces.

### Shared helpers

A mod installs alone and cannot import another mod's code. The helpers every mod needs live in
`hooks/ui.tsx`, tested by `tests/ui.test.ts`, and both files are copies, the same in each mod:
language and icon style from the options, a prompt fill with its `[blank]` marked, the window of
a long list, a row of clickable verbs, and the number formats. Nothing in it takes `$`: the
engine follows `$` only into functions of the file that uses it, so the calls on `$` stay in
each mod's `register.tsx`. Change one copy, copy it to the other mods, then check them:

```bash
./scripts/check-shared.sh
```

### Pane layout

Every pane follows the same outline, after launchpad's `/pad configuration`:

1. A dim hint on top: what the pane shows and where the figures come from.
2. Sections, each under a bold heading.
3. An empty state that names the next step (`/tests demo shows what this looks like`).
4. A footer: the command's verbs as clickable buttons (`/tests clear · demo · help`), then a
   close button.

A button that runs something from outside the mod, or undoes the person's data, puts the text in
the prompt instead of running it.

After a change to what a mod draws, regenerate the images:

```bash
./scripts/screenshots/run.sh
```

## License

MIT. See [LICENSE](LICENSE).
