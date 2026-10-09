// limits-meter: plan limits and context, above the prompt and in a pane.
//
//   band   AbovePrompt: the main thread's model and effort, 5-hour and weekly windows with reset
//          times, context fill, last turn's cache hit rate. Tokens and percent only, never money.
//          `details` opens the pane, `hide` hides the band, and from 85% context `compact` puts
//          /compact in the prompt. The `format`, `cells`, `density`, `warnAt` and `dangerAt`
//          options shape it; below 90 columns each bar shrinks to one cell, and `format: compact`
//          draws one line of numbers.
//   pace   each window's readings since its reset; when their pace reaches 100% before the
//          reset, the pane says when.
//   /limits  opens a pane with the same figures at full width and the last turns' tokens;
//          /limits hide | show toggles the band, and the choice is kept across sessions.
//   toasts once per threshold: a window at 80, 90 and 100%, context at 85%. And once per costly
//          switch (a model up haiku < sonnet < opus < fable, or effort turning to max) with the
//          5-hour window at /limits warn N or more (70 by default): the minutes left at the pace
//          of the last 3 turns, or when the window resets first, or no number without a pace.
//
// Figures come from `session.measure` (pushed by the engine after each turn and when a window
// moves a point), so nothing polls. Reads nothing from disk, runs no process, calls no model.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Samples, Snapshot, Turn } from '../types'
import type { Setting } from './meter'
import { addSamples, alerts, bar, contextSpark, heaviest, label, mini, needsCompact, pace, pct, resetIn, summary, switchWarning, toSnapshot, toTurn, tone as toneOf, TURNS_KEPT } from './meter'
import type { Lang, Verb } from './ui'
import { fillArgs, langOf, linesOf, shortModel, tokens, verbRow } from './ui'
import { COMMAND, WORDS } from './words'

const PANE = 'limits'
const KEY_HIDDEN = 'hidden'
const KEY_SWITCH = 'switchWarnAt'
const SWITCH_AT = 70
/** The thresholds the pane offers for the costly-switch toast; /limits warn takes any 1 to 100. */
const SWITCH_CHOICES = [50, 60, 70, 80, 90]

const EMPTY: Snapshot = { limits: [], contextPercent: null, contextTokens: null, contextWindow: 0 }

const snapshot = atom({ plugin: 'limits-meter', key: 'snapshot' } as const, EMPTY)
const turns = atom({ plugin: 'limits-meter', key: 'turns' } as const, [] as Turn[])
const isHidden = atom({ plugin: 'limits-meter', key: 'isHidden' } as const, false)
const fired = atom({ plugin: 'limits-meter', key: 'fired' } as const, [] as string[])
const samples = atom({ plugin: 'limits-meter', key: 'samples' } as const, {} as Samples)
const model = atom({ plugin: 'limits-meter', key: 'model' } as const, null as string | null)
const effort = atom({ plugin: 'limits-meter', key: 'effort' } as const, null as string | number | null)
const switchAt = atom({ plugin: 'limits-meter', key: 'switchAt' } as const, SWITCH_AT)

// Set by register from the options, and by session.start from the system's LANG.
let lang: Lang = 'en'
let warnAt = 70
let dangerAt = 90
/** The band's cells by id (5h, wk, spend, ctx, cache); null shows them all. */
let cells: Set<string> | null = null
let density: 'auto' | 'bars' | 'mini' | 'numbers' = 'auto'
/** `full`, the band with bars, or `compact`, one line of numbers. */
let format: 'full' | 'compact' = 'full'

const tone = (percent: number | null) => toneOf(percent, warnAt, dangerAt)

const CELL_IDS: Record<string, string> = { five_hour: '5h', seven_day: 'wk', spend_limit: 'spend' }
const shows = (id: string) => cells === null || cells.has(id)

/** The `cells` option: names from model, 5h, wk, spend, ctx, cache, comma-separated; `all` or nothing known shows them all. */
const cellsOf = (option: unknown): Set<string> | null => {
  const names = String(option ?? '')
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(n => ['model', '5h', 'wk', 'spend', 'ctx', 'cache'].includes(n))
  return names.length ? new Set(names) : null
}

