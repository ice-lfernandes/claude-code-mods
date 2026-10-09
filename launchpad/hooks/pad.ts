// Pure logic for launchpad: the default buttons, icons, parsing /pad add and the project file,
// checking buttons against what the session has installed, and laying them out in columns.
// No `$` here, so it tests without an engine.

import type { IconStyle, Kind, Lang, Origin, Pad, Placement, Target } from '../types'

/** Buttons the menu shows, and the most the person's own list may hold. */
export const MAX_SHOWN = 8
export const MAX_LABEL = 24
export const MAX_TEXT = 2000
export const MAX_PROJECT = 8

/** Agent types every session has, besides the ones in `.claude/agents/`. */
export const BUILTIN_AGENTS = ['general-purpose', 'Explore', 'Plan']

/** Built-in icons: an emoji for most terminals, a one-cell symbol for those that draw emoji badly. */
export const ICONS: Record<string, { emoji: string; symbol: string }> = {
  folder: { emoji: '📁', symbol: '▤' },
  doc: { emoji: '📄', symbol: '¶' },
  pen: { emoji: '✏️', symbol: '✎' },
  search: { emoji: '🔍', symbol: 'Δ' },
  compress: { emoji: '🗜️', symbol: '⇲' },
  gauge: { emoji: '⏱️', symbol: '◔' },
  chart: { emoji: '📊', symbol: '▥' },
  table: { emoji: '📋', symbol: '▦' },
  mail: { emoji: '✉️', symbol: '✉' },
  undo: { emoji: '↩️', symbol: '↺' },
  spark: { emoji: '✨', symbol: '✦' },
  brain: { emoji: '🧠', symbol: '◎' },
  sliders: { emoji: '🎛️', symbol: '≡' },
  help: { emoji: '❓', symbol: '?' },
  agent: { emoji: '🤖', symbol: '◉' },
  tool: { emoji: '🔧', symbol: '⚙' },
  plug: { emoji: '🔌', symbol: '⌁' },
}

type Words = {
  ask: string
  defaults: { id: string; icon: string; label: string; text: string }[]
  kinds: Record<Kind, string>
  origins: Record<Origin, string>
  shown: string
  empty: string
  off: string
  on: string
  isOff: string
  added: (n: number, label: string) => string
  removed: (label: string) => string
  reset: string
  projectRemove: string
  noSuch: (n: string) => string
  help: string
  badAdd: string
  addTemplate: string
  removeTemplate: string
  missing: (text: string) => string
  full: string
  already: (text: string) => string
  failed: (what: string) => string
  more: (n: number) => string
  /** Where the menu shows: the answer to /pad place, and what /pad says when the menu is not a card. */
  placed: Record<Placement, string>
  badPlace: string
  placeTemplate: string
  inBand: string
  /** The menu's own pane, when it shows as one. */
  menuPane: string
  /** The band's button that opens /pad configuration. */
  settings: string
  /** The question a command's argument asks before it runs, and its fixed answers. */
  askArg: (command: string, hint: string) => string
  noArg: string
  writeIt: string
  cancel: string
  /** What an agent button puts in the prompt, its `[blank]` for the task. */
  useAgent: (name: string, task?: string) => string
  pane: {
    title: string
    hint: string
    menu: (n: number) => string
    project: string
    add: string
    filter: string
    placeholder: string
    plus: string
    remove: string
    gone: string
    full: string
    none: string
    range: (from: number, to: number, of: number) => string
    up: string
    down: string
    reset: string
    close: string
  }
}

