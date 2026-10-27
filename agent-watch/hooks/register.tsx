// agent-watch: subagents at a glance.
//
//   tokens   per agent, from every model request's usage (`turn.step`), so the count moves while
//            the agent runs. Tokens a loop spends before any listing names it wait as orphans and
//            join the agent once it appears; the engine's own forks (compaction, memory) stay
//            orphans and show as "other".
//   stalls   a running agent with no model request and no tool call for `stallMinutes` gets one
//            toast, saying whether it is thinking, inside a tool, or quiet. Activity re-arms it.
//   summary  when the last active agent ends, a toast with the wave's agents, tokens, wall time,
//            the heaviest agent and the share of the 5-hour window the wave used; the pane keeps
//            it as "last run".
//   /watch   opens the pane: a summary row (agents, tokens, time, the 5-hour window the wave moved,
//            the week it cost), then a card per agent in two groups, Running and Finished, each
//            a bar that runs to the right edge and folds it (`clear finished` at the end of the Finished
//            bar, a blank row above each bar). A card has the agent's mascot and color (fixed by the order
//            agents appeared), its step, the two calls before it, a bar of its tokens against
//            the heaviest agent's, and what it cost of the 5-hour window and of the week: an
//            estimate, the wave's change split by tokens at a rate the mod keeps from earlier
//            waves (`—` while it has none). From `compactAt` agents each is one boxed line (name
//            button, action, tokens and time at the right edge), and a name opens its card. A stalled agent has an `investigate` button that asks about
//            it in the prompt. `⇅` sorts each group by start or by tokens. The list scrolls.
//            /watch clear drops finished and demo agents (clear done, clear demo: one kind);
//            /watch demo seeds three fake ones.
//   band     AbovePrompt, while agents run: `Agents 2/5`, a gradient bar of how many finished,
//            and what one is doing now; `open` opens the pane, `hide` is /watch hide. After the
//            last agent ends it says they are done, until the next prompt.
//
// Reads nothing from disk, runs no process, calls no model.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, Message, Run, Tokens } from '../types'
import type { Rate, RateSample } from './watch'
import {
  add,
  addSample,
  addStep,
  adopt,
  clearOut,
  DEFAULT_COMPACT_AT,
  finish,
  fillCells,
  fitRows,
  fiveHourOf,
  fromUsage,
  glyphOf,
  groupsOf,
  isActive,
  isCompact,
  isFailed,
  lastDone,
  lastStartFor,
  cap,
  isInCard,
  messageOf,
  nameOf,
  quietFor,
  rateOf,
  reconcile,
  runText,
  sevenDayOf,
  stalls,
  stallText,
  stepOf,
  summarize,
  summaryOf,
  toolEnd,
  toolStart,
  total,
  touch,
  windowShare,
  windowUsed,
  ZERO,
} from './watch'
import type { SortBy } from './watch'
import { barCells, colorOf, glyphOfSlot, SLOTS, SPRITES, spriteSvg } from './look'
import { PHRASES, phraseOf } from './phrases'
import type { IconStyle, Lang, Verb } from './ui'
import { BAR_EMPTY, BAR_FULL, PRIMARY, SECONDARY, clip, elapsed, fig, fillArgs, glyph, langOf, lbl, linesOf, shortModel, styleOf, tokens, verbRow } from './ui'
import { switchOf, switchWords } from './switch'
import type { Switch } from './switch'
import { COMMAND, WORDS } from './words'

const PANE = 'agent-watch'
const POLL_MS = 5000
const DEMO = 'demo-'
const KEY_HIDDEN = 'hidden'

const agents = atom({ plugin: 'agent-watch', key: 'agents' } as const, [] as Agent[])
const orphans = atom({ plugin: 'agent-watch', key: 'orphans' } as const, {} as Record<string, Tokens>)
const lead = atom({ plugin: 'agent-watch', key: 'lead' } as const, ZERO)
const live = atom({ plugin: 'agent-watch', key: 'live' } as const, 0)
const standDownAt = atom({ plugin: 'agent-watch', key: 'standDownAt' } as const, 0)
const lastRun = atom({ plugin: 'agent-watch', key: 'lastRun' } as const, null as Run | null)
const tick = atom({ plugin: 'agent-watch', key: 'tick' } as const, 0)
const dropped = atom({ plugin: 'agent-watch', key: 'dropped' } as const, [] as string[])
const expanded = atom({ plugin: 'agent-watch', key: 'expanded' } as const, [] as string[])
const sortBy = atom({ plugin: 'agent-watch', key: 'sortBy' } as const, 'start' as SortBy)
const offset = atom({ plugin: 'agent-watch', key: 'offset' } as const, 0)
const waveStart = atom({ plugin: 'agent-watch', key: 'waveStart' } as const, null as number | null)
const waveStartWeek = atom({ plugin: 'agent-watch', key: 'waveStartWeek' } as const, null as number | null)
const windowNow = atom({ plugin: 'agent-watch', key: 'windowNow' } as const, null as number | null)
const folded = atom({ plugin: 'agent-watch', key: 'folded' } as const, [] as string[])
const bandDone = atom({ plugin: 'agent-watch', key: 'bandDone' } as const, false)
const message = atom({ plugin: 'agent-watch', key: 'message' } as const, null as Message | null)
// plain-view's, read only: whether its card is drawn, and the agents its row lists.
const PV_CARD_ON = { plugin: 'plain-view', key: 'cardOn' } as const
const PV_AGENTS = { plugin: 'plain-view', key: 'agents' } as const

