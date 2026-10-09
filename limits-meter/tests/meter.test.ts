import { describe, expect, test } from 'claude-code/testing'

import { addSamples, alerts, bar, contextSpark, heaviest, isCostlier, label, mini, minutesLeft, needsCompact, pace, pct, rankOf, resetIn, summary, switchWarning, tone, toSnapshot, toTurn } from '../hooks/meter'

const NOW = Date.parse('2026-10-08T12:00:00Z')

describe('meter math', () => {
  test('reset times read short', async () => {
    expect(resetIn(null, NOW)).toBe('')
    expect(resetIn(NOW + 20_000, NOW)).toBe('now')
    expect(resetIn(NOW + 7 * 60_000, NOW)).toBe('7m')
    expect(resetIn(NOW + 72 * 60_000, NOW)).toBe('1h12')
    expect(resetIn(NOW + (3 * 24 + 4) * 3_600_000, NOW)).toBe('3d4h')
  })

  test('bars clamp to their width', async () => {
    expect(bar(10, 50)).toBe('█████░░░░░')
    expect(bar(4, 140)).toBe('████')
    expect(bar(4, -5)).toBe('░░░░')
    expect(pct(null)).toBe('–')
  })

  test('tones are the theme colors', async () => {
    expect(tone(null)).toBe(undefined)
    expect(tone(69)).toBe('success')
    expect(tone(70)).toBe('warning')
    expect(tone(90)).toBe('error')
  })

  test('compact is offered from 85% context', async () => {
    const s = (contextPercent: number | null) => ({ limits: [], contextPercent, contextTokens: null, contextWindow: 100 })
    expect(needsCompact(s(84))).toBe(false)
    expect(needsCompact(s(85))).toBe(true)
    expect(needsCompact(s(null))).toBe(false)
  })

  test('a snapshot keeps the engine figures and parses reset times', async () => {
    const s = toSnapshot({ tokens: 90_000, window: 200_000, percent: 45 }, [
      { kind: 'five_hour', percentUsed: 64.5, resetsAt: '2026-10-08T13:12:00Z' },
      { kind: 'seven_day', percentUsed: 31 },
    ])
    expect(s.contextPercent).toBe(45)
    expect(s.limits[0]!.resetsAt).toBe(Date.parse('2026-10-08T13:12:00Z'))
    expect(s.limits[1]!.resetsAt).toBe(null)
  })

  test('a turn counts cache-read and cache-written tokens as input', async () => {
    const t = toTurn({ input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 8000, cache_creation_input_tokens: 1000, model: 'claude-opus-5-5' }, 12_000)
    expect(t.input).toBe(10_000)
    expect(t.cacheHit).toBe(0.8)
    expect(toTurn({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'm' }, 0).cacheHit).toBe(null)
  })
})

describe('alerts', () => {
  const at = Date.parse('2026-10-08T13:12:00Z')
  const window = (percent: number, resetsAt = at) => ({ limits: [{ kind: 'five_hour', percent, resetsAt }], contextPercent: 10, contextTokens: 1, contextWindow: 100 })

  test('each threshold fires once per window', async () => {
    const first = alerts(window(82), [], NOW)
    expect(first.raised.map(a => a.text)).toEqual(['5h window at 82%, resets in 1h12'])
    expect(alerts(window(85), first.fired, NOW).raised).toEqual([])
    const jump = alerts(window(95), first.fired, NOW)
    expect(jump.raised.length).toBe(1)
    expect(jump.raised[0]!.text).toContain('95%')
  })

  test('a new window re-arms its alerts', async () => {
    const first = alerts(window(92), [], NOW)
    expect(alerts(window(92, at + 5 * 3_600_000), first.fired, NOW).raised.length).toBe(1)
  })

  test('context alert fires at 85% and re-arms below 50%', async () => {
    const full = { limits: [], contextPercent: 87, contextTokens: 1, contextWindow: 100 }
    const first = alerts(full, [], NOW)
    expect(first.raised[0]!.text).toContain('/compact')
    expect(alerts(full, first.fired, NOW).raised).toEqual([])
    const compacted = alerts({ ...full, contextPercent: 20 }, first.fired, NOW)
    expect(alerts(full, compacted.fired, NOW).raised.length).toBe(1)
  })

  test('summary says when there are no plan windows', async () => {
    expect(summary({ limits: [], contextPercent: 12, contextTokens: 1, contextWindow: 100 }, undefined, NOW)).toContain('no plan-limit readings')
  })
})

