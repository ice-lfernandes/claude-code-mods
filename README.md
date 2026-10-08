# Claude Code mods

Mods for everyday Claude Code UX. A mod is a Claude Code plugin made of function hooks: it can
draw a band above the prompt, a pane, a status line entry or a toast. Requires Claude Code
2.1.287 or later.

| Mod | Command | What it does |
| --- | --- | --- |
| [limits-meter](limits-meter/) | `/limits` | Plan limits and context above the prompt: 5-hour and weekly windows with reset times, context fill, cache hit rate, tokens per turn |
| [allowlist-coach](allowlist-coach/) | `/allowlist` | Counts permission dialogs per rule; after 5 approvals with no refusal, offers to add the rule to `permissions.allow`, asking before it writes |

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

## Developing

```bash
claude plugin validate ./limits-meter
claude plugin test ./limits-meter
claude plugin validate ./allowlist-coach
claude plugin test ./allowlist-coach
```

Every mod ships tests, including a render test on the `terminal` and `desktop` surfaces.

## License

MIT. See [LICENSE](LICENSE).
