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
//   agents the agents (subagents) the main loop spawns, in one row of the card: `◇ 1 agente
//          rodando · code-review · 3m 12s`, with agent-watch's `/watch` when it is installed.
//          With the main turn over and no task list, the card waits for them (`Esperando 1
//          agente`). A turn with no list that called tools or agents ends in a small card
//          (`✓ Pronto`, the time, the files and the agents); a plain conversation leaves none.
//   plan   from the agent's TaskCreate, TaskUpdate and TodoWrite calls, else from a checklist it
//          writes in its answer (`1. [ ] Ler a API`). The `askForTasks` option asks the model, in
//          the system prompt, to keep a task list with those tools, or a checklist in its reply
//          when the session has none.
//   words  `agentText`: final (the default) hides the text of each step that went on to call
//          tools, so the final answer stays; none hides every message; card hides them all and
//          puts the answer's first sentence in the end card; all keeps every word.
//   bars   a gradient of the `palette` option's colors, and a shine that runs while the agent
//          works (`animation`); see palettes.ts and the design guide's "Exception: gradients".
//   pane   /plain-view alone, or /plain-view config: a pane (a tab like /limits and /watch) with
//          the seven options in three tabs, Transcript, Card and General. Each value is a button
//          that saves it as /config would ($.config.set); the engine reloads the mod with it, and
//          the pane opens again if the reload closed it. A locked option (managed settings) shows
//          its value and why it does not change; `defaults` asks first, then resets them all.
//   /plain-view config | on | off | demo | palette [name] | help
//
// The task list comes from the agent's TaskCreate, TaskUpdate and TodoWrite calls, the agents from
// agent.spawn, their turn.complete and $.agent.list(). Reads nothing from disk, runs no process,
// calls no model; the only writes are its own options, through $.config.set, when the person asks
// for them.

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, Timer } from 'claude-code'

import type { Agent, AgentText, Flash, Item, Turn } from '../types'
import { drawCard, rasterCells, barCells } from './card'
import { PALETTES, paletteOf, stopsOf } from './palettes'
import type { Palette } from './palettes'
import {
  agentTextOf,
  applyAnswer,
  applyTask,
  cardOf,
  countCall,
  demoOf,
  endTurn,
  finishAgent,
  keepAgents,
  LIST_MS,
  MID_KEPT,
  NEVER_HIDDEN,
  normalize,
  reconcileAgents,
  runningOf,
  showsBlock,
  spawnAgent,
  startTurn,
  TASK_TOOLS,
  touch,
} from './plan'
import type { Setting, SettingKey, SettingValue } from './settings'
import { awayFromDefaults, SETTINGS, settingsOf, tabOf, TABS } from './settings'
import type { IconStyle, Lang, Verb } from './ui'
import { langOf, linesOf, styleOf, verbRow } from './ui'
import { COMMAND, MODE, WATCH, WORDS } from './words'

const turn = atom({ plugin: 'plain-view', key: 'turn' } as const, null as Turn | null)
const items = atom({ plugin: 'plain-view', key: 'items' } as const, [] as Item[])
const tick = atom({ plugin: 'plain-view', key: 'tick' } as const, 0)
const mids = atom({ plugin: 'plain-view', key: 'mids' } as const, [] as string[])
const agents = atom({ plugin: 'plain-view', key: 'agents' } as const, [] as Agent[])
const tab = atom({ plugin: 'plain-view', key: 'tab' } as const, 0)
const flash = atom({ plugin: 'plain-view', key: 'flash' } as const, null as Flash | null)
const reopenAt = atom({ plugin: 'plain-view', key: 'reopenAt' } as const, 0)
const resetting = atom({ plugin: 'plain-view', key: 'resetting' } as const, false)

/** The settings pane. */
const PANE = 'plain-view-settings'
/** How soon after a change from the pane a reload opens the pane again. */
const REOPEN_MS = 10_000

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
// When the ticker last asked $.agent.list(), and whether agent-watch's /watch is there to offer.
let listedAt = 0
let hasWatch = false
// The options this load got: what the pane shows for a row /config does not list.
let loaded: Readonly<Record<string, unknown>> = {}

const quietly = (p: Promise<unknown>) => void p.catch(() => undefined)

/**
 * The ticker: it moves the shine while the agent works (`animation`), and while the main loop's
 * agents run it also asks $.agent.list() every LIST_MS, for an end their turn.complete missed.
 * With animation off it runs only for the agents, at LIST_MS.
 */
