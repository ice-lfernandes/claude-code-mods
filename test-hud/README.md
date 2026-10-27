# test-hud

Test runs at a glance: how many pass, which ones fail, and whether the count is going down.
The serious cousin of boss-fight: same idea, no boss.

![test-hud: the /test-hud pane, the tests line and the toasts](../screenshots/test-hud.svg)

- **Reads every test run in Bash**, by the lead or a subagent: vitest, jest, pytest, Maven
  (surefire and failsafe), Gradle, cargo, go, bun, mocha, rspec, `claude plugin test`, and
  `npm`, `pnpm` or `yarn` test scripts. The command must start the runner (`./mvnw test`,
  `cd api && npx vitest run`); a command that only mentions one (`grep jest package.json`)
  does not count. Maven runs with `-DskipTests` and Gradle runs with `-x test` do not count.
- **Tests line**, atop the hint line under the prompt: `✗ tests 41/43 · 2 failing ▃▅█▅▂`. That
  is the last run, passing over total (skipped left out), and a sparkline of failures over the
  runner's last 8 runs. `▁` is a green run; `▂` to `█` scale to the most failures in the line. Its
  color says the result: red with at least one failure, yellow with skipped tests
  (`✓ tests 41/41 · 2 skipped`) or a test the command left flaky (`! tests 43/43 · 1 flaky?`),
  green otherwise. Press it to open the pane. It is not the status line: `$.ui.status` takes text
  only, and Claude Code draws every mod's status as a yellow notice.
- **Toast when the suite turns green** after red runs, once: `✓ Tests green: 43/43
  (vitest) after 4 red runs in 12m 05s.` With the `regressionToast` option, also a toast when a runner
  turns red right after a green run.
- **Toast when a test turns flaky:** `! Flaky test: totals > rounds half up (3 runs)`. It failed, passed
  and failed again in the command's last 10 runs. One toast per run, each test named once per
  session (`+N` when several turn at once). It takes the place of the red toast on that run. The
  `flakyToast` option turns it off. Toasts open with a glyph for the state, since a toast cannot be
  colored: `✓` green, `!` flaky, `✗` red.
- **`/test-hud`** opens the pane: the last run with its failing tests by name, the tests
  fixed since the run before, sparklines of failures and duration, and the last 10 runs. The
  command runs mid-turn. The name is not `/tests`, which a user's own skill or command often
  takes.
  - Failing tests are grouped by file: `▾ src/auth.test.ts  2 ✗  show · run`. The first group is
    open; press a header to open or close one, which shows `new` or `flaky?` when closed. `show`
    puts the file in the prompt (`@src/auth.test.ts`) and appears only when the group is a real
    path: vitest and pytest. Other runners group by what the name carries (Maven and Gradle by
    class, jest and bun by suite, cargo by module); the mod never searches the disk for a file.
    go and rspec names carry no group, so that list stays flat. `run` asks for only that group's
    tests, with the same runner as the command that ran.
  - A test that was not failing in the run before is marked `new`. A test that failed, then
    passed, then failed again in the command's last 10 runs is marked `flaky?`.
  - Press a run in the list to see it in the pane; `↩ latest run` goes back.
  - With two runners or more in the session, tabs pick which runner the pane shows.
- **Every press waits in the prompt.** A failing test puts "Investigate and fix the failure in
  ..." there, with the whole command that ran. `run again` asks for the same command, so the
  run goes through Bash and the pane reads it. The footer's `clear` puts `/test-hud clear`
  there too. Nothing runs until you press Enter.
- **Commands:** `/test-hud clear` drops the runs, `/test-hud demo` adds six fake runs that go
  from red to green, `/test-hud hide` drops the tests line and the toasts but keeps counting,
  until `/test-hud show`. `/test-hud off` and `on` turn the mod off or on in every conversation
  (the `enabled` option). `/test-hud help` lists them.

## Options

In `/config`:

| Option | Default | What it does |
| --- | --- | --- |
| `enabled` | on | Off keeps only the mod's command, which turns it back on. `/test-hud on` and `off` change it too |
| `regressionToast` | off | A toast when a runner turns red right after a green run |
| `flakyToast` | on | One toast when a run leaves a test flaky; each test is named once per session |
| `keepHistory` | off | Keep the last runs per project, so the next session in the same project starts with them. Demo runs are not kept |

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
The mod then reads the full output from the file Claude Code saved under `tool-results/`.
When only the output's text names that file, the mod reads it only if it really lands in a
`tool-results/` folder under `~/.claude` (or `CLAUDE_CONFIG_DIR`), since a test can print any
path. It reads no other file. It reads `HOME` and `CLAUDE_CONFIG_DIR` to find that folder. It keeps the last 30 runs in the session's plugin state. Only with
`keepHistory` does it keep them across sessions, in the plugin's store, under the project
root. Its messages and buttons are in English only.

The test runner parser follows boss-fight from
[OneWave-AI/claude-code-mods](https://github.com/OneWave-AI/claude-code-mods) (MIT).