const KEY_RATES = 'rates'
// The last first item the list can start at, from the last render: the wheel stops there.
let lastStart = 0
/** Percentage points of the 5-hour window and the week a token costs, from earlier waves; read from the store once. */
let rate: Rate | null = null
let isRateLoaded = false
/** The `compactAt` option: with this many agents the pane draws a line each. */
let compactAt = DEFAULT_COMPACT_AT
/** The person's theme row, which picks the dark or the light colors of the mascots and the band's bar. */
let theme: unknown = 'dark'

let shownStatus: string | undefined
let stallMs = 5 * 60_000
/** The `enabled` option; off, only the command answers. */
let isOn = true
/** On but silent: no toast and no status line. The pane still opens. Kept in the store. */
let isHidden = false
/** The `quiet` option, set in every mod by `/pad quiet`: hides what the mod draws by itself, as hide does. `show` does not undo it. */
let isQuiet = false
// Set by register from the options, and by session.start from the system's LANG and terminal.
let lang: Lang = 'en'
let style: IconStyle = 'emoji'

const warn = () => glyph(style, { emoji: '⚠', symbol: '!' })

/** Edits the agents and the orphans together. */
const edit = async ($: EngineInterface, fn: (list: Agent[], early: Record<string, Tokens>) => { agents: Agent[]; orphans: Record<string, Tokens> }) => {
  const known = await read($, orphans)
  let left = known
  await update($, agents, list => {
    const next = fn(list, known)
    left = next.orphans
    return next.agents
  })
  await update($, orphans, () => left)
}

/** True when plain-view draws its card with an agents row, which then carries the band's message. */
const inCard = async ($: EngineInterface) => {
  const cardOn = await $.state.get(PV_CARD_ON).catch(() => undefined)
  const row = await $.state.get(PV_AGENTS).catch(() => undefined)
  return isInCard(cardOn?.value, row?.value)
}

/** Writes the band's message for plain-view to draw; null while the band is hidden or has nothing to say. */
const publish = async ($: EngineInterface) => {
  const list = await read($, agents)
  const isDone = list.length > 0 && (await read($, bandDone))
  const next = isHidden || isQuiet ? null : messageOf(list, await read($, lastRun), isDone, await $.clock.now(), theme, lang)
  if (JSON.stringify(await read($, message)) !== JSON.stringify(next)) await update($, message, () => next)
}

