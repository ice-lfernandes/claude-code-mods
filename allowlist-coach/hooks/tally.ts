import type { Configured, Entry } from '../types'
import type { Lang } from './ui'
import { WORDS } from './words'

/** Approvals, with no refusal, before the coach offers a rule. */
export const THRESHOLD = 5
/** Entries kept per project; the least recent go first. */
export const ENTRIES_KEPT = 200

export const SETTINGS_FILE = '.claude/settings.local.json'

type Suggestion = { type: string; behavior?: string; rules?: readonly { toolName: string; ruleContent?: string }[] }

export const formatRule = (toolName: string, content?: string) => (content ? `${toolName}(${content})` : toolName)

const host = (url: unknown) => {
  try {
    return new URL(String(url)).hostname
  } catch {
    return ''
  }
}

/**
 * The rules that would have skipped this dialog: the engine's own suggestion when it made one
 * (what "Yes, and don't ask again" would save), else a narrow rule of our own.
 */
export const rulesFor = (tool: string, input: unknown, suggestions?: readonly Suggestion[]): string[] => {
  const offered = (suggestions ?? [])
    .filter(s => s.type === 'addRules' && s.behavior === 'allow')
    .flatMap(s => s.rules ?? [])
    .map(r => formatRule(r.toolName, r.ruleContent))
  if (offered.length > 0) return [...new Set(offered)]
  const args = (input ?? {}) as Record<string, unknown>
  if (tool === 'Bash' && typeof args.command === 'string') return [formatRule('Bash', args.command.trim())]
  if (tool === 'WebFetch' && host(args.url)) return [formatRule('WebFetch', `domain:${host(args.url)}`)]
  return [tool]
}

