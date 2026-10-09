// The plan card's logic, with no `$`: the agent's task list from its tool calls, the estimate of
// the current step, what the turn touched, and the card as plain data that card.tsx draws.

import type { End, Item, Turn } from '../types'
import { phraseOf } from './phrases'
import type { Lang } from './ui'
import { clip, elapsed } from './ui'
import { WORDS } from './words'

/** Tools whose rows plain-view never hides: the agent's questions, its plan and its helpers. */
export const NEVER_HIDDEN: readonly string[] = ['AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode', 'Agent', 'Task']

/** The tools that write the agent's task list. */
export const TASK_TOOLS: readonly string[] = ['TaskCreate', 'TaskUpdate', 'TodoWrite']

const CHANGES = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']

/** Tool calls a step is guessed to take before any step has finished. */
export const DEFAULT_CALLS = 4

/** The highest estimate a step shows before its task is marked done. */
export const MAX_ESTIMATE = 0.95

/** Seconds the first step (understanding the request) is guessed to take. */
export const FIRST_STEP_SECONDS = 10

/** A plan of more than this many tasks shows a window of WINDOW around the current one. */
export const WINDOW = 5

type Input = Readonly<Record<string, unknown>>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const isStatus = (s: unknown): s is Item['status'] => s === 'pending' || s === 'in_progress' || s === 'completed'

/** The request's first line, for the card's title. */
export const titleOf = (text: string) => text.split('\n').map(l => l.trim()).find(l => l !== '') ?? ''

/** A new turn: a fresh card, and the task list kept only while some task is still open. */
export const startTurn = (prev: Turn | null, items: Item[], text: string, now: number, lang: Lang): { turn: Turn; items: Item[] } => {
  const title = titleOf(text) || prev?.title || WORDS[lang].untitled
  const open = items.some(i => i.status !== 'completed')
  return {
    turn: { title, startedAt: now, calls: 0, changed: [], read: [] },
    items: open ? items : [],
  }
}

/** The index of the task being worked on: the first in progress, else the first pending; -1 when all are done. */
export const currentOf = (items: readonly Item[]) => {
  const busy = items.findIndex(i => i.status === 'in_progress')
  return busy >= 0 ? busy : items.findIndex(i => i.status === 'pending')
}

/** The task list after a task tool's call: TaskCreate adds (with the id its result gave), TaskUpdate changes, TodoWrite replaces. */
export const applyTask = (items: Item[], tool: string, input: Input, result?: unknown): Item[] => {
  if (tool === 'TaskCreate') {
    const task = (result as { task?: { id?: unknown } } | undefined)?.task
    const subject = str(input.subject)
    if (!subject) return items
    const item: Item = { subject, status: 'pending', calls: 0 }
    if (typeof task?.id === 'string') item.id = task.id
    const form = str(input.activeForm)
    if (form) item.activeForm = form
    return [...items, item]
  }
  if (tool === 'TaskUpdate') {
    const id = str(input.taskId)
    const at = items.findIndex(i => i.id === id)
    if (at < 0) return items
    if (input.status === 'deleted') return items.filter((_, i) => i !== at)
    const was = items[at]!
    const next: Item = { ...was }
    if (isStatus(input.status)) next.status = input.status
    if (str(input.subject)) next.subject = str(input.subject)
    if (str(input.activeForm)) next.activeForm = str(input.activeForm)
    return items.map((it, i) => (i === at ? next : it))
  }
  if (tool === 'TodoWrite') {
    const todos = Array.isArray(input.todos) ? input.todos : []
    return todos
      .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null && str((t as Record<string, unknown>).content) !== '')
      .map((t, i) => {
        const subject = str(t.content)
        const kept = items.find(it => it.subject === subject) ?? items[i]
        const item: Item = { subject, status: isStatus(t.status) ? t.status : 'pending', calls: kept && kept.subject === subject ? kept.calls : 0 }
        if (str(t.activeForm)) item.activeForm = str(t.activeForm)
        return item
      })
  }
  return items
}

/** One more tool call for the task being worked on. */
export const countCall = (items: Item[]): Item[] => {
  const at = currentOf(items)
  return at < 0 ? items : items.map((it, i) => (i === at ? { ...it, calls: it.calls + 1 } : it))
}

/** The turn after a tool call on the main loop: what it is doing, and the file it changed or read. */
export const touch = (turn: Turn, tool: string, input: Input, lang: Lang, ok: boolean | null): Turn => {
  const file = str(input.file_path) || str(input.notebook_path)
  const next: Turn = { ...turn }
  if (ok === null) {
    next.calls = turn.calls + 1
    next.doing = phraseOf(tool, input, lang)
    return next
  }
  if (ok && file) {
    if (CHANGES.includes(tool) && !turn.changed.includes(file)) next.changed = [...turn.changed, file]
    if (tool === 'Read' && !turn.read.includes(file)) next.read = [...turn.read, file]
  }
  return next
}

/** The turn once it ended. */
export const endTurn = (turn: Turn, reason: string, now: number): Turn => {
  const end: End = reason === 'answer' ? 'answer' : reason === 'aborted' ? 'aborted' : 'error'
  const { doing: _, ...rest } = turn
  return { ...rest, endedAt: now, end }
}

/**
 * The current step's estimate, 0 to MAX_ESTIMATE: its tool calls against the average of the
 * finished steps (DEFAULT_CALLS before any). It is a guess, so the card shows it with `~`.
 */
