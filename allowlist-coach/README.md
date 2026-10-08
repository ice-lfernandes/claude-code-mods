# allowlist-coach

Counts the permission dialogs you answer, per rule, and offers the rules you keep approving.
It writes nothing until you pick **Add** in a dialog.

![allowlist-coach: the line under the permission dialog, the toast and the /allowlist pane](../screenshots/allowlist-coach.svg)

- **Under the dialog:** one line with your approvals of that rule in this project toward the
  offer, `●●●○○ 3/5`, and how many are left.
- **Toast**, once per rule: "You approved `Bash(./mvnw test:*)` 5 times here. /allowlist to add
  it to permissions.allow."
- **`/allowlist`** opens a pane with every rule, numbered: rules ready to allow first, each
  with **allow** and **dismiss** buttons, then every other rule with its approvals, refusals
  and status. Under each rule, the last call that asked and when (`e.g. ./mvnw test -pl core ·
  12 min ago`). When the rules do not fit, the pane says how many were left out. **allow** asks
  you first (Add, Not now, Never offer it), then adds the rule to `permissions.allow` in
  `.claude/settings.local.json` under the project root, keeping the rest of the file as it was.
- **Commands:** `/allowlist allow 1` and `/allowlist dismiss 1` take the pane's number or the
  rule written out. `/allowlist reset` clears this project's counts after you pick **Clear**;
  **Cancel** comes first, so a stray Enter keeps them. `/allowlist help` lists them.
- **The pane's footer** has the same verbs as buttons. `allow`, `dismiss` and `reset` put the
  command in the prompt for you to finish and send; `help` answers at once.

## Options

In `/config`:

| Option | Default | What it does |
| --- | --- | --- |
| `language` | `auto` | `pt-BR` or `en` for the pane, the line under the dialog, the questions and the toasts. `auto` follows `LANG`: Portuguese for `pt_*`, English otherwise |

The rule is the one the engine itself suggests for "Yes, and don't ask again" (so
`./mvnw test -Dtest=A` and `./mvnw test -Dtest=B` count as one `Bash(./mvnw test:*)`). When the
engine suggests none, the rule is the exact command, or `WebFetch(domain:<host>)`.

## What it never offers

- A rule after 5 approvals if you refused it even once.
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
| allowlist-coach | No | No | Reads and writes `.claude/settings.local.json`, after you confirm | No | No |

It keeps the counts in its plugin store, per project root, across sessions: the rule, approvals,
refusals, the last command or path that asked, and when. Up to 200 rules per project. It reads
`LANG` for the `auto` language.
