// The plan card's logic, with no `$`: the agent's task list from its tool calls, the estimate of
// the current step, what the turn touched, the agents the main loop spawned, and the card as
// plain data that card.tsx draws.

import type { Agent, AgentText, End, Item, RequestLine, Turn } from '../types'
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

/** A harness notification's opening tag, such as `<task-notification>`: an XML-like tag. */
const NOTICE = /^<([a-zA-Z][\w-]*)[\s>]/

const firstLine = (text: string) => text.split('\n').map(l => l.trim()).find(l => l !== '') ?? ''

/**
 * The turn's text without the harness notifications it starts with: each one up to its closing
 * tag, or its line when it has none. A request sent with a notification follows them.
 */
const requestOf = (text: string) => {
  let rest = text.trimStart()
  for (let m = NOTICE.exec(rest); m; m = NOTICE.exec(rest)) {
    const close = rest.indexOf(`</${m[1]}>`)
    const end = rest.indexOf('\n')
    rest = (close >= 0 ? rest.slice(close + m[1]!.length + 3) : end >= 0 ? rest.slice(end + 1) : '').trimStart()
  }
  return rest
}

/** Whether a turn's text is only a harness notification (a background agent finished), with no request. */
const isNotice = (text: string) => NOTICE.test(text.trimStart()) && requestOf(text) === ''

/** The request's first line, for the card's title; none when the turn holds only a notification. */
export const titleOf = (text: string) => firstLine(requestOf(text))

/**
 * The request's lines for the card: the turn's text past its notifications, each non-blank line
 * trimmed, and a fenced code block as one line that counts its lines (`{ code: 4 }`). Fences
 * open and close as in checklistOf (fenceOf, closes).
 */
export const requestLinesOf = (text: string): RequestLine[] => {
  const lines: RequestLine[] = []
  let fence: Fence | null = null
  let code = 0
  for (const raw of requestOf(text).split('\n')) {
    if (fence) {
      if (closes(raw, fence)) {
        lines.push({ code })
        fence = null
      } else code++
      continue
    }
    const opened = indentOf(raw) <= 3 ? fenceOf(raw, false) : null
    if (opened) {
      fence = opened
      code = 0
      continue
    }
    const line = raw.trim().replace(/\s+/g, ' ')
    if (line) lines.push(line)
  }
  // A fence left open still counts what it held.
  if (fence) lines.push({ code })
  return lines
}

/**
 * A new turn: a fresh card, and the task list kept only while some task is still open. A new
 * request puts an open checklist read from the text to sleep (`dormant`): not drawn, it counts
 * no call, and wakes only when an answer writes one of its tasks again (wake).
 */