export const estimate = (items: readonly Item[], at: number): number => {
  const item = items[at]
  if (!item) return 0
  const finished = items.filter(i => i.status === 'completed' && i.calls > 0)
  const average = finished.length ? finished.reduce((n, i) => n + i.calls, 0) / finished.length : DEFAULT_CALLS
  return Math.min(MAX_ESTIMATE, item.calls / Math.max(1, average))
}

/** What a task row shows: done, the one now, the next one, later ones, or the one a stop left. */
export type RowKind = 'done' | 'now' | 'next' | 'later' | 'halted'

export type Row = { kind: RowKind; text: string; frac: number; status: string; doing?: string }

/** The card as data. `state`: working, done (the turn answered) or stopped (interrupted or an error). */
export type Card =
  | {
      kind: 'plan'
      state: 'work' | 'done' | 'stopped'
      title: string
      badge?: string
      time: string
      label: string
      frac: number
      pct: string
      rows: Row[]
      /** `✓ mais 3 feitos` above a long plan's window, `○ mais 2 depois` below it. */
      before?: string
      after?: string
      files?: string
    }
  | { kind: 'phrase'; title: string; time: string; doing: string }

/** The rows a long plan shows: WINDOW of them around the current one. */
export const windowAround = (total: number, at: number): { start: number; end: number } => {
  if (total <= WINDOW + 1) return { start: 0, end: total }
  const start = Math.max(0, Math.min(total - WINDOW, at - 1))
  return { start, end: start + WINDOW }
}

/** The card for a turn, or null when there is none to show (no turn, or a turn with no list that ended). */
export const cardOf = (turn: Turn | null, items: readonly Item[], now: number, lang: Lang): Card | null => {
  if (!turn) return null
  const w = WORDS[lang]
  const span = elapsed((turn.endedAt ?? now) - turn.startedAt)
  const isOver = turn.end !== undefined

  // No task list yet: the two first steps until the agent calls a tool, then the tool's phrase.
  if (items.length === 0) {
    if (isOver) return null
    if (turn.calls > 0) return { kind: 'phrase', title: turn.title, time: span, doing: capital(turn.doing ?? '') }
    const est = Math.min(0.9, (now - turn.startedAt) / 1000 / FIRST_STEP_SECONDS)
    const rows: Row[] = [
      { kind: 'now', text: w.first[0]![0], frac: est, status: `~${Math.round(est * 100)}%` },
      { kind: 'next', text: w.first[1]![0], frac: 0, status: w.next },
    ]
    return { kind: 'plan', state: 'work', title: turn.title, time: span, label: w.step(1, 2), frac: est / 2, pct: pct(est / 2), rows }
  }

  const total = items.length
  const completed = items.filter(i => i.status === 'completed').length
  const at = currentOf(items)
  const state = turn.end === undefined ? 'work' : turn.end === 'answer' ? 'done' : 'stopped'
  const est = state === 'work' && at >= 0 ? estimate(items, at) : 0
  const frac = (completed + est) / total
  const { start, end } = windowAround(total, at < 0 ? total - 1 : at)

  const rows: Row[] = items.slice(start, end).map((it, j) => {
    const i = start + j
    if (it.status === 'completed') return { kind: 'done', text: it.subject, frac: 1, status: w.done }
    if (i === at) {
      if (state !== 'work') return { kind: 'halted', text: it.subject, frac: Math.max(0.05, estimate(items, i)), status: w.halted }
      return { kind: 'now', text: it.subject, frac: est, status: `~${Math.round(est * 100)}%`, doing: turn.doing }
    }
    return { kind: i === at + 1 ? 'next' : 'later', text: it.subject, frac: 0, status: i === at + 1 ? w.next : w.later }
  })

  const badge = state === 'done' ? (completed === total ? w.allDone : w.turnDone) : state === 'stopped' ? (turn.end === 'aborted' ? w.interrupted : w.stopped) : undefined
  const touched = turn.changed.length + turn.read.length > 0 ? w.files(turn.changed.length, turn.read.length) : undefined
  return {
    kind: 'plan',
    state,
    title: turn.title,
    ...(badge ? { badge } : {}),
    time: state === 'done' ? w.took(span) : state === 'stopped' ? w.stoppedAt(span) : span,
    label: state === 'done' && completed === total ? w.steps(total, total) : w.step(Math.min(total, (at < 0 ? total - 1 : at) + 1), total),
    frac,
    pct: pct(frac),
    rows,
    ...(start > 0 ? { before: w.moreDone(start) } : {}),
    ...(end < total ? { after: w.moreAfter(total - end) } : {}),
    ...(isOver && touched ? { files: touched } : {}),
  }
}

const pct = (f: number) => `${Math.round(f * 100)}%`
const capital = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

/** The sample turn /plain-view demo shows: step `step` of the four, `now` the time it shows. */
export const demoOf = (step: number, startedAt: number, lang: Lang): { turn: Turn; items: Item[] } => {
  const w = WORDS[lang]
  const items: Item[] = w.demoTasks.map(([subject, activeForm], i) => ({
    subject,
    activeForm,
    status: i < step ? 'completed' : i === step ? 'in_progress' : 'pending',
    calls: i < step ? DEFAULT_CALLS : i === step ? 2 : 0,
  }))
  const turn: Turn = { title: w.demoTitle, startedAt, calls: step * DEFAULT_CALLS + 2, doing: w.demoDoing, changed: [], read: [], isDemo: true }
  return { turn, items }
}

/** The title cut for a row of `room` columns. */
export const titleFor = (title: string, room: number) => clip(title, Math.max(8, room))