/** Bar cells for the band: by the terminal's width on `auto`, 0 for one cell, -1 for none. */
const barWidth = (columns: number) =>
  density === 'bars' ? 10 : density === 'mini' ? 0 : density === 'numbers' ? -1 : columns >= 120 ? 10 : columns >= 90 ? 6 : 0

const take = async ($: EngineInterface, next: Snapshot) => {
  await update($, snapshot, () => next)
  const now = await $.clock.now()
  await update($, samples, list => addSamples(list, next, now))
  const result = alerts(next, await read($, fired), now, lang)
  if (result.raised.length === 0) return
  await update($, fired, () => result.fired)
  for (const a of result.raised) $.ui.toast(a.text, { timeoutMs: 8000 })
}

/** Hides or shows the band, and keeps the choice for later sessions. */
const setHidden = async ($: EngineInterface, hidden: boolean) => {
  await update($, isHidden, () => hidden)
  await $.store.set(KEY_HIDDEN, hidden)
}

/** Sets the costly-switch threshold, and keeps it for later sessions. */
const setSwitchAt = async ($: EngineInterface, percent: number) => {
  await update($, switchAt, () => percent)
  await $.store.set(KEY_SWITCH, percent)
}

/** A costly switch with the 5-hour window at the threshold or more raises one toast. */
const warnIfCostly = async ($: EngineInterface, from: Setting, to: Setting) => {
  const s = await read($, snapshot)
  const five = s.limits.find(l => l.kind === 'five_hour')
  const text = switchWarning(from, to, five, await read($, switchAt), await read($, turns), await $.clock.now(), lang)
  if (text) $.ui.toast(text, { timeoutMs: 8000 })
}

/** A threshold from /limits warn: a whole number from 1 to 100, else null. */
const percentOf = (arg: string) => (/^\d{1,3}%?$/.test(arg) && Number.parseInt(arg, 10) >= 1 && Number.parseInt(arg, 10) <= 100 ? Number.parseInt(arg, 10) : null)

const open = ($: EngineInterface) => $.ui.open({ id: PANE, title: WORDS[lang].pane, focus: true, closeOnEscape: true }).catch(() => null)

/** /limits and its arguments: what the command answers, and what the pane's verbs run. */
const runCommand = async ($: EngineInterface, args: string): Promise<{ text?: string }> => {
  const w = WORDS[lang]
  const [verb = '', arg = ''] = args.trim().toLowerCase().split(/\s+/)
  if (verb === 'warn') {
    if (arg === '') return { text: w.warnIs(await read($, switchAt)) }
    const percent = percentOf(arg)
    if (percent === null) return { text: w.help }
    await setSwitchAt($, percent)
    return { text: w.warnSet(percent) }
  }
  switch (args.trim().toLowerCase()) {
    case 'hide':
      await setHidden($, true)
      return { text: w.hidden }
    case 'show':
      await setHidden($, false)
      return { text: w.shown }
    case 'help':
      return { text: w.help }
    case '': {
      const opened = await open($)
      if (opened?.isPlaced) return {}
      const list = await read($, turns)
      return { text: summary(await read($, snapshot), list[list.length - 1], await $.clock.now(), lang) }
    }
    default:
      return { text: w.help }
  }
}

/** Puts a text in the prompt for the person to send; runs nothing. */
const fill = async ($: EngineInterface, text: string) => {
  await $.prompt.fill(fillArgs(text))
}

/** The pane's verbs: each one is undone by another, so all of them run. */
const VERBS: readonly Verb[] = [{ verb: 'hide' }, { verb: 'show' }, { verb: 'help' }]