/** Folds the agent listing in, raises stall toasts, ends a wave, and sets the status line. */
const refresh = async ($: EngineInterface) => {
  const w = WORDS[lang]
  const now = await $.clock.now()
  // A finished agent the person cleared stays out, though the listing still names it.
  const gone = await read($, dropped)
  const listed = (await $.agent.list().catch(() => [])).filter(l => isActive(l.status) || !gone.includes(l.id))
  const known = await read($, orphans)
  let left = known
  let raised: Agent[] = []
  await update($, agents, list => {
    const folded = reconcile(list, known, listed, now)
    left = folded.orphans
    const checked = stalls(folded.agents, now, stallMs)
    raised = checked.raised
    return checked.agents
  })
  if (left !== known) await update($, orphans, () => left)
  for (const a of raised) if (!isHidden && !isQuiet) $.ui.toast(w.stalledToast(nameOf(a), stallText(a, now, lang)), { timeoutMs: 10_000 })

  const list = await read($, agents)
  const active = list.filter(a => isActive(a.status) && !a.id.startsWith(DEMO)).length
  let before = 0
  await update($, live, n => {
    before = n
    return active
  })
  if (list.some(a => isActive(a.status))) await update($, tick, n => n + 1)
  if (active > 0) {
    const usage = await $.session.usage().catch(() => null)
    if (before === 0) {
      await update($, waveStart, () => fiveHourOf(usage))
      await update($, waveStartWeek, () => sevenDayOf(usage))
      await update($, bandDone, () => false)
    }
    await update($, windowNow, () => fiveHourOf(usage))
  }
  if (before > 0 && active === 0) {
    const since = await read($, standDownAt)
    const wave = summarize(list.filter(a => a.startedAt > since && !a.id.startsWith(DEMO)), now)
    await update($, standDownAt, () => now)
    const usage = await $.session.usage().catch(() => null)
    const used = windowUsed(await read($, waveStart), fiveHourOf(usage))
    const usedWeek = windowUsed(await read($, waveStartWeek), sevenDayOf(usage))
    const run = wave && { ...wave, windowUsed: used }
    if (run) {
      await update($, lastRun, () => run)
      await update($, bandDone, () => true)
      await learn($, run.total, used, usedWeek)
      if (!isHidden && !isQuiet) $.ui.toast(w.doneToast(runText(run, lang)), { timeoutMs: 10_000 })
    }
  }

  const running = list.filter(a => isActive(a.status))
  const stalled = running.filter(a => a.isStalled).length
  const text = running.length && !isHidden && !isQuiet ? w.statusLine(running.length, tokens(running.reduce((n, a) => n + total(a.tokens), 0)), stalled, warn()) : undefined
  if (text !== shownStatus) {
    shownStatus = text
    $.ui.status(text)
  }
  await publish($)
}

/** The rate the pane's estimates use, from the waves the store remembers. */
const loadRate = async ($: EngineInterface) => {
  const kept = (await $.store.get(KEY_RATES).catch(() => undefined)) as RateSample[] | undefined
  rate = rateOf(Array.isArray(kept) ? kept : [])
  isRateLoaded = true
}

/** A wave ended: its tokens and the points the windows moved join the samples, and the rate follows. */
const learn = async ($: EngineInterface, tokensOf: number, five: number | null, week: number | null) => {
  const kept = (await $.store.get(KEY_RATES).catch(() => undefined)) as RateSample[] | undefined
  const samples = addSample(Array.isArray(kept) ? kept : [], tokensOf, five, week)
  await $.store.set(KEY_RATES, samples).catch(() => undefined)
  rate = rateOf(samples)
  isRateLoaded = true
}

const quietly = ($: EngineInterface) => void refresh($).catch(() => undefined)

const open = ($: EngineInterface) => $.ui.open({ id: PANE, title: WORDS[lang].pane }).catch(() => null)

const clear = async ($: EngineInterface, kind: 'done' | 'demo' | 'both') => {
  let removed: string[] = []
  await update($, agents, list => {
    const kept = clearOut(list, kind, DEMO)
    removed = list.filter(a => !kept.includes(a)).map(a => a.id)
    return kept
  })
  await update($, dropped, ids => [...ids, ...removed].slice(-200))
  quietly($)
}

const runDemo = async ($: EngineInterface) => {
  const now = await $.clock.now()
  const [first, second, third] = WORDS[lang].demoLabels
  const t = (input: number, output: number, cacheRead: number) => ({ input, output, cacheRead, cacheWrite: 0 })
  const demo: Agent[] = [
    { id: `${DEMO}1`, slot: 0, label: first, type: 'Explore', model: 'claude-haiku-4-5', status: 'running', startedAt: now - 140_000, lastAt: now - 4000, activity: 'tool', doing: PHRASES[lang].reading('routes.ts'), tools: 14, errors: 0, steps: 15, tokens: t(9_000, 6_200, 118_000), isStalled: false, recent: [{ doing: PHRASES[lang].reading('app.ts'), ok: true }, { doing: PHRASES[lang].reading('routes.ts'), ok: true }] },
    { id: `${DEMO}2`, slot: 1, label: second, type: 'general-purpose', model: 'claude-opus-5-5', status: 'running', startedAt: now - 600_000, lastAt: now - stallMs - 60_000, activity: 'tool', doing: PHRASES[lang].running('npm test'), tools: 9, errors: 2, steps: 10, tokens: t(14_000, 8_100, 210_000), isStalled: false, recent: [{ doing: PHRASES[lang].reading('auth.test.ts'), ok: true }, { doing: PHRASES[lang].running('npm test'), ok: false }] },
    { id: `${DEMO}3`, slot: 2, label: third, type: 'Explore', parentId: `${DEMO}1`, model: 'claude-haiku-4-5', status: 'completed', startedAt: now - 90_000, endedAt: now - 30_000, lastAt: now - 30_000, activity: 'idle', tools: 6, errors: 0, steps: 7, tokens: t(3_000, 1_900, 41_000), isStalled: false, recent: [{ doing: PHRASES[lang].reading('README.md'), ok: true }, { doing: PHRASES[lang].reading('docs.md'), ok: true }] },
  ]
  await update($, agents, list => [...list.filter(a => !a.id.startsWith(DEMO)), ...demo])
  await open($)
  await refresh($)
}

