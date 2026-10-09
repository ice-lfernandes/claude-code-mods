import type { Limit, Samples, Snapshot, Turn } from '../types'
import type { Lang } from './ui'
import { WORDS } from './words'

export const LIMIT_ALERTS = [80, 90, 100]
export const CONTEXT_ALERT = 85
/** Below this the context alert re-arms (after a compaction or /clear). */
export const CONTEXT_REARM = 50
export const TURNS_KEPT = 20
/** Readings kept per plan window for the pace, and how far apart they need to be. */
export const SAMPLES_KEPT = 60
const SAMPLE_GAP_MS = 60_000
/** The pace needs readings over this long before it says anything. */
const PACE_SPAN_MS = 10 * 60_000

export const label = (kind: string, lang: Lang = 'en') => WORDS[lang].labels[kind] ?? kind

/** Context full enough that the band and the pane offer /compact. */
export const needsCompact = (s: Snapshot) => s.contextPercent !== null && s.contextPercent >= CONTEXT_ALERT

type RateLimitIn = { kind: string; percentUsed: number; resetsAt?: string }
type ContextIn = { tokens?: number; window: number; percent?: number }

export const toSnapshot = (context: ContextIn, rateLimits: readonly RateLimitIn[]): Snapshot => ({
  limits: rateLimits.map(r => {
    const at = r.resetsAt ? Date.parse(r.resetsAt) : NaN
    return { kind: r.kind, percent: r.percentUsed, resetsAt: Number.isFinite(at) ? at : null }
  }),
  contextPercent: context.percent ?? null,
  contextTokens: context.tokens ?? null,
  contextWindow: context.window,
})

/** "3d4h", "1h12", "7m", "now"; "" when unknown. */
export const resetIn = (at: number | null, now: number, lang: Lang = 'en') => {
  if (at === null) return ''
  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  if (minutes === 0) return WORDS[lang].now
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}`
  return `${Math.floor(hours / 24)}d${hours % 24}h`
}

export const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n)}%`)

export const bar = (width: number, percent: number) => {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** The theme's colors: error from `dangerAt` (90%), warning from `warnAt` (70%), success below. */
export const tone = (percent: number | null, warnAt = 70, dangerAt = 90) =>
  percent === null ? undefined : percent >= dangerAt ? 'error' : percent >= warnAt ? 'warning' : 'success'

const CELLS = '▁▂▃▄▅▆▇█'

/** One cell for a percent, ▁ empty to █ full: the bar of a narrow terminal. */
export const mini = (percent: number) => CELLS[Math.round((Math.max(0, Math.min(100, percent)) / 100) * 7)]!

/** Context fill per turn, oldest first, on the 0 to 100 scale; a turn with no reading is a space. */
export const contextSpark = (turns: readonly Turn[]) => turns.map(t => (t.contextPercent == null ? ' ' : mini(t.contextPercent))).join('')

/** The turn with the most input, the one to look at first; undefined with no turns. */
export const heaviest = (turns: readonly Turn[]) => turns.reduce<Turn | undefined>((top, t) => (!top || t.input > top.input ? t : top), undefined)

/**
 * The readings with the snapshot's added: one per window a minute apart at least, dropped when
 * the window resets (its reset time moves), at most SAMPLES_KEPT.
 */
export const addSamples = (samples: Samples, s: Snapshot, now: number): Samples => {
  const next: Samples = { ...samples }
  for (const l of s.limits) {
    if (l.resetsAt === null) continue
    const was = samples[l.kind]
    const points = was && was.resetsAt === l.resetsAt ? was.points : []
    const last = points[points.length - 1]
    if (last && now - last[0] < SAMPLE_GAP_MS && last[1] === l.percent) continue
    const kept = last && now - last[0] < SAMPLE_GAP_MS ? points.slice(0, -1) : points
    next[l.kind] = { resetsAt: l.resetsAt, points: [...kept, [now, l.percent] as [number, number]].slice(-SAMPLES_KEPT) }
  }
  return next
}

/**
 * Milliseconds until the window reaches 100% at the pace of its readings (a least-squares
 * line), or null: too few readings, too short a span, a flat or falling pace, or a window that
 * resets first.
 */
export const pace = (points: readonly (readonly [number, number])[], now: number, resetsAt: number): number | null => {
  if (points.length < 3) return null
  const first = points[0]![0]
  const last = points[points.length - 1]!
  if (last[0] - first < PACE_SPAN_MS) return null
  const n = points.length
  const mx = points.reduce((a, p) => a + (p[0] - first), 0) / n
  const my = points.reduce((a, p) => a + p[1], 0) / n
  const sxx = points.reduce((a, p) => a + (p[0] - first - mx) ** 2, 0)
  const sxy = points.reduce((a, p) => a + (p[0] - first - mx) * (p[1] - my), 0)
  const slope = sxx > 0 ? sxy / sxx : 0
  if (slope <= 0) return null
  const at = first + mx + (100 - my) / slope
  const left = Math.max(0, at - now)
  return now + left < resetsAt ? left : null
}

export const toTurn = (
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; model: string },
  durationMs: number,
): Turn => {
  const input = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  return {
    input,
    output: usage.output_tokens,
    cacheHit: input > 0 ? usage.cache_read_input_tokens / input : null,
    model: usage.model,
    durationMs,
  }
}

export type Alert = { key: string; text: string }

/**
 * Alerts the snapshot raises that have not fired yet. A limit alert is keyed by its window's
 * reset time, so a new window re-arms it; the context alert re-arms once the fill drops below
 * CONTEXT_REARM. Returns the alerts and the fired list to store.
 */
