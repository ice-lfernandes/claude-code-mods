import { describe, expect, test } from 'claude-code/testing'

import type { Agent } from '../types'
import {
  addSample,
  addStep,
  adopt,
  clearOut,
  fillCells,
  finish,
  fitRows,
  fiveHourOf,
  fiveText,
  glyphOf,
  groupsOf,
  isCompact,
  isInCard,
  lastDone,
  lastStartFor,
  messageOf,
  nextSlot,
  rateOf,
  reconcile,
  runText,
  sevenDayOf,
  stalls,
  stallText,
  stepOf,
  summarize,
  summaryOf,
  toolEnd,
  toolStart,
  total,
  touch,
  upsert,
  weekText,
  windowShare,
  windowUsed,
  ZERO,
} from '../hooks/watch'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const MIN = 60_000
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-12
const t = (input: number, output: number, cacheRead = 0) => ({ input, output, cacheRead, cacheWrite: 0 })
const agent = (id: string, over: Partial<Agent> = {}): Agent => ({
  id,
  label: id,
  type: 'Explore',
  status: 'running',
  startedAt: NOW,
  lastAt: NOW,
  activity: 'idle',
  tools: 0,
  errors: 0,
  steps: 0,
  tokens: ZERO,
  isStalled: false,
  slot: 0,
  ...over,
})

describe('tokens', () => {
  test('a step adds to its agent and restarts the stall clock', async () => {
    const { agents } = addStep([agent('a', { tokens: t(10, 5), isStalled: true })], {}, 'a', t(100, 50, 1000), 'claude-haiku-4-5', NOW + MIN)
    expect(agents[0]!.tokens).toEqual(t(110, 55, 1000))
    expect(agents[0]!.steps).toBe(1)
    expect(agents[0]!.lastAt).toBe(NOW + MIN)
    expect(agents[0]!.isStalled).toBe(false)
  })

  test('a step from an unknown loop waits as an orphan until its agent appears', async () => {
    const early = addStep([], {}, 'x', t(100, 50), 'm', NOW)
    expect(early.agents).toEqual([])
    const again = addStep(early.agents, early.orphans, 'x', t(1, 1), 'm', NOW)
    expect(again.orphans.x).toEqual(t(101, 51))
    const adopted = adopt(again.agents, again.orphans, 'x', NOW, { label: 'late' })
    expect(adopted.agents[0]!.tokens).toEqual(t(101, 51))
    expect(adopted.orphans).toEqual({})
  })

  test('the listing adopts orphans and ends agents that left the active statuses', async () => {
    const list = [agent('a')]
    const r = reconcile(list, { b: t(7, 3) }, [
      { id: 'a', description: 'a', type: 'Explore', status: 'completed' },
      { id: 'b', description: 'Check sources', type: 'Explore', status: 'running', parentId: 'a' },
    ], NOW + MIN)
    expect(r.finished.map(a => a.id)).toEqual(['a'])
    expect(r.agents[0]!.endedAt).toBe(NOW + MIN)
    expect(r.agents[1]!.label).toBe('Check sources')
    expect(total(r.agents[1]!.tokens)).toBe(10)
    expect(r.orphans).toEqual({})
  })
})

describe('endings', () => {
  test('a subagent turn.complete closes it, and a lagging listing does not reopen it', async () => {
    const closed = finish([agent('a')], 'a', 'answer', NOW)
    expect(closed[0]!.status).toBe('completed')
    const lagging = reconcile(closed, {}, [{ id: 'a', description: 'a', type: 'Explore', status: 'running' }], NOW + 1000)
    expect(lagging.agents[0]!.status).toBe('completed')
    expect(finish([agent('b')], 'b', 'aborted', NOW)[0]!.status).toBe('killed')
    expect(finish([agent('c')], 'c', 'error', NOW)[0]!.status).toBe('failed')
  })

  test('a resumed agent reopens once it shows activity', async () => {
    const closed = finish([agent('a')], 'a', 'answer', NOW)
    const resumed = touch(closed, 'a', NOW + 5000, 'thinking')
    const r = reconcile(resumed, {}, [{ id: 'a', description: 'a', type: 'Explore', status: 'running' }], NOW + 6000)
    expect(r.agents[0]!.status).toBe('running')
    expect(r.agents[0]!.endedAt).toBe(undefined)
  })

  test('a teammate ends a turn without ending', async () => {
    expect(finish([agent('t', { type: 'teammate' })], 't', 'answer', NOW)[0]!.status).toBe('running')
  })
})