/** Changes the mod's `enabled` option as /config would; the engine reloads the mod with it. */
const setEnabled = async ($: EngineInterface, value: boolean): Promise<string | null> => {
  const result = await $.config.set({ key: 'agent-watch.enabled', value } as never)
  return result && 'deny' in result && result.deny !== undefined ? String(result.deny) : null
}

/** /watch on|off|hide|show: off is the option, in every conversation; hide is a stored flag. */
const runSwitch = async ($: EngineInterface, choice: Switch): Promise<{ text?: string }> => {
  const s = switchWords(lang, COMMAND)
  if (choice === 'on' || choice === 'off') {
    const want = choice === 'on'
    if (want === isOn) return { text: want ? s.alreadyOn : s.alreadyOff }
    const deny = await setEnabled($, want)
    return { text: deny ? s.denied(deny) : want ? s.on : s.off }
  }
  isHidden = choice === 'hide'
  await $.store.set(KEY_HIDDEN, isHidden)
  if (isHidden) $.ui.status(undefined)
  else quietly($)
  await publish($)
  return { text: isHidden ? s.hidden : s.shown }
}

/** /watch and its arguments: what the command answers, and what the pane's verbs run. */
const runCommand = async ($: EngineInterface, args: string): Promise<{ text?: string }> => {
  const w = WORDS[lang]
  const choice = switchOf(args)
  if (choice) return runSwitch($, choice)
  switch (args.trim().toLowerCase().replace(/\s+/g, ' ')) {
    case 'clear':
      await clear($, 'both')
      return { text: w.clearedBoth }
    case 'clear done':
      await clear($, 'done')
      return { text: w.clearedDone }
    case 'clear demo':
      await clear($, 'demo')
      return { text: w.clearedDemo }
    case 'demo':
      await runDemo($)
      return { text: w.demoAdded }
    case 'help':
      return { text: w.help }
    case '': {
      const opened = await open($)
      await refresh($).catch(() => undefined)
      if (opened?.isPlaced) return {}
      const list = await read($, agents)
      const run = await read($, lastRun)
      const running = list.filter(a => isActive(a.status))
      return {
        text: `${w.answer(running.length, list.length - running.length)}${running.map(a => ` ${nameOf(a)} ${tokens(total(a.tokens))}.`).join('')}${run ? ` ${w.lastRunAnswer(runText(run, lang))}` : ''}`,
      }
    }
    default:
      return { text: w.help }
  }
}

/** Puts a text in the prompt for the person to send; runs nothing. */
const fill = async ($: EngineInterface, text: string) => {
  await $.prompt.fill(fillArgs(text))
}

/** The pane's verbs: clear drops agents, so it waits in the prompt. */
const VERBS: readonly Verb[] = [{ verb: 'clear', fill: `/${COMMAND} clear` }, { verb: 'demo' }, { verb: 'help' }]

/** A verb pressed in the pane: fills the prompt, or runs and writes its answer to the transcript. */
const pressVerb = async ($: EngineInterface, v: Verb) => {
  try {
    if (v.fill) return await fill($, v.fill)
    const { text } = await runCommand($, v.verb)
    for (const line of linesOf(text)) $.ui.log(line)
  } catch {
    $.ui.toast(WORDS[lang].failedToRun(`/${COMMAND} ${v.verb}`))
  }
}

