// limits-meter: plan limits and context, above the prompt and in a pane.
//
//   band   AbovePrompt: 5-hour and weekly windows with reset times, context fill, last turn's
//          cache hit rate. Tokens and percent only, never money.
//   /limits  opens a pane with the same figures at full width and the last turns' tokens;
//          /limits hide | show toggles the band.
//   toasts once per threshold: a window at 80, 90 and 100%, context at 85%.
//
// Figures come from `session.measure` (pushed by the engine after each turn and when a window
// moves a point), so nothing polls. Reads nothing from disk, runs no process, calls no model.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Snapshot, Turn } from '../types'
import { alerts, bar, label, pct, resetIn, shortModel, summary, toSnapshot, toTurn, tokens, tone, TURNS_KEPT } from './meter'

const PANE = 'limits'

const EMPTY: Snapshot = { limits: [], contextPercent: null, contextTokens: null, contextWindow: 0 }

const snapshot = atom({ plugin: 'limits-meter', key: 'snapshot' } as const, EMPTY)
const turns = atom({ plugin: 'limits-meter', key: 'turns' } as const, [] as Turn[])
const isHidden = atom({ plugin: 'limits-meter', key: 'isHidden' } as const, false)
const fired = atom({ plugin: 'limits-meter', key: 'fired' } as const, [] as string[])

const take = async ($: EngineInterface, next: Snapshot) => {
  await update($, snapshot, () => next)
  const now = await $.clock.now()
  const result = alerts(next, await read($, fired), now)
  if (result.raised.length === 0) return
  await update($, fired, () => result.fired)
  for (const a of result.raised) $.ui.toast(a.text, { timeoutMs: 8000 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'limits',
      description: 'Plan limits and context: /limits opens the pane; /limits hide | show toggles the band',
      immediate: true,
    })
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

  on('command.run', { command: 'limits' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'hide') {
      await update($, isHidden, () => true)
      return { text: 'limits-meter: band hidden. /limits show brings it back.' }
    }
    if (arg === 'show') {
      await update($, isHidden, () => false)
      return { text: 'limits-meter: band shown.' }
    }
    const opened = await $.ui.open({ id: PANE, title: 'Limits & context', focus: true, closeOnEscape: true }).catch(() => null)
    if (opened?.isPlaced) return {}
    const list = await read($, turns)
    return { text: summary(await read($, snapshot), list[list.length - 1], await $.clock.now()) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)
    const s = await read($, snapshot)
    if (s.limits.length === 0 && s.contextPercent === null) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const now = await $.clock.now()
    const list = await read($, turns)
    const last = list[list.length - 1]
    const columns = e.props.bodyColumns || e.viewport?.columns || 80
    const width = columns >= 120 ? 10 : columns >= 90 ? 6 : 0

    const cells = [
      ...s.limits.map(l => {
        const reset = resetIn(l.resetsAt, now)
        return (
          <Text key={l.kind}>
            <Text dimColor>{`${label(l.kind)} `}</Text>
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
      <Box key="limits-meter" flexDirection="row" gap={2} paddingX={1}>
        {cells}
        <Button key="hide" label="hide" plain onPress={() => update($, isHidden, () => true)} />
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
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, snapshot)
    const list = await read($, turns)
    const now = await $.clock.now()
    const columns = Math.max(30, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)
    const width = Math.max(10, Math.min(40, columns - 30))
    const room = Math.max(3, (e.viewport?.rows ?? 30) - 12 - s.limits.length)

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="column">
          <Text bold>Plan windows</Text>
          {s.limits.length === 0 && <Text dimColor>No readings: an API key has no plan windows, and a subscription shows them after the first response.</Text>}
          {s.limits.map(l => (
            <Text key={l.kind}>
              <Text dimColor>{label(l.kind).padEnd(6)}</Text>
              <Text color={tone(l.percent)}>{bar(width, l.percent)}</Text>
              <Text bold>{` ${pct(l.percent).padStart(4)}`}</Text>
              <Text dimColor>{l.resetsAt !== null ? `  resets in ${resetIn(l.resetsAt, now)}` : ''}</Text>
            </Text>
          ))}
        </Box>

        <Box flexDirection="column">
          <Text bold>Context</Text>
          <Text>
            <Text dimColor>{'ctx   '}</Text>
            <Text color={tone(s.contextPercent)}>{bar(width, s.contextPercent ?? 0)}</Text>
            <Text bold>{` ${pct(s.contextPercent).padStart(4)}`}</Text>
            <Text dimColor>{s.contextTokens !== null ? `  ${tokens(s.contextTokens)} of ${tokens(s.contextWindow)}` : ''}</Text>
          </Text>
        </Box>

        <Box flexDirection="column">
          <Text bold>Turns (main thread)</Text>
          {list.length === 0 && <Text dimColor>No finished turns yet.</Text>}
          {list.slice(-room).map((t, i, shown) => (
            <Text key={`turn-${list.length - shown.length + i}`}>
              <Text dimColor>{`#${String(list.length - shown.length + i + 1).padStart(2)}  `}</Text>
              <Text>{`in ${tokens(t.input).padStart(5)}  out ${tokens(t.output).padStart(5)}  `}</Text>
              <Text color={t.cacheHit === null ? undefined : t.cacheHit < 0.5 ? 'yellow' : undefined}>{`cache ${pct(t.cacheHit === null ? null : t.cacheHit * 100).padStart(4)}`}</Text>
              <Text dimColor>{`  ${Math.round(t.durationMs / 1000)}s  ${shortModel(t.model)}`}</Text>
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
