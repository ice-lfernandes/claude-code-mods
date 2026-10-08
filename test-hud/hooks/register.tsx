// test-hud: test runs at a glance, the serious cousin of boss-fight.
//
//   runs     every Bash command that starts a known runner (vitest, jest, pytest, maven, gradle,
//            cargo, go, bun, mocha, rspec, an npm test script...) is read for its summary:
//            failed, passed, skipped, and the failing tests by name.
//   status   "✗ tests 41/43 ▃▅█▅▂": the last run and a sparkline of failures over the runner's
//            last 8 runs. ▁ is a green run.
//   toast    when a runner turns green after red runs, once, with how many red runs it took.
//   /tests   opens the pane: the last run, its failing tests (new ones marked), the sparkline and
//            the recent runs. /tests clear drops them; /tests demo seeds a red-to-green streak.
//
// Reads one file: Bash's saved copy of an output too long to show whole, so the summary at its
// end is not lost. Runs no process, calls no model.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { Parsed, Run } from '../types'
import { clip, commandLine, elapsed, fresh, greenText, parseRun, quietPass, record, runnerOf, score, spark, statusText, trail } from './hud'

const PANE = 'test-hud'
const PANE_SPARK = 24
const PANE_RUNS = 10

const runs = atom({ plugin: 'test-hud', key: 'runs' } as const, [] as Run[])

let shownStatus: string | undefined

const show = ($: EngineInterface, list: readonly Run[]) => {
  const text = statusText(list)
  if (text === shownStatus) return
  shownStatus = text
  $.ui.status(text)
}

type BashRecord = { stdout?: string; stderr?: string; interrupted?: boolean; backgroundTaskId?: string; persistedOutputPath?: string }

// The engine's own note when an output is too long to show whole.
const SAVED = /Full output saved to: (\S+\/tool-results\/\S+)/

/** The whole output: the engine's saved copy when Bash cut it short, else what the model read. */
const outputOf = async ($: EngineInterface, ran: ToolCallResult<'Bash'>) => {
  const rec = (ran.isError ? undefined : ran.result) as BashRecord | undefined
  const saved = rec?.persistedOutputPath ?? SAVED.exec(ran.text ?? '')?.[1]
  if (saved) {
    const full = await $.fs.read(saved).catch(() => null)
    if (typeof full === 'string') return full
  }
  return rec?.stdout !== undefined ? `${rec.stdout}\n${rec.stderr ?? ''}` : (ran.text ?? '')
}

const add = async ($: EngineInterface, parsed: Parsed, meta: Omit<Run, keyof Parsed | 'n'>) => {
  let run: Run | undefined
  let list: Run[] = []
  await update($, runs, l => {
    run = { ...parsed, ...meta, n: (l.at(-1)?.n ?? 0) + 1 }
    list = record(l, run)
    return list
  })
  show($, list)
  const green = run && greenText(list, run)
  if (green) $.ui.toast(`${green} /tests`, { timeoutMs: 8000 })
}

const DEMO_NAMES = [
  'src/parse.test.ts > parse > handles empty input',
  'src/parse.test.ts > parse > keeps trailing commas',
  'src/auth.test.ts > session > refreshes an expired token',
  'src/auth.test.ts > session > rejects a revoked token',
  'src/cart.test.ts > totals > rounds half up',
  'src/cart.test.ts > totals > applies the coupon once',
  'src/api.test.ts > routes > returns 404 for unknown ids',
]

const DEMO: readonly { failing: number[]; ms: number }[] = [
  { failing: [0, 1, 2, 3, 4, 5, 6], ms: 14_000 },
  { failing: [0, 1, 2, 3, 6], ms: 12_000 },
  { failing: [0, 1, 2, 3, 6, 4], ms: 13_000 },
  { failing: [2, 3, 6], ms: 11_000 },
  { failing: [6], ms: 12_000 },
  { failing: [], ms: 12_000 },
]

