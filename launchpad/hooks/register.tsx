// launchpad: a welcome menu of one-click actions, so nobody has to know a /command first.
//
//   menu     a card in the transcript, under the header: an icon and an action per button, in
//            bordered tiles. It is /pad's output row drawn as buttons, so the mod runs /pad when
//            a session starts with an empty conversation and after /clear, and the card scrolls
//            up with the conversation. Typing /pad draws a new one.
//   buttons  each one runs a command or skill (`/compact`) or calls an agent (`@Explore`, which
//            puts "use the Explore agent to [task]" in the prompt). Only what this session has
//            installed shows or can be added: the catalog is $.command.list() (commands and
//            skills), the built-in agents and the files in .claude/agents/ (project and user).
//   /pad configuration  a pane to order, remove and add buttons from the catalog, up to
//            MAX_SHOWN. /pad add, remove, list and reset do the same from the prompt. The
//            person's list is kept across sessions in the plugin's store.
//   /pad off | on  turns the menu off (no card at the start, after /clear or on /pad) and back
//            on, kept across sessions.
//   /pad place header | prompt | pane  where the menu shows: the card under the header, a band
//            above the prompt that stays, or a pane of its own, a tab like other mods' panes.
//            Kept across sessions; the `placement` option is the default.
//   project  .claude/launchpad.json adds the repository's buttons. They come from the repo, so
//            a press only puts the text in the prompt: the person reads it before pressing Enter.
//
// Reads .claude/launchpad.json and the agent files in .claude/agents/ (the session's folder and
// the home folder). Runs no process, calls no model.

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { IconStyle, Lang, Pad, Placement, Target } from '../types'
import {
  agentName,
  agentOf,
  agentTask,
  asPads,
  available,
  BUILTIN_AGENTS,
  blankIn,
  blanksOf,
  buttonLabel,
  commandOf,
  defaults,
  keyOf,
  langOf,
  layout,
  listText,
  localize,
  matches,
  MAX_SHOWN,
  moveId,
  windowOf,
  padFor,
  padKey,
  parseAdd,
  parseProject,
  placementOf,
  sameText,
  shownOf,
  spell,
  styleOf,
  tileLabel,
  unblank,
  WORDS,
} from './pad'

const PANE = 'launchpad'
/** The menu's own pane, under `/pad place pane`. */
const MENU_PANE = 'launchpad-menu'
const PROJECT_FILE = '.claude/launchpad.json'
const AGENTS_DIR = '.claude/agents'
const KEY_MENU = 'menu'
const KEY_OFF = 'off'
const KEY_PLACE = 'placement'

const menu = atom({ plugin: 'launchpad', key: 'menu' } as const, [] as Pad[])
const project = atom({ plugin: 'launchpad', key: 'project' } as const, [] as Pad[])
const catalog = atom({ plugin: 'launchpad', key: 'catalog' } as const, [] as Target[])
const filter = atom({ plugin: 'launchpad', key: 'filter' } as const, '')
const offset = atom({ plugin: 'launchpad', key: 'offset' } as const, 0)
const isOff = atom({ plugin: 'launchpad', key: 'isOff' } as const, false)
const placement = atom({ plugin: 'launchpad', key: 'placement' } as const, 'header' as Placement)

/**
 * Argument hints by command name, as the engine lists the commands for the typeahead and /help
 * (command.describe). $.command.list() carries none, so a command the person has not yet seen
 * listed in this session has no hint here.
 */
const hints = new Map<string, string>()

/** The last first row the pane's catalog list can start at, as last drawn: where the wheel stops. */
let lastStart = 0

// Set by register from the options, and by session.start for the folder.
let lang: Lang = 'pt-BR'
let style: IconStyle = 'emoji'
let cwd = ''
/** The `placement` option: where the menu shows until /pad place picks a place. */
let placeOption: Placement = 'header'