const startTicking = ($: EngineInterface, forAgents = false) => {
  if (ticker || (!animate && !forAgents)) return
  ticker = $.clock.every(animate ? TICK_MS : LIST_MS, () => quietly(onTick($)))
}
const stopTicking = () => {
  ticker?.cancel()
  ticker = null
}

const onTick = async ($: EngineInterface) => {
  if (animate) await update($, tick, n => n + 1)
  const now = await $.clock.now()
  if (now - listedAt < LIST_MS) return
  listedAt = now
  await reconcile($, now)
}

/** Folds $.agent.list() into the running agents, then stops the ticker when nothing is left to show moving. */
const reconcile = async ($: EngineInterface, now: number) => {
  if (runningOf(await read($, agents)).length > 0) {
    const listed = await $.agent.list().catch(() => null)
    if (listed) await update($, agents, list => reconcileAgents(list, listed, now))
  }
  await settle($)
}

/** Stops the ticker once the main turn is over and no agent of it runs. */
const settle = async ($: EngineInterface) => {
  const t = await read($, turn)
  if (t?.isDemo && t.end === undefined) return
  if ((!t || t.end !== undefined) && runningOf(await read($, agents)).length === 0) stopTicking()
}

/** Whether agent-watch's /watch is among the commands the person can run. */
const watchOf = async ($: EngineInterface) =>
  (await $.command.list().catch(() => [])).some(c => c.name === WATCH && c.plugin === 'agent-watch')

/** Changes one of the mod's options as /config would; the engine reloads the mod with it. */
const setOption = async ($: EngineInterface, key: string, value: unknown): Promise<string | null> => {
  const result = await $.config.set({ key: `plain-view.${key}`, value } as never)
  return result && 'deny' in result && result.deny !== undefined ? String(result.deny) : null
}

/** The seven options as /config holds them now. */
const settingsNow = async ($: EngineInterface) => settingsOf(await $.config.list().catch(() => []), loaded)

const openPane = ($: EngineInterface) =>
  $.ui.open({ id: PANE, title: WORDS[lang].pane.title, focus: true, closeOnEscape: true }).catch(() => null)

/**
 * A value pressed in the pane. The reload a change causes may cut this hook short, so the
 * `Salvo` line and the time to open the pane again are written first; a refusal, which reloads
 * nothing, replaces the line.
 */
const choose = async ($: EngineInterface, key: SettingKey, value: SettingValue) => {
  await update($, flash, (): Flash => ({ kind: 'saved', key, value }))
  const now = await $.clock.now()
  await update($, reopenAt, () => now)
  const deny = await setOption($, key, value).catch((err: unknown) => String(err instanceof Error ? err.message : err))
  if (deny) {
    await update($, reopenAt, () => 0)
    await update($, flash, (): Flash => ({ kind: 'denied', why: deny }))
  }
}

/**
 * Puts every option that is not locked back to its default, one $.config.set each. Each change
 * reloads the mod; `resetting` lets the next load's session.start go on with what is left.
 */
const resetOptions = async ($: EngineInterface) => {
  const wasResetting = await read($, resetting)
  const left = awayFromDefaults(await settingsNow($))
  if (left.length === 0) {
    await update($, resetting, () => false)
    await update($, flash, (): Flash => ({ kind: wasResetting ? 'reset' : 'resetNone' }))
    return
  }
  await update($, resetting, () => true)
  await update($, flash, (): Flash => ({ kind: 'reset' }))
  for (const key of left) {
    const now = await $.clock.now()
    await update($, reopenAt, () => now)
    const deny = await setOption($, key, SETTINGS[key].initial).catch((err: unknown) => String(err instanceof Error ? err.message : err))
    if (deny) {
      await update($, resetting, () => false)
      await update($, flash, (): Flash => ({ kind: 'denied', why: deny }))
      return
    }
  }
  await update($, resetting, () => false)
}