const runDemo = async ($: EngineInterface) => {
  const now = await $.clock.now()
  await update($, runs, l => l.filter(r => !r.isDemo))
  let at = now - 9 * 60_000
  for (const d of DEMO) {
    at += 90_000
    const failures = d.failing.map(i => DEMO_NAMES[i]!)
    await add($, { failed: failures.length, passed: 43 - failures.length, skipped: 1, failures }, { runner: 'vitest', command: 'npm test', endedAt: at, durationMs: d.ms, isDemo: true })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'tests',
      description: 'Test runs: /tests opens the pane; /tests clear drops the runs; /tests demo shows fake ones',
      immediate: true,
    })
    return result
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const runner = runnerOf(e.command)
    if (!runner || e.run_in_background) return next(e)
    const start = await $.clock.now()
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const rec = (ran.isError ? undefined : ran.result) as BashRecord | undefined
    if (rec?.backgroundTaskId || rec?.interrupted) return ran
    const parsed = parseRun(runner, await outputOf($, ran)) ?? (ran.isError ? null : quietPass(runner))
    if (!parsed) return ran
    const end = await $.clock.now()
    await add($, parsed, { runner, command: commandLine(e.command), endedAt: end, durationMs: end - start, ...(e.agentId ? { agentId: e.agentId } : {}) })
    return ran
  }).catch(($, e, next) => next(e)) // an observer: fail open, the call's result stands

  on('command.run', { command: 'tests' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'clear') {
      await update($, runs, () => [])
      show($, [])
      return { text: 'Test runs cleared.' }
    }
    if (arg === 'demo') {
      await runDemo($)
      await $.ui.open({ id: PANE, title: 'Tests' }).catch(() => null)
      return { text: 'Six demo runs added, red to green. /tests clear removes them.' }
    }
    const opened = await $.ui.open({ id: PANE, title: 'Tests' }).catch(() => null)
    if (opened?.isPlaced) return {}
    const list = await read($, runs)
    const r = list.at(-1)
    if (!r) return { text: 'No test runs yet this session.' }
    return { text: `Last run: ${r.runner} ${score(r)}${r.failed ? `, ${r.failed} failed` : ''}. ${spark(trail(list))}${r.failures.length ? ` Failing: ${r.failures.slice(0, 5).join('; ')}.` : ''}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, runs)
    const width = Math.max(40, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)
    const r = list.at(-1)

    if (!r) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text dimColor>No test runs yet this session. Test commands run in Bash show here.</Text>
          <Text dimColor>/tests demo shows what this looks like.</Text>
        </Box>
      )
    }

    const isRed = r.failed > 0
    const counts = [
      r.passed === null ? (isRed ? '' : 'passed, no counts printed') : `${r.passed}/${r.passed + r.failed} passing`,
      isRed ? `${r.failed} failed` : '',
      r.skipped ? `${r.skipped} skipped` : '',
    ].filter(Boolean)
    const line = trail(list, PANE_SPARK)
    const most = Math.max(...line.map(x => x.failed))
    const isNew = fresh(list, r)
    const recent = list.slice(-PANE_RUNS).reverse()

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="column">
          <Text>
            <Text color={isRed ? 'red' : 'green'} bold>{`${isRed ? '✗' : '✓'} ${counts.join(' · ')}`}</Text>
          </Text>
          <Text dimColor>{clip(`${r.runner} · #${r.n} · ${elapsed(r.durationMs)}${r.agentId ? ' · subagent' : ''} · ${r.command}`, width)}</Text>
        </Box>

        <Text>
          <Text color={isRed ? 'red' : 'green'}>{spark(line)}</Text>
          <Text dimColor>{`  failures over the last ${line.length} ${r.runner} run${line.length === 1 ? '' : 's'}${most ? ` (most ${most})` : ''}`}</Text>
        </Text>

        {isRed && (
          <Box flexDirection="column">
            <Text bold>{`Failing${r.failures.length ? ` (${r.failures.length}${r.failures.length < r.failed ? ` of ${r.failed}` : ''})` : ''}`}</Text>
            {r.failures.length === 0 && <Text dimColor>  The output named no failing tests in a shape this mod reads.</Text>}
            {r.failures.map(f => (
              <Text key={f}>
                <Text color="red">{'  ✗ '}</Text>
                <Text>{clip(f, width - 10)}</Text>
                {isNew.has(f) && <Text color="yellow">{'  new'}</Text>}
              </Text>
            ))}
          </Box>
        )}

        <Box flexDirection="column">
          <Text bold>Runs</Text>
          {recent.map(x => (
            <Text key={String(x.n)}>
              <Text dimColor>{`  #${String(x.n).padEnd(4)}`}</Text>
              <Text>{x.runner.padEnd(8)}</Text>
              <Text color={x.failed ? 'red' : 'green'}>{score(x).padEnd(8)}</Text>
              <Text dimColor>{`${elapsed(x.durationMs).padStart(6)}  ${clip(x.command, Math.max(10, width - 34))}${x.agentId ? ' (subagent)' : ''}`}</Text>
            </Text>
          ))}
        </Box>

        <Box gap={2}>
          <Button key="clear" label="clear runs" onPress={() => update($, runs, () => []).then(() => show($, []))} />
        </Box>
      </Box>
    )
  })
}
