// Pure agent bookkeeping: no engine, so the tests drive it directly.

import type { Activity, Agent, Run, Tokens } from '../types'
import type { Lang } from './ui'
import { elapsed, tokens } from './ui'
import { WORDS } from './words'

const MAX_AGENTS = 60
/** Tool calls an agent row keeps for its expanded view. */
export const RECENT_KEPT = 5

export const ZERO: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

export type Listed = { id: string; description: string; type: string; status: string; parentId?: string; name?: string }

export const fromUsage = (u: Usage): Tokens => ({
  input: u.input_tokens,
  output: u.output_tokens,
  cacheRead: u.cache_read_input_tokens,
  cacheWrite: u.cache_creation_input_tokens,
})

export const add = (a: Tokens, b: Tokens): Tokens => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
})

export const total = (t: Tokens) => t.input + t.output + t.cacheRead + t.cacheWrite

/** Running a turn, about to, or held on its own background work. */
export const isActive = (status: string) => status === 'running' || status === 'pending' || status === 'waiting'
export const isFailed = (status: string) => status === 'failed' || status === 'killed'

const blank = (id: string, now: number, patch: Partial<Agent>): Agent => ({
  id,
  label: 'agent',
  type: 'agent',
  status: 'running',
  startedAt: now,
  lastAt: now,
  activity: 'idle',
  tools: 0,
  errors: 0,
  steps: 0,
  tokens: ZERO,
  isStalled: false,
  ...patch,
})

export const upsert = (list: readonly Agent[], id: string, now: number, patch: Partial<Agent>): Agent[] => {
  const i = list.findIndex(a => a.id === id)
  if (i < 0) {
    const next = [...list, blank(id, now, patch)]
    return next.length > MAX_AGENTS ? next.slice(next.length - MAX_AGENTS) : next
  }
  const next = list.slice()
  next[i] = { ...next[i]!, ...patch }
  return next
}

/** A new agent, taking the tokens its loop spent before it was known. */
export const adopt = (
  list: readonly Agent[],
  orphans: Readonly<Record<string, Tokens>>,
  id: string,
  now: number,
  patch: Partial<Agent>,
): { agents: Agent[]; orphans: Record<string, Tokens> } => {
  const early = orphans[id]
  const had = list.find(a => a.id === id)
  const agents = upsert(list, id, now, early ? { ...patch, tokens: add(had?.tokens ?? ZERO, early) } : patch)
  if (!early) return { agents, orphans: { ...orphans } }
  const { [id]: _, ...rest } = orphans
  return { agents, orphans: rest }
}

/** Something happened in the loop: the stall clock restarts. */
export const touch = (list: readonly Agent[], id: string, now: number, activity: Activity, patch: Partial<Agent> = {}): Agent[] =>
  list.some(a => a.id === id) ? upsert(list, id, now, { ...patch, activity, lastAt: now, isStalled: false }) : (list as Agent[])

/** A model request ended: its tokens go to the agent, or to the orphans while no agent has the id. */
export const addStep = (
  list: readonly Agent[],
  orphans: Readonly<Record<string, Tokens>>,
  id: string,
  tokens: Tokens,
  model: string,
  now: number,
): { agents: Agent[]; orphans: Record<string, Tokens> } => {
  const a = list.find(x => x.id === id)
  if (!a) return { agents: list as Agent[], orphans: { ...orphans, [id]: add(orphans[id] ?? ZERO, tokens) } }
  return { agents: touch(list, id, now, 'idle', { tokens: add(a.tokens, tokens), steps: a.steps + 1, model }), orphans: { ...orphans } }
}

export const toolStart = (list: readonly Agent[], id: string, doing: string, now: number): Agent[] => {
  const a = list.find(x => x.id === id)
  const recent = [...(a?.recent ?? []), { doing, ok: null }].slice(-RECENT_KEPT)
  return a ? touch(list, id, now, 'tool', { doing, tools: a.tools + 1, recent }) : (list as Agent[])
}

export const toolEnd = (list: readonly Agent[], id: string, ok: boolean, now: number): Agent[] => {
  const a = list.find(x => x.id === id)
  if (!a) return list as Agent[]
  // The call that ends is the last one still open.
  const recent = [...(a.recent ?? [])]
  const open = recent.map(r => r.ok).lastIndexOf(null)
  if (open >= 0) recent[open] = { ...recent[open]!, ok }
  return touch(list, id, now, 'idle', { errors: a.errors + (ok ? 0 : 1), recent })
}

