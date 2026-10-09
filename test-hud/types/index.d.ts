/** What a test runner's output says, before it becomes a Run. */
export type Parsed = {
  failed: number
  /** Null when the runner printed no counts: a quiet Gradle or Maven success. */
  passed: number | null
  skipped: number
  /** Failing tests by name, as the runner prints them. At most 20. */
  failures: string[]
}

/** One test command that ran in Bash. Times are epoch milliseconds. */
export type Run = Parsed & {
  /** Counts up through the session; the pane shows it as #n. */
  n: number
  /** `vitest`, `jest`, `pytest`, `maven`, `gradle`, `npm`... */
  runner: string
  /** The command's first line, clipped. */
  command: string
  /** The whole command, as it ran, for the prompt to run it again. */
  fullCommand: string
  endedAt: number
  durationMs: number
  /** Set when a subagent ran it. */
  agentId?: string
  isDemo?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'test-hud': {
      /** The last runs, oldest first. */
      runs: Run[]
      /** The run the pane shows, picked in its list; null for the runner's latest. */
      selected: number | null
      /** The runner the pane shows, picked in its tabs; null for the latest run's. */
      tab: string | null
    }
  }
}