/** `defaults`: asks first, since it may change all seven at once. */
const askReset = async ($: EngineInterface) => {
  const p = WORDS[lang].pane
  if (awayFromDefaults(await settingsNow($)).length === 0) {
    await update($, flash, (): Flash => ({ kind: 'resetNone' }))
    return
  }
  const answer = await $.ui.ask(p.ask, { options: [p.askYes, p.askNo], header: 'plain-view' }).catch(() => null)
  if (answer === p.askYes) await resetOptions($)
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
    case '':
    case 'config':
    case 'configuration':
    case 'settings': {
      await update($, flash, () => null)
      const opened = await openPane($)
      return opened?.isPlaced ? {} : { text: w.help }
    }
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

const VERBS: readonly Verb[] = [{ verb: 'config' }, { verb: 'on' }, { verb: 'off' }, { verb: 'demo' }, { verb: 'palette' }]
/** The pane's own footer: the verbs that do something the tabs do not. */
const PANE_VERBS: readonly Verb[] = [{ verb: 'on' }, { verb: 'off' }, { verb: 'demo' }, { verb: 'help' }]

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
  loaded = options

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = langOf(options.language, await $.env.get('LANG').catch(() => undefined))
    style = styleOf(options.icons, await $.env.get('TERMINAL_EMULATOR').catch(() => undefined))
    await $.command.register({
      name: COMMAND,
      description: WORDS[lang].description,
      argumentHint: '[config|on|off|demo|palette [name]|help]',
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
    // Agents that ran across the reload: settle the ones that ended meanwhile, and keep watching.
    if (runningOf(await read($, agents)).length > 0) {
      hasWatch = await watchOf($)
      const listed = await $.agent.list().catch(() => null)
      const now = await $.clock.now()
      if (listed) await update($, agents, list => reconcileAgents(list, listed, now))
      if (isOn && runningOf(await read($, agents)).length > 0) startTicking($, true)
    }
    // A reload a change from the pane caused: open the pane again (a no-op when it stayed open),
    // and go on with a reset that the reload cut short.
    const pressedAt = await read($, reopenAt)
    if (pressedAt > 0) {
      await update($, reopenAt, () => 0)
      if ((await $.clock.now()) - pressedAt < REOPEN_MS) quietly(openPane($))
    }
    if (await read($, resetting)) quietly(resetOptions($))
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
    // A new request keeps the agents still running; a notification keeps the finished ones too.
    await update($, agents, list => keepAgents(list, e.text))
    if (isOn) startTicking($, runningOf(await read($, agents)).length > 0)
    return result
  })

  // An agent the main loop spawns joins the card's agents row; one spawned by another agent does
  // not, nor a workflow's (no $.agent.list() row settles it).
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const id = result.agentId
    if (result.deny !== undefined || !id || e.parentAgentId || e.workflow) return result
    // After next(e) nothing throws, so the spawn never runs twice.
    try {
      const now = await $.clock.now()
      await update($, agents, list => spawnAgent(list, id, e.description || e.subagentType, now))
      hasWatch = await watchOf($)
      if (isOn) startTicking($, true)
    } catch {
      // An observer: the spawn goes on.
    }
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

  // With askForTasks, one line in the system prompt asks for a task list, or for a checklist in
  // the reply when the session has no task tool.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!isOn || !askForTasks) return result
    const text = e.tools.some(t => t === 'TodoWrite' || t === 'TaskCreate') ? WORDS.en.askForTasks : WORDS.en.askForChecklist
    return { sections: [...result.sections, { id: 'plain-view:tasks', text, scope: 'session' as const }] }
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

  // The main turn ends the card's turn; an agent's run ends that agent. The ticker stops once both
  // are over.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const now = await $.clock.now()
    const id = e.agentId
    if (id) await update($, agents, list => finishAgent(list, id, now))
    else await update($, turn, v => (v && v.end === undefined && !v.isDemo ? endTurn(v, e.reason, now, e.answer) : v))
    await settle($)
    return result
  })

  on('command.run', { command: COMMAND }, ($, e) => runCommand($, e.args)).catch(() => ({ text: WORDS[lang].failed }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const t = await read($, turn)
    if (!isOn && !t?.isDemo) return next(e)
    // A demo's card shows no agents.
    const team = t?.isDemo ? [] : await read($, agents)
    const card = cardOf(t, await read($, items), await $.clock.now(), lang, agentText === 'card', team)
    if (!card) return next(e)
    const n = await read($, tick)
    const isWorking = (t !== null && t.end === undefined) || runningOf(team).length > 0
    // Rasters only on the terminal; another surface's table draws one as an empty box.
    const all = $.ui.resolve(e)
    const ui = { Box: all.Box, Text: all.Text, Button: all.Button, Raster: e.surface === 'terminal' ? (all as Elements['terminal']).Raster : undefined }
    const mine = drawCard(ui, card, {
      stops: animate ? stopsOf(palette, theme) : null,
      tick: animate && isWorking ? n : null,
      columns: e.props.bodyColumns || e.viewport?.columns || 80,
      icons: style,
      answerLabel: WORDS[lang].answer,
      ...(hasWatch ? { onWatch: () => quietly($.command.run({ command: WATCH, args: '' })) } : {}),
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
    if (verb === 'help' || (verb === '' && e.props.text)) {
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

  // The settings pane: three tabs, a button per value, what each does, and a preview of the card.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const all = $.ui.resolve(e)
    const { Box, Text, Button } = all
    const Raster = e.surface === 'terminal' ? (all as Elements['terminal']).Raster : undefined
    const w = WORDS[lang]
    const p = w.pane
    const s = await settingsNow($)
    const shown = tabOf(await read($, tab))
    const said = await read($, flash)
    const columns = Math.max(30, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)
    const isDark = !/light/i.test(String(theme ?? ''))
    const nameOf = (v: SettingValue) => (v === true ? p.yes : v === false ? p.no : String(v))
    const whatOf = (key: SettingKey, v: SettingValue) =>
      key === 'palette' ? (PALETTES.find(x => x.id === v)?.hint[lang] ?? '') : (p.values[key][String(v)] ?? '')

    const option = (key: SettingKey, cur: Setting) => (
      <Box key={`opt:${key}`} flexDirection="column">
        <Text bold>{p.labels[key]}</Text>
        {SETTINGS[key].values.map(v => {
          const isCur = v === cur.value
          const label = `${isCur ? '●' : '○'} ${nameOf(v)}`
          const pal = key === 'palette' ? PALETTES.find(x => x.id === v) : undefined
          return (
            <Box key={`val:${key}:${String(v)}`} flexDirection="row">
              <Box width={12}>
                {isCur || cur.isLocked ? (
                  <Text bold={isCur} color={cur.isLocked ? 'inactive' : 'claude'}>{label}</Text>
                ) : (
                  <Button key={`set:${key}:${String(v)}`} plain label={label} onPress={() => quietly(choose($, key, v))} />
                )}
              </Box>
              {pal && Raster ? <Raster key={`swatch:${pal.id}`} columns={6} rows={1} cells={rasterCells(barCells(6, 1, 'work', isDark ? pal.dark : pal.light, null))} /> : null}
              {pal && Raster ? <Text> </Text> : null}
              <Text dimColor={!cur.isLocked} color={cur.isLocked ? 'inactive' : undefined}>{whatOf(key, v)}</Text>
            </Box>
          )
        })}
        {cur.isLocked && <Text color="inactive">{p.locked}</Text>}
        {cur.isLocked && <Text dimColor>{p.lockedWhy}</Text>}
      </Box>
    )

    // The card tab's preview: the demo's second step, in the palette and animation the pane shows.
    const now = await $.clock.now()
    const preview = () => {
      const demo = demoOf(1, now - 12_000, lang)
      const sample = cardOf(demo.turn, demo.items, now, lang)
      if (!sample) return null
      const stops = s.animation.value === true ? stopsOf(paletteOf(s.palette.value), theme) : null
      return (
        <Box key="preview" flexDirection="column">
          <Text bold>{p.preview}</Text>
          {drawCard({ Box, Text, Raster }, sample, { stops, tick: null, columns, icons: style })}
        </Box>
      )
    }

    const line =
      said === null ? null : said.kind === 'saved' ? (
        <Text color="success">{p.saved(p.labels[said.key as SettingKey] ?? said.key, nameOf(said.value))}</Text>
      ) : said.kind === 'denied' ? (
        <Text color="warning">{p.denied(said.why)}</Text>
      ) : said.kind === 'reset' ? (
        <Text color="success">{p.reset}</Text>
      ) : (
        <Text dimColor>{p.resetNone}</Text>
      )

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="column">
          <Text color="claude" bold>{p.heading}</Text>
          <Text dimColor>{p.hint}</Text>
          {line}
        </Box>

        <Box flexDirection="row" flexWrap="wrap">
          {p.tabs.map((name, i) => (
            <Box key={`tabs:${i}`} flexDirection="row">
              {i > 0 && <Text dimColor> · </Text>}
              {i === shown ? (
                <Text color="claude" bold>{`▸ ${name}`}</Text>
              ) : (
                <Button key={`tab:${i}`} plain label={name} onPress={() => quietly(update($, tab, () => i).then(() => update($, flash, () => null)))} />
              )}
            </Box>
          ))}
        </Box>

        {TABS[shown]!.map(key => option(key, s[key]))}
        {shown === 1 && preview()}

        <Box flexDirection="column" alignItems="flex-start">
          {verbRow({ Box, Text, Button }, COMMAND, PANE_VERBS, v => quietly(pressVerb($, v)))}
          <Box flexDirection="row" gap={1}>
            <Button key="reset" label={p.defaults} onPress={() => quietly(askReset($))} />
            <Button key="close" role="dismiss" label={p.close} onPress={() => quietly($.ui.close({ id: PANE }))} />
          </Box>
        </Box>
      </Box>
    )
  })
}
