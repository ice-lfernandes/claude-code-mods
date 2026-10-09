// The plan card's logic, with no `$`: the agent's task list from its tool calls, the estimate of
// the current step, what the turn touched, the agents the main loop spawned, and the card as
// plain data that card.tsx draws.

import type { Agent, AgentText, End, Item, Turn } from '../types'
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

/** A harness notification's first line, such as `<task-notification>`: an XML-like tag. */
const NOTICE = /^<[a-zA-Z][\w-]*[\s>]/

const firstLine = (text: string) => text.split('\n').map(l => l.trim()).find(l => l !== '') ?? ''

/** Whether a turn's text is a harness notification (a background agent finished), not a request. */
const isNotice = (text: string) => NOTICE.test(firstLine(text))

/** The request's first line, for the card's title; none when the turn starts from a notification. */
export const titleOf = (text: string) => (isNotice(text) ? '' : firstLine(text))

/** A new turn: a fresh card, and the task list kept only while some task is still open. */
export const startTurn = (prev: Turn | null, items: Item[], text: string, now: number, lang: Lang): { turn: Turn; items: Item[] } => {
  // A notification keeps the last request's title, or says an agent finished.
  const title = titleOf(text) || prev?.title || (isNotice(text) ? WORDS[lang].agentDone : WORDS[lang].untitled)
  // A demo's sample list never carries into a real request.
  const open = !prev?.isDemo && items.some(i => i.status !== 'completed')
  return {
    turn: { title, startedAt: now, calls: 0, changed: [], read: [] },
    items: open ? items : [],
  }
}

/** How often, at most, the ticker asks $.agent.list() about an agent whose end it may have missed. */
export const LIST_MS = 2000

/** An agent $.agent.list() no longer names this long after it started counts as ended. */
export const GONE_MS = 10_000

/** The statuses $.agent.list() gives an agent that ended. */
const ENDED: readonly string[] = ['completed', 'failed', 'killed']

/** The agents a turn starts with: a request keeps the running ones, a notification keeps them all. */
export const keepAgents = (list: readonly Agent[], text: string): Agent[] =>
  isNotice(text) ? [...list] : list.filter(a => a.endedAt === undefined)

/** One more agent of the main loop, as agent.spawn answered it. */
export const spawnAgent = (list: readonly Agent[], id: string, label: string, now: number): Agent[] =>
  list.some(a => a.id === id) ? [...list] : [...list, { id, label, startedAt: now }]

/** The agent's run ended (its turn.complete). */
export const finishAgent = (list: readonly Agent[], id: string, now: number): Agent[] =>
  list.map(a => (a.id === id && a.endedAt === undefined ? { ...a, endedAt: now } : a))

/**
 * The agents after a look at $.agent.list(): one it lists as completed, failed or killed ended,
 * and so did one it no longer names GONE_MS after it started (its task dropped).
 */
export const reconcileAgents = (list: readonly Agent[], listed: readonly { id: string; status: string }[], now: number): Agent[] =>
  list.map(a => {
    if (a.endedAt !== undefined) return a
    const l = listed.find(x => x.id === a.id)
    const isOver = l ? ENDED.includes(l.status) : now - a.startedAt >= GONE_MS
    return isOver ? { ...a, endedAt: now } : a
  })

/** The agents still running. */
export const runningOf = (list: readonly Agent[]) => list.filter(a => a.endedAt === undefined)

/** The card's agents row: how many run (or finished), the latest one's label, and the time since the oldest running one started. */
export type AgentsRow = { isRunning: boolean; text: string; label: string; time?: string }

/** The agents row, or none when no agent ran this request. Never tokens or cost: those are agent-watch's. */
export const agentsRowOf = (list: readonly Agent[], now: number, lang: Lang): AgentsRow | undefined => {
  if (list.length === 0) return undefined
  const w = WORDS[lang]
  const running = runningOf(list)
  if (running.length > 0) {
    const latest = running.reduce((a, b) => (b.startedAt >= a.startedAt ? b : a))
    const oldest = Math.min(...running.map(a => a.startedAt))
    return { isRunning: true, text: w.agentsRunning(running.length), label: latest.label, time: elapsed(now - oldest) }
  }
  const latest = list.reduce((a, b) => ((b.endedAt ?? 0) >= (a.endedAt ?? 0) ? b : a))
  return { isRunning: false, text: w.agentsFinished(list.length), label: latest.label }
}

