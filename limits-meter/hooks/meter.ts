import type { Limit, Snapshot, Turn } from '../types'

export const LIMIT_ALERTS = [80, 90, 100]
export const CONTEXT_ALERT = 85
/** Below this the context alert re-arms (after a compaction or /clear). */
export const CONTEXT_REARM = 50
export const TURNS_KEPT = 20

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'wk', spend_limit: 'spend' }

export const label = (kind: string) => LABELS[kind] ?? kind

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
export const resetIn = (at: number | null, now: number) => {
  if (at === null) return ''
  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  if (minutes === 0) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}`
  return `${Math.floor(hours / 24)}d${hours % 24}h`
}

/** 1234 -> "1.2k", 1234567 -> "1.2M". */
export const tokens = (n: number) => {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n)}%`)

export const bar = (width: number, percent: number) => {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const tone = (percent: number | null) =>
  percent === null ? undefined : percent >= 90 ? 'red' : percent >= 70 ? 'yellow' : 'green'

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

export const shortModel = (model: string) => model.replace(/^claude-/, '').replace(/-\d{8}$/, '')

export type Alert = { key: string; text: string }

/**
 * Alerts the snapshot raises that have not fired yet. A limit alert is keyed by its window's
 * reset time, so a new window re-arms it; the context alert re-arms once the fill drops below
 * CONTEXT_REARM. Returns the alerts and the fired list to store.
 */
export const alerts = (s: Snapshot, fired: readonly string[], now: number): { raised: Alert[]; fired: string[] } => {
  let next = [...fired]
  const raised: Alert[] = []
  for (const limit of s.limits) {
    const hit = LIMIT_ALERTS.filter(t => limit.percent >= t)
    const top = hit[hit.length - 1]
    if (top === undefined) continue
    const keys = hit.map(t => `${limit.kind}:${limit.resetsAt ?? '-'}:${t}`)
    if (keys.every(k => next.includes(k))) continue
    next = [...next, ...keys.filter(k => !next.includes(k))]
    const reset = resetIn(limit.resetsAt, now)
    raised.push({ key: keys[keys.length - 1]!, text: `${label(limit.kind)} window at ${pct(limit.percent)}${reset ? `, resets in ${reset}` : ''}` })
  }
  const contextKey = `context:${CONTEXT_ALERT}`
  if (s.contextPercent !== null && s.contextPercent < CONTEXT_REARM) next = next.filter(k => k !== contextKey)
  if (s.contextPercent !== null && s.contextPercent >= CONTEXT_ALERT && !next.includes(contextKey)) {
    next = [...next, contextKey]
    raised.push({ key: contextKey, text: `Context ${pct(s.contextPercent)} full: a good moment for /compact with a focus` })
  }
  return { raised, fired: next }
}

/** One-line text summary, for the command's answer where no pane can open. */
export const summary = (s: Snapshot, last: Turn | undefined, now: number) => {
  const parts = s.limits.map(l => `${label(l.kind)} ${pct(l.percent)}${l.resetsAt !== null ? ` (resets in ${resetIn(l.resetsAt, now)})` : ''}`)
  parts.push(`context ${pct(s.contextPercent)}`)
  if (last?.cacheHit != null) parts.push(`cache ${pct(last.cacheHit * 100)}`)
  if (s.limits.length === 0) parts.push('no plan-limit readings (API key, or before the first response)')
  return parts.join(' · ')
}