export const WORDS: Record<Lang, Words> = {
  'pt-BR': {
    ask: 'O que você quer fazer?',
    defaults: [
      { id: 'compact', icon: 'compress', label: 'Compactar conversa', text: '/compact' },
      { id: 'context', icon: 'chart', label: 'Ver contexto', text: '/context' },
      { id: 'limits', icon: 'gauge', label: 'Ver limites', text: '/limits' },
      { id: 'resume', icon: 'undo', label: 'Retomar conversa', text: '/resume' },
      { id: 'memory', icon: 'brain', label: 'Editar memória', text: '/memory' },
      { id: 'model', icon: 'sliders', label: 'Trocar modelo', text: '/model' },
      { id: 'explore', icon: 'search', label: 'Explorar código', text: '@Explore' },
      { id: 'help', icon: 'help', label: 'Ajuda', text: '/help' },
    ],
    kinds: { command: 'comando', agent: 'agente' },
    origins: { default: 'padrão', user: 'seu', project: 'projeto' },
    shown: 'Menu de atalhos do launchpad.',
    empty: 'Nenhum atalho disponível. /pad configuration escolhe os do menu.',
    off: 'Launchpad desligado: o menu não aparece mais ao abrir a sessão nem com /pad. /pad on liga de novo.',
    on: 'Launchpad ligado: o menu aparece ao abrir a sessão, depois do /clear e com /pad.',
    isOff: 'O launchpad está desligado. /pad on liga de novo.',
    added: (n, label) => `Atalho ${n} criado: ${label}.`,
    removed: label => `Atalho removido: ${label}.`,
    reset: 'Atalhos de volta aos padrões.',
    projectRemove: 'Esse atalho vem do projeto. Edite .claude/launchpad.json para tirá-lo.',
    noSuch: n => `Não existe atalho ${n}. /pad list mostra os números.`,
    help: [
      '/pad                   mostra o menu',
      '/pad configuration     abre o painel para escolher e ordenar os atalhos',
      '/pad list              lista os atalhos',
      '/pad add 📊 Nome | /comando   um atalho que roda um comando ou skill',
      '/pad add Nome | @agente       um atalho que chama um agente',
      '/pad remove 3          tira o atalho 3',
      '/pad reset             volta aos atalhos padrão',
      '/pad off | on          desliga ou liga o menu',
      '/pad place header      o menu como cartão sob o cabeçalho (padrão)',
      '/pad place prompt      o menu numa linha abaixo do prompt, sempre à mão',
      '/pad place pane        o menu num painel, uma aba como as de /limits e /watch',
      `Só entram comandos, skills e agentes instalados, até ${MAX_SHOWN} atalhos.`,
    ].join('\n'),
    badAdd: 'Use: /pad add 📊 Nome | /comando  ou  /pad add Nome | @agente',
    addTemplate: '/pad add [nome] | [/comando ou @agente]',
    removeTemplate: '/pad remove [número]',
    missing: text => `${text} não está instalado nesta sessão. /pad configuration mostra o que está.`,
    full: `O menu já tem ${MAX_SHOWN} atalhos. Tire um com /pad remove ou no painel.`,
    already: text => `${text} já está no menu.`,
    failed: what => `Não deu para rodar: ${what}`,
    more: n => `+${n} em /pad list`,
    placed: {
      header: 'O menu volta a ser um cartão sob o cabeçalho, ao abrir a sessão, depois do /clear e com /pad.',
      prompt: 'O menu agora fica numa linha abaixo do prompt, sempre à mão.',
      pane: 'O menu agora abre num painel, uma aba como as de /limits e /watch.',
    },
    badPlace: 'Use: /pad place header | prompt | pane',
    placeTemplate: '/pad place [header|prompt|pane]',
    inBand: 'O menu está na linha abaixo do prompt. /pad place header volta ao cartão.',
    menuPane: 'Atalhos',
    settings: '⋯ configurar',
    askArg: (command, hint) => `Rodar ${command} com qual argumento? Dica: ${hint}. Em "Other", escreva o seu.`,
    noArg: 'Sem argumento',
    writeIt: 'Escrever no prompt',
    cancel: 'Cancelar',
    useAgent: (name, task) => `Use o agente ${name} para ${task || '[tarefa]'}`,
    pane: {
      title: 'Launchpad',
      hint: `Só aparecem comandos, skills e agentes instalados nesta sessão. Até ${MAX_SHOWN} no menu.`,
      menu: n => `No menu (${n}/${MAX_SHOWN})`,
      project: 'Do projeto (.claude/launchpad.json)',
      add: 'Adicionar',
      filter: 'Filtrar',
      placeholder: 'nome de comando, skill ou agente',
      plus: '+ adicionar',
      remove: 'remover',
      gone: '(não instalado)',
      full: `Menu cheio. Tire um atalho para adicionar outro.`,
      none: 'Nada com esse nome.',
      range: (from, to, of) => `${from}–${to} de ${of}`,
      up: '▲ acima',
      down: '▼ abaixo',
      reset: 'Restaurar padrões',
      close: 'Fechar',
    },
  },
  en: {
    ask: 'What do you want to do?',
    defaults: [
      { id: 'compact', icon: 'compress', label: 'Compact chat', text: '/compact' },
      { id: 'context', icon: 'chart', label: 'See context', text: '/context' },
      { id: 'limits', icon: 'gauge', label: 'See limits', text: '/limits' },
      { id: 'resume', icon: 'undo', label: 'Resume a chat', text: '/resume' },
      { id: 'memory', icon: 'brain', label: 'Edit memory', text: '/memory' },
      { id: 'model', icon: 'sliders', label: 'Switch model', text: '/model' },
      { id: 'explore', icon: 'search', label: 'Explore code', text: '@Explore' },
      { id: 'help', icon: 'help', label: 'Help', text: '/help' },
    ],
    kinds: { command: 'command', agent: 'agent' },
    origins: { default: 'default', user: 'yours', project: 'project' },
    shown: 'Launchpad shortcuts menu.',
    empty: 'No shortcuts available. /pad configuration picks the menu.',
    off: 'Launchpad off: the menu no longer shows when a session starts or on /pad. /pad on turns it back on.',
    on: 'Launchpad on: the menu shows when a session starts, after /clear and on /pad.',
    isOff: 'The launchpad is off. /pad on turns it back on.',
    added: (n, label) => `Shortcut ${n} added: ${label}.`,
    removed: label => `Shortcut removed: ${label}.`,
    reset: 'Shortcuts back to the defaults.',
    projectRemove: 'That shortcut comes from the project. Edit .claude/launchpad.json to drop it.',
    noSuch: n => `There is no shortcut ${n}. /pad list shows the numbers.`,
    help: [
      '/pad                   show the menu',
      '/pad configuration     open the pane to pick and order the shortcuts',
      '/pad list              list the shortcuts',
      '/pad add 📊 Name | /command   a shortcut that runs a command or skill',
      '/pad add Name | @agent        a shortcut that calls an agent',
      '/pad remove 3          drop shortcut 3',
      '/pad reset             back to the default shortcuts',
      '/pad off | on          turn the menu off or on',
      '/pad place header      the menu as a card under the header (the default)',
      '/pad place prompt      the menu in a row below the prompt, always at hand',
      '/pad place pane        the menu in a pane, a tab like those of /limits and /watch',
      `Only installed commands, skills and agents, up to ${MAX_SHOWN} shortcuts.`,
    ].join('\n'),
    badAdd: 'Use: /pad add 📊 Name | /command  or  /pad add Name | @agent',
    addTemplate: '/pad add [name] | [/command or @agent]',
    removeTemplate: '/pad remove [number]',
    missing: text => `${text} is not installed in this session. /pad configuration shows what is.`,
    full: `The menu already has ${MAX_SHOWN} shortcuts. Drop one with /pad remove or in the pane.`,
    already: text => `${text} is already in the menu.`,
    failed: what => `Could not run: ${what}`,
    more: n => `+${n} in /pad list`,
    placed: {
      header: 'The menu is a card under the header again: when a session starts, after /clear and on /pad.',
      prompt: 'The menu now sits in a row below the prompt, always at hand.',
      pane: 'The menu now opens in a pane, a tab like those of /limits and /watch.',
    },
    badPlace: 'Use: /pad place header | prompt | pane',
    placeTemplate: '/pad place [header|prompt|pane]',
    inBand: 'The menu is in the row below the prompt. /pad place header brings the card back.',
    menuPane: 'Shortcuts',
    settings: '⋯ configure',
    askArg: (command, hint) => `Run ${command} with which argument? Hint: ${hint}. Under "Other", type your own.`,
    noArg: 'No argument',
    writeIt: 'Write it in the prompt',
    cancel: 'Cancel',
    useAgent: (name, task) => `Use the ${name} agent to ${task || '[task]'}`,
    pane: {
      title: 'Launchpad',
      hint: `Only commands, skills and agents installed in this session show. Up to ${MAX_SHOWN} in the menu.`,
      menu: n => `In the menu (${n}/${MAX_SHOWN})`,
      project: 'From the project (.claude/launchpad.json)',
      add: 'Add',
      filter: 'Filter',
      placeholder: 'command, skill or agent name',
      plus: '+ add',
      remove: 'remove',
      gone: '(not installed)',
      full: 'The menu is full. Drop a shortcut to add another.',
      none: 'Nothing by that name.',
      range: (from, to, of) => `${from}–${to} of ${of}`,
      up: '▲ up',
      down: '▼ down',
      reset: 'Restore defaults',
      close: 'Close',
    },
  },
}

