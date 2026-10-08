/** What a button does when pressed: run a command or skill, or call an agent. */
export type Kind = 'command' | 'agent'

/** Where a button comes from: built in, the person's own, or the project's .claude/launchpad.json. */
export type Origin = 'default' | 'user' | 'project'

export type Lang = 'pt-BR' | 'en'

export type IconStyle = 'emoji' | 'symbol'

export type Pad = {
  id: string
  /** A key of ICONS (`folder`) or a glyph of the person's own (`🧾`). */
  icon: string
  label: string
  /** `/name args` for a command or skill, `@type` for an agent. */
  text: string
  kind: Kind
  origin: Origin
}

/** A command, skill or agent this session has: what a button may point at. */
export type Target = {
  kind: Kind
  /** Without the slash or the at sign. */
  name: string
  description: string
  /** Where a command comes from (`builtin`, `plugin`, `user`, `mcp`); `agent` for an agent. */
  source: string
}

declare module 'claude-code' {
  interface PluginState {
    launchpad: {
      /** The person's buttons in order, at most MAX_SHOWN: the defaults until they change them. */
      menu: Pad[]
      /** The buttons of the project's .claude/launchpad.json. */
      project: Pad[]
      /** The commands, skills and agents this session has, read when the menu or the pane loads. */
      catalog: Target[]
      /** The pane's filter over the catalog. */
      filter: string
      /** The first catalog row the pane's list shows: moved by its arrows and the wheel. */
      offset: number
      /** True after /pad off: no menu at the start, after /clear or on /pad, until /pad on. */
      isOff: boolean
    }
  }
}
