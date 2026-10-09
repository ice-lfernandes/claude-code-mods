// launchpad's icon map. Kept by the mod's owner: it is not a plugin option and no /pad verb
// changes it. To re-icon something, change one line here.
//
//   ICONS          key → an emoji for most terminals and a one-cell symbol for those that draw
//                  emoji badly (the `icons` option picks one). An emoji here is always one with
//                  default emoji presentation (📦, not 🗜️): those that need U+FE0F take one or two
//                  columns depending on the terminal, and break the tiles. A symbol is one cell.
//                  tests/icons.test.ts checks both.
//   COMMAND_ICONS  command name → key: the icon a command gets as a button, in the panel's Mods
//                  section, on the menu and in /pad configuration.
//   SOURCE_ICONS   where a command comes from → key: the icon of a command with no row above.
//
// Keys are also what `/pad add :chart: ...` takes, so renaming one breaks buttons people saved.

export const ICONS: Record<string, { emoji: string; symbol: string }> = {
  // this collection's mods
  gauge: { emoji: '⏳', symbol: '◔' },
  shield: { emoji: '🔐', symbol: '⊘' },
  agents: { emoji: '👀', symbol: '◈' },
  scroll: { emoji: '📜', symbol: '§' },
  // commands
  compress: { emoji: '📦', symbol: '⇲' },
  chart: { emoji: '📊', symbol: '▥' },
  undo: { emoji: '⏪', symbol: '↺' },
  brain: { emoji: '🧠', symbol: '◎' },
  sliders: { emoji: '🔀', symbol: '≡' },
  help: { emoji: '❓', symbol: '?' },
  search: { emoji: '🔍', symbol: 'Δ' },
  broom: { emoji: '🧹', symbol: '⌫' },
  reload: { emoji: '🔄', symbol: '↻' },
  money: { emoji: '💰', symbol: '$' },
  doctor: { emoji: '🩺', symbol: '+' },
  doc: { emoji: '📄', symbol: '¶' },
  folder: { emoji: '📁', symbol: '▤' },
  // by origin
  tool: { emoji: '🔧', symbol: '⚙' },
  puzzle: { emoji: '🧩', symbol: '⊞' },
  plug: { emoji: '🔌', symbol: '⌁' },
  spark: { emoji: '✨', symbol: '✦' },
  agent: { emoji: '🤖', symbol: '◉' },
  // for /pad add and .claude/launchpad.json
  pen: { emoji: '📝', symbol: '✎' },
  mail: { emoji: '📧', symbol: '✉' },
  table: { emoji: '📋', symbol: '▦' },
}

export const COMMAND_ICONS: Record<string, string> = {
  // this collection's mods
  limits: 'gauge',
  allowlist: 'shield',
  watch: 'agents',
  'plain-view': 'scroll',
  // built-in commands
  clear: 'broom',
  compact: 'compress',
  context: 'chart',
  usage: 'chart',
  cost: 'money',
  resume: 'undo',
  rewind: 'undo',
  memory: 'brain',
  model: 'sliders',
  help: 'help',
  init: 'doc',
  export: 'doc',
  review: 'search',
  'security-review': 'shield',
  permissions: 'shield',
  config: 'tool',
  doctor: 'doctor',
  mcp: 'plug',
  agents: 'agent',
  plugin: 'puzzle',
  'reload-plugins': 'reload',
  'add-dir': 'folder',
}

export const SOURCE_ICONS: Record<string, string> = {
  builtin: 'tool',
  plugin: 'puzzle',
  mcp: 'plug',
  user: 'spark',
  project: 'spark',
  agent: 'agent',
}

/** The icons a button gets from where its command comes from: a saved one with these may take a better one. */
export const GENERIC = ['tool', 'spark', 'plug', 'puzzle']