/**
 * The language: the `language` option when it names one; on `auto` (or none), Portuguese when the
 * system's LANG is Portuguese (`pt_BR.UTF-8`, `pt_PT`, `pt`), English otherwise and when unset.
 */
export const langOf = (option: unknown, systemLang?: string | null): Lang =>
  option === 'en' || option === 'pt-BR' ? option : /^pt([_.@-]|$)/i.test(systemLang ?? '') ? 'pt-BR' : 'en'
/**
 * The icon style: the `icons` option when it names one; on `auto` (or none), symbols in a
 * JetBrains IDE's terminal (TERMINAL_EMULATOR=JetBrains-JediTerm), which gives many emoji one
 * column where Claude Code counts two, and emoji everywhere else.
 */
export const styleOf = (option: unknown, terminal?: string | null): IconStyle =>
  option === 'emoji' || option === 'symbol' ? option : /^JetBrains/i.test(terminal ?? '') ? 'symbol' : 'emoji'

/** `/x` runs a command or skill, `@x` calls an agent; anything else is no button. */
export const kindOf = (text: string): Kind | null => (/^\/[^\s/]/.test(text) ? 'command' : /^@[^\s@]/.test(text) ? 'agent' : null)

const BLANK = /\[[^\]\n]+\]/

/** The first `[blank]` in a text, as offsets, so the prompt can mark what to replace. */
export const blankIn = (text: string): { start: number; end: number } | null => {
  const m = BLANK.exec(text)
  return m ? { start: m.index, end: m.index + m[0].length } : null
}