export const alerts = (s: Snapshot, fired: readonly string[], now: number, lang: Lang = 'en'): { raised: Alert[]; fired: string[] } => {
  const w = WORDS[lang]
  let next = [...fired]
  const raised: Alert[] = []
  for (const limit of s.limits) {
    const hit = LIMIT_ALERTS.filter(t => limit.percent >= t)
    const top = hit[hit.length - 1]
    if (top === undefined) continue
    const keys = hit.map(t => `${limit.kind}:${limit.resetsAt ?? '-'}:${t}`)
    if (keys.every(k => next.includes(k))) continue
    next = [...next, ...keys.filter(k => !next.includes(k))]
    raised.push({ key: keys[keys.length - 1]!, text: w.windowAlert(label(limit.kind, lang), pct(limit.percent), resetIn(limit.resetsAt, now, lang)) })
  }
  const contextKey = `context:${CONTEXT_ALERT}`
  if (s.contextPercent !== null && s.contextPercent < CONTEXT_REARM) next = next.filter(k => k !== contextKey)
  if (s.contextPercent !== null && s.contextPercent >= CONTEXT_ALERT && !next.includes(contextKey)) {
    next = [...next, contextKey]
    raised.push({ key: contextKey, text: w.contextAlert(pct(s.contextPercent)) })
  }
  return { raised, fired: next }
}

/** One-line text summary, for the command's answer where no pane can open. */
export const summary = (s: Snapshot, last: Turn | undefined, now: number, lang: Lang = 'en') => {
  const w = WORDS[lang]
  const parts = s.limits.map(l => `${label(l.kind, lang)} ${pct(l.percent)}${l.resetsAt !== null ? ` (${w.resetsIn(resetIn(l.resetsAt, now, lang))})` : ''}`)
  parts.push(`${w.context} ${pct(s.contextPercent)}`)
  if (last?.cacheHit != null) parts.push(`cache ${pct(last.cacheHit * 100)}`)
  if (s.limits.length === 0) parts.push(w.noReadings)
  return parts.join(' · ')
}

/** Effort levels from least to most thinking, the gauge's five steps. */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** Effort as a five-step gauge, low ▰▱▱▱▱ to max ▰▰▰▰▰; "" for a level outside the list. */
export const gauge = (level: string | number | null | undefined) => {
  const n = EFFORT_LEVELS.indexOf(String(level) as (typeof EFFORT_LEVELS)[number]) + 1
  return n > 0 ? '▰'.repeat(n) + '▱'.repeat(EFFORT_LEVELS.length - n) : ''
}

/** Models from cheapest to costliest; a switch up this list is a costly one. */
export const MODEL_ORDER = ['haiku', 'sonnet', 'opus', 'fable'] as const

/** A model's place in MODEL_ORDER, or -1 for a model it does not name. */
export const rankOf = (model: string | null | undefined) => {
  const hit = /(haiku|sonnet|opus|fable)/i.exec(model ?? '')
  return hit ? MODEL_ORDER.indexOf(hit[1]!.toLowerCase() as (typeof MODEL_ORDER)[number]) : -1
}

/** Whether going from one model to another climbs MODEL_ORDER; an unknown model never does. */
export const isCostlier = (from: string | null | undefined, to: string | null | undefined) => {
  const a = rankOf(from)
  const b = rankOf(to)
  return a >= 0 && b > a
}

/** Turns the toast's pace reads: the last few, as the plan item says. */
export const PACE_TURNS = 3

/**
 * Minutes until the 5-hour window reaches 100% at the pace of the last PACE_TURNS main-thread
 * turns of this same window, or null: fewer turns than that, or no rise between them.
 */
export const minutesLeft = (five: Limit, recentTurns: readonly Turn[]): number | null => {
  const same = recentTurns.filter(t => t.fivePercent != null && t.endedAt != null && t.fiveResetsAt === five.resetsAt).slice(-PACE_TURNS)
  if (same.length < PACE_TURNS) return null
  const first = same[0]!
  const last = same[same.length - 1]!
  const span = last.endedAt! - first.endedAt!
  const rise = last.fivePercent! - first.fivePercent!
  if (span <= 0 || rise <= 0) return null
  return Math.max(0, Math.round(((100 - five.percent) * span) / rise / 60_000))
}

/** What the session runs: a model id and the effort of its last request. */
export type Setting = { model: string | null; effort: string | number | null }

/**
 * The toast for a costly switch (a model up MODEL_ORDER, or effort turning to max) with the
 * 5-hour window at `threshold` or more, or null when there is nothing to say. With a pace, the
 * minutes left; when the window resets before that, its reset time; with no pace, no number.
 */
export const switchWarning = (
  from: Setting,
  to: Setting,
  five: Limit | undefined,
  threshold: number,
  recentTurns: readonly Turn[],
  now: number,
  lang: Lang = 'en',
): string | null => {
  const toModel = isCostlier(from.model, to.model)
  const toMax = to.effort === 'max' && from.effort !== 'max'
  if (!toModel && !toMax) return null
  if (!five || five.percent < threshold) return null
  const w = WORDS[lang]
  const percent = pct(five.percent)
  const minutes = minutesLeft(five, recentTurns)
  if (minutes !== null) {
    const runsOutAt = now + minutes * 60_000
    if (five.resetsAt !== null && runsOutAt >= five.resetsAt) return w.switchResets(percent, resetIn(five.resetsAt, now, lang))
    return w.switchPace(percent, minutes < 60 ? `${minutes} min` : resetIn(runsOutAt, now, lang))
  }
  return w.switchFaster(percent, toModel ? (/(haiku|sonnet|opus|fable)/i.exec(to.model ?? '')?.[1]?.toLowerCase() ?? '') : 'effort max')
}
