import { describe, expect, test } from 'claude-code/testing'

import { alerts, bar, pct, resetIn, summary, toSnapshot, toTurn } from '../hooks/meter'

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
