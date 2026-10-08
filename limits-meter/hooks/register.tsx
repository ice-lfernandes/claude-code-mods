// limits-meter: plan limits and context, above the prompt and in a pane.
//
//   band   AbovePrompt: 5-hour and weekly windows with reset times, context fill, last turn's
//          cache hit rate. Tokens and percent only, never money. `details` opens the pane,
//          `hide` hides the band, and from 85% context `compact` puts /compact in the prompt.
//   /limits  opens a pane with the same figures at full width and the last turns' tokens;
//          /limits hide | show toggles the band, and the choice is kept across sessions.
//   toasts once per threshold: a window at 80, 90 and 100%, context at 85%.
//
// Figures come from `session.measure` (pushed by the engine after each turn and when a window
// moves a point), so nothing polls. Reads nothing from disk, runs no process, calls no model.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot, Turn } from '../types'
import { alerts, bar, label, needsCompact, pct, resetIn, summary, toSnapshot, toTurn, tone, TURNS_KEPT } from './meter'
import type { Lang, Verb } from './ui'
import { fillArgs, langOf, linesOf, shortModel, tokens, verbRow } from './ui'
import { COMMAND, WORDS } from './words'

const PANE = 'limits'
const KEY_HIDDEN = 'hidden'

const EMPTY: Snapshot = { limits: [], contextPercent: null, contextTokens: null, contextWindow: 0 }

const snapshot = atom({ plugin: 'limits-meter', key: 'snapshot' } as const, EMPTY)
const turns = atom({ plugin: 'limits-meter', key: 'turns' } as const, [] as Turn[])
const isHidden = atom({ plugin: 'limits-meter', key: 'isHidden' } as const, false)
const fired = atom({ plugin: 'limits-meter', key: 'fired' } as const, [] as string[])

// Set by register from the options, and by session.start from the system's LANG.
let lang: Lang = 'en'

const take = async ($: EngineInterface, next: Snapshot) => {
  await update($, snapshot, () => next)
  const now = await $.clock.now()
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

const open = ($: EngineInterface) => $.ui.open({ id: PANE, title: WORDS[lang].pane, focus: true, closeOnEscape: true }).catch(() => null)

/** /limits and its arguments: what the command answers, and what the pane's verbs run. */
const runCommand = async ($: EngineInterface, args: string): Promise<{ text?: string }> => {
  const w = WORDS[lang]
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

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = langOf(options.language, await $.env.get('LANG').catch(() => undefined))
    await $.command.register({
      name: COMMAND,
      description: WORDS[lang].description,
      argumentHint: '[hide|show|help]',
      immediate: true,
    })
    const hidden = (await $.store.get(KEY_HIDDEN).catch(() => undefined)) === true
    await update($, isHidden, () => hidden)
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
      const turn = toTurn(e.usage, e.durationMs)
      await update($, turns, list => [...list, turn].slice(-TURNS_KEPT))
    }
    return result
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
    const width = columns >= 120 ? 10 : columns >= 90 ? 6 : 0

    const cells = [
      ...s.limits.map(l => {
        const reset = resetIn(l.resetsAt, now, lang)
        return (
          <Text key={l.kind}>
            <Text dimColor>{`${label(l.kind, lang)} `}</Text>
            {width > 0 && <Text color={tone(l.percent)}>{`${bar(width, l.percent)} `}</Text>}
            <Text color={tone(l.percent)} bold>{pct(l.percent)}</Text>
            {reset !== '' && <Text dimColor>{` ↻${reset}`}</Text>}
          </Text>
        )
      }),
      <Text key="ctx">
        <Text dimColor>ctx </Text>
        {width > 0 && s.contextPercent !== null && <Text color={tone(s.contextPercent)}>{`${bar(width, s.contextPercent)} `}</Text>}
        <Text color={tone(s.contextPercent)} bold>{pct(s.contextPercent)}</Text>
      </Text>,
      ...(last?.cacheHit != null
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
        {cells}
        {needsCompact(s) && <Button key="compact" label={w.compact} plain color="warning" onPress={() => fill($, w.compactFill)} />}
        <Button key="details" label={w.details} plain dimColor onPress={() => open($)} />
        <Button key="hide" label={w.hide} plain dimColor onPress={() => setHidden($, true)} />
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
    const now = await $.clock.now()
    const columns = Math.max(30, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)
    const width = Math.max(10, Math.min(40, columns - 30))
    // Rows besides the turns: the hint, three headings, the context row, the footer and the gaps.
    const fixed = 11 + Math.max(1, s.limits.length)
    const room = Math.max(3, (e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 30) - fixed)

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text dimColor>{w.hint}</Text>

        <Box flexDirection="column">
          <Text bold>{w.planWindows}</Text>
          {s.limits.length === 0 && <Text dimColor>{w.noWindows}</Text>}
          {s.limits.map(l => (
            <Text key={l.kind}>
              <Text dimColor>{label(l.kind, lang).padEnd(6)}</Text>
              <Text color={tone(l.percent)}>{bar(width, l.percent)}</Text>
              <Text bold>{` ${pct(l.percent).padStart(4)}`}</Text>
              <Text dimColor>{l.resetsAt !== null ? `  ${w.resetsIn(resetIn(l.resetsAt, now, lang))}` : ''}</Text>
            </Text>
          ))}
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
        </Box>

        <Box flexDirection="column">
          <Text bold>{w.turns}</Text>
          {list.length === 0 && <Text dimColor>{w.noTurns}</Text>}
          {list.slice(-room).map((t, i, shown) => (
            <Text key={`turn-${list.length - shown.length + i}`}>
              <Text dimColor>{`#${String(list.length - shown.length + i + 1).padStart(2)}  `}</Text>
              <Text>{`in ${tokens(t.input).padStart(5)}  out ${tokens(t.output).padStart(5)}  `}</Text>
              <Text color={t.cacheHit === null ? undefined : t.cacheHit < 0.5 ? 'warning' : undefined}>{`cache ${pct(t.cacheHit === null ? null : t.cacheHit * 100).padStart(4)}`}</Text>
              <Text dimColor>{`  ${Math.round(t.durationMs / 1000)}s  ${shortModel(t.model)}`}</Text>
            </Text>
          ))}
        </Box>

        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {verbRow({ Box, Text, Button }, COMMAND, VERBS, v => pressVerb($, v))}
          <Button key="close" role="dismiss" label={w.close} onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