/** The agent types in one `.claude/agents` folder; none where it cannot be read. */
async function agentsIn($: EngineInterface, dir: string): Promise<Target[]> {
  const entries = (await $.fs.list(dir).catch(() => [])).filter(f => f.kind === 'file' && f.name.endsWith('.md'))
  const names = await Promise.all(
    entries.map(async f => {
      const raw = await $.fs.read(`${dir}/${f.name}`).catch(() => null)
      return agentName(f.name, typeof raw === 'string' ? raw : null)
    }),
  )
  return names.filter(Boolean).map(name => ({ kind: 'agent' as const, name, description: '', source: 'agent' }))
}

/** Every command, skill and agent this session has, less /pad itself. */
async function readCatalog($: EngineInterface): Promise<Target[]> {
  const commands = await $.command.list().catch(() => [])
  const home = await $.env.get('HOME').catch(() => undefined)
  const [here, mine] = await Promise.all([cwd ? agentsIn($, `${cwd}/${AGENTS_DIR}`) : [], home ? agentsIn($, `${home}/${AGENTS_DIR}`) : []])
  const files = [...here, ...mine]
  const seen = new Set<string>()
  const out: Target[] = []
  const push = (t: Target) => {
    const key = keyOf(t.kind, t.name)
    if (seen.has(key)) return
    seen.add(key)
    out.push(t)
  }
  for (const c of commands) {
    const name = c.name.replace(/^\//, '')
    if (name && name !== 'pad') push({ kind: 'command', name, description: c.description, source: c.source })
  }
  for (const name of BUILTIN_AGENTS) push({ kind: 'agent', name, description: '', source: 'agent' })
  for (const a of files) push(a)
  return out
}

/**
 * Reads the person's list, the project's buttons and the on/off switch. The catalog is read once
 * a session (and again when the pane opens, or an add names something it lacks): `fresh` reads
 * it now.
 */
async function load($: EngineInterface, fresh = false) {
  const stored = asPads(await $.store.get(KEY_MENU).catch(() => undefined))
  const raw = cwd ? await $.fs.read(`${cwd}/${PROJECT_FILE}`).catch(() => null) : null
  await update($, menu, () => (stored ? localize(stored, lang) : defaults(lang)))
  const off = (await $.store.get(KEY_OFF).catch(() => undefined)) === true
  await update($, isOff, () => off)
  const place = await $.store.get(KEY_PLACE).catch(() => undefined)
  await update($, placement, () => (typeof place === 'string' ? placementOf(place) : placeOption))
  await update($, project, () => parseProject(typeof raw === 'string' ? raw : null))
  if (fresh || (await read($, catalog)).length === 0) {
    const list = await readCatalog($)
    await update($, catalog, () => list)
  }
}

/** Applies a change to the list as it stands now, not as a drawing last saw it. */
async function editMenu($: EngineInterface, change: (list: Pad[]) => Pad[]) {
  await saveMenu($, change(await read($, menu)))
}

async function saveMenu($: EngineInterface, list: Pad[]) {
  await $.store.set(KEY_MENU, list)
  await update($, menu, () => list)
}

/** The buttons as shown and numbered: the person's that work here, then the project's. */
async function shown($: EngineInterface) {
  return shownOf(await read($, menu), await read($, project), await read($, catalog))
}

/** Puts a text in the prompt, its `[blank]` marked for the person to replace. */
async function fill($: EngineInterface, text: string) {
  const blank = blankIn(text)
  await $.prompt.fill(blank ? { text, decorations: [{ ...blank, bold: true, underline: true }] } : { text })
}

async function press($: EngineInterface, p: Pad) {
  try {
    if (p.kind === 'agent') return await fill($, WORDS[lang].useAgent(agentOf(p.text), agentTask(p.text)))
    // A command with a [blank] waits in the prompt for the person to fill in; so does any
    // project button, whose text comes from the repository.
    // A command whose blanks came from an optional hint (`/clear [name]`) runs bare.
    const text = p.origin === 'project' ? p.text : unblank(p.text, hints.get(commandOf(p.text).command))
    if (p.origin === 'project' || blankIn(text)) return await fill($, text)
    const { command, args } = commandOf(text)
    await $.command.run({ command, args })
  } catch {
    $.ui.toast(WORDS[lang].failed(p.label))
  }
}

/** Adds a button to the person's list. Returns why not, or null when it was added. */
async function add($: EngineInterface, p: Pad): Promise<string | null> {
  const w = WORDS[lang]
  const list = await read($, menu)
  const key = padKey(p)
  const known = async () => (await read($, catalog)).some(t => keyOf(t.kind, t.name) === key)
  // Installed since the catalog was read? Read it again before saying no.
  if (!(await known())) await load($, true)
  if (!(await known())) return w.missing(p.text.split(/\s+/)[0] ?? p.text)
  if ([...list, ...(await read($, project))].some(x => sameText(x.text, p.text))) return w.already(p.text)
  // The limit counts the buttons that work here: one whose command another session has stays
  // in the list, marked in the pane, and takes no place in this menu.
  if (available(list, await read($, catalog)).length >= MAX_SHOWN) return w.full
  await saveMenu($, [...list, p])
  return null
}

/** The tile's background under the pointer: the theme's subtle gray, so it reads on dark and light. */
const TILE_HOVER = 'subtle'

/** /pad's arguments in the row under the menu; `fill` is the text the prompt waits with. */
const PAD_ACTIONS: { verb: string; fill?: (w: (typeof WORDS)[Lang]) => string }[] = [
  { verb: 'configuration' },
  { verb: 'list' },
  { verb: 'add', fill: w => w.addTemplate },
  { verb: 'remove', fill: w => w.removeTemplate },
  { verb: 'reset', fill: () => '/pad reset' },
  { verb: 'place', fill: w => w.placeTemplate },
  { verb: 'off' },
  { verb: 'help' },
]

/** An id no button in the list has: the time, and the list's length for two in one millisecond. */
async function newId($: EngineInterface) {
  return `user:${await $.clock.now()}:${(await read($, menu)).length}`
}

/** Opens the menu's own pane. The host opens a pane only with the keyboard on it; Esc closes it. */
function openMenuPane($: EngineInterface) {
  return $.ui.open({ id: MENU_PANE, title: WORDS[lang].menuPane, focus: true, closeOnEscape: true }).catch(() => null)
}

/**
 * Shows the menu at the start and after /clear, where it lives: under the header, /pad's row
 * drawn as the card (not awaited: the row lands once the hook has returned); in its pane, opened
 * with the keyboard on it, as the host opens every pane. The band above the prompt is there
 * already.
 */
async function showMenu($: EngineInterface) {
  const place = await read($, placement)
  if (place === 'header') $.command.run({ command: 'pad' }).catch(() => undefined)
  else if (place === 'pane') await openMenuPane($)
}

/** Runs one of /pad's arguments from the row: its answer, if any, as dim lines in the transcript. */
async function pressVerb($: EngineInterface, a: (typeof PAD_ACTIONS)[number]) {
  const w = WORDS[lang]
  try {
    if (a.fill) return await fill($, a.fill(w))
    const { text } = await runPad($, a.verb)
    // A log line is drawn as one row: a list or the help goes out a line at a time.
    for (const line of text?.split('\n') ?? []) if (line.trim()) $.ui.log(line)
  } catch {
    $.ui.toast(w.failed(`/pad ${a.verb}`))
  }
}

/**
 * The row under the buttons: /pad's own arguments, one press each. Those that run at once (the
 * pane, the list, off, help) run; those that take an argument or undo the person's list (add,
 * remove, reset) wait in the prompt, so nothing is lost on a stray click.
 */
function padRow($: EngineInterface, ui: Pick<Elements[keyof Elements], 'Box' | 'Text' | 'Button'>, more: number) {
  const { Box, Text, Button } = ui
  const w = WORDS[lang]
  return (
    <Box flexDirection="row" flexWrap="wrap">
      {more > 0 && <Text dimColor>{`${w.more(more)} · `}</Text>}
      <Text dimColor>/pad </Text>
      {PAD_ACTIONS.map((a, i) => (
        <Box key={`padrow:${a.verb}`} flexDirection="row">
          {i > 0 && <Text dimColor> · </Text>}
          <Button key={`cmd:${a.verb}`} plain dimColor label={a.verb} onPress={() => pressVerb($, a)} />
        </Box>
      ))}
    </Box>
  )
}

/**
 * The terminal's card: a frame in the accent color, the question, and a grid of bordered tiles.
 * Each tile adds 5 cells to its label (border and padding on both sides, one cell of gap); the
 * frame takes 4 cells.
 */
function terminalCard($: EngineInterface, ui: Elements['terminal'], list: Pad[], columns: number) {
  const { Box, Text, Button } = ui
  const w = WORDS[lang]
  const visible = list.slice(0, MAX_SHOWN)
  const more = list.length - visible.length
  const { width, rows } = layout(visible, style, Math.max(1, columns - 4), 5)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
      <Text color="claude" bold>
        ✻ {w.ask}
      </Text>
      {rows.map((row, r) => (
        <Box key={`row:${r}`} flexDirection="row">
          {row.map(p => (
            <Box key={`cell:${p.id}`} width={width} paddingRight={1}>
              {/* The border is the Box's: a Button there would show inverted under the pointer.
                  The label fills the row inside it, so a press anywhere on that row counts.
                  Over the tile, it tints and its border and label turn the accent color. */}
              <Box
                key={`tile:${p.id}`}
                flexGrow={1}
                borderStyle="round"
                borderDimColor
                hover={{ borderColor: 'claude', borderDimColor: false, backgroundColor: TILE_HOVER }}
              >
                <Button
                  key={`pad:${p.id}`}
                  plain
                  label={tileLabel(buttonLabel(p, style), width - 3)}
                  hover={{ color: 'claude', bold: true }}
                  onPress={() => press($, p)}
                />
              </Box>
            </Box>
          ))}
        </Box>
      ))}
      {padRow($, ui, more)}
    </Box>
  )
}