export const register: Register = (on, options) => {
  stallMs = Math.max(1, Number(options.stallMinutes) || 5) * 60_000
  compactAt = Math.max(1, Math.round(Number(options.compactAt) || DEFAULT_COMPACT_AT))
  isOn = options.enabled !== false
  isQuiet = options.quiet === true
  lang = langOf(options.language)
  style = styleOf(options.icons)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = langOf(options.language, await $.env.get('LANG').catch(() => undefined))
    style = styleOf(options.icons, await $.env.get('TERMINAL_EMULATOR').catch(() => undefined))
    await $.command.register({
      name: COMMAND,
      description: WORDS[lang].description,
      argumentHint: '[on|off|hide|show|clear [done|demo]|demo|help]',
      immediate: true,
    })
    isHidden = (await $.store.get(KEY_HIDDEN).catch(() => undefined)) === true
    theme = (await $.config.list().catch(() => [])).find(r => r.key === 'theme')?.value ?? theme
    await loadRate($)
    if (isOn) $.clock.every(POLL_MS, () => quietly($))
    return result
  })

  on('command.run', { command: COMMAND }, ($, e) => runCommand($, e.args))

  // Off: only the command above answers, so `/watch on` can bring the rest back.
  if (!isOn) return

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const id = result.agentId
    if (result.deny !== undefined || !id) return result
    const now = await $.clock.now()
    await edit($, (list, early) =>
      adopt(list, early, id, now, {
        label: e.description || e.subagentType,
        type: e.fork ? 'fork' : e.subagentType,
        model: result.model,
        status: 'running',
        startedAt: now,
        lastAt: now,
        ...(e.name ? { name: e.name } : {}),
        ...(e.parentAgentId ? { parentId: e.parentAgentId } : {}),
      }),
    )
    quietly($)
    return result
  }).catch(($, e, next) => next(e)) // an observer: fail open, the spawn goes on

  // Every model request: the stall clock reads "thinking" while it is out, and its tokens land
  // on the loop's agent (or the lead) when it is back.
  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id) {
      const now = await $.clock.now()
      await update($, agents, list => touch(list, id, now, 'thinking'))
    }
    const result = yield* next(e)
    const usage = result.usage
    if (usage) {
      const spent = fromUsage(usage)
      if (id) {
        const now = await $.clock.now()
        await edit($, (list, early) => addStep(list, early, id, spent, usage.model, now))
      } else await update($, lead, t => add(t, spent))
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (!id) return next(e)
    const now = await $.clock.now()
    await update($, agents, list => toolStart(list, id, phraseOf(e.tool, e as unknown as Record<string, unknown>, lang), now))
    let ok = false
    try {
      const ran = await next(e)
      ok = ran.deny === undefined && ran.isError !== true
      return ran
    } finally {
      const end = await $.clock.now()
      await update($, agents, list => toolEnd(list, id, ok, end))
    }
  }).catch(($, e, next) => next(e)) // an observer: fail open, the call goes on

  // A subagent's run ends in its own turn.complete: close it and refresh now.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const id = e.agentId
    if (id) {
      const now = await $.clock.now()
      await update($, agents, list => finish(list, id, e.reason, now))
      quietly($)
    }
    return result
  })


  // The person changed the theme: the mascots and the band's bar follow.
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (!('deny' in result && result.deny !== undefined)) theme = e.value
    return result
  }).catch(($, e, next) => next(e)) // an observer: fail open

  // A prompt sent: the band that said the agents were done goes.
  on('prompt.submit', async ($, e, next) => {
    await update($, bandDone, () => false)
    await publish($)
    return next(e)
  }).catch(($, e, next) => next(e)) // an observer: fail open

  // The wheel over the pane moves the list.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await update($, offset, o => Math.max(0, Math.min(lastStart, o + e.by)))
    return {}
  }).catch(($, e, next) => next(e))

  // The band above the prompt while agents run, and for a moment after they end. Its row goes
  // first, then whatever the other mods drew.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await read($, tick)
    if (e.props.hasSurvey || isHidden || isQuiet) return next(e)
    // plain-view's card carries the message as a child of its agents row: nothing above the prompt.
    if (await inCard($)) return next(e)
    const list = await read($, agents)
    const now = await $.clock.now()
    const isDone = list.length > 0 && (await read($, bandDone))
    const msg = messageOf(list, await read($, lastRun), isDone, now, theme, lang)
    if (!msg) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const w = WORDS[lang]
    const columns = e.props.bodyColumns || e.viewport?.columns || 80
    const row = (
      <Box key="watch-band" flexDirection="row" flexWrap="wrap" gap={1}>
        {msg.kind === 'done' ? (
          <Text key="band-done">
            <Text color="success" bold>{'✓ '}</Text>
            <Text bold>{msg.text}</Text>
          </Text>
        ) : (
          [
            <Text key="band-title" bold>{msg.label}</Text>,
            fig({ Text }, msg.count, 'ok', 'band-count'),
            <Text key="band-bar">
              {msg.bar.map((c, i) => (
                <Text key={`band-bar:${i}`} color={c.color}>{c.filled ? BAR_FULL : BAR_EMPTY}</Text>
              ))}
            </Text>,
            <Text key="band-now" color={msg.stalled ? 'warning' : undefined}>
              <Text color={msg.stalled ? 'warning' : msg.color} bold>{`${msg.glyph} `}</Text>
              {msg.stalled ?? w.band.now(clip(msg.name, 20), clip(msg.action, columns < 90 ? 20 : 44))}
            </Text>,
          ]
        )}
        <Button key="band:open" plain label={w.band.open} onPress={() => open($)} />
        <Button key="band:hide" plain dimColor label={w.band.hide} onPress={() => runSwitch($, 'hide').then(() => update($, tick, n => n + 1))} />
      </Box>
    )
    const theirs = await next(e)
    return theirs ? <Box key="watch-band-stack" flexDirection="column">{row}{theirs}</Box> : row
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const Svg = e.surface === 'terminal' ? undefined : ($.ui.resolve(e as never) as Elements['desktop']).Svg
    const w = WORDS[lang]
    if (!isRateLoaded) await loadRate($)
    const n = await read($, tick)
    const opened = await read($, expanded)
    const foldedGroups = await read($, folded)
    const order = await read($, sortBy)
    const now = await $.clock.now()
    const list = await read($, agents)
    const spentLead = await read($, lead)
    const other = Object.values(await read($, orphans)).reduce((t, x) => add(t, x), ZERO)
    const run = await read($, lastRun)
    const liveFive = await read($, windowNow)
    const startFive = await read($, waveStart)
    const width = Math.max(40, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)

    const running = list.filter(a => isActive(a.status))
    const hasDemo = list.some(a => a.id.startsWith(DEMO))
    const groups = groupsOf(list, order)
    const isLine = isCompact(list.length, compactAt)
    const max = list.reduce((m, a) => Math.max(m, total(a.tokens)), 0)
    const colorFor = (a: Agent) => colorOf(a.slot, theme)
    const toggle = (id: string) => update($, expanded, ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))
    const toggleGroup = (id: string) => update($, folded, ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))
    const investigate = (a: Agent) =>
      fill($, w.askInvestigate(nameOf(a), a.activity === 'thinking' ? w.thinking : (a.doing ?? w.inATool), elapsed(quietFor(a, now))))

    // The wave's change in the 5-hour window, measured while it runs and kept in the last run after.
    const used = running.length > 0 && liveFive !== null && startFive !== null && liveFive >= startFive ? liveFive - startFive : run?.windowUsed ?? null
    const sum = summaryOf(list, now, running.length > 0 ? used : (run?.windowUsed ?? null), rate, lang)
    const cell = (key: string, value: string, label: string, tone?: 'ok' | 'warn') => (
      <Box key={`sum:${key}`} flexDirection="column">
        {fig({ Text }, value, tone)}
        {lbl({ Text }, label)}
      </Box>
    )

    const mascot = (a: Agent, px: number) =>
      Svg ? (
        <Svg key={`mascot:${a.id}`} source={spriteSvg(a.slot, theme, px)} alt={w.mascot(nameOf(a))} width={px} />
      ) : (
        <Box key={`mascot:${a.id}`} flexDirection="column">
          <Text color={colorFor(a)} bold>{SPRITES[a.slot % SLOTS]![0]}</Text>
          <Text color={colorFor(a)} bold>{SPRITES[a.slot % SLOTS]![1]}</Text>
        </Box>
      )

    const actionOf = (a: Agent) => (a.activity === 'thinking' ? w.thinking : (a.doing ?? w.starting))

    // A card: mascot, name and meta, the step line, the two calls before it, the bar, the windows.
    const card = (a: Agent) => {
      const isStuck = a.isStalled && isActive(a.status)
      const isRunning = isActive(a.status)
      const parent = a.parentId ? list.find(x => x.id === a.parentId) : undefined
      const barW = Math.max(8, Math.min(24, width - 40))
      const filled = fillCells(total(a.tokens), max, barW)
      const clock = isRunning ? elapsed(now - a.startedAt) : elapsed((a.endedAt ?? now) - a.startedAt)
      const recent = lastDone(a)
      return (
        <Box key={`card:${a.id}`} flexDirection="row" borderStyle="round" borderColor={colorFor(a)} paddingX={1} gap={1}>
          {mascot(a, 40)}
          <Box flexDirection="column" flexGrow={1}>
            <Text>
              <Text bold>{clip(nameOf(a), 28)}</Text>
              <Text dimColor>{`  ${a.type === 'general-purpose' ? 'general' : a.type}${a.model ? ` · ${shortModel(a.model)}` : ''}`}</Text>
              {parent && <Text dimColor>{`  ${w.inParent(clip(nameOf(parent), 16))}`}</Text>}
              {a.id.startsWith(DEMO) && <Text color="warning">{`  ${w.demoBadge}`}</Text>}
            </Text>
            <Box flexDirection="row" gap={1}>
              {isStuck ? (
                <Text color="warning" bold>{`${warn()} ${cap(stallText(a, now, lang))}`}</Text>
              ) : isRunning ? (
                <Text>
                  <Text color="claude">{`${glyphOf(a, n)} `}</Text>
                  <Text bold>{w.step(stepOf(a))}</Text>
                  <Text>{` · ${cap(clip(actionOf(a), Math.max(10, width - 40)))}`}</Text>
                </Text>
              ) : isFailed(a.status) ? (
                <Text color="error">{`× ${cap(w.statuses[a.status] ?? a.status)}`}</Text>
              ) : (
                <Text color="success">{`✓ ${w.stepsDone(a.steps)}`}</Text>
              )}
              {isStuck && <Button key={`investigate:${a.id}`} {...PRIMARY} label={w.investigate} onPress={() => investigate(a)} />}
            </Box>
            {recent.map((r, i) => (
              <Text key={`recent:${a.id}:${i}`} color={r.ok === false ? 'error' : undefined} dimColor={r.ok !== false}>
                {r.ok === false ? `× ${cap(clip(r.doing, Math.max(10, width - 52)))}  ${w.failedMark}` : `  ${cap(clip(r.doing, Math.max(10, width - 52)))}`}
              </Text>
            ))}
            <Text>
              <Text color={colorFor(a)}>{BAR_FULL.repeat(filled)}</Text>
              <Text dimColor>{BAR_EMPTY.repeat(barW - filled)}</Text>
              {'  '}
              {fig({ Text }, tokens(total(a.tokens)), 'ok')}
              {lbl({ Text }, ' · ')}
              {fig({ Text }, clock, isStuck ? 'warn' : 'ok')}
            </Text>
            <Text dimColor>{windowShare(total(a.tokens), rate, lang)}</Text>
          </Box>
        </Box>
      )
    }

    // One boxed line an agent, from `compactAt` agents on: glyph, the name as a button that opens
    // its card, what it does, and its tokens and time at the right edge. Three rows with the border.
    const line = (a: Agent) => {
      const isStuck = a.isStalled && isActive(a.status)
      const isRunning = isActive(a.status)
      const tone = isStuck ? 'warning' : isRunning ? 'claude' : isFailed(a.status) ? 'error' : 'success'
      const action = isRunning ? (isStuck ? w.sum.stalled : actionOf(a)) : (w.statuses[a.status] ?? a.status)
      const clock = isRunning ? elapsed(now - a.startedAt) : elapsed((a.endedAt ?? now) - a.startedAt)
      return (
        <Box key={`row:${a.id}`} flexDirection="row" justifyContent="space-between" borderStyle="round" borderDimColor paddingX={1} gap={1}>
          <Box flexDirection="row" gap={1}>
            {Svg ? mascot(a, 24) : <Text color={colorFor(a)} bold>{glyphOfSlot(a.slot)}</Text>}
            <Button key={`open:${a.id}`} {...SECONDARY} label={`${clip(nameOf(a), 16)} ▸`} onPress={() => toggle(a.id)} />
            <Text color={tone}>{`${glyphOf(a, n)} ${cap(clip(action, Math.max(10, width - 54)))}`}</Text>
          </Box>
          <Text>
            {fig({ Text }, tokens(total(a.tokens)), 'ok')}
            {lbl({ Text }, ' · ')}
            {fig({ Text }, clock, isStuck ? 'warn' : 'ok')}
          </Text>
        </Box>
      )
    }

    // The list, a header and its agents a group, each item with the rows it takes, so it can scroll.
    type Item = { key: string; rows: number; isAgent: boolean; node: unknown }
    const items: Item[] = []
    // The group's bar: it runs to the right edge, a blank row above it, and `clear finished` sits at
    // its end. The whole bar folds the group. Two rows with the gap above.
    const header = (id: 'running' | 'finished', label: string, color: 'claude' | 'success', count: number) => {
      const isFolded = foldedGroups.includes(id)
      const onBar = (text: string) => <Text backgroundColor={color} color="inverseText" bold>{text}</Text>
      items.push({
        key: `group:${id}`,
        rows: 2,
        isAgent: false,
        node: (
          <Box key={`grouprow:${id}`} flexDirection="row" justifyContent="space-between" backgroundColor={color} paddingX={1} marginTop={1}>
            <Button key={`group:${id}`} plain onPress={() => toggleGroup(id)}>
              {onBar(`${isFolded ? '▸' : '▾'} ${label}`)}
            </Button>
            {id === 'finished' && !isFolded && count > 0 &&
              (Svg ? (
                <Button key="clear-done" {...SECONDARY} label={w.clearDone} onPress={() => clear($, 'done')} />
              ) : (
                <Button key="clear-done" plain onPress={() => clear($, 'done')}>
                  {onBar(`[ ${w.clearDone} ]`)}
                </Button>
              ))}
          </Box>
        ),
      })
      return !isFolded
    }
    const add1 = (a: Agent) => {
      if (isLine && !opened.includes(a.id)) items.push({ key: a.id, rows: 3, isAgent: true, node: line(a) })
      else {
        const asCard = card(a)
        const extra = isLine
          ? [<Button key={`open:${a.id}`} plain label={w.closeCard(clip(nameOf(a), 24))} onPress={() => toggle(a.id)} />]
          : []
        items.push({
          key: a.id,
          rows: 6 + lastDone(a).length,
          isAgent: true,
          node: extra.length ? <Box key={`opened:${a.id}`} flexDirection="column">{extra}{asCard}</Box> : asCard,
        })
        if (extra.length) items[items.length - 1]!.rows += 1
      }
    }
    if (groups.running.length > 0 && header('running', w.groupRunning(groups.running.length), 'claude', groups.running.length)) groups.running.forEach(add1)
    if (groups.finished.length > 0 && header('finished', w.groupFinished(groups.finished.length), 'success', groups.finished.length)) groups.finished.forEach(add1)

    // The rest of the pane: hint, summary, lead, other loops, last run, scroll row, footer, gaps.
    const room = Math.max(8, (e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 40) - 14)
    const heights = items.map(i => i.rows)
    const view = fitRows(heights, await read($, offset), room)
    lastStart = lastStartFor(heights, room)
    const agentsBefore = items.slice(0, view.start).filter(i => i.isAgent).length
    const agentsShown = items.slice(view.start, view.end).filter(i => i.isAgent).length
    const agentsAll = items.filter(i => i.isAgent).length
    const scrollList = (by: number) => update($, offset, o => fitRows(heights, o + by, room).start)

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text dimColor>{w.hint}</Text>

        {list.length > 0 && (
          <Box flexDirection="row" flexWrap="wrap" gap={3}>
            {cell('agents', sum.agents, w.sum.agents)}
            {cell('tokens', sum.tokens, w.sum.tokens)}
            {cell('time', sum.time, w.sum.time)}
            {cell('five', sum.five, w.sum.five)}
            {cell('week', sum.week, w.sum.week)}
            {sum.stalled > 0 && cell('stalled', `${warn()} ${sum.stalled}`, w.sum.stalled, 'warn')}
          </Box>
        )}

        <Box flexDirection="column">
          <Box flexDirection="row" gap={2}>
            <Text>
              <Text bold>{`◆ ${w.lead}`}</Text>
              <Text dimColor>{`  ${w.leadLine(tokens(total(spentLead)), tokens(spentLead.output))}`}</Text>
            </Text>
            {list.length > 1 && (
              <Button key="sort" {...SECONDARY} label={`⇅ ${order === 'start' ? w.sortStart : w.sortTokens}`} onPress={() => update($, sortBy, x => (x === 'start' ? 'tokens' : 'start'))} />
            )}
          </Box>
          {list.length === 0 && <Text dimColor>{`  ${w.empty} ${w.emptyNext}`}</Text>}
          {items.slice(view.start, view.end).map(i => i.node as never)}
          {agentsAll > agentsShown && (
            <Box flexDirection="row" gap={2}>
              <Button key="list:up" plain dimColor={view.start === 0} label={w.up} onPress={() => scrollList(-Math.max(1, view.end - view.start - 1))} />
              <Button key="list:down" plain dimColor={view.end === items.length} label={w.down} onPress={() => scrollList(Math.max(1, view.end - view.start - 1))} />
              <Text dimColor>{w.range(agentsBefore + 1, agentsBefore + agentsShown, agentsAll)}</Text>
            </Box>
          )}
          {total(other) > 0 && <Text dimColor>{`  ${w.otherLoops(tokens(total(other)))}`}</Text>}
        </Box>

        {run && (
          <Text>
            <Text bold>{`${w.lastRun}  `}</Text>
            <Text dimColor>{runText(run, lang)}</Text>
          </Text>
        )}

        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {verbRow({ Box, Text, Button }, COMMAND, VERBS, v => pressVerb($, v))}
          {hasDemo && <Button key="clear-demo" {...SECONDARY} label={w.clearDemo} onPress={() => clear($, 'demo')} />}
          <Button key="close" role="dismiss" {...SECONDARY} label={w.close} onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