/** One short line for the call that asked. */
export const exampleOf = (tool: string, input: unknown) => {
  const args = (input ?? {}) as Record<string, unknown>
  const text = String(args.command ?? args.file_path ?? args.notebook_path ?? args.url ?? args.pattern ?? args.query ?? tool)
  const line = text.split('\n')[0]!.trim()
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

const BROAD_TOOLS = new Set(['Bash', 'PowerShell', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Read', 'Glob', 'Grep', 'WebFetch'])

const RISKY_COMMAND = [
  /^(sudo|su|doas)\b/,
  /^(rm|rmdir|dd|mkfs\S*|shred|truncate|chmod|chown|kill|pkill|killall|shutdown|reboot)\b/,
  /^(curl|wget|ssh|scp|rsync|nc|eval|exec|source)\b/,
  /^(bash|sh|zsh|fish|python\d*|node|deno|bun|ruby|perl)(\s+-[ce]\b|\s*$|\s*:\*)/,
  /^git\s+(push|reset|clean|rebase|filter-branch|update-ref)\b/,
  /^git\s+(checkout|restore)\s+(--\s+)?\.\s*$/,
  /^git\s+branch\s+-D\b/,
  /^(docker|kubectl|helm|terraform|aws|gcloud|az)\b.*\b(rm|delete|destroy|prune|apply)\b/,
  /^(npm|pnpm|yarn)\s+publish\b/,
  /--force\b|\s-f\b.*\bpush\b/,
  /\|\s*(sudo\s+)?(sh|bash|zsh)\b/,
]

/**
 * Whether a rule lets through more than one familiar command: a whole tool, a bare wildcard,
 * or a command that deletes, escalates, reaches the network or runs arbitrary code. Such a
 * rule is counted and shown, never offered.
 */
export const isRisky = (rule: string) => {
  const match = /^([^(]+)(?:\((.*)\))?$/s.exec(rule)
  if (!match) return true
  const [, toolName, content] = match
  if (content === undefined) return BROAD_TOOLS.has(toolName!)
  const body = content.trim()
  if (body === '' || body === '*' || body === ':*' || body === '**' || body.startsWith('/**')) return true
  if (toolName === 'Bash' || toolName === 'PowerShell') return RISKY_COMMAND.some(r => r.test(body))
  return false
}

const sameRule = (a: string, b: string) => a.replace(/\s+/g, ' ') === b.replace(/\s+/g, ' ')
const listed = (list: readonly string[], rule: string) => list.some(r => sameRule(r, rule))

export type Status = 'ready' | 'counting' | 'refused' | 'risky' | 'allowed' | 'pinned' | 'dismissed'

/**
 * Where an entry stands. `allowed`: every rule is in permissions.allow already. `pinned`: one
 * sits in ask or deny, a choice the coach never argues with. `ready`: offer it.
 */
export const status = (entry: Entry, configured: Configured): Status => {
  if (entry.state === 'added' || entry.rules.every(r => listed(configured.allow, r))) return 'allowed'
  if (entry.rules.some(r => listed(configured.ask, r) || listed(configured.deny, r))) return 'pinned'
  if (entry.state === 'dismissed') return 'dismissed'
  if (entry.rules.some(isRisky)) return 'risky'
  if (entry.denied > 0) return 'refused'
  return entry.approved >= THRESHOLD ? 'ready' : 'counting'
}

export const keyOf = (rules: readonly string[]) => rules.join(', ')

/** Counts one answered dialog; drops the least recent entries past ENTRIES_KEPT. */
export const record = (
  entries: Record<string, Entry>,
  rules: readonly string[],
  approved: boolean,
  example: string,
  now: number,
): Record<string, Entry> => {
  const key = keyOf(rules)
  const was = entries[key]
  const entry: Entry = {
    rules: [...rules],
    approved: (was?.approved ?? 0) + (approved ? 1 : 0),
    denied: (was?.denied ?? 0) + (approved ? 0 : 1),
    example,
    lastAt: now,
    state: was?.state ?? 'counting',
  }
  const next = { ...entries, [key]: entry }
  const keys = Object.keys(next)
  if (keys.length <= ENTRIES_KEPT) return next
  const keep = keys.sort((a, b) => next[b]!.lastAt - next[a]!.lastAt).slice(0, ENTRIES_KEPT)
  return Object.fromEntries(keep.map(k => [k, next[k]!]))
}

export const setState = (entries: Record<string, Entry>, key: string, state: Entry['state']) =>
  entries[key] ? { ...entries, [key]: { ...entries[key]!, state } } : entries

/** Approvals toward the offer: `●●●○○ 3/5`. */
export const progress = (approved: number) => {
  const done = Math.max(0, Math.min(THRESHOLD, approved))
  return `${'●'.repeat(done)}${'○'.repeat(THRESHOLD - done)} ${done}/${THRESHOLD}`
}

/** The line shown under an open dialog, or undefined when there is nothing to say yet. */
export const noticeFor = (entry: Entry | undefined, configured: Configured, lang: Lang = 'en') => {
  if (!entry || entry.approved === 0) return undefined
  const w = WORDS[lang]
  const s = status(entry, configured)
  if (s === 'risky') return w.noticeRisky(entry.approved)
  if (s === 'refused') return w.noticeRefused(entry.approved, entry.denied)
  if (s === 'ready' || s === 'dismissed') return w.noticeReady(entry.approved)
  return w.noticeCounting(progress(entry.approved), THRESHOLD - entry.approved, keyOf(entry.rules))
}

/**
 * The settings file's text with `rules` added to permissions.allow, or null when every rule is
 * there already. Throws on text that is not a JSON object, so a file it cannot read whole is
 * never rewritten.
 */
export const addAllow = (text: string, rules: readonly string[]): string | null => {
  const parsed: unknown = text.trim() === '' ? {} : JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${SETTINGS_FILE} is not a JSON object`)
  const settings = parsed as Record<string, unknown>
  const permissions = (settings.permissions ?? {}) as Record<string, unknown>
  if (typeof permissions !== 'object' || Array.isArray(permissions)) throw new Error(`permissions in ${SETTINGS_FILE} is not an object`)
  if (permissions.allow !== undefined && !Array.isArray(permissions.allow)) throw new Error(`permissions.allow in ${SETTINGS_FILE} is not a list`)
  const allow = [...((permissions.allow as string[] | undefined) ?? [])]
  const missing = rules.filter(r => !listed(allow, r))
  if (missing.length === 0) return null
  return `${JSON.stringify({ ...settings, permissions: { ...permissions, allow: [...allow, ...missing] } }, null, 2)}\n`
}

export const toConfigured = (settings: { permissions?: { allow?: unknown; ask?: unknown; deny?: unknown } } | undefined): Configured => {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((r): r is string => typeof r === 'string') : [])
  return { allow: list(settings?.permissions?.allow), ask: list(settings?.permissions?.ask), deny: list(settings?.permissions?.deny) }
}

/** JSON with sorted keys, so two copies of one tool input compare equal. */
export const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj)
      .filter(k => obj[k] !== undefined)
      .sort()
      .map(k => `${JSON.stringify(k)}:${stable(obj[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

const ORDER: Status[] = ['ready', 'counting', 'refused', 'risky', 'dismissed', 'pinned', 'allowed']

/** Entries in the order the pane lists them: ready first, then by approvals. */
export const sorted = (entries: Record<string, Entry>, configured: Configured) =>
  Object.entries(entries)
    .map(([key, entry]) => ({ key, entry, status: status(entry, configured) }))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.entry.approved - a.entry.approved || b.entry.lastAt - a.entry.lastAt)

/**
 * The key an argument of /allowlist allow or dismiss names: a number as the pane numbers the
 * rules (1 is the first), else the rule written out.
 */
export const keyAt = (entries: Record<string, Entry>, configured: Configured, arg: string): string => {
  if (!/^\d+$/.test(arg)) return arg
  return sorted(entries, configured)[Number(arg) - 1]?.key ?? arg
}

/** A text summary, for the command's answer where no pane can open; numbered as the pane is. */
export const summary = (entries: Record<string, Entry>, configured: Configured, lang: Lang = 'en') => {
  const w = WORDS[lang]
  const rows = sorted(entries, configured)
  if (rows.length === 0) return w.noDialogs
  return rows
    .slice(0, 15)
    .map((r, i) => `${String(i + 1).padStart(2)} ${w.status[r.status].padEnd(10)} ✓${r.entry.approved} ✗${r.entry.denied}  ${r.key}`)
    .concat(rows.some(r => r.status === 'ready') ? ['', w.addHint] : [])
    .join('\n')
}
