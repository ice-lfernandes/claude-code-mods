// Pure agent bookkeeping: no engine, so the tests drive it directly.

import type { Activity, Agent, Message, Run, Tokens } from '../types'
import { SLOTS, barCells, colorOf, glyphOfSlot } from './look'
import type { Lang } from './ui'
import { clip, elapsed, tokens } from './ui'
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

/** The slot after the newest agent's, so agents take the five looks in the order they appear and start over after the fifth. */
export const nextSlot = (list: readonly Agent[]) => (list.length === 0 ? 0 : (list[list.length - 1]!.slot + 1) % SLOTS)

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
  slot: 0,
  ...patch,
})

export const upsert = (list: readonly Agent[], id: string, now: number, patch: Partial<Agent>): Agent[] => {
  const i = list.findIndex(a => a.id === id)
  if (i < 0) {
    const next = [...list, blank(id, now, { slot: nextSlot(list), ...patch })]
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

/** How the pane orders agents within a group. */
export type SortBy = 'start' | 'tokens'

export const nameOf = (a: Agent) => a.name || a.label

/** The text with its first letter capitalized. */
export const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

/** Cells of the band's bar. */
const BAND_CELLS = 10

/**
 * What the band above the prompt says: the wave's progress and the agent in focus (a stalled one
 * first, else the one that moved last), or the summary once the wave is done (`isDone`, with its
 * `run`). Null when there is nothing to say. The band and plain-view's child row both draw this.
 */
export const messageOf = (list: readonly Agent[], run: Run | null, isDone: boolean, now: number, theme: unknown, lang: Lang): Message | null => {
  const w = WORDS[lang]
  const running = list.filter(a => isActive(a.status))
  if (running.length === 0) return isDone && run ? { kind: 'done', text: w.band.done(run.count, tokens(run.total), elapsed(run.durationMs)) } : null
  const cur = running.find(a => a.isStalled) ?? running.reduce((best, a) => (a.lastAt > best.lastAt ? a : best), running[0]!)
  const finished = list.length - running.length
  const name = nameOf(cur)
  return {
    kind: 'run',
    label: w.band.agents,
    count: `${finished}/${list.length}`,
    bar: barCells(BAND_CELLS, finished / list.length, theme),
    glyph: glyphOfSlot(cur.slot),
    color: colorOf(cur.slot, theme),
    name,
    action: cap(cur.activity === 'thinking' ? w.thinking : (cur.doing ?? w.starting)),
    stalled: cur.isStalled ? w.band.stalled(clip(name, 20), elapsed(quietFor(cur, now))) : null,
  }
}

/** True when plain-view draws its card and the card has an agents row: the band's message lives there then. */
export const isInCard = (cardOn: unknown, agents: unknown) => cardOn === true && Array.isArray(agents) && agents.length > 0

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

/** The agents of each group, ordered by start time or by most tokens first. */
export const groupsOf = (list: readonly Agent[], order: SortBy = 'start'): { running: Agent[]; finished: Agent[] } => {
  const sorted = (xs: Agent[]) => xs.sort((x, y) => (order === 'tokens' ? total(y.tokens) - total(x.tokens) : 0) || x.startedAt - y.startedAt)
  return { running: sorted(list.filter(a => isActive(a.status))), finished: sorted(list.filter(a => !isActive(a.status))) }
}

/** Agents from which a pane draws one line each, until the person opens one. */
export const DEFAULT_COMPACT_AT = 5
export const isCompact = (count: number, at: number) => count >= at

/**
 * The step an agent is on: its model requests so far, one more while a request is out. An agent
 * that has made none is on its first. There is no "of N": nothing tells how many it will take.
 */
export const stepOf = (a: Agent) => Math.max(1, a.steps + (a.activity === 'thinking' ? 1 : 0))

/** The last `n` calls that ended, oldest first: what the card shows under its step line. */
export const lastDone = (a: Agent, n = 2) => (a.recent ?? []).filter(r => r.ok !== null).slice(-n)

/** An agent's bar of `width` cells, `tokens` of the heaviest agent's `max`: at least one cell for any tokens. */
export const fillCells = (tokensOf: number, max: number, width: number) => (tokensOf <= 0 || max <= 0 ? 0 : Math.max(1, Math.min(width, Math.round((tokensOf / max) * width))))

// --- the share of the plan's windows --------------------------------------------------------

/** One finished wave: its tokens and the points the 5-hour and weekly windows moved (null without a reading at both ends). */
export type RateSample = { tokens: number; five: number | null; week: number | null }

/** Percentage points of each window one token costs, from past waves; null while there is no sample to say. */
export type Rate = { five: number | null; week: number | null }

export const SAMPLES_KEPT = 10

/** Adds a wave to the samples, keeping the last ones; a wave with no tokens says nothing. */
export const addSample = (samples: readonly RateSample[], tokensOf: number, five: number | null, week: number | null): RateSample[] =>
  tokensOf > 0 && (five !== null || week !== null) ? [...samples, { tokens: tokensOf, five, week }].slice(-SAMPLES_KEPT) : [...samples]

/** Points per token of one window: the points waves moved it, over those waves' tokens. Null with no points at all. */
const per = (samples: readonly RateSample[], key: 'five' | 'week') => {
  const read = samples.filter(s => s[key] !== null)
  const points = read.reduce((n, s) => n + s[key]!, 0)
  const spent = read.reduce((n, s) => n + s.tokens, 0)
  return points > 0 && spent > 0 ? points / spent : null
}

export const rateOf = (samples: readonly RateSample[]): Rate => ({ five: per(samples, 'five'), week: per(samples, 'week') })

/** Points of a window `tokensOf` cost at `rate`; null without a rate. An estimate: the API gives the whole account's window, in whole percents. */
export const estimate = (tokensOf: number, rate: number | null) => (rate === null ? null : tokensOf * rate)

const decimal = (n: number, lang: Lang) => (lang === 'pt-BR' ? n.toFixed(1).replace('.', ',') : n.toFixed(1))

/** The 5-hour window's share as the card says it: `~3%`, `<1%`, or `—` with no estimate. */
export const fiveText = (points: number | null) => (points === null ? '—' : points < 0.5 ? '<1%' : `~${Math.round(points)}%`)

/** The weekly window's share, to a tenth: `~0.1%`, `<0.1%`, or `—`. */
export const weekText = (points: number | null, lang: Lang = 'en') => (points === null ? '—' : points < 0.05 ? `<${decimal(0.1, lang)}%` : `~${decimal(points, lang)}%`)

/** What a card says about the windows, from the agent's tokens. */
export const windowShare = (tokensOf: number, rate: Rate | null, lang: Lang = 'en') =>
  WORDS[lang].windowShare(fiveText(estimate(tokensOf, rate?.five ?? null)), weekText(estimate(tokensOf, rate?.week ?? null), lang))

/** The cells of the summary row. `usedFive` is what the wave has moved the 5-hour window by, measured; the week is estimated. */
export const summaryOf = (list: readonly Agent[], now: number, usedFive: number | null, rate: Rate | null, lang: Lang = 'en') => {
  const sum = list.reduce((n, a) => n + total(a.tokens), 0)
  const first = list.length ? Math.min(...list.map(a => a.startedAt)) : now
  const last = list.length ? Math.max(...list.map(a => a.endedAt ?? now)) : now
  const week = estimate(sum, rate?.week ?? null)
  return {
    agents: String(list.length),
    tokens: tokens(sum),
    time: elapsed(last - first),
    five: usedFive === null ? '—' : `+${Math.round(usedFive)}%`,
    week: week === null ? '—' : week < 0.05 ? `<${decimal(0.1, lang)}%` : `+${decimal(week, lang)}%`,
    stalled: list.filter(a => a.isStalled && isActive(a.status)).length,
  }
}

/** The 7-day window's percent in a usage reading, or null. */
export const sevenDayOf = (usage: { rateLimits?: readonly { kind: string; percentUsed: number }[] } | null | undefined) =>
  usage?.rateLimits?.find(r => r.kind === 'seven_day')?.percentUsed ?? null

// --- a long list, by rows ---------------------------------------------------------------------

/** The first item a scroll can start at so the rest still fills no more than `room` rows. */
export const lastStartFor = (heights: readonly number[], room: number) => {
  let used = 0
  let at = heights.length
  while (at > 0 && used + heights[at - 1]! <= room) used += heights[--at]!
  return Math.min(at, Math.max(0, heights.length - 1))
}

/** The items shown from `offset`, as many as fit in `room` rows (always at least one). */
export const fitRows = (heights: readonly number[], offset: number, room: number): { start: number; end: number } => {
  const start = Math.max(0, Math.min(offset, lastStartFor(heights, room)))
  let end = start
  let used = 0
  while (end < heights.length && (end === start || used + heights[end]! <= room)) used += heights[end++]!
  return { start, end }
}
