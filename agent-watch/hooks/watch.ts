// Pure agent bookkeeping: no engine, so the tests drive it directly.

import type { Activity, Agent, Run, Tokens } from '../types'
import { clip, elapsed, tokens } from './ui'

const MAX_AGENTS = 60

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
  return a ? touch(list, id, now, 'tool', { doing, tools: a.tools + 1 }) : (list as Agent[])
}

export const toolEnd = (list: readonly Agent[], id: string, ok: boolean, now: number): Agent[] => {
  const a = list.find(x => x.id === id)
  return a ? touch(list, id, now, 'idle', { errors: a.errors + (ok ? 0 : 1) }) : (list as Agent[])
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
export const stallText = (a: Agent, now: number) => {
  const span = elapsed(quietFor(a, now))
  if (a.activity === 'thinking') return `thinking for ${span}`
  if (a.activity === 'tool') return `${a.doing ?? 'in a tool call'} for ${span}`
  return `quiet for ${span}`
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

export const runText = (r: Run) =>
  `${r.count} agent${r.count === 1 ? '' : 's'}, ${tokens(r.total)} tokens in ${elapsed(r.durationMs)}` +
  (r.top ? `. Heaviest: ${r.top.label} ${tokens(r.top.total)} (${Math.round(r.top.share * 100)}%)` : '')

export const nameOf = (a: Agent) => a.name || a.label

/** `prefix` leads the agent's first line, `rail` its second. */
export type Row = { agent: Agent; prefix: string; rail: string }

/** Depth-first, children under their parent by start time, with tree connectors. */
export const tree = (list: readonly Agent[]): Row[] => {
  const ids = new Set(list.map(a => a.id))
  const kids = new Map<string, Agent[]>()
  for (const a of list) {
    const p = a.parentId && ids.has(a.parentId) ? a.parentId : ''
    kids.set(p, [...(kids.get(p) ?? []), a])
  }
  const rows: Row[] = []
  const walk = (parent: string, rail: string) => {
    const children = (kids.get(parent) ?? []).sort((x, y) => x.startedAt - y.startedAt)
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

const base = (p: unknown) => (typeof p === 'string' ? (p.split('/').filter(Boolean).pop() ?? p) : '')

/** A tool call in a few words. */
export const labelOf = (tool: string, input: Readonly<Record<string, unknown>>): string => {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (tool) {
    case 'Bash':
      return `running ${clip(s('description') || s('command').split('\n')[0]!, 50)}`
    case 'Read':
      return `reading ${base(input.file_path)}`
    case 'Write':
      return `writing ${base(input.file_path)}`
    case 'Edit':
    case 'MultiEdit':
      return `editing ${base(input.file_path)}`
    case 'Grep':
      return `searching "${clip(s('pattern'), 30)}"`
    case 'Glob':
      return `finding ${clip(s('pattern'), 30)}`
    case 'WebFetch':
    case 'WebSearch':
      return `on the web`
    case 'Agent':
      return `delegating "${clip(s('description') || 'a task', 30)}"`
    default:
      return `calling ${clip(tool.startsWith('mcp__') ? (tool.split('__').pop() ?? tool) : tool, 30)}`
  }
}
