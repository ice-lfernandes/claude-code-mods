/** One task of the agent's list, from TaskCreate/TaskUpdate or TodoWrite. */
export type Item = {
  /** TaskCreate's id; absent for a TodoWrite entry. */
  id?: string
  subject: string
  /** The present-continuous form: `Montando o painel`. */
  activeForm?: string
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
}

declare module 'claude-code' {
  interface PluginState {
    'plain-view': {
      turn: Turn | null
      /** The agent's task list; it outlives a turn until every task is done. */
      items: Item[]
      /** Moves while the agent works, so the bars' shine redraws. */
      tick: number
    }
  }
}