/** /pad and its arguments: what the command answers, and what the row under the menu runs. */
async function runPad($: EngineInterface, args: string): Promise<{ text?: string }> {
  const w = WORDS[lang]
  const [verb = '', ...rest] = args.trim().split(/\s+/)
  const arg = rest.join(' ')

  switch (verb.toLowerCase()) {
    case '':
    case 'show': {
      await load($)
      if (await read($, isOff)) return { text: w.isOff }
      if (!(await shown($)).length) return { text: w.empty }
      const place = await read($, placement)
      if (place === 'prompt') return { text: w.inBand }
      if (place === 'pane') {
        const opened = await openMenuPane($)
        if (opened?.isPlaced) return {}
        return { text: listText(await shown($), lang, style) }
      }
      return { text: w.shown }
    }

    case 'place': {
      const where = arg.toLowerCase()
      if (where !== 'header' && where !== 'prompt' && where !== 'pane') return { text: w.badPlace }
      await $.store.set(KEY_PLACE, where)
      await update($, placement, () => where)
      if (where === 'pane') await openMenuPane($)
      else await $.ui.close({ id: MENU_PANE }).catch(() => undefined)
      return { text: w.placed[where] }
    }

    // Kept across sessions. Off hides every card, those already in the transcript too; the
    // commands and the pane go on working, to set the menu up before turning it back on.
    case 'off':
    case 'on': {
      const off = verb.toLowerCase() === 'off'
      await $.store.set(KEY_OFF, off)
      await update($, isOff, () => off)
      return { text: off ? w.off : w.on }
    }

    case 'configuration':
    case 'config':
    case 'configure': {
      await load($, true)
      await update($, filter, () => '')
      await update($, offset, () => 0)
      const opened = await $.ui.open({ id: PANE, title: w.pane.title, focus: true, closeOnEscape: true }).catch(() => null)
      if (opened?.isPlaced) return {}
      return { text: listText(await shown($), lang, style) }
    }

    case 'list':
      await load($)
      return { text: listText(await shown($), lang, style) }

    case 'add': {
      await load($)
      const p = parseAdd(args.trim().slice(3), await newId($))
      if (!p) return { text: w.badAdd }
      const why = await add($, p)
      if (why) return { text: why }
      const n = (await shown($)).findIndex(x => x.id === p.id) + 1
      return { text: w.added(n, buttonLabel(p, style)) }
    }

    case 'remove': {
      await load($)
      const p = (await shown($))[Number(arg) - 1]
      if (!/^\d+$/.test(arg) || !p) return { text: w.noSuch(arg || '?') }
      if (p.origin === 'project') return { text: w.projectRemove }
      await saveMenu($, (await read($, menu)).filter(x => x.id !== p.id))
      return { text: w.removed(p.label) }
    }

    case 'reset':
      await saveMenu($, defaults(lang))
      return { text: w.reset }

    default:
      return { text: w.help }
  }
}