/** A verb pressed in the pane: runs and writes its answer to the transcript. */
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
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Math.max(1, Math.min(100, Number(v))) : d)
  warnAt = num(options.warnAt, 70)
  dangerAt = Math.max(warnAt, num(options.dangerAt, 90))
  cells = cellsOf(options.cells)
  density = options.density === 'bars' || options.density === 'mini' || options.density === 'numbers' ? options.density : 'auto'
  format = options.format === 'compact' ? 'compact' : 'full'

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = langOf(options.language, await $.env.get('LANG').catch(() => undefined))
    await $.command.register({
      name: COMMAND,
      description: WORDS[lang].description,
      argumentHint: '[hide|show|warn N|help]',
      immediate: true,
    })
    const hidden = (await $.store.get(KEY_HIDDEN).catch(() => undefined)) === true
    await update($, isHidden, () => hidden)
    const kept = await $.store.get(KEY_SWITCH).catch(() => undefined)
    await update($, switchAt, () => (typeof kept === 'number' && kept >= 1 && kept <= 100 ? kept : SWITCH_AT))
    try {
      const id = await $.session.model()
      await update($, model, () => id || null)
    } catch {
      // The first turn.step brings it.
    }
    try {
      const usage = await $.session.usage()
      await update($, snapshot, () => toSnapshot(usage.context, usage.rateLimits))
    } catch {
      // No figures yet; the first session.measure brings them.
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await take($, toSnapshot(e.context, e.rateLimits))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId && e.usage) {
      const s = await read($, snapshot)
      const five = s.limits.find(l => l.kind === 'five_hour')
      const turn = {
        ...toTurn(e.usage, e.durationMs),
        contextPercent: s.contextPercent,
        fivePercent: five?.percent ?? null,
        fiveResetsAt: five?.resetsAt ?? null,
        endedAt: await $.clock.now(),
      }
      await update($, turns, list => [...list, turn].slice(-TURNS_KEPT))
    }
    return result
  })

  // A switch to a costlier model: the band's model and, near the 5-hour limit, a toast. A resumed
  // session restores its model, which is no switch. Fail-open: the switch goes on regardless.
  on('classic.PostModelSwitch', async ($, e, next) => {
    const result = await next(e)
    await update($, model, () => e.to_model)
    if (e.source !== 'resume') {
      const now = await read($, effort)
      await warnIfCostly($, { model: e.from_model, effort: now }, { model: e.to_model, effort: now })
    }
    return result
  }).catch(($, e, next) => next(e))

  // The main loop's model and effort as each request goes out; effort turning to max warns here,
  // on the first request at max, since a /effort command raises no event of its own.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      try {
        const was = await read($, effort)
        const is = e.effort ?? null
        await update($, model, () => e.model)
        await update($, effort, () => is)
        if (was !== null && was !== is) await warnIfCostly($, { model: e.model, effort: was }, { model: e.model, effort: is })
      } catch {
        // The band keeps what it had; the request goes on.
      }
    }
    return yield* next(e)
  })

  on('command.run', { command: COMMAND }, ($, e) => runCommand($, e.args))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)
    const s = await read($, snapshot)
    if (s.limits.length === 0 && s.contextPercent === null) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const w = WORDS[lang]
    const now = await $.clock.now()
    const list = await read($, turns)
    const last = list[list.length - 1]
    const columns = e.props.bodyColumns || e.viewport?.columns || 80
    const width = barWidth(columns)
    const meter = (percent: number) =>
      width > 0 ? <Text color={tone(percent)}>{`${bar(width, percent)} `}</Text> : width === 0 ? <Text color={tone(percent)}>{mini(percent)}</Text> : null
    const id = await read($, model)
    const level = await read($, effort)
    const setting =
      id && shows('model') ? (
        <Text key="model">
          <Text>{shortModel(id)}</Text>
          {level !== null && <Text dimColor> · </Text>}
          {level !== null && <Text color={level === 'max' ? 'warning' : undefined}>{String(level)}</Text>}
        </Text>
      ) : null

    const verbs = [
      ...(needsCompact(s) ? [<Button key="compact" label={w.compact} plain color="warning" onPress={() => fill($, w.compactFill)} />] : []),
      <Button key="details" label={w.details} plain dimColor onPress={() => open($)} />,
      <Button key="hide" label={w.hide} plain dimColor onPress={() => setHidden($, true)} />,
    ]

    if (format === 'compact') {
      // model · effort · ctx 8% · 5h 34% · wk 31%: numbers only, one line.
      const cell = (key: string, name: string, percent: number | null) => (
        <Text key={key}>
          <Text dimColor>{`${name} `}</Text>
          <Text color={tone(percent)} bold>{pct(percent)}</Text>
        </Text>
      )
      const parts = [
        ...(setting ? [setting] : []),
        ...(shows('ctx') ? [cell('ctx', 'ctx', s.contextPercent)] : []),
        ...s.limits.filter(l => shows(CELL_IDS[l.kind] ?? l.kind)).map(l => cell(l.kind, label(l.kind, lang), l.percent)),
      ]
      const line = (
        <Box key="limits-meter" flexDirection="row" flexWrap="wrap" gap={2} paddingX={1}>
          <Text key="numbers">{parts.flatMap((p, i) => (i > 0 ? [<Text key={`sep-${i}`} dimColor> · </Text>, p] : [p]))}</Text>
          {verbs}
        </Box>
      )
      const beneath = await next(e)
      return beneath ? (
        <Box flexDirection="column">
          {line}
          {beneath}
        </Box>
      ) : (
        line
      )
    }

    const band = [
      ...(setting ? [setting] : []),
      ...s.limits
        .filter(l => shows(CELL_IDS[l.kind] ?? l.kind))
        .map(l => {
          const reset = resetIn(l.resetsAt, now, lang)
          return (
            <Text key={l.kind}>
              <Text dimColor>{`${label(l.kind, lang)} `}</Text>
              {meter(l.percent)}
              <Text color={tone(l.percent)} bold>{pct(l.percent)}</Text>
              {reset !== '' && <Text dimColor>{` ↻${reset}`}</Text>}
            </Text>
          )
        }),
      ...(shows('ctx')
        ? [
            <Text key="ctx">
              <Text dimColor>ctx </Text>
              {s.contextPercent !== null && meter(s.contextPercent)}
              <Text color={tone(s.contextPercent)} bold>{pct(s.contextPercent)}</Text>
            </Text>,
          ]
        : []),
      ...(last?.cacheHit != null && shows('cache')
        ? [
            <Text key="cache">
              <Text dimColor>cache </Text>
              <Text>{pct(last.cacheHit * 100)}</Text>
            </Text>,
          ]
        : []),
    ]

    const mine = (
      <Box key="limits-meter" flexDirection="row" flexWrap="wrap" gap={2} paddingX={1}>
        {band}
        {verbs}
      </Box>
    )
    const theirs = await next(e)
    return theirs ? (
      <Box flexDirection="column">
        {mine}
        {theirs}
      </Box>
    ) : (
      mine
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const w = WORDS[lang]
    const s = await read($, snapshot)
    const list = await read($, turns)
    const readings = await read($, samples)
    const now = await $.clock.now()
    const columns = Math.max(30, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)
    const width = Math.max(10, Math.min(40, columns - 30))
    const paces = s.limits.map(l => {
      const points = readings[l.kind]
      return l.resetsAt !== null && points && points.resetsAt === l.resetsAt ? pace(points.points, now, l.resetsAt) : null
    })
    const trend = list.filter(t => t.contextPercent != null)
    const top = heaviest(list)
    const id = await read($, model)
    const level = await read($, effort)
    const at = await read($, switchAt)
    const choices = [...new Set([...SWITCH_CHOICES, at])].sort((a, b) => a - b)
    // Rows besides the turns: the hint, three headings, the context row, the table head, the
    // footer, the gaps, a pace line per window that has one and the trend line; then the
    // costly-switch section (heading, hint, choices, order, gap) and the model's (heading, row, gap).
    const fixed = 12 + Math.max(1, s.limits.length) + paces.filter(p => p !== null).length + (trend.length > 1 ? 1 : 0) + 5 + (id ? 3 : 0)
    const room = Math.max(3, (e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 30) - fixed)
    const [cIn, cOut, cCache, cTime, cModel] = w.columns

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text dimColor>{w.hint}</Text>

        <Box flexDirection="column">
          <Text bold>{w.planWindows}</Text>
          {s.limits.length === 0 && <Text dimColor>{w.noWindows}</Text>}
          {s.limits.map((l, i) => {
            const left = paces[i]
            return (
              <Box key={l.kind} flexDirection="column">
                <Text>
                  <Text dimColor>{label(l.kind, lang).padEnd(6)}</Text>
                  <Text color={tone(l.percent)}>{bar(width, l.percent)}</Text>
                  <Text bold>{` ${pct(l.percent).padStart(4)}`}</Text>
                  <Text dimColor>{l.resetsAt !== null ? `  ${w.resetsIn(resetIn(l.resetsAt, now, lang))}` : ''}</Text>
                </Text>
                {left != null && <Text color="warning">{`      ${w.pace(label(l.kind, lang), resetIn(now + left, now, lang))}`}</Text>}
              </Box>
            )
          })}
        </Box>

        <Box flexDirection="column">
          <Text bold>{w.contextHeading}</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={2}>
            <Text>
              <Text dimColor>{'ctx   '}</Text>
              <Text color={tone(s.contextPercent)}>{bar(width, s.contextPercent ?? 0)}</Text>
              <Text bold>{` ${pct(s.contextPercent).padStart(4)}`}</Text>
              <Text dimColor>{s.contextTokens !== null ? `  ${w.ofWindow(tokens(s.contextTokens), tokens(s.contextWindow))}` : ''}</Text>
            </Text>
            {needsCompact(s) && <Button key="compact" label={w.compact} plain color="warning" onPress={() => fill($, w.compactFill)} />}
          </Box>
          {trend.length > 1 && (
            <Text>
              <Text dimColor>{'      '}</Text>
              <Text color={tone(s.contextPercent)}>{contextSpark(list.slice(-width))}</Text>
              <Text dimColor>{`  ${w.trend(Math.min(list.length, width))}`}</Text>
            </Text>
          )}
        </Box>

        {id && (
          <Box flexDirection="column">
            <Text bold>{w.modelHeading}</Text>
            <Text>
              <Text>{shortModel(id)}</Text>
              {level !== null && <Text dimColor>{` · ${w.effort(String(level))}`}</Text>}
            </Text>
          </Box>
        )}

        <Box flexDirection="column">
          <Text bold>{w.warnHeading}</Text>
          <Text dimColor>{w.warnHint}</Text>
          <Box flexDirection="row" flexWrap="wrap">
            {choices.map((n, i) => (
              <Box key={`warn-${n}`} flexDirection="row">
                {i > 0 && <Text dimColor> · </Text>}
                {n === at ? (
                  <Text color="claude" bold>{`${n}%`}</Text>
                ) : (
                  <Button key={`warn:${n}`} plain dimColor label={`${n}%`} onPress={() => setSwitchAt($, n).then(() => $.ui.toast(w.warnSet(n)))} />
                )}
              </Box>
            ))}
          </Box>
          <Text dimColor>{w.warnOrder}</Text>
        </Box>

        <Box flexDirection="column">
          <Text bold>{w.turns}</Text>
          {list.length === 0 && <Text dimColor>{w.noTurns}</Text>}
          {list.length > 0 && <Text dimColor>{`    ${cIn.padStart(8)}${cOut.padStart(8)}${cCache.padStart(7)}${cTime.padStart(7)}  ${cModel}`}</Text>}
          {list.slice(-room).map((t, i, shown) => {
            const isTop = list.length > 1 && t === top
            return (
              <Text key={`turn-${list.length - shown.length + i}`}>
                <Text dimColor>{`#${list.length - shown.length + i + 1}`.padEnd(4)}</Text>
                <Text color={isTop ? 'claude' : undefined} bold={isTop}>{tokens(t.input).padStart(8)}</Text>
                <Text>{tokens(t.output).padStart(8)}</Text>
                <Text color={t.cacheHit !== null && t.cacheHit < 0.5 ? 'warning' : undefined}>{pct(t.cacheHit === null ? null : t.cacheHit * 100).padStart(7)}</Text>
                <Text dimColor>{`${`${Math.round(t.durationMs / 1000)}s`.padStart(7)}  ${shortModel(t.model)}`}</Text>
              </Text>
            )
          })}
        </Box>

        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {verbRow({ Box, Text, Button }, COMMAND, VERBS, v => pressVerb($, v))}
          <Button key="close" role="dismiss" label={w.close} onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
