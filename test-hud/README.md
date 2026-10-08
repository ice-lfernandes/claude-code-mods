# test-hud

Test runs at a glance: how many pass, which ones fail, and whether the count is going down.
The serious cousin of boss-fight: same idea, no boss.

![test-hud: the /test-hud pane, the status line and the green toast](../screenshots/test-hud.svg)

- **Reads every test run in Bash**, by the lead or a subagent: vitest, jest, pytest, Maven
  (surefire and failsafe), Gradle, cargo, go, bun, mocha, rspec, `claude plugin test`, and
  `npm`, `pnpm` or `yarn` test scripts. The command must start the runner (`./mvnw test`,
  `cd api && npx vitest run`); a command that only mentions one (`grep jest package.json`)
  does not count. Maven runs with `-DskipTests` and Gradle runs with `-x test` do not count.
- **Status line:** `✗ tests 41/43 ▃▅█▅▂`. That is the last run, passing over total (skipped
  left out), and a sparkline of failures over the runner's last 8 runs. `▁` is a green run;
  `▂` to `█` scale to the most failures in the line.
- **Toast when the suite turns green** after red runs, once: `Tests green: 43/43 (vitest)
  after 4 red runs in 12m 05s.` With the `regressionToast` option, also a toast when a runner
  turns red right after a green run.
- **`/test-hud`** opens the pane: the last run with its failing tests by name (tests that were
  not failing in the run before are marked `new`), the tests fixed since the run before, a
  longer sparkline, and the last 10 runs. The command runs mid-turn. The name is not `/tests`,
  which a user's own skill or command often takes.
- **Every press waits in the prompt.** A failing test puts "Investigate and fix the failure in
  ..." there, with the whole command that ran. `run again` asks for the same command, so the
  run goes through Bash and the pane reads it. The footer's `clear` puts `/test-hud clear`
  there too. Nothing runs until you press Enter.
- **Commands:** `/test-hud clear` drops the runs, `/test-hud demo` adds six fake runs that go
  from red to green, `/test-hud help` lists them.

## Options

In `/config`:

| Option | Default | What it does |
| --- | --- | --- |
| `language` | `auto` | `pt-BR` or `en` for the pane, the status line and the toasts. `auto` follows `LANG`: Portuguese for `pt_*`, English otherwise |
| `regressionToast` | off | A toast when a runner turns red right after a green run |

Counts come from the runner's own summary line. Failing test names come from the runner's
failure lines, at most 20 per run. For mocha the mod reads counts only, no names. Gradle
prints counts only when a test fails, and Maven prints none with `-q`: a successful run of
either shows as green with no counts (`✓ tests pass`). A run that ends with no summary (a
compile error, a missing script) is not recorded.

## Install

```
/plugin install test-hud --marketplace ice-lfernandes/claude-code-mods
```

Or for one session: `claude --plugin-dir ./test-hud`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| test-hud | No | No | Reads Bash's saved copy of an output too long to show whole | No | No |

It reads the Bash calls through the `tool.call` event, after they run. The hook only
observes: it never changes a command or its result, and if it fails, the result stands.
When an output is too long for Claude Code to show whole, the summary at its end is cut off.
The mod then reads the full output from the file Claude Code saved under `tool-results/`. It
reads no other file. It keeps the last 30 runs in the session's plugin state and nothing
across sessions. It reads `LANG` for the `auto` language.

The test runner parser follows boss-fight from
[OneWave-AI/claude-code-mods](https://github.com/OneWave-AI/claude-code-mods) (MIT).
