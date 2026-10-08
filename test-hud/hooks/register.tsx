// test-hud: test runs at a glance, the serious cousin of boss-fight.
//
//   runs     every Bash command that starts a known runner (vitest, jest, pytest, maven, gradle,
//            cargo, go, bun, mocha, rspec, an npm test script...) is read for its summary:
//            failed, passed, skipped, and the failing tests by name.
//   status   "✗ tests 41/43 ▃▅█▅▂": the last run and a sparkline of failures over the runner's
//            last 8 runs. ▁ is a green run.
//   toasts   when a runner turns green after red runs, once, with how many red runs it took;
//            with the `regressionToast` option, also when it turns red after a green run.
//   /test-hud  opens the pane: the last run, its failing tests (new ones marked), the tests it
//            fixed, the sparkline and the recent runs. A failing test is a button that asks for
//            a fix in the prompt; `run again` puts the command there. Nothing runs on a press.
//            /test-hud clear drops the runs; /test-hud demo seeds a red-to-green streak.
//
// Reads one file: Bash's saved copy of an output too long to show whole, so the summary at its
// end is not lost. Runs no process, calls no model.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import type { Parsed, Run } from '../types'
import { commandLine, fixed, fresh, greenText, parseRun, quietPass, record, redText, runnerOf, score, spark, statusText, trail, wholeCommand } from './hud'
import type { Lang, Verb } from './ui'
import { clip, elapsed, fillArgs, langOf, linesOf, verbRow } from './ui'
import { COMMAND, WORDS } from './words'

const PANE = 'test-hud'
const PANE_SPARK = 24
const PANE_RUNS = 10

const runs = atom({ plugin: 'test-hud', key: 'runs' } as const, [] as Run[])

let shownStatus: string | undefined
// Set by register from the options, and by session.start from the system's LANG.
let lang: Lang = 'en'
let regressionToast = false

const show = ($: EngineInterface, list: readonly Run[]) => {
  const text = statusText(list, lang)
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
  if (!run) return
  const green = greenText(list, run, lang)
  if (green) $.ui.toast(`${green} /${COMMAND}`, { timeoutMs: 8000 })
  const red = regressionToast ? redText(list, run, lang) : null
  if (red) $.ui.toast(`${red} /${COMMAND}`, { timeoutMs: 8000 })
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
    await add($, { failed: failures.length, passed: 43 - failures.length, skipped: 1, failures }, { runner: 'vitest', command: 'npm test', fullCommand: 'npm test', endedAt: at, durationMs: d.ms, isDemo: true })
  }
}

const open = ($: EngineInterface) => $.ui.open({ id: PANE, title: WORDS[lang].pane }).catch(() => null)

/** /test-hud and its arguments: what the command answers, and what the pane's verbs run. */
const runCommand = async ($: EngineInterface, args: string): Promise<{ text?: string }> => {
  const w = WORDS[lang]
  switch (args.trim().toLowerCase()) {
    case 'clear':
      await update($, runs, () => [])
      show($, [])
      return { text: w.cleared }
    case 'demo':
      await runDemo($)
      await open($)
      return { text: w.demoAdded }
    case 'help':
      return { text: w.help }
    case '': {
      const opened = await open($)
      if (opened?.isPlaced) return {}
      const list = await read($, runs)
      const r = list.at(-1)
      if (!r) return { text: w.noRuns }
      return { text: `${w.lastRun(r.runner, score(r, lang), r.failed)} ${spark(trail(list))}${r.failures.length ? ` ${w.failingList(r.failures.slice(0, 5).join('; '))}` : ''}` }
    }
    default:
      return { text: w.help }
  }
}

/** Puts a text in the prompt for the person to send; runs nothing. */
const fill = async ($: EngineInterface, text: string) => {
  await $.prompt.fill(fillArgs(text))
}

/** The pane's verbs: clear drops the person's runs, so it waits in the prompt. */
const VERBS: readonly Verb[] = [{ verb: 'clear', fill: `/${COMMAND} clear` }, { verb: 'demo' }, { verb: 'help' }]

/** A verb pressed in the pane: fills the prompt, or runs and writes its answer to the transcript. */
const pressVerb = async ($: EngineInterface, v: Verb) => {
  try {
    if (v.fill) return await fill($, v.fill)
    const { text } = await runCommand($, v.verb)
    for (const line of linesOf(text)) $.ui.log(line)
  } catch {
    $.ui.toast(WORDS[lang].failedToRun(`/${COMMAND} ${v.verb}`))
  }
}

