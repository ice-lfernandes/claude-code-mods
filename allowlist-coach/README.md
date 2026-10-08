# allowlist-coach

Counts the permission dialogs you answer, per rule, and offers the rules you keep approving.
It writes nothing until you pick **Add** in a dialog.

```
Ready to allow
✓  14  Bash(./mvnw test:*)                      [ allow ]  dismiss

Counted
counting   ✓  3 ✗  0  WebFetch(domain:docs.spring.io)
refused    ✓  6 ✗  1  Bash(docker compose up -d)
risky      ✓  9 ✗  0  Bash(rm -rf target)
```

- **Under the dialog:** one line with how often you approved that rule in this project, and
  how many approvals are left before it is offered.
- **Toast**, once per rule: "You approved `Bash(./mvnw test:*)` 5 times here. /allowlist to add
  it to permissions.allow."
- **`/allowlist`** opens a pane: rules ready to allow first, each with **allow** and **dismiss**
  buttons, then every other rule with its approvals, refusals and status. **allow** asks you
  first (Add, Not now, Never offer it), then adds the rule to `permissions.allow` in
  `.claude/settings.local.json` under the project root, keeping the rest of the file as it was.
- Where no pane opens: `/allowlist allow <rule>`, `/allowlist dismiss <rule>`,
  `/allowlist reset` (clears this project's counts).

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
refusals, the last command or path that asked, and when. Up to 200 rules per project.