/**
 * A subagent's run ended in its `turn.complete`. Closed here because the listing may drop the
 * agent before a poll sees its final status. Teammates end a turn without ending.
 */
export const finish = (list: readonly Agent[], id: string, reason: string, now: number): Agent[] => {
  const a = list.find(x => x.id === id)
  if (!a || a.type === 'teammate' || !isActive(a.status)) return list as Agent[]
  const status = reason === 'aborted' ? 'killed' : reason === 'answer' ? 'completed' : 'failed'
  return upsert(list, id, now, { status, endedAt: now, activity: 'idle' })
}

/**
 * Folds `$.agent.list()` in: new agents adopt their early tokens, statuses move, and agents
 * that left the active statuses get an end time. An agent the listing dropped keeps its row.
 */
export const reconcile = (
  list: readonly Agent[],
  orphans: Readonly<Record<string, Tokens>>,
  listed: readonly Listed[],
  now: number,
): { agents: Agent[]; orphans: Record<string, Tokens>; finished: Agent[] } => {
  let agents = list as Agent[]
  let left = { ...orphans }
  const finished: Agent[] = []
  for (const l of listed) {
    const had = agents.find(a => a.id === l.id)
    // A listing that lags behind finish() must not bring the agent back; activity after the end does.
    const isLagging = had?.endedAt !== undefined && isActive(l.status) && had.lastAt <= had.endedAt
    const patch: Partial<Agent> = {
      ...(isLagging ? {} : { status: l.status }),
      ...(had ? {} : { label: l.description || l.name || l.type, type: l.type }),
      ...(l.name ? { name: l.name } : {}),
      ...(l.parentId ? { parentId: l.parentId } : {}),
    }
    if (had && isActive(had.status) && !isActive(l.status)) {
      Object.assign(patch, { endedAt: now, activity: 'idle' as const })
      finished.push({ ...had, ...patch })
    }
    if (!had && !isActive(l.status)) patch.endedAt = now
    if (had?.endedAt !== undefined && isActive(l.status) && !isLagging) patch.endedAt = undefined
    const next = adopt(agents, left, l.id, now, patch)
    agents = next.agents
    left = next.orphans
  }
  return { agents, orphans: left, finished }
}

export const quietFor = (a: Agent, now: number) => Math.max(0, now - a.lastAt)

/**
 * Marks running agents quiet for `thresholdMs` or longer as stalled, once per quiet spell.
 * Only `running` counts: a teammate between turns is `idle`, and `waiting` is held on purpose.
 */
export const stalls = (list: readonly Agent[], now: number, thresholdMs: number): { agents: Agent[]; raised: Agent[] } => {
  const raised: Agent[] = []
  const agents = list.map(a => {
    if (a.isStalled || a.status !== 'running' || quietFor(a, now) < thresholdMs) return a
    const marked = { ...a, isStalled: true }
    raised.push(marked)
    return marked
  })
  return { agents: raised.length ? agents : (list as Agent[]), raised }
}

/** "thinking for 6m", "in Bash (running npm test) for 6m", "quiet for 6m". */
export const stallText = (a: Agent, now: number, lang: Lang = 'en') => {
  const w = WORDS[lang]
  const span = elapsed(quietFor(a, now))
  if (a.activity === 'thinking') return w.thinkingFor(span)
  if (a.activity === 'tool') return w.doingFor(a.doing ?? w.inATool, span)
  return w.quietFor(span)
}

/** What a wave of agents came to. Null when the wave had none. */
export const summarize = (wave: readonly Agent[], now: number): Run | null => {
  if (wave.length === 0) return null
  const sum = wave.reduce((n, a) => n + total(a.tokens), 0)
  const heaviest = wave.reduce((best, a) => (total(a.tokens) > total(best.tokens) ? a : best), wave[0]!)
  const first = Math.min(...wave.map(a => a.startedAt))
  const last = Math.max(...wave.map(a => a.endedAt ?? now))
  return {
    endedAt: now,
    count: wave.length,
    durationMs: last - first,
    total: sum,
    top: total(heaviest.tokens) > 0 ? { label: nameOf(heaviest), total: total(heaviest.tokens), share: total(heaviest.tokens) / sum } : null,
  }
}