describe('stalls', () => {
  test('a running agent quiet past the threshold is raised once', async () => {
    const list = [agent('a', { lastAt: NOW - 6 * MIN }), agent('b', { lastAt: NOW - MIN })]
    const first = stalls(list, NOW, 5 * MIN)
    expect(first.raised.map(a => a.id)).toEqual(['a'])
    expect(stalls(first.agents, NOW + MIN, 5 * MIN).raised).toEqual([])
  })

  test('activity re-arms the alert', async () => {
    const first = stalls([agent('a', { lastAt: NOW - 6 * MIN })], NOW, 5 * MIN)
    const active = touch(first.agents, 'a', NOW, 'thinking')
    expect(active[0]!.isStalled).toBe(false)
    expect(stalls(active, NOW + 6 * MIN, 5 * MIN).raised.length).toBe(1)
  })

  test('idle teammates and held agents never stall', async () => {
    const list = [agent('t', { status: 'idle', lastAt: 0 }), agent('w', { status: 'waiting', lastAt: 0 }), agent('d', { status: 'completed', lastAt: 0 })]
    expect(stalls(list, NOW, 5 * MIN).raised).toEqual([])
  })

  test('the stall text says what the agent is stuck on', async () => {
    const started = toolStart([agent('a')], 'a', 'running npm test', NOW - 6 * MIN)
    expect(stallText(started[0]!, NOW)).toBe('running npm test for 6m 00s')
    const ended = toolEnd(started, 'a', false, NOW - 7 * MIN)
    expect(ended[0]!.errors).toBe(1)
    expect(stallText(ended[0]!, NOW)).toBe('quiet for 7m 00s')
    expect(stallText(touch(ended, 'a', NOW - 90_000, 'thinking')[0]!, NOW)).toBe('thinking for 1m 30s')
  })
})

describe('summary', () => {
  test('names the heaviest agent and its share', async () => {
    const run = summarize([
      agent('a', { label: 'Map the API', tokens: t(0, 0, 300), startedAt: NOW, endedAt: NOW + 2 * MIN }),
      agent('b', { name: 'writer', tokens: t(50, 50), startedAt: NOW + MIN, endedAt: NOW + 6 * MIN }),
    ], NOW + 7 * MIN)!
    expect(run.total).toBe(400)
    expect(run.top).toEqual({ label: 'Map the API', total: 300, share: 0.75 })
    expect(runText(run)).toBe('2 agents, 400 tokens in 6m 00s. Heaviest: Map the API 300 (75%)')
    expect(summarize([], NOW)).toBe(null)
  })
})

describe('the pane', () => {
  test('a running agent spins with the tick; stalled, done and failed have their glyph', async () => {
    expect([0, 1, 2, 3, 4].map(n => glyphOf(agent('a'), n)).join('')).toBe('◐◓◑◒◐')
    expect(glyphOf(agent('a', { isStalled: true }), 0)).toBe('!')
    expect(glyphOf(agent('a', { status: 'completed' }), 0)).toBe('✓')
    expect(glyphOf(agent('a', { status: 'killed' }), 0)).toBe('×')
  })

  test('clear drops one kind, or both', async () => {
    const list = [agent('a'), agent('b', { status: 'completed' }), agent('demo-1'), agent('demo-2', { status: 'completed' })]
    expect(clearOut(list, 'done', 'demo-').map(a => a.id)).toEqual(['a', 'demo-1'])
    expect(clearOut(list, 'demo', 'demo-').map(a => a.id)).toEqual(['a', 'b'])
    expect(clearOut(list, 'both', 'demo-').map(a => a.id)).toEqual(['a'])
  })

  test('Portuguese', async () => {
    expect(stallText(agent('a', { lastAt: NOW - 6 * MIN }), NOW, 'pt-BR')).toBe('parado há 6m 00s')
    const run = summarize([agent('a', { label: 'Mapear', tokens: t(0, 0, 300), startedAt: NOW, endedAt: NOW + MIN })], NOW)!
    expect(runText(run, 'pt-BR')).toBe('1 agente, 300 tokens em 1m 00s. Mais pesado: Mapear 300 (100%)')
  })
})