describe('Portuguese', () => {
  const at = Date.parse('2026-10-08T13:12:00Z')

  test('labels, reset times and alerts', async () => {
    expect(label('seven_day', 'pt-BR')).toBe('sem')
    expect(label('other', 'pt-BR')).toBe('other')
    expect(resetIn(NOW, NOW, 'pt-BR')).toBe('agora')
    const s = { limits: [{ kind: 'five_hour', percent: 81, resetsAt: at }], contextPercent: 90, contextTokens: 1, contextWindow: 100 }
    expect(alerts(s, [], NOW, 'pt-BR').raised.map(a => a.text)).toEqual(['Janela 5h em 81%, reinicia em 1h12', 'Contexto 90% cheio: bom momento para /compact com um foco'])
  })

  test('summary', async () => {
    const s = { limits: [{ kind: 'five_hour', percent: 40, resetsAt: at }], contextPercent: 12, contextTokens: 1, contextWindow: 100 }
    expect(summary(s, undefined, NOW, 'pt-BR')).toBe('5h 40% (reinicia em 1h12) · contexto 12%')
    expect(summary({ ...s, limits: [] }, undefined, NOW, 'pt-BR')).toContain('sem leituras de limite do plano')
  })
})

describe('stage 2', () => {
  const MIN = 60_000
  const reset = NOW + 3 * 60 * MIN

  test('pace: minutes to 100% from a least-squares line', async () => {
    const points: [number, number][] = [[NOW, 40], [NOW + 10 * MIN, 50], [NOW + 20 * MIN, 60], [NOW + 30 * MIN, 70]]
    expect(pace(points, NOW + 30 * MIN, reset)).toBe(30 * MIN)
    // Too few readings, too short a span, a flat pace, a window that resets first.
    expect(pace(points.slice(0, 2), NOW + 30 * MIN, reset)).toBe(null)
    expect(pace([[NOW, 40], [NOW + MIN, 50], [NOW + 2 * MIN, 60]], NOW + 2 * MIN, reset)).toBe(null)
    expect(pace([[NOW, 40], [NOW + 10 * MIN, 40], [NOW + 20 * MIN, 40]], NOW + 20 * MIN, reset)).toBe(null)
    expect(pace(points, NOW + 30 * MIN, NOW + 40 * MIN)).toBe(null)
  })

  test('samples: a minute apart, dropped when the window resets', async () => {
    const s = (percent: number, resetsAt = reset) => ({ limits: [{ kind: 'five_hour', percent, resetsAt }], contextPercent: null, contextTokens: null, contextWindow: 0 })
    let list = addSamples({}, s(10), NOW)
    list = addSamples(list, s(10), NOW + 30_000)
    list = addSamples(list, s(11), NOW + 40_000)
    expect(list.five_hour!.points).toEqual([[NOW + 40_000, 11]])
    list = addSamples(list, s(12), NOW + 2 * MIN)
    expect(list.five_hour!.points).toHaveLength(2)
    list = addSamples(list, s(1, reset + 5 * 60 * MIN), NOW + 3 * MIN)
    expect(list.five_hour!.points).toEqual([[NOW + 3 * MIN, 1]])
  })

  test('mini cells, the context sparkline and the heaviest turn', async () => {
    expect([0, 50, 100].map(mini).join('')).toBe('▁▅█')
    const turn = (input: number, contextPercent: number | null) => ({ input, output: 0, cacheHit: null, model: 'm', durationMs: 0, contextPercent })
    expect(contextSpark([turn(1, 0), turn(1, null), turn(1, 100)])).toBe('▁ █')
    expect(heaviest([turn(5, 0), turn(9, 0), turn(2, 0)])!.input).toBe(9)
    expect(heaviest([])).toBe(undefined)
  })

  test('tone takes the warnAt and dangerAt options', async () => {
    expect(tone(55, 50, 80)).toBe('warning')
    expect(tone(80, 50, 80)).toBe('error')
    expect(tone(49, 50, 80)).toBe('success')
  })
})