export const startTurn = (prev: Turn | null, items: Item[], text: string, now: number, lang: Lang): { turn: Turn; items: Item[]; dormant: Item[] } => {
  // A notification, or a continuation with no text, keeps the last request's title and lines.
  const isRequest = titleOf(text) !== ''
  const title = titleOf(text) || prev?.title || (isNotice(text) ? WORDS[lang].agentDone : WORDS[lang].untitled)
  const lines = isRequest ? requestLinesOf(text) : (prev?.lines ?? [])
  // A demo's sample list never carries into a real request.
  const open = !prev?.isDemo && items.some(i => i.status !== 'completed')
  // A notification or a continuation goes on with the request before it: its checklist stays awake.
  const isAsleep = open && isRequest && items.some(i => i.fromText)
  return {
    turn: { title, startedAt: now, calls: 0, changed: [], read: [], ...(lines.length > 1 || lines.some(l => typeof l !== 'string') ? { lines } : {}) },
    items: open && !isAsleep ? items : [],
    dormant: isAsleep ? items : [],
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

/** A list item of any kind, checklist or not. */
const LIST = /^\s*(?:\d+[.)]|[-*+])\s/

/** A code fence's line: three or more backticks or tildes, then an info string or nothing. */
const FENCE = /^[ \t]*(`{3,}|~{3,})(.*)$/

/** A blockquote's line. */
const QUOTE = /^ {0,3}>/

/** A line's indent in columns, a tab reaching the next multiple of 4. */
const indentOf = (line: string) => {
  let col = 0
  for (const c of line) {
    if (c === ' ') col++
    else if (c === '\t') col += 4 - (col % 4)
    else break
  }
  return col
}

/** An open code fence: its mark, its length, and whether it sits in a list (any indent closes it then). */
type Fence = { char: string; size: number; isNested: boolean }

/** The fence a line opens, or none: a backtick fence's info string holds no backtick. */
const fenceOf = (line: string, isNested: boolean): Fence | null => {
  const m = FENCE.exec(line)
  if (!m || (m[1]![0] === '`' && m[2]!.includes('`'))) return null
  return { char: m[1]![0]!, size: m[1]!.length, isNested }
}

/** Whether a line closes the fence: the same mark, at least as long, and only spaces after it. */
const closes = (line: string, fence: Fence) => {
  const m = FENCE.exec(line)
  const isPlaced = fence.isNested || indentOf(line) <= 3
  return !!m && isPlaced && m[1]![0] === fence.char && m[1]!.length >= fence.size && m[2]!.trim() === ''
}

/**
 * A checklist the agent wrote in its answer (`1. [ ] Ler a API`, `- [x] Montar o painel`), as a
 * task list: `[x]` done, `[~]` `[>]` `[-]` in progress, `[ ]` pending. Null under `min` items.
 * A checklist the answer quotes is not the plan: one in a fenced code block (an unclosed fence
 * runs to the end), a blockquote, or an indented code block.
 */
export const checklistOf = (text: string, min = 2): Item[] | null => {
  // The last run of checklist lines: blank lines may sit inside it, other text ends it.
  let items: Item[] = []
  let isOpen = false
  let fence: Fence | null = null
  // Inside a list, an indented line belongs to the list (a nested checklist); outside one, 4
  // columns of indent make an indented code block. A line at column 0 that is no item ends the list.
  let isInList = false
  for (const line of text.split('\n')) {
    if (fence) {
      if (closes(line, fence)) fence = null
      continue
    }
    if (line.trim() === '') continue
    const indent = indentOf(line)
    const isNested = isInList && indent > 0
    const opened = indent <= 3 || isNested ? fenceOf(line, isNested) : null
    const isQuoted = !opened && (QUOTE.test(line) || (indent >= 4 && !isNested))
    if (opened || isQuoted) {
      fence = opened
      isOpen = false
      isInList = isNested
      continue
    }
    isInList = isNested || LIST.test(line)
    const m = CHECK.exec(line)
    if (!m) {
      isOpen = false
      continue
    }
    if (!isOpen) items = []
    isOpen = true
    const subject = m[2]!.replace(/[*_`]/g, '').trim()
    if (!subject) continue
    const mark = m[1]!.toLowerCase()
    items.push({ subject, status: mark === 'x' ? 'completed' : mark === ' ' ? 'pending' : 'in_progress', calls: 0, fromText: true })
  }
  return items.length >= min ? items : null
}

/**
 * Whether a line names a task: equal once markdown, spaces and case are gone, or the task and then
 * a note after punctuation (`- [x] Run the tests (195 pass)`), as the agent often ticks a step.
 */
