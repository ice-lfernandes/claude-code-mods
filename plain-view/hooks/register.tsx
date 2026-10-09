// plain-view: a quiet transcript.
//
//   rows   ToolUse, ToolResult and ToolGroup draw nothing while the mod is on. A failed or
//          interrupted call draws in full, and the agent's questions, its plan and its helpers
//          (NEVER_HIDDEN) are never touched, nor the permission dialog or any message.
//   card   AbovePrompt: the request's title, `Passo 2 de 4` with a bar, one row per task with its
//          own bar and `Feito · ~40% · Próximo · Depois`. Before a task list, `Entender o pedido`
//          and `Planejar os passos`; with no list at all, the tool in flight. When the turn ends
//          the card turns green (`✓ Tudo pronto`, `levou 1m 47s`, the files changed and read), or
//          grey on Esc; the next request starts a fresh one. The engine's `[-]` folds it.
//   plan   from the agent's TaskCreate, TaskUpdate and TodoWrite calls, else from a checklist it
//          writes in its answer (`1. [ ] Ler a API`). The `askForTasks` option asks the model, in
//          the system prompt, to keep a task list with those tools.
//   words  `agentText`: final (the default) hides the text of each step that went on to call
//          tools, so the final answer stays; none hides every message; card hides them all and
//          puts the answer's first sentence in the end card; all keeps every word.
//   bars   a gradient of the `palette` option's colors, and a shine that runs while the agent
//          works (`animation`); see palettes.ts and the design guide's "Exception: gradients".
//   /plain-view on | off | demo | palette [name] | help
//
// The task list comes from the agent's TaskCreate, TaskUpdate and TodoWrite calls. Reads nothing
// from disk, runs no process, calls no model; the only writes are its own options, through
// $.config.set, when the person asks for them.

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, Timer } from 'claude-code'

import type { AgentText, Item, Turn } from '../types'
import { drawCard, rasterCells, barCells } from './card'
import { PALETTES, paletteOf, stopsOf } from './palettes'
import type { Palette } from './palettes'
import { agentTextOf, applyAnswer, applyTask, cardOf, countCall, demoOf, endTurn, MID_KEPT, NEVER_HIDDEN, normalize, showsBlock, startTurn, TASK_TOOLS, touch } from './plan'
import type { IconStyle, Lang, Verb } from './ui'
import { langOf, linesOf, styleOf, verbRow } from './ui'
import { COMMAND, MODE, WORDS } from './words'

const turn = atom({ plugin: 'plain-view', key: 'turn' } as const, null as Turn | null)
const items = atom({ plugin: 'plain-view', key: 'items' } as const, [] as Item[])
const tick = atom({ plugin: 'plain-view', key: 'tick' } as const, 0)
const mids = atom({ plugin: 'plain-view', key: 'mids' } as const, [] as string[])

/** How often the shine moves while the agent works. */
const TICK_MS = 100
/** How long each step of the demo lasts. */
const DEMO_STEP_MS = 3000

// Set by register from the options, and by session.start from the system and the theme row.
let lang: Lang = 'en'
let style: IconStyle = 'emoji'
let isOn = false
let palette: Palette = paletteOf(undefined)
let animate = true
let askForTasks = true
let agentText: AgentText = 'final'
let theme: unknown = 'dark'
// The timers of this load; a reload starts them again from session.start.
let ticker: Timer | null = null
let demoTimer: Timer | null = null

const quietly = (p: Promise<unknown>) => void p.catch(() => undefined)

const startTicking = ($: EngineInterface) => {
  if (!animate || ticker) return
  ticker = $.clock.every(TICK_MS, () => quietly(update($, tick, n => n + 1)))
}
const stopTicking = () => {
  ticker?.cancel()
  ticker = null
}

/** Changes one of the mod's options as /config would; the engine reloads the mod with it. */
const setOption = async ($: EngineInterface, key: string, value: unknown): Promise<string | null> => {
  const result = await $.config.set({ key: `plain-view.${key}`, value } as never)
  return result && 'deny' in result && result.deny !== undefined ? String(result.deny) : null
}

const runDemo = async ($: EngineInterface): Promise<string> => {
  const w = WORDS[lang]
  const now = await $.clock.now()
  const t = await read($, turn)
  if (t && t.end === undefined && !t.isDemo) return w.demoBusy
  demoTimer?.cancel()
  const show = async (step: number) => {
    const demo = demoOf(step, now, lang)
    await update($, items, () => demo.items)
    if (step < demo.items.length) {
      await update($, turn, () => demo.turn)
      demoTimer = $.clock.after(DEMO_STEP_MS, () => quietly(show(step + 1)))
    } else {
      await update($, turn, () => endTurn(demo.turn, 'answer', now + DEMO_STEP_MS * step))
      stopTicking()
    }
  }
  await show(0)
  startTicking($)
  return w.demoStarted
}