describe('stage 2', () => {
  test('the last five tool calls, each closed with how it went', async () => {
    let list = [agent('a')]
    for (let i = 0; i < 6; i++) {
      list = toolStart(list, 'a', `call ${i}`, NOW)
      list = toolEnd(list, 'a', i !== 3, NOW)
    }
    list = toolStart(list, 'a', 'call 6', NOW)
    expect(list[0]!.recent).toEqual([
      { doing: 'call 2', ok: true },
      { doing: 'call 3', ok: false },
      { doing: 'call 4', ok: true },
      { doing: 'call 5', ok: true },
      { doing: 'call 6', ok: null },
    ])
  })

  test('groups split running from finished, each by start or by most tokens', async () => {
    const list = [
      agent('a', { startedAt: 1, tokens: t(1, 0) }),
      agent('b', { startedAt: 2, tokens: t(9, 0) }),
      agent('c', { startedAt: 3, status: 'completed', tokens: t(5, 0) }),
      agent('d', { startedAt: 4, status: 'failed', tokens: t(7, 0) }),
    ]
    const by = groupsOf(list)
    expect(by.running.map(a => a.id)).toEqual(['a', 'b'])
    expect(by.finished.map(a => a.id)).toEqual(['c', 'd'])
    const heavy = groupsOf(list, 'tokens')
    expect(heavy.running.map(a => a.id)).toEqual(['b', 'a'])
    expect(heavy.finished.map(a => a.id)).toEqual(['d', 'c'])
  })

  test('the share of the 5h window a wave used', async () => {
    expect(fiveHourOf({ rateLimits: [{ kind: 'seven_day', percentUsed: 9 }, { kind: 'five_hour', percentUsed: 40 }] })).toBe(40)
    expect(fiveHourOf({ rateLimits: [] })).toBe(null)
    expect(windowUsed(40, 46)).toBe(6)
    expect(windowUsed(null, 46)).toBe(null)
    // The window reset during the wave: no figure.
    expect(windowUsed(90, 3)).toBe(null)
    const run = summarize([agent('a', { tokens: t(0, 0, 300), startedAt: NOW, endedAt: NOW + MIN })], NOW)!
    expect(runText({ ...run, windowUsed: 6 })).toContain('. Used ~6% of the 5h window')
    expect(runText({ ...run, windowUsed: 0.4 })).not.toContain('Used')
  })
})

describe('identity (G1)', () => {
  test('agents take the five slots in the order they appear, then start over', async () => {
    let list: ReturnType<typeof upsert> = []
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) list = upsert(list, id, NOW, {})
    expect(list.map(a => a.slot)).toEqual([0, 1, 2, 3, 4, 0])
    expect(nextSlot([])).toBe(0)
    expect(nextSlot(list)).toBe(1)
  })

  test('an agent keeps its slot when it is updated, and adopt gives a new one its own', async () => {
    const list = upsert(upsert([], 'a', NOW, {}), 'b', NOW, {})
    expect(upsert(list, 'a', NOW + 1, { status: 'completed' })[0]!.slot).toBe(0)
    expect(adopt(list, {}, 'c', NOW, { label: 'late' }).agents[2]!.slot).toBe(2)
  })
})

describe('the card (G2)', () => {
  test('the step is the model requests so far, one more while a request is out, never below one', async () => {
    expect(stepOf(agent('a'))).toBe(1)
    expect(stepOf(agent('a', { steps: 3 }))).toBe(3)
    expect(stepOf(agent('a', { steps: 3, activity: 'thinking' }))).toBe(4)
  })

  test('the card keeps the two calls that ended before the current one', async () => {
    let list = [agent('a')]
    for (let i = 0; i < 4; i++) {
      list = toolStart(list, 'a', `call ${i}`, NOW)
      list = toolEnd(list, 'a', i !== 2, NOW)
    }
    list = toolStart(list, 'a', 'call 4', NOW)
    expect(lastDone(list[0]!).map(r => r.doing)).toEqual(['call 2', 'call 3'])
    expect(lastDone(list[0]!, 3).map(r => r.doing)).toEqual(['call 1', 'call 2', 'call 3'])
    expect(lastDone(agent('b'))).toEqual([])
  })

  test('a bar is the agent\'s tokens against the heaviest, one cell at least', async () => {
    expect(fillCells(50, 100, 20)).toBe(10)
    expect(fillCells(100, 100, 20)).toBe(20)
    expect(fillCells(1, 1000, 20)).toBe(1)
    expect(fillCells(0, 100, 20)).toBe(0)
    expect(fillCells(5, 0, 20)).toBe(0)
  })
})