/** A command button's name and arguments: `/compact focus` is `compact` and `focus`. */
export const commandOf = (text: string): { command: string; args: string } => {
  const [name = '', ...rest] = text.replace(/^\//, '').trim().split(/\s+/)
  return { command: name, args: rest.join(' ') }
}

/** An agent button's type: `@Explore` is `Explore`. */
export const agentOf = (text: string): string => text.replace(/^@/, '').trim().split(/\s+/)[0] ?? ''

/** What an agent button asks after the agent's name: `@revisor review [file]` is `review [file]`. */
export const agentTask = (text: string): string => text.replace(/^@/, '').trim().split(/\s+/).slice(1).join(' ')

/** What a button or a target stands for, the same spelling for both: `command:compact`, `agent:Explore`. */
export const keyOf = (kind: Kind, name: string) => `${kind}:${name}`
export const padKey = (p: Pad) => keyOf(p.kind, p.kind === 'command' ? commandOf(p.text).command : agentOf(p.text))

/** How a target is written on a button: `/compact`, `@Explore`. */
export const spell = (t: Target) => (t.kind === 'command' ? `/${t.name}` : `@${t.name}`)

export const defaults = (lang: Lang): Pad[] =>
  WORDS[lang].defaults.map(d => ({ ...d, kind: kindOf(d.text)!, origin: 'default' as const }))

/** A saved list in the current language: a default button takes its label from `defaults(lang)`. */
export const localize = (list: Pad[], lang: Lang): Pad[] => {
  const labels = new Map(defaults(lang).map(d => [d.id, d.label]))
  return list.map(p => (p.origin === 'default' && labels.has(p.id) ? { ...p, label: labels.get(p.id)! } : p))
}

/** The icon a target gets when the pane adds it: by kind, and for a command by where it comes from. */
export const iconFor = (t: Target) => (t.kind === 'agent' ? 'agent' : t.source === 'builtin' ? 'tool' : t.source === 'mcp' ? 'plug' : 'spark')

/**
 * Whether a command's argument hint names only optional arguments: every part in square
 * brackets, as `/clear [name]` or `/autocompact [auto|<tokens>]`, or a hint that says so
 * (`<optional custom summarization instructions>`). Such a command can run bare.
 */
export const isOptionalHint = (hint: string | undefined) => /^\s*(\[[^\]]*\]\s*)+$/.test(hint ?? '') || /\boptional\b/i.test(hint ?? '')

