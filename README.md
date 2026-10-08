# Claude Code mods

Mods for everyday Claude Code UX. A mod is a Claude Code plugin made of function hooks: it can
draw a band above the prompt, a pane, a status line entry or a toast. Requires Claude Code
2.1.287 or later.

| Mod | Command | What it does |
| --- | --- | --- |
| [limits-meter](limits-meter/) | `/limits` | Plan limits and context above the prompt: 5-hour and weekly windows with reset times, context fill, cache hit rate, tokens per turn |
| [allowlist-coach](allowlist-coach/) | `/allowlist` | Counts permission dialogs per rule; after 5 approvals with no refusal, offers to add the rule to `permissions.allow`, asking before it writes |
| [agent-watch](agent-watch/) | `/watch` | Subagents at a glance: tokens per agent, a toast when one stalls, and a summary naming the heaviest agent when they finish |

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

## Developing

```bash
claude plugin validate ./limits-meter
claude plugin test ./limits-meter
claude plugin validate ./allowlist-coach
claude plugin test ./allowlist-coach
claude plugin validate ./agent-watch
claude plugin test ./agent-watch
```

Every mod ships tests, including a render test on the `terminal` and `desktop` surfaces.

After a change to what a mod draws, regenerate the images:

```bash
./scripts/screenshots/run.sh
```

## License

MIT. See [LICENSE](LICENSE).