export const runText = (r: Run, lang: Lang = 'en') =>
  WORDS[lang].run(r.count, tokens(r.total), elapsed(r.durationMs)) +
  (r.top ? WORDS[lang].heaviest(r.top.label, tokens(r.top.total), Math.round(r.top.share * 100)) : '') +
  (r.windowUsed != null && r.windowUsed >= 1 ? WORDS[lang].windowUsed(Math.round(r.windowUsed)) : '')

/** Points of the 5-hour window a wave used, from its reading at the start and at the end; null without both. */
export const windowUsed = (start: number | null, end: number | null) => (start === null || end === null || end < start ? null : end - start)

/** The 5-hour window's percent in a usage reading, or null. */
export const fiveHourOf = (usage: { rateLimits?: readonly { kind: string; percentUsed: number }[] } | null | undefined) =>
  usage?.rateLimits?.find(r => r.kind === 'five_hour')?.percentUsed ?? null

/** One part of the share bar: an agent, or the rest together (`agent` null), and its cells. */
export type Share = { agent: Agent | null; tokens: number; cells: number }

/**
 * Each agent's part of `width` cells by tokens: the `top` heaviest on their own, the rest as
 * one part. Cells go by largest remainder, so they add up to `width`; an agent with tokens gets
 * a cell at least when there is room.
 */
export const shares = (list: readonly Agent[], width: number, top = 4): Share[] => {
  const withTokens = list.filter(a => total(a.tokens) > 0).sort((x, y) => total(y.tokens) - total(x.tokens))
  const sum = withTokens.reduce((n, a) => n + total(a.tokens), 0)
  if (sum === 0 || width <= 0) return []
  const parts: Share[] = withTokens.slice(0, top).map(a => ({ agent: a, tokens: total(a.tokens), cells: 0 }))
  const rest = withTokens.slice(top).reduce((n, a) => n + total(a.tokens), 0)
  if (rest > 0) parts.push({ agent: null, tokens: rest, cells: 0 })
  const exact = parts.map(p => (p.tokens / sum) * width)
  parts.forEach((p, i) => (p.cells = Math.floor(exact[i]!)))
  let left = width - parts.reduce((n, p) => n + p.cells, 0)
  const order = parts.map((_, i) => i).sort((i, j) => exact[j]! - Math.floor(exact[j]!) - (exact[i]! - Math.floor(exact[i]!)))
  for (const i of order) {
    if (left === 0) break
    parts[i]!.cells++
    left--
  }
  return parts
}

/** How the pane orders agents among their siblings. */
export type SortBy = 'start' | 'tokens'

export const nameOf = (a: Agent) => a.name || a.label

/** `prefix` leads the agent's first line, `rail` its second. */
export type Row = { agent: Agent; prefix: string; rail: string }

/** Depth-first, children under their parent by start time (or most tokens first), with tree connectors. */
export const tree = (list: readonly Agent[], sortBy: SortBy = 'start'): Row[] => {
  const ids = new Set(list.map(a => a.id))
  const kids = new Map<string, Agent[]>()
  for (const a of list) {
    const p = a.parentId && ids.has(a.parentId) ? a.parentId : ''
    kids.set(p, [...(kids.get(p) ?? []), a])
  }
  const rows: Row[] = []
  const walk = (parent: string, rail: string) => {
    const children = (kids.get(parent) ?? []).sort((x, y) => (sortBy === 'tokens' ? total(y.tokens) - total(x.tokens) : 0) || x.startedAt - y.startedAt)
    children.forEach((a, i) => {
      const last = i === children.length - 1
      const below = rail + (last ? '  ' : '│ ')
      rows.push({ agent: a, prefix: rail + (last ? '└─' : '├─'), rail: below })
      walk(a.id, below)
    })
  }
  walk('', '')
  return rows
}

/** The agents left after a clear: `done` drops the finished ones, `demo` the demo ones, `both` both. */
export const clearOut = (list: readonly Agent[], kind: 'done' | 'demo' | 'both', demoPrefix: string): Agent[] =>
  list.filter(a => {
    const isDemo = a.id.startsWith(demoPrefix)
    if (kind === 'demo') return !isDemo
    if (kind === 'done') return isActive(a.status)
    return isActive(a.status) && !isDemo
  })

const SPINNER = '◐◓◑◒'

/** The glyph of an agent: a spinner while it runs, `!` stalled, ✓ done, × failed. */
export const glyphOf = (a: Agent, tick: number) =>
  isActive(a.status) ? (a.isStalled ? '!' : SPINNER[tick % SPINNER.length]!) : isFailed(a.status) ? '×' : '✓'
