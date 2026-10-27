/** Token counts as the API reports them, summed over a loop's model requests. */
export type Tokens = {
  /** Uncached input. */
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** What a loop is doing since `lastAt`. */
export type Activity = 'thinking' | 'tool' | 'idle'

/** One subagent, fork, teammate or workflow agent. Times are epoch milliseconds. */
export type Agent = {
  id: string
  /** The Agent call's description. */
  label: string
  /** `general-purpose`, `Explore`, `fork`, `teammate`, a plugin's type... */
  type: string
  /** What SendMessage addresses it by, when it has one. */
  name?: string
  parentId?: string
  /** The model of its last request, else the one it was spawned on. */
  model?: string
  /** The engine's status: pending, running, waiting, idle, completed, failed, killed. */
  status: string
  startedAt: number
  endedAt?: number
  /** Last model request or tool call, started or ended. */
  lastAt: number
  activity: Activity
  /** The tool in flight, or the last one, in plain words. */
  doing?: string
  tools: number
  errors: number
  steps: number
  tokens: Tokens
  /** True once the stall toast fired; activity re-arms it. */
  isStalled: boolean
  /** Which of the five looks (mascot and color) the agent has, in the order agents appeared. */
  slot: number
  /** The last tool calls, oldest first: what each did, and whether it worked (null while it runs). */
  recent?: { doing: string; ok: boolean | null }[]
}

/** What one wave of agents came to, from the first spawn to the last agent ending. */
export type Run = {
  endedAt: number
  count: number
  durationMs: number
  total: number
  /** The agent with the most tokens, and its share of the run's tokens (0 to 1). */
  top: { label: string; total: number; share: number } | null
  /** Points of the 5-hour plan window the wave used; null without readings. */
  windowUsed?: number | null
}

/**
 * What the band above the prompt says, as data: plain-view draws it as a child of its agents row
 * when it is on. Strings come localized; colors are hex for the person's theme.
 */
export type Message =
  | { kind: 'done'; text: string }
  | {
      kind: 'run'
      /** `Agents`. */
      label: string
      /** `0/3`: agents finished of all. */
      count: string
      /** The bar's cells, each filled or not, with its color. */
      bar: { filled: boolean; color: string }[]
      /** The current agent's one-cell shape and its color. */
      glyph: string
      color: string
      name: string
      /** What it does now, capitalized. */
      action: string
      /** `Name quiet for 6m` when the current agent is stalled, else null. */
      stalled: string | null
    }

declare module 'claude-code' {
  interface PluginState {
    'agent-watch': {
      agents: Agent[]
      /** Tokens of loops no agent listing names (compaction, memory), by loop id. */
      orphans: Record<string, Tokens>
      /** The main loop's tokens this session. */
      lead: Tokens
      /** Agents active at the last refresh. */
      live: number
      /** When the last wave ended; agents started after it belong to the next. */
      standDownAt: number
      lastRun: Run | null
      /** Moves while agents run, so the pane's clocks and spinners redraw. */
      tick: number
      /** Agents a clear removed: kept out though the listing still names them. */
      dropped: string[]
      /** Agent rows the pane shows opened, with their recent tool calls. */
      expanded: string[]
      sortBy: 'start' | 'tokens'
      /** The first agent row the pane shows. */
      offset: number
      /** The 5-hour window's percent when the current wave started. */
      waveStart: number | null
      /** The weekly window's percent when the current wave started. */
      waveStartWeek: number | null
      /** The 5-hour window's percent at the last refresh while agents ran, for the summary's live figure. */
      windowNow: number | null
      /** Groups the pane shows folded to their header: `running`, `finished`. */
      folded: string[]
      /** True from a wave's end to the next prompt: the band says the agents are done. */
      bandDone: boolean
      /** The band's message, or null while the band says nothing (hidden, quiet, no agents). plain-view reads it. */
      message: Message | null
    }
    /** What agent-watch reads of plain-view: whether its card is drawn, and the agents its row lists. */
    'plain-view': {
      cardOn: boolean
      agents: { id: string; endedAt?: number }[]
    }
  }
}
