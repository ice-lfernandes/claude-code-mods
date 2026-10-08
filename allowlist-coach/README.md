# allowlist-coach

Counts the permission dialogs you answer, per rule, and offers the rules you keep approving.
It writes nothing until you pick a file to add the rule to in a dialog.

![allowlist-coach: the line under the permission dialog, the toast and the /allowlist pane](../screenshots/allowlist-coach.svg)

- **Under the dialog:** one line with your approvals of that rule in this project toward the
  offer, `●●●○○ 3/5`, and how many are left.
- **Toast**, once per rule: "You approved `Bash(./mvnw test:*)` 5 times here. /allowlist to add
  it to permissions.allow."
- **`/allowlist`** opens a pane with every rule, numbered: ready ones first, then by
  approvals. Each rule shows its status, approvals and refusals (or `●●●○○ 3/5` while it
  counts), and under it the last call that asked and when (`e.g. ./mvnw test -pl core · 12 min
  ago`). A `risky` rule says why: `(runs rm)`, `(the whole tool)`, `(a bare wildcard)`.
  - **Tabs** (`all · ready · counting · refused`, each with its count) and a **filter** that
    matches the rule or the call that asked narrow the list. The numbers stay those of the
    whole list, so `/allowlist allow 3` names the same rule whatever shows. The list scrolls
    with the wheel or `▲ up` / `▼ down`, under a `11–20 of 34` range.
  - **Actions on each rule:** `allow` on a ready rule; `dismiss` and `reset count` on the
    others; `remove from allow` on a rule the coach added.
- **allow asks first, and shows the line it adds.** The answers: add to
  `.claude/settings.local.json` (just you), add to `.claude/settings.json` (shared with the
  team, committed with the code), Not now, or Never offer it. The rest of the file stays as it
  was.
- **remove from allow** asks first, with **Cancel** first, then takes the rule out of the file
  the coach added it to. The rule is then dismissed, so it is not offered again.
- **Commands:** `/allowlist allow 1`, `dismiss 1` and `remove 1` take the pane's number or the
  rule written out. `/allowlist reset 1` sets one rule's count back to zero; `/allowlist reset`
  clears this project's counts. Both ask first, with **Cancel** first, so a stray Enter keeps
  them. `/allowlist help` lists them.
- **The pane's footer** has the same verbs as buttons. `allow`, `dismiss`, `remove` and `reset`
  put the command in the prompt for you to finish and send; `help` answers at once.

## Options

In `/config`:

| Option | Default | What it does |
| --- | --- | --- |
| `language` | `auto` | `pt-BR` or `en` for the pane, the line under the dialog, the questions and the toasts. `auto` follows `LANG`: Portuguese for `pt_*`, English otherwise |
| `threshold` | 5 | Approvals, with no refusal, before a rule is offered: 2 to 20 |

The rule is the one the engine itself suggests for "Yes, and don't ask again" (so
`./mvnw test -Dtest=A` and `./mvnw test -Dtest=B` count as one `Bash(./mvnw test:*)`). When the
engine suggests none, the rule is the exact command, or `WebFetch(domain:<host>)`.

## What it never offers

- A rule you refused even once, however many times you approved it.
- A whole tool (`Bash`, `Edit`, `Write`, `Read`, `WebFetch`) or a bare wildcard (`Bash(*)`,
  `Read(/**)`).
- A command that deletes, escalates, reaches the network or runs arbitrary code: `rm`, `sudo`,
  `chmod`, `curl`, `ssh`, `git push`, `git reset`, `bash -c`, `node`, `… | sh`, `--force`, and
  the like. These are counted and shown as `risky`.
- A rule you already put under `permissions.ask` or `permissions.deny`.
- A rule you dismissed.

Dialogs that a settings hook answered, and decisions made in `auto`, `dontAsk` or
`bypassPermissions` mode, are not counted: they are not your answer.

## Install

```
/plugin install allowlist-coach --marketplace ice-lfernandes/claude-code-mods
```

Or for one session: `claude --plugin-dir ./allowlist-coach`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| allowlist-coach | No | No | Reads and writes `.claude/settings.local.json`, or `.claude/settings.json` when you pick it, after you confirm | No | No |

It keeps the counts in its plugin store, per project root, across sessions: the rule, approvals,
refusals, the last command or path that asked, and when. Up to 200 rules per project. It reads
`LANG` for the `auto` language.