const sameTask = (task: string, line: string) => {
  const t = normalize(task).toLowerCase()
  const l = normalize(line).toLowerCase()
  return l === t || (l.startsWith(t) && /^\s*[(\[:;,.·—–-]/.test(l.slice(t.length)))
}

/**
 * The list after an answer of the agent, unless a task tool keeps the list. A checklist shorter
 * than the list that names some of its tasks ticks them off and keeps the rest (the agent listed
 * what it just did); a checklist as long or longer, or one that shares no task, is the list now.
 * Once a text list is open, one line is enough to tick its task (`- [x] Ler a API`), but only a
 * line that names a task of the list: a lone line never replaces the list.
 */
export const applyAnswer = (items: Item[], answer: string): Item[] => {
  if (items.some(i => !i.fromText)) return items
  const list = checklistOf(answer, items.length > 0 ? 1 : 2)
  if (!list) return items
  const isPart = list.length < items.length && list.some(n => items.some(o => sameTask(o.subject, n.subject)))
  if (list.length === 1 && !isPart) return items
  if (!isPart) return keepCalls(items, list)
  return items.map(o => {
    const n = list.find(x => sameTask(o.subject, x.subject))
    return n ? { ...o, status: n.status } : o
  })
}

/**
 * The list after an answer, with the checklist the last request left asleep: a checklist that
 * shares a task with it, while the turn has no list, wakes it (applyAnswer against it, so its
 * calls and ticks carry); any other checklist is the list, and the sleeping one is dropped.
 */
export const wake = (items: Item[], dormant: Item[], answer: string): { items: Item[]; dormant: Item[] } => {
  const list = checklistOf(answer)
  if (!list || dormant.length === 0) return { items: applyAnswer(items, answer), dormant }
  const isSame = items.length === 0 && list.some(n => dormant.some(o => sameTask(o.subject, n.subject)))
  return { items: applyAnswer(isSame ? dormant : items, answer), dormant: [] }
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

/** A shell word with its quotes gone; `''` stays an empty word. */
const unquote = (w: string) => (/^(["']).*\1$/s.test(w) ? w.slice(1, -1) : w)

/** The command's lines without the bodies of its heredocs (`<<EOF` ... `EOF`): those are data, not commands. */
const withoutHeredocs = (command: string) => {
  const kept: string[] = []
  let until: string | undefined
  for (const line of command.split('\n')) {
    if (until !== undefined) {
      if (line.trim() === until) until = undefined
      continue
    }
    kept.push(line)
    until = /(?<!<)<<-?(?!<)\s*["']?(\w+)["']?/.exec(line)?.[1]
  }
  return kept.join('\n')
}

/** A path the command names for sure: not a device, a variable, a glob or a substitution. */
const isPath = (w: string) => w !== '' && !w.startsWith('-') && !w.startsWith('/dev/') && !/[$`*?{}()<>|;&]/.test(w)

/** The files one simple command writes in place: `sed -i`, `perl -i` / `-pi`, `tee`. */
const inPlace = (words: string[]): string[] => {
  while (words[0] === 'sudo' || words[0] === 'command' || /^\w+=/.test(words[0] ?? '')) words = words.slice(1)
  const name = (words[0] ?? '').split('/').pop()
  const args = words.slice(1)
  if (name === 'tee') return args.filter(isPath)
  if (name !== 'sed' && name !== 'gsed' && name !== 'perl') return []
  const flag = name === 'perl' ? /^-[a-zA-Z]*i/ : /^(?:-[a-zA-Z]*i|--in-place)/
  if (!args.some(a => flag.test(a))) return []
  // The script comes with -e (or -f), else it is the first word that is not an option.
  const takesNext = (a: string) => (name === 'perl' ? /^-[a-zA-Z]*[eE]$/.test(a) : a === '-e' || a === '-f' || a === '--expression' || a === '--file')
  const plain: string[] = []
  let hasScript = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (takesNext(a)) {
      hasScript = true
      i++
    } else if (name !== 'perl' && a === '-i' && args[i + 1] === '') i++ // BSD sed: -i '' (no backup)
    else if (!a.startsWith('-')) plain.push(a)
  }
  return (hasScript ? plain : plain.slice(1)).filter(isPath)
}

/**
 * The files a shell command writes, read from its text without running it: in-place edits
 * (`sed -i`, `perl -pi`, `tee`) and output redirects (`> file`, `>> file`). Not `python -c` or a
 * script: what those write cannot be read from the command.
 */
export const shellWrites = (command: string): string[] => {
  // Quoted strings step aside first, so a `;`, `|` or `>` inside one splits or redirects nothing.
  const quoted: string[] = []
  const masked = withoutHeredocs(command).replace(/"[^"]*"|'[^']*'/g, q => `\0${quoted.push(q) - 1}\0`)
  const word = (w: string) => unquote(w.replace(/\0(\d+)\0/g, (_, i: string) => quoted[Number(i)]!))
  const files: string[] = []
  for (const part of masked.split(/&&|\|\||[;|\n]/)) {
    files.push(...inPlace((part.match(/\S+/g) ?? []).map(word)))
    // Redirects of the output: `> f`, `>> f`, `1> f`, `&> f`; not `2> f` or `>&2`.
    for (const m of part.matchAll(/(?:^|[^\d&<>])(?:1|&)?>>?(?!&)\s*([^\s;&|<>]+)/g)) {
      const target = word(m[1]!)
      if (isPath(target)) files.push(target)
    }
  }
  return [...new Set(files)]
}

/** The list with one more file, unless it names it already, as a full or a relative path. */
const withFile = (list: readonly string[], file: string) =>
  list.some(f => f === file || f.endsWith(`/${file}`) || file.endsWith(`/${f}`)) ? [...list] : [...list, file]

/** The turn after a tool call on the main loop: what it is doing, and the files it changed or read. */
export const touch = (turn: Turn, tool: string, input: Input, lang: Lang, ok: boolean | null): Turn => {
  const file = str(input.file_path) || str(input.notebook_path)
  const next: Turn = { ...turn }
  if (ok === null) {
    next.calls = turn.calls + 1
    next.doing = doingOf(tool, input, lang)
    return next
  }
  if (!ok) return next
  if (tool === 'Bash') next.changed = shellWrites(str(input.command)).reduce(withFile, turn.changed)
  if (file && CHANGES.includes(tool)) next.changed = withFile(turn.changed, file)
  if (file && tool === 'Read') next.read = withFile(turn.read, file)
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
  return Math.min(MAX_ESTIMATE, item.calls / Math.max(1, averageCalls(items)))
}

/** A text list is stale when its step has made this many times the average of the finished steps. */
export const STALE_FACTOR = 3

/** Calls between two reminders to the model, and the most it gets for one step. */
export const NUDGE_EVERY = 10
export const NUDGE_MAX = 3

/**
 * The average tool calls of the finished steps (DEFAULT_CALLS before any). A step that went
 * stale stays out of it: its calls were not progress, and would make the next step look slow.
 */
const averageCalls = (items: readonly Item[]): number => {
  const finished = items.filter(i => i.status === 'completed' && i.calls > 0 && i.calls <= STALE_FACTOR * DEFAULT_CALLS)
  return finished.length ? finished.reduce((n, i) => n + i.calls, 0) / finished.length : DEFAULT_CALLS
}

/** The calls a step may make before its list counts as stale. */
export const staleAfter = (items: readonly Item[]): number => Math.ceil(STALE_FACTOR * averageCalls(items))

/**
 * Whether the list of the current step has gone stale: it came from the agent's text, and the
 * step has made far more calls than the finished ones, so the agent most likely stopped writing
 * the checklist. A task tool's list is the agent's own marking, so it is never called stale.
 */
export const isStale = (items: readonly Item[], at: number): boolean => {
  const item = items[at]
  return item?.fromText === true && item.calls > staleAfter(items)
}

/**
 * Whether the call that just made the step's count what it is should carry a reminder: the call
 * that crosses the limit, then every NUDGE_EVERY calls, NUDGE_MAX times at most per step.
 */
export const isNudgeDue = (items: readonly Item[], at: number): boolean => {
  if (!isStale(items, at)) return false
  const past = items[at]!.calls - staleAfter(items) - 1
  return past % NUDGE_EVERY === 0 && past / NUDGE_EVERY < NUDGE_MAX
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
      /** `lista parada`, next to the figure: the text list stopped moving, so the bar counts only finished steps. */
      notice?: string
      rows: Row[]
      /** `✓ mais 3 feitos` above a long plan's window, `○ mais 2 depois` below it. */
      before?: string
      after?: string
      files?: string
      /** The answer's first sentence, under `agentText: card`. */
      answer?: string
      agents?: AgentsRow
      request?: RequestView
    }
  | { kind: 'phrase'; title: string; time: string; doing: string; agents?: AgentsRow; request?: RequestView }
  /** The main turn ended with no task list and an agent still runs: `Esperando 1 agente`. */
  | { kind: 'waiting'; title: string; time: string; text: string; agents: AgentsRow; request?: RequestView }
  /** A turn with no task list that called tools or agents ended: a small card with badge, time and files. */
  | { kind: 'summary'; state: 'done' | 'stopped'; title: string; badge: string; time: string; detail?: string; answer?: string; request?: RequestView }

/** The `request` option: how much of a request of several lines the card's title shows. */
export type RequestMode = 'line' | 'joined' | 'auto' | 'all'

/** The `request` option; `line` when it names none. */
export const requestModeOf = (option: unknown): RequestMode => (option === 'joined' || option === 'auto' || option === 'all' ? option : 'line')

/** The most request lines the card draws under its title (`all`, or unfolded); the rest is `+N linhas`. */
export const REQUEST_ROWS = 10

/**
 * The request's lines under the card's title: the rows shown, the lines left out, whether it is
 * unfolded, whether the button would show more (`joined` asks the card: only when the line is cut).
 */
export type RequestView = { rest: string[]; more: number; isOpen: boolean; isJoined: boolean; canOpen: boolean }

/** A line as the card draws it: a code block as `⟨código · 4 linhas⟩`. */
const lineText = (line: RequestLine, lang: Lang) => (typeof line === 'string' ? line : WORDS[lang].codeLines(line.code))

const LIST_MARK = /^(?:\d+[.)]|[-*+])\s+/

/** A line of three words or more; `isProse` asks for one that is not a list item either (`1. sim`). */
const isSentence = (line: RequestLine, isProse: boolean) =>
  typeof line === 'string' && !(isProse && LIST_MARK.test(line)) && line.replace(LIST_MARK, '').split(' ').length >= 3

/**
 * The card's title and the request's lines under it, as `request` says: `line` the first line and
 * a count of the rest; `auto` the first line of prose (a list item only when there is none) and a count; `joined` all of
 * them in one line; `all` every line. Unfolded (the card's button), every line. Under the title,
 * REQUEST_ROWS lines at most.
 */
export const requestViewOf = (turn: Turn, mode: RequestMode, isOpen: boolean, lang: Lang): { title: string; request?: RequestView } => {
  const lines = (turn.lines ?? []).map(l => lineText(l, lang))
  if (lines.length === 0) return { title: turn.title }
  if (lines.length === 1) return { title: lines[0]! }
  if (isOpen || mode === 'all') {
    const rest = lines.slice(1, 1 + REQUEST_ROWS)
    return { title: lines[0]!, request: { rest, more: lines.length - 1 - rest.length, isOpen, isJoined: false, canOpen: isOpen } }
  }
  if (mode === 'joined') return { title: lines.join(' · '), request: { rest: [], more: 0, isOpen, isJoined: true, canOpen: false } }
  // auto: the first line of prose, else the first list item that reads as a sentence, else the first line.
  const all = turn.lines ?? []
  const prose = all.findIndex(l => isSentence(l, true))
  const at = mode === 'auto' ? Math.max(0, prose >= 0 ? prose : all.findIndex(l => isSentence(l, false))) : 0
  return { title: lines[at]!, request: { rest: [], more: lines.length - 1, isOpen, isJoined: false, canOpen: true } }
}

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
export const cardOf = (
  turn: Turn | null,
  items: readonly Item[],
  now: number,
  lang: Lang,
  withAnswer = false,
  agents: readonly Agent[] = [],
  view: { mode: RequestMode; isOpen: boolean } = { mode: 'line', isOpen: false },
): Card | null => {
  if (!turn) return null
  const w = WORDS[lang]
  const head = requestViewOf(turn, view.mode, view.isOpen, lang)
  const req = head.request ? { request: head.request } : {}
  const span = elapsed((turn.endedAt ?? now) - turn.startedAt)
  const isOver = turn.end !== undefined
  const team = agentsRowOf(agents, now, lang)

  // No task list yet: the two first steps until the agent calls a tool, then the tool's phrase.
  if (items.length === 0) {
    if (isOver) {
      // The main turn ended with an agent running: the card waits for it.
      const running = runningOf(agents).length
      if (running > 0 && team) return { kind: 'waiting', title: head.title, time: elapsed(now - turn.startedAt), text: w.waiting(running), agents: team, ...req }
      if (turn.calls === 0 && agents.length === 0) return null
      const isDone = turn.end === 'answer'
      const touched = turn.changed.length + turn.read.length > 0 ? w.files(turn.changed.length, turn.read.length) : ''
      const detail = [touched, agents.length > 0 ? w.agents(agents.length) : ''].filter(x => x !== '').join(' · ')
      return {
        kind: 'summary',
        state: isDone ? 'done' : 'stopped',
        title: head.title,
        badge: isDone ? w.ready : turn.end === 'aborted' ? w.interrupted : w.stopped,
        time: isDone ? w.took(span) : w.stoppedAt(span),
        ...(detail ? { detail } : {}),
        ...(withAnswer && isDone && turn.answer ? { answer: turn.answer } : {}),
        ...req,
      }
    }
    if (turn.calls > 0) return { kind: 'phrase', title: head.title, time: span, doing: capital(turn.doing ?? ''), ...(team ? { agents: team } : {}), ...req }
    const est = Math.min(0.9, (now - turn.startedAt) / 1000 / FIRST_STEP_SECONDS)
    const rows: Row[] = [
      { kind: 'now', text: w.first[0], frac: est, status: `~${Math.round(est * 100)}%` },
      { kind: 'next', text: w.first[1], frac: 0, status: w.next },
    ]
    return { kind: 'plan', state: 'work', title: head.title, time: span, label: w.step(1, 2), frac: est / 2, pct: pct(est / 2), rows, ...(team ? { agents: team } : {}), ...req }
  }

  const total = items.length
  const completed = items.filter(i => i.status === 'completed').length
  const at = currentOf(items)
  const state = turn.end === undefined ? 'work' : turn.end === 'answer' ? 'done' : 'stopped'
  const est = state === 'work' && at >= 0 ? estimate(items, at) : 0
  // A text list that stopped moving: the step's guess is gone (its calls were not progress).
  const stale = state === 'work' && at >= 0 && isStale(items, at)
  const frac = (completed + (stale ? 0 : est)) / total
  const { start, end } = windowAround(total, at < 0 ? total - 1 : at)

  const rows: Row[] = items.slice(start, end).map((it, j) => {
    const i = start + j
    if (it.status === 'completed') return { kind: 'done', text: it.subject, frac: 1, status: w.done }
    if (i === at) {
      if (state === 'stopped') return { kind: 'halted', text: it.subject, frac: Math.max(0.05, estimate(items, i)), status: w.halted }
      // The turn answered with this task open: it waits, nothing stopped it.
      if (state === 'done') return { kind: 'later', text: it.subject, frac: 0, status: w.leftOpen }
      if (stale) return { kind: 'now', text: it.subject, frac: 0, status: w.staleFor(it.calls), doing: turn.doing }
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
    title: head.title,
    ...(badge ? { badge } : {}),
    time: state === 'done' ? w.took(span) : state === 'stopped' ? w.stoppedAt(span) : span,
    label: state === 'done' && completed === total ? w.steps(total, total) : w.step(Math.min(total, (at < 0 ? total - 1 : at) + 1), total),
    frac,
    pct: pct(frac),
    ...(stale ? { notice: w.stale } : {}),
    rows,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(isOver && touched ? { files: touched } : {}),
    ...(withAnswer && state === 'done' && turn.answer ? { answer: turn.answer } : {}),
    ...(team ? { agents: team } : {}),
    ...req,
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