/**
 * What a command's argument hint offers to pick: the alternatives of a single group
 * (`[auto|<tokens>]` gives `auto`), and whether it leaves room for text of one's own (a
 * `<placeholder>`, a bare name as `[name]`, or more than one argument).
 */
export const argChoices = (hint: string | undefined): { literals: string[]; isFree: boolean } => {
  const h = (hint ?? '').trim()
  if (!h) return { literals: [], isFree: false }
  const groups = h.match(/\[[^\]]*\]|<[^>]*>|[^\s[\]<>]+/g) ?? []
  if (groups.length !== 1) return { literals: [], isFree: true }
  const inner = groups[0]!.replace(/^[[<]|[\]>]$/g, '')
  const parts = inner.split('|').map(x => x.trim()).filter(Boolean)
  if (parts.length < 2) return { literals: [], isFree: true }
  const literals = parts.filter(x => /^[\w.:@/-]+$/.test(x))
  return { literals, isFree: literals.length < parts.length }
}

/** Where the menu shows: the option or /pad place when it names one, else under the header. */
export const placementOf = (v: unknown): Placement => (v === 'prompt' || v === 'pane' || v === 'header' ? v : 'header')

/**
 * A command button's text without the blanks an optional hint gave it: `/clear [name]` back to
 * `/clear`, so it runs. Any other text, and an agent's, as it is.
 */
export const unblank = (text: string, hint: string | undefined) => {
  if (!isOptionalHint(hint)) return text
  const { command, args } = commandOf(text)
  return sameText(args, blanksOf(hint)) ? `/${command}` : text
}

/**
 * A command's argument hint as blanks to fill: `[level]` and `[a] [b]` stay, `<file>` becomes
 * `[file]`, a bare `message` becomes `[message]`; empty when there is no hint.
 */
export const blanksOf = (hint: string | undefined): string => {
  const h = (hint ?? '').trim()
  if (!h) return ''
  if (h.includes('[')) return h
  return /<[^>]+>/.test(h) ? h.replace(/<([^>]+)>/g, '[$1]') : `[${h}]`
}

/**
 * A button for a target the pane lists. A command whose hint asks for an argument gets it as
 * blanks, so a press puts it in the prompt to finish rather than running it bare. A hint of
 * optional arguments only gives none: the command runs as it is.
 */
export const padFor = (t: Target, id: string, hint?: string): Pad => {
  const blanks = t.kind === 'command' && !isOptionalHint(hint) ? blanksOf(hint) : ''
  return {
    id,
    icon: iconFor(t),
    label: t.name.slice(0, MAX_LABEL),
    text: blanks ? `${spell(t)} ${blanks}` : spell(t),
    kind: t.kind,
    origin: 'user',
  }
}

/** Whether a name is one of the built-in icons; own keys only, so `constructor` is none. */
export const isIcon = (name: string) => Object.hasOwn(ICONS, name)

/**
 * The icon a word of /pad add names, or null: a built-in name written `:chart:`, or a glyph (any
 * token that starts with no letter or digit). A bare word is part of the label, so `search docs`
 * is a label and not the icon `search`.
 */
