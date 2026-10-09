import { describe, expect, test } from 'claude-code/testing'

import type { Agent } from '../types'
import { addStep, adopt, clearOut, finish, fiveHourOf, glyphOf, shares, windowUsed, reconcile, runText, stalls, stallText, summarize, toolEnd, toolStart, total, touch, tree, ZERO } from '../hooks/watch'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const MIN = 60_000
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

  test('the tree nests children under their parent', async () => {
    const rows = tree([agent('a', { startedAt: 1 }), agent('c', { parentId: 'a', startedAt: 3 }), agent('b', { startedAt: 2 })])
    expect(rows.map(r => `${r.prefix}${r.agent.id}`)).toEqual(['├─a', '│ └─c', '└─b'])
    expect(rows[1]!.rail).toBe('│   ')
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
  test('shares add up to the width, heaviest first, the rest together', async () => {
    const list = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => agent(id, { tokens: t(0, 0, [50, 20, 10, 10, 5, 5][i]) }))
    const parts = shares(list, 20)
    expect(parts.map(p => p.agent?.id ?? 'rest')).toEqual(['a', 'b', 'c', 'd', 'rest'])
    expect(parts.map(p => p.cells)).toEqual([10, 4, 2, 2, 2])
    expect(parts.reduce((n, p) => n + p.cells, 0)).toBe(20)
    expect(shares([agent('x')], 20)).toEqual([])
  })

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

  test('the tree sorts siblings by tokens on request', async () => {
    const list = [agent('a', { startedAt: 1, tokens: t(1, 0) }), agent('b', { startedAt: 2, tokens: t(9, 0) })]
    expect(tree(list).map(r => r.agent.id)).toEqual(['a', 'b'])
    expect(tree(list, 'tokens').map(r => r.agent.id)).toEqual(['b', 'a'])
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
