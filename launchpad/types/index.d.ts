/** What a button does when pressed: run a command or skill, or call an agent. */
export type Kind = 'command' | 'agent'

/** Where a button comes from: built in, the person's own, or the project's .claude/launchpad.json. */
export type Origin = 'default' | 'user' | 'project'

export type Lang = 'pt-BR' | 'en'

export type IconStyle = 'emoji' | 'symbol'

/** Where the menu shows: a card under the header, a band above the prompt, or its own pane. */
export type Placement = 'header' | 'prompt' | 'pane'

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
  /** The plugin that added a command, when the engine knows. */
  plugin?: string
}

/** A reasoning effort level, as `/effort` takes it. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** One of this collection's mods, as the panel's Mods section knows it. */
export type ModInfo = {
  /** The plugin's name, as `/plugin install` takes it. */
  plugin: string
  /** Its command, without the slash: what opens its pane. */
  command: string
  /** A key of ICONS. */
  icon: string
  label: { 'pt-BR': string; en: string }
  /** Whether its command takes `on` and `off`, its state in the `<plugin>.enabled` option. */
  toggles: boolean
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
      /** Where the menu shows: /pad place, else the `placement` option. */
      placement: Placement
      /** The session's model as the engine names it (`claude-opus-5-5`): the panel's active chip. */
      model: string
      /** The effort of the last model request; null until the first one, or for a model without effort. */
      effort: Effort | null
    }
  }
}