const iconIn = (token: string): string | null => {
  const named = /^:([\w-]+):$/.exec(token)?.[1]
  if (named) return isIcon(named) ? named : null
  return /^[^\p{L}\p{N}]/u.test(token) ? token : null
}

/** `/pad add 📊 Name | /command` or `| @agent` (icon optional) as a button, or null. */
export const parseAdd = (args: string, id: string): Pad | null => {
  const bar = args.indexOf('|')
  if (bar < 0) return null
  const left = args.slice(0, bar).trim()
  const text = args.slice(bar + 1).trim().slice(0, MAX_TEXT)
  const [first = '', ...rest] = left.split(/\s+/)
  const icon = rest.length > 0 ? iconIn(first) : null
  const label = (icon ? rest.join(' ') : left).trim().slice(0, MAX_LABEL)
  const kind = kindOf(text)
  if (!/[\p{L}\p{N}]/u.test(label) || !kind) return null
  return { id, icon: icon ?? (kind === 'agent' ? 'agent' : 'tool'), label, text, kind, origin: 'user' }
}

/**
 * The project's `.claude/launchpad.json`: `{ "buttons": [{ "icon", "label", "text" }] }`, each
 * text a `/command` or an `@agent`. It comes from the repository, so a press only puts the text in
 * the prompt and the person reads it before pressing Enter. Nothing from the file runs on a press.
 */
export const parseProject = (raw: string | null | undefined): Pad[] => {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  const list = (data as { buttons?: unknown })?.buttons
  if (!Array.isArray(list)) return []
  const out: Pad[] = []
  for (const b of list) {
    if (out.length >= MAX_PROJECT) break
    const label = typeof b?.label === 'string' ? b.label.trim().slice(0, MAX_LABEL) : ''
    const text = typeof b?.text === 'string' ? b.text.trim().slice(0, MAX_TEXT) : ''
    const kind = kindOf(text)
    if (!label || !kind) continue
    const icon = typeof b?.icon === 'string' && b.icon.trim() ? b.icon.trim().slice(0, 8) : 'table'
    out.push({ id: `project:${out.length}`, icon, label, text, kind, origin: 'project' })
  }
  return out
}

/** An agent file's type: the `name:` in its frontmatter, else the file name less `.md`. */
export const agentName = (file: string, raw: string | null | undefined): string => {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw ?? '')?.[1] ?? ''
  const name = /^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(front)?.[1]
  return (name ?? file.replace(/\.md$/i, '')).trim()
}

/**
 * A saved list as buttons: entries with no id, label or button text are dropped, and a missing
 * icon or origin takes the kind's icon and `user`, so nothing malformed reaches the drawing.
 */
export const asPads = (v: unknown): Pad[] | null => {
  if (!Array.isArray(v)) return null
  const out: Pad[] = []
  for (const p of v) {
    if (typeof p?.id !== 'string' || typeof p?.label !== 'string' || typeof p?.text !== 'string') continue
    const kind = kindOf(p.text)
    if (!kind) continue
    const icon = typeof p.icon === 'string' && p.icon ? p.icon : kind === 'agent' ? 'agent' : 'tool'
    const origin: Origin = p.origin === 'default' || p.origin === 'project' ? p.origin : 'user'
    out.push({ id: p.id, icon, label: p.label, text: p.text, kind, origin })
  }
  return out
}

/** Whether two button texts run the same thing: the same words, whatever the spaces. */
export const sameText = (a: string, b: string) => a.trim().split(/\s+/).join(' ') === b.trim().split(/\s+/).join(' ')

/** Keeps the buttons whose command, skill or agent this session has. */
export const available = (pads: Pad[], catalog: readonly Target[]): Pad[] => {
  const have = new Set(catalog.map(t => keyOf(t.kind, t.name)))
  return pads.filter(p => have.has(padKey(p)))
}

/** The person's buttons that work here, then the project's: what the menu shows and numbers. */
export const shownOf = (menu: Pad[], project: Pad[], catalog: readonly Target[]): Pad[] => available([...menu, ...project], catalog)