/** The index of the task being worked on: the first in progress, else the first pending; -1 when all are done. */
export const currentOf = (items: readonly Item[]) => {
  const busy = items.findIndex(i => i.status === 'in_progress')
  return busy >= 0 ? busy : items.findIndex(i => i.status === 'pending')
}

/** A new list that keeps the tool calls the old one counted, matched by subject, else by place. */
const keepCalls = (old: readonly Item[], next: Item[]): Item[] =>
  next.map((it, i) => {
    const kept = old.find(o => o.subject === it.subject) ?? old[i]
    return kept ? { ...it, calls: kept.calls } : it
  })

const CHECK = /^\s*(?:\d+[.)]|[-*+])\s+\[([ xX~>\-])\]\s+(.+?)\s*$/

/**
 * A checklist the agent wrote in its answer (`1. [ ] Ler a API`, `- [x] Montar o painel`), as a
 * task list: `[x]` done, `[~]` `[>]` `[-]` in progress, `[ ]` pending. Null under two items.
 */
export const checklistOf = (text: string): Item[] | null => {
  // The last run of checklist lines: blank lines may sit inside it, other text ends it.
  let items: Item[] = []
  let isOpen = false
  for (const line of text.split('\n')) {
    const m = CHECK.exec(line)
    if (!m) {
      if (line.trim() !== '') isOpen = false
      continue
    }
    if (!isOpen) items = []
    isOpen = true
    const subject = m[2]!.replace(/[*_`]/g, '').trim()
    if (!subject) continue
    const mark = m[1]!.toLowerCase()
    items.push({ subject, status: mark === 'x' ? 'completed' : mark === ' ' ? 'pending' : 'in_progress', calls: 0, fromText: true })
  }
  return items.length >= 2 ? items : null
}

/** The list after an answer of the agent: its last checklist, unless a task tool keeps the list. */
export const applyAnswer = (items: Item[], answer: string): Item[] => {
  if (items.some(i => !i.fromText)) return items
  const list = checklistOf(answer)
  return list ? keepCalls(items, list) : items
}

/** The task list after a task tool's call: TaskCreate adds (with the id its result gave), TaskUpdate changes, TodoWrite replaces. */
export const applyTask = (from: Item[], tool: string, input: Input, result?: unknown): Item[] => {
  // A task tool takes over from a checklist read in the text.
  const items = from.some(i => i.fromText) ? [] : from
  if (tool === 'TaskCreate') {
    const task = (result as { task?: { id?: unknown } } | undefined)?.task
    const subject = str(input.subject)
    if (!subject) return items
    const item: Item = { subject, status: 'pending', calls: 0 }
    if (typeof task?.id === 'string') item.id = task.id
    return [...items, item]
  }
  if (tool === 'TaskUpdate') {
    const id = str(input.taskId)
    const at = items.findIndex(i => i.id === id)
    if (at < 0) return from
    if (input.status === 'deleted') return items.filter((_, i) => i !== at)
    const was = items[at]!
    const next: Item = { ...was }
    if (isStatus(input.status)) next.status = input.status
    if (str(input.subject)) next.subject = str(input.subject)
    return items.map((it, i) => (i === at ? next : it))
  }
  if (tool === 'TodoWrite') {
    const todos = Array.isArray(input.todos) ? input.todos : []
    const list = todos
      .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null && str((t as Record<string, unknown>).content) !== '')
      .map((t): Item => ({ subject: str(t.content), status: isStatus(t.status) ? t.status : 'pending', calls: 0 }))
    return keepCalls(items, list)
  }
  return from
}

/** One more tool call for the task being worked on. */
export const countCall = (items: Item[]): Item[] => {
  const at = currentOf(items)
  return at < 0 ? items : items.map((it, i) => (i === at ? { ...it, calls: it.calls + 1 } : it))
}

/**
 * What a call is doing, for the card: phraseOf's words, but a Bash call by its own description
 * (the model's words, in its language), a skill by name, and any other tool as `usando X`.
 */
export const doingOf = (tool: string, input: Input, lang: Lang): string => {
  const w = WORDS[lang]
  if (tool === 'Bash' && str(input.description)) return clip(str(input.description), 50)
  if (tool === 'Skill' && str(input.skill)) return w.usingSkill(clip(str(input.skill), 30))
  if (KNOWN.includes(tool)) return phraseOf(tool, input, lang)
  return w.using(clip(tool.startsWith('mcp__') ? (tool.split('__').pop() ?? tool) : tool, 30))
}

const KNOWN = ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Agent']

/** The turn after a tool call on the main loop: what it is doing, and the file it changed or read. */
export const touch = (turn: Turn, tool: string, input: Input, lang: Lang, ok: boolean | null): Turn => {
  const file = str(input.file_path) || str(input.notebook_path)
  const next: Turn = { ...turn }
  if (ok === null) {
    next.calls = turn.calls + 1
    next.doing = doingOf(tool, input, lang)
    return next
  }
  if (ok && file) {
    if (CHANGES.includes(tool) && !turn.changed.includes(file)) next.changed = [...turn.changed, file]
    if (tool === 'Read' && !turn.read.includes(file)) next.read = [...turn.read, file]
  }
  return next
}

/** The turn once it ended, with its answer's first sentence when it gave one. */
export const endTurn = (turn: Turn, reason: string, now: number, answer = ''): Turn => {
  const end: End = reason === 'answer' ? 'answer' : reason === 'aborted' ? 'aborted' : 'error'
  const { doing: _, ...rest } = turn
  const first = firstSentence(answer)
  return { ...rest, endedAt: now, end, ...(first ? { answer: first } : {}) }
}

/** The `agentText` option; `final` when it names none. */
export const agentTextOf = (option: unknown): AgentText =>
  option === 'none' || option === 'card' || option === 'all' ? option : 'final'

/** Text with its markdown marks and runs of space gone, to compare a block with an answer. */
export const normalize = (text: string) => text.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim()

/** The first sentence of an answer, plain, up to 100 characters. */
export const firstSentence = (answer: string) => {
  const line = answer.split('\n').map(l => l.trim()).find(l => l !== '') ?? ''
  const flat = normalize(line.replace(/^(?:\d+[.)]|[-*+])\s+/, ''))
  // A sentence of at least 12 characters: `1.` or `e.g.` does not end one.
  const m = /^(.{11,}?[.!?])(\s|$)/.exec(flat)
  return clip(m ? m[1]! : flat, 100)
}

/** Mid-turn texts kept to hide their blocks under `final`: the last 200. Older ones show again. */
export const MID_KEPT = 200

/**
 * Whether an assistant block shows. Under `final`, a block hides only when its text is known to
 * be mid-turn (the text of a step that went on to call tools); anything else shows, so a final
 * answer, an old turn or a resumed session is never hidden by mistake.
 */
export const showsBlock = (mode: AgentText, text: string, mids: ReadonlySet<string> | readonly string[]) => {
  if (mode === 'all') return true
  if (mode !== 'final') return false
  const block = normalize(text)
  if (block === '') return true
  const list = [...mids]
  return !(list.includes(block) || list.some(m => m.includes(block)))
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
      /** The answer's first sentence, under `agentText: card`. */
      answer?: string
      agents?: AgentsRow
    }
  | { kind: 'phrase'; title: string; time: string; doing: string; agents?: AgentsRow }
  /** The main turn ended with no task list and an agent still runs: `Esperando 1 agente`. */
  | { kind: 'waiting'; title: string; time: string; text: string; agents: AgentsRow }
  /** A turn with no task list that called tools or agents ended: a small card with badge, time and files. */
  | { kind: 'summary'; state: 'done' | 'stopped'; title: string; badge: string; time: string; detail?: string; answer?: string }

/** The rows a long plan shows: WINDOW of them around the current one. */
export const windowAround = (total: number, at: number): { start: number; end: number } => {
  if (total <= WINDOW + 1) return { start: 0, end: total }
  const start = Math.max(0, Math.min(total - WINDOW, at - 1))
  return { start, end: start + WINDOW }
}

/**
 * The card for a turn, or null when there is none to show: no turn, or a turn with no list that
 * ended with no tool call and no agent (a plain conversation). `agents` are the main loop's.
 */
export const cardOf = (turn: Turn | null, items: readonly Item[], now: number, lang: Lang, withAnswer = false, agents: readonly Agent[] = []): Card | null => {
  if (!turn) return null
  const w = WORDS[lang]
  const span = elapsed((turn.endedAt ?? now) - turn.startedAt)
  const isOver = turn.end !== undefined
  const team = agentsRowOf(agents, now, lang)

  // No task list yet: the two first steps until the agent calls a tool, then the tool's phrase.
  if (items.length === 0) {
    if (isOver) {
      // The main turn ended with an agent running: the card waits for it.
      const running = runningOf(agents).length
      if (running > 0 && team) return { kind: 'waiting', title: turn.title, time: elapsed(now - turn.startedAt), text: w.waiting(running), agents: team }
      if (turn.calls === 0 && agents.length === 0) return null
      const isDone = turn.end === 'answer'
      const touched = turn.changed.length + turn.read.length > 0 ? w.files(turn.changed.length, turn.read.length) : ''
      const detail = [touched, agents.length > 0 ? w.agents(agents.length) : ''].filter(x => x !== '').join(' · ')
      return {
        kind: 'summary',
        state: isDone ? 'done' : 'stopped',
        title: turn.title,
        badge: isDone ? w.ready : turn.end === 'aborted' ? w.interrupted : w.stopped,
        time: isDone ? w.took(span) : w.stoppedAt(span),
        ...(detail ? { detail } : {}),
        ...(withAnswer && isDone && turn.answer ? { answer: turn.answer } : {}),
      }
    }
    if (turn.calls > 0) return { kind: 'phrase', title: turn.title, time: span, doing: capital(turn.doing ?? ''), ...(team ? { agents: team } : {}) }
    const est = Math.min(0.9, (now - turn.startedAt) / 1000 / FIRST_STEP_SECONDS)
    const rows: Row[] = [
      { kind: 'now', text: w.first[0], frac: est, status: `~${Math.round(est * 100)}%` },
      { kind: 'next', text: w.first[1], frac: 0, status: w.next },
    ]
    return { kind: 'plan', state: 'work', title: turn.title, time: span, label: w.step(1, 2), frac: est / 2, pct: pct(est / 2), rows, ...(team ? { agents: team } : {}) }
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
      if (state === 'stopped') return { kind: 'halted', text: it.subject, frac: Math.max(0.05, estimate(items, i)), status: w.halted }
      // The turn answered with this task open: it waits, nothing stopped it.
      if (state === 'done') return { kind: 'later', text: it.subject, frac: 0, status: w.leftOpen }
      return { kind: 'now', text: it.subject, frac: est, status: `~${Math.round(est * 100)}%`, doing: turn.doing }
    }
    return { kind: i === at + 1 ? 'next' : 'later', text: it.subject, frac: 0, status: i === at + 1 ? w.next : w.later }
  })
  // The rows outside the window, named by what they are: all done, or a count above or below.
  const outside = (list: readonly Item[], done: (n: number) => string, other: (n: number) => string) =>
    list.length === 0 ? undefined : list.every(i => i.status === 'completed') ? done(list.length) : other(list.length)
  const before = outside(items.slice(0, start), w.moreDone, w.moreBefore)
  const after = outside(items.slice(end), w.moreDone, w.moreAfter)

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
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(isOver && touched ? { files: touched } : {}),
    ...(withAnswer && state === 'done' && turn.answer ? { answer: turn.answer } : {}),
    ...(team ? { agents: team } : {}),
  }
}

const pct = (f: number) => `${Math.round(f * 100)}%`
const capital = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)

/** The sample turn /plain-view demo shows: step `step` of the four, `now` the time it shows. */
export const demoOf = (step: number, startedAt: number, lang: Lang): { turn: Turn; items: Item[] } => {
  const w = WORDS[lang]
  const items: Item[] = w.demoTasks.map((subject, i) => ({
    subject,
    status: i < step ? 'completed' : i === step ? 'in_progress' : 'pending',
    calls: i < step ? DEFAULT_CALLS : i === step ? 2 : 0,
  }))
  const turn: Turn = { title: w.demoTitle, startedAt, calls: step * DEFAULT_CALLS + 2, doing: w.demoDoing, changed: [], read: [], isDemo: true }
  return { turn, items }
}