describe('costly switch (0.4.0)', () => {
  const MIN = 60_000
  const reset = NOW + 60 * MIN
  const five = (percent: number, resetsAt: number | null = reset) => ({ kind: 'five_hour', percent, resetsAt })
  // A turn of the 5-hour window `resetsAt`, ended `minutes` from NOW with the window at `percent`.
  const t = (percent: number, minutes: number, resetsAt: number | null = reset) => ({
    input: 1, output: 1, cacheHit: null, model: 'claude-sonnet-5-5', durationMs: 1, fivePercent: percent, fiveResetsAt: resetsAt, endedAt: NOW + minutes * MIN,
  })
  const sonnet = { model: 'claude-sonnet-5-5', effort: 'high' }

  test('model order: haiku < sonnet < opus < fable; an unknown model never climbs', async () => {
    expect(['claude-haiku-4-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'].map(rankOf)).toEqual([0, 1, 2, 3])
    expect(rankOf('gpt-x')).toBe(-1)
    expect(isCostlier('claude-sonnet-5-5', 'claude-opus-5-5')).toBe(true)
    expect(isCostlier('claude-opus-5-5', 'claude-fable-5-1')).toBe(true)
    expect(isCostlier('claude-opus-5-5', 'claude-sonnet-5-5')).toBe(false)
    expect(isCostlier('claude-opus-5-5', 'claude-opus-5-5')).toBe(false)
    expect(isCostlier('custom-model', 'claude-opus-5-5')).toBe(false)
    expect(isCostlier(null, 'claude-opus-5-5')).toBe(false)
  })

  test('minutesLeft: the pace of the last 3 turns of the same window', async () => {
    // 70% to 82% over 12 minutes: 1% a minute, 18 minutes to 100%.
    expect(minutesLeft(five(82), [t(40, -30), t(70, -12), t(76, -6), t(82, 0)])).toBe(18) // the oldest turn is left out
    expect(minutesLeft(five(82), [t(70, -12), t(76, -6), t(82, 0)])).toBe(18)
    expect(minutesLeft(five(82), [t(76, -6), t(82, 0)])).toBeNull() // fewer than 3 turns
    expect(minutesLeft(five(82), [t(82, -12), t(82, -6), t(82, 0)])).toBeNull() // no rise
    expect(minutesLeft(five(82), [t(70, -12, NOW), t(76, -6), t(82, 0)])).toBeNull() // a turn of the window before
  })

  test('with pace: the minutes left', async () => {
    const turns = [t(62, -40), t(72, -20), t(82, 0)]
    expect(switchWarning(sonnet, { ...sonnet, model: 'claude-opus-5-5' }, five(82), 70, turns, NOW)).toBe('5h at 82%: at this pace the window runs out in ~36 min · /limits')
    expect(switchWarning(sonnet, { ...sonnet, model: 'claude-opus-5-5' }, five(82, NOW + 400 * MIN), 70, [t(72, -200, NOW + 400 * MIN), t(77, -100, NOW + 400 * MIN), t(82, 0, NOW + 400 * MIN)], NOW)).toBe(
      '5h at 82%: at this pace the window runs out in ~6h00 · /limits',
    )
  })

  test('no pace: no number', async () => {
    expect(switchWarning(sonnet, { ...sonnet, model: 'claude-opus-5-5' }, five(82), 70, [], NOW)).toBe('5h at 82%: opus uses the window faster · /limits')
    expect(switchWarning(sonnet, { ...sonnet, effort: 'max' }, five(82), 70, [], NOW, 'pt-BR')).toBe('5h em 82%: effort max gasta a janela mais rápido · /limits')
  })

  test('effort max: the same toast; staying at max or going down says nothing', async () => {
    const turns = [t(70, -12), t(76, -6), t(82, 0)]
    expect(switchWarning(sonnet, { ...sonnet, effort: 'max' }, five(82), 70, turns, NOW, 'pt-BR')).toBe('5h em 82%: neste ritmo a janela acaba em ~18 min · /limits')
    expect(switchWarning({ ...sonnet, effort: 'max' }, { ...sonnet, effort: 'max' }, five(82), 70, turns, NOW)).toBeNull()
    expect(switchWarning({ ...sonnet, effort: 'max' }, sonnet, five(82), 70, turns, NOW)).toBeNull()
  })

  test('switch below the threshold, a cheaper model, or no 5-hour window: nothing', async () => {
    const opus = { ...sonnet, model: 'claude-opus-5-5' }
    expect(switchWarning(sonnet, opus, five(45), 70, [], NOW)).toBeNull()
    expect(switchWarning(sonnet, opus, five(45), 40, [], NOW)).toBe('5h at 45%: opus uses the window faster · /limits')
    expect(switchWarning(opus, sonnet, five(95), 70, [], NOW)).toBeNull()
    expect(switchWarning(sonnet, opus, undefined, 70, [], NOW)).toBeNull()
  })

  test('resets first: when it resets, with no pace minutes', async () => {
    // 1% a minute from 85%: 15 minutes to 100%, but the window resets in 12.
    const turns = [t(73, -12), t(79, -6), t(85, 0)]
    expect(switchWarning(sonnet, { ...sonnet, model: 'claude-opus-5-5' }, five(85, NOW + 12 * MIN), 70, turns.map(x => ({ ...x, fiveResetsAt: NOW + 12 * MIN })), NOW, 'pt-BR')).toBe(
      '5h em 85%: reinicia em 12m, antes de acabar · /limits',
    )
  })
})