/** Targets not yet in the menu that match the filter, commands first, then agents, by name. */
export const matches = (catalog: readonly Target[], menu: Pad[], filter: string): Target[] => {
  const taken = new Set(menu.map(padKey))
  const q = filter.trim().toLowerCase().replace(/^[/@]/, '')
  return catalog
    .filter(t => !taken.has(keyOf(t.kind, t.name)))
    .filter(t => !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'command' ? -1 : 1))
}

/** The window of `rows` items a list of `total` shows from `offset`, kept inside the list. */
export const windowOf = (total: number, offset: number, rows: number): { start: number; end: number } => {
  const size = Math.max(1, rows)
  const start = Math.max(0, Math.min(offset, total - size))
  return { start, end: Math.min(total, start + size) }
}

/** The list with the button `id` moved by `delta` places; unchanged where it cannot move. */
export const moveId = (list: readonly Pad[], id: string, delta: number): Pad[] => move(list, list.findIndex(p => p.id === id), delta)

/** The list with item `i` moved by `delta` places; unchanged where it cannot move. */
export const move = <T>(list: readonly T[], i: number, delta: number): T[] => {
  const j = i + delta
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list]
  const out = [...list]
  ;[out[i], out[j]] = [out[j]!, out[i]!]
  return out
}

export const glyph = (icon: string, style: IconStyle): string => {
  return isIcon(icon) ? ICONS[icon]![style] : icon
}

const EMOJI = /\p{Emoji_Presentation}/u
const PICTO = /\p{Extended_Pictographic}/u

/**
 * Cells a string takes in a terminal: two for an emoji drawn as one (📁, or ✏️ with its variation
 * selector), one for a symbol drawn as text (⚙, ✉) and the rest, none for the selectors.
 */
export const cells = (s: string): number => {
  const chars = [...s]
  let n = 0
  chars.forEach((ch, i) => {
    if (ch === '\uFE0F' || ch === '\u200D') return
    n += EMOJI.test(ch) || (PICTO.test(ch) && chars[i + 1] === '\uFE0F') ? 2 : 1
  })
  return n
}

/**
 * A button's icon and label. With symbols, an icon of the person's own that is not one cell wide
 * (an emoji from /pad add or the project file) gives way to the symbol of the button's kind, so
 * the columns stay aligned.
 */
export const buttonLabel = (p: Pad, style: IconStyle) => {
  const icon = style === 'symbol' && !isIcon(p.icon) && cells(p.icon) !== 1 ? (p.kind === 'agent' ? 'agent' : 'tool') : p.icon
  return `${glyph(icon, style)} ${p.label}`
}

/**
 * A tile's label padded to the cells inside its border, a space each side: the whole row between
 * the side borders is the button, so a press anywhere on it counts.
 */
export const tileLabel = (label: string, inner: number): string => {
  const room = Math.max(cells(label) + 2, inner)
  return ` ${label}${' '.repeat(room - 1 - cells(label))}`
}

/** Columns of equal width that fit `columns` cells: the cell width and the rows of buttons. */
export const layout = (pads: Pad[], style: IconStyle, columns: number, gap = 3): { width: number; rows: Pad[][] } => {
  const width = Math.max(1, ...pads.map(p => cells(buttonLabel(p, style)))) + gap
  const per = Math.max(1, Math.floor(Math.max(columns, width) / width))
  const rows: Pad[][] = []
  for (let i = 0; i < pads.length; i += per) rows.push(pads.slice(i, i + per))
  return { width, rows }
}

/** /pad list: every button, numbered, with what it runs, its kind and where it comes from. */
export const listText = (pads: Pad[], lang: Lang, style: IconStyle): string => {
  const w = WORDS[lang]
  if (pads.length === 0) return w.empty
  return pads.map((p, i) => `${i + 1}. ${buttonLabel(p, style)}  ${p.text}  (${w.kinds[p.kind]}, ${w.origins[p.origin]})`).join('\n')
}
