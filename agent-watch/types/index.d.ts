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
      /** Whether the pane lists finished agents, or folds them into one line. */
      showDone: boolean
      /** Agents a clear removed: kept out though the listing still names them. */
      dropped: string[]
      /** Agent rows the pane shows opened, with their recent tool calls. */
      expanded: string[]
      sortBy: 'start' | 'tokens'
      /** The first agent row the pane shows. */
      offset: number
      /** The 5-hour window's percent when the current wave started. */
      waveStart: number | null
    }
  }
}
