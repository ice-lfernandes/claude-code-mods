// Pure logic for launchpad: the default buttons, icons, parsing /pad add and the project file,
// checking buttons against what the session has installed, and laying them out in columns.
// No `$` here, so it tests without an engine.

import type { IconStyle, Kind, Lang, Origin, Pad, Target } from '../types'

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
  /** What an agent button puts in the prompt, its `[blank]` for the task. */
  useAgent: (name: string) => string
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
    useAgent: name => `Use o agente ${name} para [tarefa]`,
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
    useAgent: name => `Use the ${name} agent to [task]`,
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
export const styleOf = (v: unknown): IconStyle => (v === 'symbol' ? 'symbol' : 'emoji')

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
 * A button for a target the pane lists. A command with an argument hint gets it as blanks, so a
 * press puts it in the prompt to finish rather than running it bare.
 */
export const padFor = (t: Target, id: string, hint?: string): Pad => {
  const blanks = t.kind === 'command' ? blanksOf(hint) : ''
  return {
    id,
    icon: iconFor(t),
    label: t.name.slice(0, MAX_LABEL),
    text: blanks ? `${spell(t)} ${blanks}` : spell(t),
    kind: t.kind,
    origin: 'user',
  }
}

const isGlyph = (token: string) => token in ICONS || /^[^\p{L}\p{N}]/u.test(token)

/** `/pad add 📊 Name | /command` or `| @agent` (icon optional) as a button, or null. */
export const parseAdd = (args: string, id: string): Pad | null => {
  const bar = args.indexOf('|')
  if (bar < 0) return null
  const left = args.slice(0, bar).trim()
  const text = args.slice(bar + 1).trim().slice(0, MAX_TEXT)
  const [first = '', ...rest] = left.split(/\s+/)
  const hasIcon = rest.length > 0 && isGlyph(first)
  const label = (hasIcon ? rest.join(' ') : left).trim().slice(0, MAX_LABEL)
  const kind = kindOf(text)
  if (!/[\p{L}\p{N}]/u.test(label) || !kind) return null
  return { id, icon: hasIcon ? first : kind === 'agent' ? 'agent' : 'tool', label, text, kind, origin: 'user' }
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

/** The list with item `i` moved by `delta` places; unchanged where it cannot move. */
export const move = <T>(list: readonly T[], i: number, delta: number): T[] => {
  const j = i + delta
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list]
  const out = [...list]
  ;[out[i], out[j]] = [out[j]!, out[i]!]
  return out
}

export const glyph = (icon: string, style: IconStyle): string => {
  const known = ICONS[icon]
  return known ? known[style] : icon
}

const WIDE = /\p{Extended_Pictographic}/u

/** Cells a string takes in a terminal: emoji two, the rest one, variation selectors none. */
export const cells = (s: string): number => {
  let n = 0
  for (const ch of s) {
    if (ch === '\uFE0F' || ch === '\u200D') continue
    n += WIDE.test(ch) ? 2 : 1
  }
  return n
}

export const buttonLabel = (p: Pad, style: IconStyle) => `${glyph(p.icon, style)} ${p.label}`

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
