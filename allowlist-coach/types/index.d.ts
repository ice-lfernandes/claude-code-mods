/** What the person did with an entry, beyond counting it. */
export type EntryState = 'counting' | 'offered' | 'added' | 'dismissed'

/** One permission rule and how often its dialog was answered in this project. */
export type Entry = {
  /** The rules that would have skipped the dialog, as settings write them (`Bash(./mvnw test:*)`). */
  rules: string[]
  approved: number
  denied: number
  /** The last call that asked, short: a command, a path, a URL. */
  example: string
  /** When the last dialog was answered, in epoch milliseconds. */
  lastAt: number
  state: EntryState
  /** The settings file the coach added the rules to, project-relative; set with `added`. */
  file?: string
}

/** The pane's tabs: one status each, and all of them. */
export type Tab = 'all' | 'ready' | 'counting' | 'refused'

/** The permission lists as the merged settings hold them. */
export type Configured = {
  allow: string[]
  ask: string[]
  deny: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'allowlist-coach': {
      /** Keyed by `rules.join(', ')`. */
      entries: Record<string, Entry>
      configured: Configured
      /** The pane: the first row of its list, its tab, and the text typed in its filter. */
      offset: number
      tab: Tab
      filter: string
    }
  }
}