describe('compact mode (G4)', () => {
  test('one line an agent from compactAt agents on', async () => {
    expect(isCompact(4, 5)).toBe(false)
    expect(isCompact(5, 5)).toBe(true)
    expect(isCompact(1, 1)).toBe(true)
  })

  test('a long list fits as many items as the rows allow, and the wheel stops at the last start', async () => {
    const heights = [1, 8, 8, 8, 1, 1, 1]
    expect(fitRows(heights, 0, 20)).toEqual({ start: 0, end: 3 })
    expect(fitRows(heights, 1, 20)).toEqual({ start: 1, end: 3 })
    expect(lastStartFor(heights, 20)).toBe(2)
    expect(fitRows(heights, 99, 20)).toEqual({ start: 2, end: 7 })
    // A single item taller than the room still shows.
    expect(fitRows([30, 1], 0, 10)).toEqual({ start: 0, end: 1 })
    expect(fitRows([], 0, 10)).toEqual({ start: 0, end: 0 })
  })
})

describe('the windows (G3)', () => {
  test('the rate is the points waves moved a window over their tokens, null without any', async () => {
    expect(rateOf([])).toEqual({ five: null, week: null })
    const samples = addSample(addSample([], 100_000, 1, 0), 300_000, 3, 0.4)
    expect(near(rateOf(samples).five, 1 / 100_000)).toBe(true)
    expect(near(rateOf(samples).week, 0.4 / 400_000)).toBe(true)
    // A wave that read nothing says nothing; a window that never moved has no rate.
    expect(addSample([], 100, null, null)).toEqual([])
    expect(addSample([], 0, 2, 1)).toEqual([])
    expect(rateOf(addSample([], 100_000, 0, 0))).toEqual({ five: null, week: null })
  })

  test('only the last ten waves count', async () => {
    let samples = addSample([], 1000, 90, null)
    for (let i = 0; i < 10; i++) samples = addSample(samples, 1000, 1, null)
    expect(samples).toHaveLength(10)
    expect(near(rateOf(samples).five, 1 / 1000)).toBe(true)
  })

  test('the card says its share of each window as an estimate, a dash with no rate', async () => {
    const rate = { five: 1 / 100_000, week: 0.075 / 100_000 }
    expect(windowShare(130_000, rate)).toBe('~1% of the 5h window · ~0.1% of the week')
    expect(windowShare(130_000, rate, 'pt-BR')).toBe('~1% da janela 5h · ~0,1% da semana')
    expect(windowShare(20_000, rate)).toBe('<1% of the 5h window · <0.1% of the week')
    expect(windowShare(130_000, null)).toBe('— of the 5h window · — of the week')
    expect(fiveText(2.6)).toBe('~3%')
    expect(weekText(0.04)).toBe('<0.1%')
  })

  test('the summary: agents, tokens, time, the measured 5h change and the estimated week', async () => {
    const list = [agent('a', { startedAt: NOW, endedAt: NOW + 2 * MIN, status: 'completed', tokens: t(0, 0, 130_000) }), agent('b', { startedAt: NOW + MIN, tokens: t(0, 0, 270_000), isStalled: true })]
    const s = summaryOf(list, NOW + 3 * MIN, 4, { five: null, week: 0.075 / 100_000 })
    expect(s).toEqual({ agents: '2', tokens: '400k', time: '3m 00s', five: '+4%', week: '+0.3%', stalled: 1 })
    expect(summaryOf(list, NOW + 3 * MIN, null, null, 'pt-BR')).toMatchObject({ five: '—', week: '—' })
    expect(summaryOf(list, NOW, 0, { five: null, week: 0.001 / 100_000 }, 'pt-BR').week).toBe('<0,1%')
  })

  test('the weekly window is read the way the 5h one is', async () => {
    expect(sevenDayOf({ rateLimits: [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day', percentUsed: 9 }] })).toBe(9)
    expect(sevenDayOf(null)).toBe(null)
  })
})

describe('the message (G6)', () => {
  const run = { endedAt: NOW, count: 3, durationMs: 114_000, total: 627_000, top: null }

  test('a running wave: progress, the agent that moved last, its action and a gradient bar', () => {
    const list = [agent('a', { label: 'Research', status: 'completed', slot: 0 }), agent('b', { label: 'Pre-outline', slot: 1, activity: 'tool', doing: 'writing pre-outline.md', lastAt: NOW }), agent('c', { label: 'Script', slot: 2, activity: 'tool', doing: 'reading guide.md', lastAt: NOW - 1000 })]
    const m = messageOf(list, null, false, NOW, 'dark', 'en')
    expect(m).toMatchObject({ kind: 'run', label: 'Agents', count: '1/3', glyph: '■', color: '#61afef', name: 'Pre-outline', action: 'Writing pre-outline.md', stalled: null })
    const bar = (m as { bar: { filled: boolean; color: string }[] }).bar
    expect(bar).toHaveLength(10)
    expect(bar.filter(c => c.filled)).toHaveLength(3)
    expect(bar[0]!.color).toBe('#d97757')
  })

  test('a stalled agent comes first and the message says for how long', () => {
    const list = [agent('a', { label: 'Tests', isStalled: true, lastAt: NOW - 6 * MIN, activity: 'tool', doing: 'running npm test' }), agent('b', { label: 'Docs', lastAt: NOW })]
    expect(messageOf(list, null, false, NOW, 'dark', 'en')).toMatchObject({ name: 'Tests', stalled: 'Tests quiet for 6m 00s' })
    expect(messageOf(list, null, false, NOW, 'dark', 'pt-BR')).toMatchObject({ label: 'Agentes', stalled: 'Tests parado há 6m 00s' })
  })

  test('a long name is cut in the stalled text, and the thinking state has its word', () => {
    const long = 'A very long agent description that goes on'
    expect(messageOf([agent('a', { label: long, isStalled: true, lastAt: NOW - MIN })], null, false, NOW, 'dark', 'en')).toMatchObject({ stalled: 'A very long agent d… quiet for 1m 00s' })
    expect(messageOf([agent('a', { activity: 'thinking' })], null, false, NOW, 'dark', 'en')).toMatchObject({ action: 'Thinking' })
    expect(messageOf([agent('a')], null, false, NOW, 'dark', 'en')).toMatchObject({ action: 'Starting' })
  })

  test('the light theme has its own colors', () => {
    expect(messageOf([agent('a', { slot: 1 })], null, false, NOW, 'light', 'en')).toMatchObject({ color: '#1f6feb' })
  })

  test('a wave that is over says the summary only while it is the band, and nothing without a run', () => {
    const done = [agent('a', { status: 'completed' }), agent('b', { status: 'completed' }), agent('c', { status: 'completed' })]
    expect(messageOf(done, run, true, NOW, 'dark', 'en')).toEqual({ kind: 'done', text: '3 agents done · 627k · 1m 54s' })
    expect(messageOf(done, run, true, NOW, 'dark', 'pt-BR')).toEqual({ kind: 'done', text: '3 agentes prontos · 627k · 1m 54s' })
    expect(messageOf(done, run, false, NOW, 'dark', 'en')).toBeNull()
    expect(messageOf(done, null, true, NOW, 'dark', 'en')).toBeNull()
    expect(messageOf([], null, false, NOW, 'dark', 'en')).toBeNull()
  })

  test('the message lives in the card only when plain-view draws it and its row lists an agent', () => {
    expect(isInCard(true, [{ id: 'a' }])).toBe(true)
    expect(isInCard(true, [])).toBe(false)
    expect(isInCard(false, [{ id: 'a' }])).toBe(false)
    expect(isInCard(undefined, undefined)).toBe(false)
    expect(isInCard(true, 'not a list')).toBe(false)
  })
})
