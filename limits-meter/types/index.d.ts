/** One rate-limit window as the meter draws it. */
export type Limit = {
  /** `five_hour`, `seven_day`, or a gateway's `spend_limit`. */
  kind: string
  /** 0 to 100, past 100 on an exceeded spend limit. */
  percent: number
  /** When the window resets, in epoch milliseconds; null when unknown. */
  resetsAt: number | null
}

/** The live figures the band draws, pushed by `session.measure`. */
export type Snapshot = {
  limits: Limit[]
  /** Context window fill, 0 to 100; null before the first response. */
  contextPercent: number | null
  /** Input tokens the last response was answered over. */
  contextTokens: number | null
  /** The model's context window in tokens. */
  contextWindow: number
}

/** One finished main-thread turn. */
export type Turn = {
  /** Input tokens: uncached, cache-read and cache-written together. */
  input: number
  output: number
  /** Share of input the prompt cache served, 0 to 1; null when no input. */
  cacheHit: number | null
  model: string
  durationMs: number
  /** Context fill when the turn ended, 0 to 100; null when unknown. */
  contextPercent?: number | null
}

/** Readings of each plan window since it last reset, for the pace: [epoch ms, percent]. */
export type Samples = Record<string, { resetsAt: number; points: [number, number][] }>

declare module 'claude-code' {
  interface PluginState {
    'limits-meter': {
      snapshot: Snapshot
      turns: Turn[]
      isHidden: boolean
      fired: string[]
      samples: Samples
    }
  }
}