/** The palette list as text, for a surface that does not draw the command's own row. */
const paletteText = () => {
  const w = WORDS[lang]
  return [`**${w.palette}** · ${w.paletteNow(palette.id)}`, ...PALETTES.map(p => `- \`${p.id}\` ${p.hint[lang]}`), w.paletteAlso].join('\n')
}

/** /plain-view and its arguments. */
const runCommand = async ($: EngineInterface, args: string): Promise<{ text?: string }> => {
  const w = WORDS[lang]
  const [verb = '', name = ''] = args.trim().toLowerCase().split(/\s+/)
  switch (verb) {
    case 'on':
    case 'off': {
      const want = verb === 'on'
      if (want === isOn) return { text: want ? w.alreadyOn : w.alreadyOff }
      const deny = await setOption($, 'enabled', want)
      return { text: deny ? w.denied(deny) : want ? w.on : w.off }
    }
    case 'demo':
      return { text: await runDemo($) }
    case 'palette': {
      if (!name) return { text: paletteText() }
      const p = PALETTES.find(x => x.id === name)
      if (!p) return { text: w.paletteUnknown(name, PALETTES.map(x => x.id).join(', ')) }
      const deny = await setOption($, 'palette', p.id)
      return { text: deny ? w.denied(deny) : w.paletteSet(p.id) }
    }
    default:
      return { text: w.help }
  }
}

const VERBS: readonly Verb[] = [{ verb: 'on' }, { verb: 'off' }, { verb: 'demo' }, { verb: 'palette' }]

const pressVerb = async ($: EngineInterface, v: Verb) => {
  const { text } = await runCommand($, v.verb)
  for (const line of linesOf(text)) $.ui.log(line)
}

/** True when a row of this tool, in this state, steps aside. */
const hides = (tool: string, isErrored: boolean, isInterrupted: boolean) => isOn && !isErrored && !isInterrupted && !NEVER_HIDDEN.includes(tool)

