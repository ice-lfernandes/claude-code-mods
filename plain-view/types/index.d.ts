/** One task of the agent's list, from TaskCreate/TaskUpdate or TodoWrite. */
export type Item = {
  /** TaskCreate's id; absent for a TodoWrite entry. */
  id?: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
  /** Tool calls made while this task was the current one: what the step's estimate reads. */
  calls: number
  /** Read from a checklist in the agent's answer, not from a task tool. */
  fromText?: boolean
}

/** How a turn ended: the model answered, the person interrupted, or an error stopped it. */
export type End = 'answer' | 'aborted' | 'error'

/** The request the card follows, from its turn.start to the next one. Times are epoch milliseconds. */
export type Turn = {
  /** The request's first line, or the last title when a turn starts with no text. */
  title: string
  startedAt: number
  endedAt?: number
  end?: End
  /** Tool calls on the main loop this turn, task tools left out. */
  calls: number
  /** The tool call in flight, in a few words. */
  doing?: string
  /** Files an Edit, Write or NotebookEdit changed, and files a Read read. */
  changed: string[]
  read: string[]
  /** A sample turn from /plain-view demo. */
  isDemo?: boolean
  /** The answer's first sentence, for the end card under `agentText: card`. */
  answer?: string
}

/** An agent (subagent) the main loop spawned, from its agent.spawn to its turn.complete. Epoch ms. */
export type Agent = {
  /** agent.spawn's agentId, as $.agent.list() names it. */
  id: string
  /** The Agent call's description, else its agent type. */
  label: string
  startedAt: number
  /** Set when it ended: its turn.complete, or $.agent.list() says completed, failed or killed. */
  endedAt?: number
}

/** What stays of the agent's words in the transcript while the mod is on. */
export type AgentText = 'final' | 'none' | 'card' | 'all'

declare module 'claude-code' {
  interface PluginState {
    'plain-view': {
      turn: Turn | null
      /** The agent's task list; it outlives a turn until every task is done. */
      items: Item[]
      /** Moves while the agent works, so the bars' shine redraws. */
      tick: number
      /** Texts of steps that went on to call tools, normalized: the blocks `agentText: final` hides. */
      mids: string[]
      /** The agents the main loop spawned: running ones, and the ones that ended during this request. */
      agents: Agent[]
    }
  }
}