export const register: Register = (on, options) => {
  // The options alone until session.start can read the system's LANG and which terminal this is.
  lang = langOf(options.language)
  style = styleOf(options.icons)
  const showOnStart = options.showOnStart !== false
  placeOption = placementOf(options.placement)
  let w = WORDS[lang]

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    cwd = e.cwd
    lang = langOf(options.language, await $.env.get('LANG').catch(() => undefined))
    style = styleOf(options.icons, await $.env.get('TERMINAL_EMULATOR').catch(() => undefined))
    w = WORDS[lang]
    await $.command.register({
      name: 'pad',
      description:
        lang === 'en'
          ? 'Shortcuts: /pad shows them; configuration, list, add, remove, reset, place, off, on'
          : 'Atalhos: /pad mostra; configuration, list, add, remove, reset, place, off, on',
      argumentHint: '[configuration|list|add|remove|reset|place|off|on]',
    })
    await load($, true)
    if (showOnStart && e.isInteractive) {
      const messages = await $.session.messages().catch(() => [])
      if (messages.length === 0 && !(await read($, isOff))) await showMenu($)
    }
    return result
  })

  // Watches the engine list the commands, to learn which take an argument.
  on('command.describe', async ($, e, next) => {
    const result = await next(e)
    const name = e.command.replace(/^\//, '')
    const hint = result.argumentHint?.trim()
    if (hint) hints.set(name, hint)
    else hints.delete(name)
    // A button saved with blanks from an optional hint (`/clear [name]`) is saved back bare.
    const list = await read($, menu)
    const fixed = list.map(p => (p.kind === 'command' && p.origin === 'user' && commandOf(p.text).command === name ? { ...p, text: unblank(p.text, hint) } : p))
    if (fixed.some((p, i) => p !== list[i] && p.text !== list[i]!.text)) await saveMenu($, fixed)
    return result
  }).catch(($, e, next) => next(e))

  // A /clear starts the conversation over with no session.start; the classic SessionStart says so.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (e.source === 'clear' && showOnStart && !(await read($, isOff))) await showMenu($)
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'pad' }, ($, e) => runPad($, e.args))

  // /pad's own row, drawn as the menu. Any other /pad output (list, add, ...) stays text.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const verb = e.props.args.trim().toLowerCase()
    if (e.props.command !== 'pad' || e.props.isErrored || (verb !== '' && verb !== 'show')) return next(e)
    if ((await read($, isOff)) || (await read($, placement)) !== 'header') return next(e)
    const list = await shown($)
    if (list.length === 0) return next(e)

    if (e.surface === 'terminal') {
      return terminalCard($, $.ui.resolve({ ...e, surface: 'terminal' }), list, e.viewport?.columns ?? 80)
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    const visible = list.slice(0, MAX_SHOWN)
    const more = list.length - visible.length
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text bold>{w.ask}</Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
          {visible.map(p => (
            <Button key={`pad:${p.id}`} label={buttonLabel(p, 'emoji')} onPress={() => press($, p)} />
          ))}
        </Box>
        {padRow($, { Box, Text, Button }, more)}
      </Box>
    )
  })

  // `/pad place prompt`: the buttons in one band above the prompt, with whatever else draws there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, placement)) !== 'prompt' || (await read($, isOff))) return next(e)
    const list = await shown($)
    if (list.length === 0) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const icons = e.surface === 'terminal' ? style : 'emoji'
    const mine = (
      <Box key="launchpad" flexDirection="row" flexWrap="wrap" gap={2} paddingX={1}>
        <Text color="claude">✻</Text>
        {list.slice(0, MAX_SHOWN).map(p => (
          <Button key={`pad:${p.id}`} plain label={buttonLabel(p, icons)} hover={{ color: 'claude', bold: true }} onPress={() => press($, p)} />
        ))}
        <Button key="band:settings" plain dimColor label={w.settings} onPress={() => pressVerb($, PAD_ACTIONS[0]!)} />
      </Box>
    )
    const theirs = await next(e)
    return theirs ? (
      <Box flexDirection="column">
        {mine}
        {theirs}
      </Box>
    ) : (
      mine
    )
  })

  // `/pad place pane`: the menu in a pane of its own, a tab beside the other mods' panes.
  on('ui.render', { component: 'Pane', requestId: MENU_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await shown($)
    const visible = list.slice(0, MAX_SHOWN)
    const more = list.length - visible.length
    const icons = e.surface === 'terminal' ? style : 'emoji'
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text color="claude" bold>{`✻ ${w.ask}`}</Text>
        {(await read($, isOff)) ? (
          <Text dimColor>{w.isOff}</Text>
        ) : visible.length === 0 ? (
          <Text dimColor>{w.empty}</Text>
        ) : (
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {visible.map(p => (
              <Button key={`pad:${p.id}`} label={buttonLabel(p, icons)} onPress={() => press($, p)} />
            ))}
          </Box>
        )}
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {padRow($, { Box, Text, Button }, more)}
          <Button key="close" role="dismiss" label={w.pane.close} onPress={() => $.ui.close({ id: MENU_PANE })} />
        </Box>
      </Box>
    )
  })

  // The wheel over the pane moves the catalog list, which the pane keeps whole in view.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await update($, offset, o => Math.max(0, Math.min(lastStart, o + e.by)))
    return {}
  }).catch(($, e, next) => next(e))

  // /pad configuration: the person's buttons to order and remove, the project's, and the catalog
  // to add from, filtered as they type.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // The mobile app draws no field yet: there the catalog lists unfiltered.
    const Input = 'Input' in els ? els.Input : null
    const icons = e.surface === 'terminal' ? style : 'emoji'
    const all = await read($, catalog)
    const mine = await read($, menu)
    const theirs = available(await read($, project), all)
    const working = available(mine, all)
    const query = await read($, filter)
    const found = matches(all, mine, query)
    // The catalog list takes the rows the rest leaves: hint, menu, project, headings, filter,
    // the scroll row, the footer and the gaps between them. The pane keeps it in view whole.
    const fixed = 10 + mine.length + (theirs.length ? theirs.length + 2 : 0)
    const listRows = Math.max(5, e.props.scroll.bodyRows - fixed)
    const view = windowOf(found.length, await read($, offset), listRows)
    const nameWidth = Math.max(24, Math.min(44, Math.floor(e.props.bodyColumns * 0.4)))
    lastStart = Math.max(0, found.length - listRows)
    const scrollList = (by: number) => update($, offset, o => windowOf(found.length, o + by, listRows).start)
    const addTarget = async (t: Target) => {
      const why = await add($, padFor(t, await newId($), hints.get(t.name)))
      if (why) $.ui.toast(why)
    }

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text dimColor>{w.pane.hint}</Text>

        <Box flexDirection="column">
          <Text bold>{w.pane.menu(working.length)}</Text>
          {mine.map((p, i) => {
            // Numbered as /pad list and /pad remove number them: the buttons that work here.
            const n = working.indexOf(p) + 1
            return (
              <Box key={`menu:${p.id}`} flexDirection="row" gap={1}>
                <Text dimColor>{n > 0 ? String(n).padStart(2) : ' –'}</Text>
                <Box width={26}>
                  <Text wrap="truncate-end">{buttonLabel(p, icons)}</Text>
                </Box>
                <Box width={22}>
                  <Text dimColor={n > 0} color={n > 0 ? undefined : 'warning'} wrap="truncate-end">
                    {n > 0 ? p.text : `${p.text} ${w.pane.gone}`}
                  </Text>
                </Box>
                <Box width={2}>{i > 0 && <Button key={`up:${p.id}`} plain label="↑" onPress={() => editMenu($, list => moveId(list, p.id, -1))} />}</Box>
                <Box width={2}>
                  {i < mine.length - 1 && <Button key={`down:${p.id}`} plain label="↓" onPress={() => editMenu($, list => moveId(list, p.id, 1))} />}
                </Box>
                <Button
                  key={`remove:${p.id}`}
                  plain
                  dimColor
                  label={w.pane.remove}
                  onPress={() => editMenu($, list => list.filter(x => x.id !== p.id))}
                />
              </Box>
            )
          })}
        </Box>

        {theirs.length > 0 && (
          <Box flexDirection="column">
            <Text bold>{w.pane.project}</Text>
            {theirs.map((p, i) => (
              <Text key={`project:${p.id}`} dimColor wrap="truncate-end">{`${String(working.length + i + 1).padStart(2)} ${buttonLabel(p, icons)}  ${p.text}`}</Text>
            ))}
          </Box>
        )}

        <Box flexDirection="column">
          <Text bold>{w.pane.add}</Text>
          {working.length >= MAX_SHOWN ? (
            <Text color="warning">{w.pane.full}</Text>
          ) : (
            <Box flexDirection="column">
              {Input && (
                <Input
                  key="filter"
                  label={w.pane.filter}
                  placeholder={w.pane.placeholder}
                  value={query}
                  autoFocus
                  submitLabel={w.pane.plus}
                  onInput={async (value: string) => {
                    await update($, filter, () => value)
                    await update($, offset, () => 0)
                  }}
                  onSubmit={(value: string) => {
                    const first = matches(all, mine, value)[0]
                    if (first) addTarget(first)
                  }}
                />
              )}
              {found.length === 0 && <Text dimColor>{w.pane.none}</Text>}
              {found.slice(view.start, view.end).map(t => (
                <Box key={`find:${keyOf(t.kind, t.name)}`} flexDirection="row" gap={1}>
                  <Button key={`add:${keyOf(t.kind, t.name)}`} plain label={w.pane.plus} onPress={() => addTarget(t)} />
                  <Box width={nameWidth}>
                    <Text wrap="truncate-end">
                      {spell(t)}
                      {t.kind === 'command' && hints.has(t.name) && <Text dimColor>{` ${blanksOf(hints.get(t.name))}`}</Text>}
                    </Text>
                  </Box>
                  <Text dimColor wrap="truncate-end">
                    {t.description || w.kinds[t.kind]}
                  </Text>
                </Box>
              ))}
              {found.length > listRows && (
                <Box flexDirection="row" gap={2}>
                  <Button key="list:up" plain dimColor={view.start === 0} label={w.pane.up} onPress={() => scrollList(-listRows + 1)} />
                  <Button key="list:down" plain dimColor={view.end === found.length} label={w.pane.down} onPress={() => scrollList(listRows - 1)} />
                  <Text dimColor>{w.pane.range(view.start + 1, view.end, found.length)}</Text>
                </Box>
              )}
            </Box>
          )}
        </Box>

        <Box flexDirection="row" gap={2}>
          <Button key="reset" label={w.pane.reset} onPress={() => saveMenu($, defaults(lang))} />
          <Button key="close" role="dismiss" label={w.pane.close} onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