export const register: Register = (on, options) => {
  lang = langOf(options.language)
  style = styleOf(options.icons)
  isOn = options.enabled === true
  palette = paletteOf(options.palette)
  animate = options.animation !== false
  askForTasks = options.askForTasks !== false
  agentText = agentTextOf(options.agentText)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = langOf(options.language, await $.env.get('LANG').catch(() => undefined))
    style = styleOf(options.icons, await $.env.get('TERMINAL_EMULATOR').catch(() => undefined))
    await $.command.register({
      name: COMMAND,
      description: WORDS[lang].description,
      argumentHint: '[on|off|demo|palette [name]|help]',
      immediate: true,
    })
    const rows = await $.config.list().catch(() => [])
    theme = rows.find(r => r.key === 'theme')?.value ?? theme
    // A reload in the middle of a turn: the shine goes on. A demo cut by the reload ends here,
    // since its timer is gone.
    const t = await read($, turn)
    if (t?.isDemo && t.end === undefined) {
      await update($, turn, () => null)
      await update($, items, () => [])
    } else if (isOn && t && t.end === undefined) startTicking($)
    return result
  })

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (!('deny' in result && result.deny !== undefined)) theme = e.value
    return result
  }).catch(($, e, next) => next(e)) // an observer: fail open

  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    demoTimer?.cancel()
    const now = await $.clock.now()
    const fresh = startTurn(await read($, turn), await read($, items), e.text, now, lang)
    await update($, items, () => fresh.items)
    await update($, turn, () => fresh.turn)
    if (isOn) startTicking($)
    return result
  })

  // The agent's answer at the end of each step: a checklist in it becomes the plan.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (!e.agentId && result.answer) {
      await update($, items, list => applyAnswer(list, result.answer)).catch(() => undefined)
      // A step that went on to call tools: its text is mid-turn, which `final` hides.
      const text = normalize(result.answer)
      if (result.toolUses.length > 0 && text) await update($, mids, list => [...list, text].slice(-MID_KEPT)).catch(() => undefined)
    }
    return result
  })

  // With askForTasks, one line in the system prompt asks for a task list.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!isOn || !askForTasks || !e.tools.some(t => t === 'TodoWrite' || t === 'TaskCreate')) return result
    return { sections: [...result.sections, { id: 'plain-view:tasks', text: WORDS.en.askForTasks, scope: 'session' as const }] }
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) return next(e)
    const input = e as unknown as Readonly<Record<string, unknown>>
    if (TASK_TOOLS.includes(e.tool)) {
      const result = await next(e)
      // TaskUpdate reports a refused change in its result ({ success: false }).
      const refused = (result.result as { success?: unknown } | undefined)?.success === false
      if (result.deny === undefined && !('isError' in result && result.isError) && !refused) {
        await update($, items, list => applyTask(list, e.tool, input, result.result)).catch(() => undefined)
      }
      return result
    }
    const t = await read($, turn)
    if (!t || t.end !== undefined || t.isDemo) return next(e)
    await update($, turn, v => (v ? touch(v, e.tool, input, lang, null) : v))
    await update($, items, countCall)
    const result = await next(e)
    const ok = result.deny === undefined && !('isError' in result && result.isError)
    await update($, turn, v => (v ? touch(v, e.tool, input, lang, ok) : v)).catch(() => undefined)
    return result
    // An observer: fail open. After next(e) nothing throws, so the call never runs twice.
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    const now = await $.clock.now()
    await update($, turn, v => (v && v.end === undefined && !v.isDemo ? endTurn(v, e.reason, now, e.answer) : v))
    stopTicking()
    return result
  })

  on('command.run', { command: COMMAND }, ($, e) => runCommand($, e.args)).catch(() => ({ text: WORDS[lang].failed }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const t = await read($, turn)
    if (!isOn && !t?.isDemo) return next(e)
    const card = cardOf(t, await read($, items), await $.clock.now(), lang, agentText === 'card')
    if (!card) return next(e)
    const n = await read($, tick)
    const isWorking = t !== null && t.end === undefined
    // Rasters only on the terminal; another surface's table draws one as an empty box.
    const all = $.ui.resolve(e)
    const ui = { Box: all.Box, Text: all.Text, Raster: e.surface === 'terminal' ? (all as Elements['terminal']).Raster : undefined }
    const mine = drawCard(ui, card, {
      stops: animate ? stopsOf(palette, theme) : null,
      tick: animate && isWorking ? n : null,
      columns: e.props.bodyColumns || e.viewport?.columns || 80,
      icons: style,
      answerLabel: WORDS[lang].answer,
    })
    const { Box } = $.ui.resolve(e)
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

  // The agent's words, as `agentText` says. Under `final` a block hides once its step is known to
  // have gone on to call tools (the read subscribes the block to that list).
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!isOn || agentText === 'all') return next(e)
    if (showsBlock(agentText, e.props.text, agentText === 'final' ? await read($, mids) : [])) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  // The rows step aside; a failure, an interrupt and the never-hidden tools draw as the engine does.
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (!hides(e.props.tool, e.props.isErrored, e.props.isInterrupted)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    if (!hides(e.props.tool, e.props.isErrored, false)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (!e.props.calls.every(c => hides(c.tool, c.isErrored, c.isInterrupted))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  // The hint line under the prompt says the mode is on (the footer's mode labels do not show
  // while none of the engine's modes is on).
  on('ui.render', { component: 'PromptHint' }, ($, e, next) =>
    isOn ? next({ ...e, props: { ...e.props, tail: e.props.tail ? `${e.props.tail} · ${MODE}` : MODE } }) : next(e),
  )

  // The command's own rows: the palettes with a sample and a button, and the help's verbs.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.props.command !== COMMAND || e.props.isErrored) return next(e)
    const [verb = '', name = ''] = e.props.args.trim().toLowerCase().split(/\s+/)
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const w = WORDS[lang]
    if (verb === 'palette' && !name) {
      const Raster = e.surface === 'terminal' ? (ui as Elements['terminal']).Raster : undefined
      const isDark = !/light/i.test(String(theme ?? ''))
      return (
        <Box flexDirection="column">
          <Text>
            <Text bold>{w.palette}</Text>
            <Text dimColor>{` · ${w.paletteNow(palette.id)}`}</Text>
          </Text>
          {PALETTES.map(p => {
            const s = isDark ? p.dark : p.light
            const inUse = p.id === palette.id
            return (
              <Box key={`palette:${p.id}`} flexDirection="row" gap={1}>
                <Text bold={inUse} color={inUse ? 'claude' : undefined}>{p.id.padEnd(8)}</Text>
                {Raster ? <Raster key={`work:${p.id}`} columns={10} rows={1} cells={rasterCells(barCells(10, 1, 'work', s, null))} /> : null}
                {Raster ? <Raster key={`ok:${p.id}`} columns={3} rows={1} cells={rasterCells(barCells(3, 1, 'ok', s, null))} /> : null}
                {inUse ? (
                  <Text color="success">{w.inUse}</Text>
                ) : (
                  <Button key={`use:${p.id}`} label={w.use} onPress={() => quietly(runCommand($, `palette ${p.id}`).then(r => $.ui.toast(r.text ?? '')))} />
                )}
                <Text dimColor>{p.hint[lang]}</Text>
              </Box>
            )
          })}
          <Text dimColor>{w.paletteAlso}</Text>
        </Box>
      )
    }
    if (verb === 'help' || verb === '') {
      const theirs = await next(e)
      return (
        <Box flexDirection="column">
          {theirs}
          {verbRow({ Box, Text, Button }, COMMAND, VERBS, v => quietly(pressVerb($, v)))}
        </Box>
      )
    }
    return next(e)
  })
}