export const register: Register = (on, options) => {
  lang = langOf(options.language)
  regressionToast = options.regressionToast === true

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = langOf(options.language, await $.env.get('LANG').catch(() => undefined))
    await $.command.register({
      name: COMMAND,
      description: WORDS[lang].description,
      argumentHint: '[clear|demo|help]',
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
    await add($, parsed, {
      runner,
      command: commandLine(e.command),
      fullCommand: wholeCommand(e.command),
      endedAt: end,
      durationMs: end - start,
      ...(e.agentId ? { agentId: e.agentId } : {}),
    })
    return ran
  }).catch(($, e, next) => next(e)) // an observer: fail open, the call's result stands

  on('command.run', { command: COMMAND }, ($, e) => runCommand($, e.args))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const w = WORDS[lang]
    const list = await read($, runs)
    const width = Math.max(40, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)
    const r = list.at(-1)
    const footer = (
      <Box flexDirection="row" flexWrap="wrap" gap={2}>
        {verbRow({ Box, Text, Button }, COMMAND, VERBS, v => pressVerb($, v))}
        <Button key="close" role="dismiss" label={w.close} onPress={() => $.ui.close({ id: PANE })} />
      </Box>
    )

    if (!r) {
      return (
        <Box flexDirection="column" paddingX={1} gap={1}>
          <Box flexDirection="column">
            <Text dimColor>{w.empty}</Text>
            <Text dimColor>{w.emptyNext}</Text>
          </Box>
          {footer}
        </Box>
      )
    }

    const isRed = r.failed > 0
    const counts = [
      r.passed === null ? (isRed ? '' : w.passedNoCounts) : w.passing(r.passed, r.passed + r.failed),
      isRed ? w.failed(r.failed) : '',
      r.skipped ? w.skipped(r.skipped) : '',
    ].filter(Boolean)
    const line = trail(list, PANE_SPARK)
    const most = Math.max(...line.map(x => x.failed))
    const isNew = fresh(list, r)
    const gone = fixed(list, r)
    const recent = list.slice(-PANE_RUNS).reverse()
    const tone = isRed ? 'error' : 'success'

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text dimColor>{w.hint}</Text>

        <Box flexDirection="column">
          <Text color={tone} bold>{`${isRed ? '✗' : '✓'} ${counts.join(' · ')}`}</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={2}>
            <Text dimColor>{clip(`${r.runner} · #${r.n} · ${elapsed(r.durationMs)}${r.agentId ? ` · ${w.subagent}` : ''} · ${r.command}`, width - w.runAgain.length - 2)}</Text>
            <Button key="rerun" plain label={w.runAgain} onPress={() => fill($, w.rerun(r.fullCommand))} />
          </Box>
        </Box>

        <Text>
          <Text color={tone}>{spark(line)}</Text>
          <Text dimColor>{`  ${w.sparkNote(line.length, r.runner, most)}`}</Text>
        </Text>

        {isRed && (
          <Box flexDirection="column">
            <Text bold>{w.failing(r.failures.length, r.failed)}</Text>
            {r.failures.length === 0 && <Text dimColor>{`  ${w.noNames}`}</Text>}
            {r.failures.map(f => (
              <Box key={`fail:${f}`} flexDirection="row">
                <Text color="error">{'  ✗ '}</Text>
                <Button key={`fix:${f}`} plain label={clip(f, width - 12)} onPress={() => fill($, w.askFix(f, r.fullCommand))} />
                {isNew.has(f) && <Text color="warning">{`  ${w.isNew}`}</Text>}
              </Box>
            ))}
          </Box>
        )}

        {gone.length > 0 && (
          <Box flexDirection="column">
            <Text bold>{w.fixed(gone.length)}</Text>
            {gone.map(f => (
              <Text key={`fixed:${f}`}>
                <Text color="success">{'  ✓ '}</Text>
                <Text>{clip(f, width - 6)}</Text>
              </Text>
            ))}
          </Box>
        )}

        <Box flexDirection="column">
          <Text bold>{w.runs}</Text>
          {recent.map(x => (
            <Text key={String(x.n)}>
              <Text dimColor>{`  #${String(x.n).padEnd(4)}`}</Text>
              <Text>{x.runner.padEnd(8)}</Text>
              <Text color={x.failed ? 'error' : 'success'}>{score(x, lang).padEnd(8)}</Text>
              <Text dimColor>{`${elapsed(x.durationMs).padStart(6)}  ${clip(x.command, Math.max(10, width - 34))}${x.agentId ? ` (${w.subagent})` : ''}`}</Text>
            </Text>
          ))}
        </Box>

        {footer}
      </Box>
    )
  })
}
