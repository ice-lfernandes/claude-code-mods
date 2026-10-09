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
//   /watch   opens the pane: the agent tree with type, model, tokens, tool calls and what each
//            is doing, a bar of each agent's share of the tokens, and a sort by start or by
//            tokens. A name opens its row with its last tool calls; a stalled agent has an
//            `investigate` button that asks about it in the prompt. The list scrolls.
//            Finished agents fold into one line that opens them. /watch clear drops
//            finished and demo agents (clear done, clear demo: one kind); /watch demo seeds
//            three fake ones.
//
// Reads nothing from disk, runs no process, calls no model.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, Run, Tokens } from '../types'
import {
  add,
  addStep,
  adopt,
  clearOut,
  finish,
  fiveHourOf,
  fromUsage,
  glyphOf,
  isActive,
  isFailed,
  nameOf,
  quietFor,
  reconcile,
  runText,
  shares,
  stalls,
  stallText,
  summarize,
  toolEnd,
  toolStart,
  total,
  touch,
  tree,
  windowUsed,
  ZERO,
} from './watch'
import type { SortBy } from './watch'
import { PHRASES, phraseOf } from './phrases'
import type { IconStyle, Lang, Verb } from './ui'
import { clip, elapsed, fillArgs, glyph, langOf, linesOf, shortModel, styleOf, tokens, verbRow, windowOf } from './ui'
import { COMMAND, WORDS } from './words'

const PANE = 'agent-watch'
const POLL_MS = 5000
const DEMO = 'demo-'

const agents = atom({ plugin: 'agent-watch', key: 'agents' } as const, [] as Agent[])
const orphans = atom({ plugin: 'agent-watch', key: 'orphans' } as const, {} as Record<string, Tokens>)
const lead = atom({ plugin: 'agent-watch', key: 'lead' } as const, ZERO)
const live = atom({ plugin: 'agent-watch', key: 'live' } as const, 0)
const standDownAt = atom({ plugin: 'agent-watch', key: 'standDownAt' } as const, 0)
const lastRun = atom({ plugin: 'agent-watch', key: 'lastRun' } as const, null as Run | null)
const tick = atom({ plugin: 'agent-watch', key: 'tick' } as const, 0)
const showDone = atom({ plugin: 'agent-watch', key: 'showDone' } as const, false)
const dropped = atom({ plugin: 'agent-watch', key: 'dropped' } as const, [] as string[])
const expanded = atom({ plugin: 'agent-watch', key: 'expanded' } as const, [] as string[])
const sortBy = atom({ plugin: 'agent-watch', key: 'sortBy' } as const, 'start' as SortBy)
const offset = atom({ plugin: 'agent-watch', key: 'offset' } as const, 0)
const waveStart = atom({ plugin: 'agent-watch', key: 'waveStart' } as const, null as number | null)

/** Colors of the share bar's parts, heaviest first; the rest of the agents are dim. */
const SHARE_COLORS = ['claude', 'success', 'warning', 'error'] as const
// The last first row the list can start at, from the last render: the wheel stops there.
let lastStart = 0


let shownStatus: string | undefined
let stallMs = 5 * 60_000
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
  for (const a of raised) $.ui.toast(w.stalledToast(nameOf(a), stallText(a, now, lang)), { timeoutMs: 10_000 })

  const list = await read($, agents)
  const active = list.filter(a => isActive(a.status) && !a.id.startsWith(DEMO)).length
  let before = 0
  await update($, live, n => {
    before = n
    return active
  })
  if (list.some(a => isActive(a.status))) await update($, tick, n => n + 1)
  if (before === 0 && active > 0) {
    const start = fiveHourOf(await $.session.usage().catch(() => null))
    await update($, waveStart, () => start)
  }
  if (before > 0 && active === 0) {
    const since = await read($, standDownAt)
    const wave = summarize(list.filter(a => a.startedAt > since && !a.id.startsWith(DEMO)), now)
    await update($, standDownAt, () => now)
    const used = windowUsed(await read($, waveStart), fiveHourOf(await $.session.usage().catch(() => null)))
    const run = wave && { ...wave, windowUsed: used }
    if (run) {
      await update($, lastRun, () => run)
      $.ui.toast(w.doneToast(runText(run, lang)), { timeoutMs: 10_000 })
    }
  }

  const running = list.filter(a => isActive(a.status))
  const stalled = running.filter(a => a.isStalled).length
  const text = running.length ? w.statusLine(running.length, tokens(running.reduce((n, a) => n + total(a.tokens), 0)), stalled, warn()) : undefined
  if (text !== shownStatus) {
    shownStatus = text
    $.ui.status(text)
  }
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
    { id: `${DEMO}1`, label: first, type: 'Explore', model: 'claude-haiku-4-5', status: 'running', startedAt: now - 140_000, lastAt: now - 4000, activity: 'tool', doing: PHRASES[lang].reading('routes.ts'), tools: 14, errors: 0, steps: 15, tokens: t(9_000, 6_200, 118_000), isStalled: false },
    { id: `${DEMO}2`, label: second, type: 'general-purpose', model: 'claude-opus-5-5', status: 'running', startedAt: now - 600_000, lastAt: now - stallMs - 60_000, activity: 'tool', doing: PHRASES[lang].running('npm test'), tools: 9, errors: 2, steps: 10, tokens: t(14_000, 8_100, 210_000), isStalled: false },
    { id: `${DEMO}3`, label: third, type: 'Explore', parentId: `${DEMO}1`, model: 'claude-haiku-4-5', status: 'completed', startedAt: now - 90_000, endedAt: now - 30_000, lastAt: now - 30_000, activity: 'idle', tools: 6, errors: 0, steps: 7, tokens: t(3_000, 1_900, 41_000), isStalled: false },
  ]
  await update($, agents, list => [...list.filter(a => !a.id.startsWith(DEMO)), ...demo])
  await open($)
  await refresh($)
}

/** /watch and its arguments: what the command answers, and what the pane's verbs run. */
const runCommand = async ($: EngineInterface, args: string): Promise<{ text?: string }> => {
  const w = WORDS[lang]
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
  lang = langOf(options.language)
  style = styleOf(options.icons)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = langOf(options.language, await $.env.get('LANG').catch(() => undefined))
    style = styleOf(options.icons, await $.env.get('TERMINAL_EMULATOR').catch(() => undefined))
    await $.command.register({
      name: COMMAND,
      description: WORDS[lang].description,
      argumentHint: '[clear [done|demo]|demo|help]',
      immediate: true,
    })
    $.clock.every(POLL_MS, () => quietly($))
    return result
  })

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

  on('command.run', { command: COMMAND }, ($, e) => runCommand($, e.args))

  // The wheel over the pane moves the agent list.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await update($, offset, o => Math.max(0, Math.min(lastStart, o + e.by)))
    return {}
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const w = WORDS[lang]
    const n = await read($, tick)
    const isOpen = await read($, showDone)
    const opened = await read($, expanded)
    const order = await read($, sortBy)
    const now = await $.clock.now()
    const list = await read($, agents)
    const spentLead = await read($, lead)
    const other = Object.values(await read($, orphans)).reduce((t, x) => add(t, x), ZERO)
    const run = await read($, lastRun)
    const width = Math.max(40, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)
    const isWide = width >= 90

    const running = list.filter(a => isActive(a.status))
    const done = list.length - running.length
    const stalled = running.filter(a => a.isStalled).length
    const hasDemo = list.some(a => a.id.startsWith(DEMO))
    const sum = list.reduce((s, a) => s + total(a.tokens), 0)
    const tone = (a: Agent) => (a.isStalled && isActive(a.status) ? 'warning' : isActive(a.status) ? 'claude' : isFailed(a.status) ? 'error' : 'success')
    const rows = tree(isOpen ? list : running, order)
    const parts = shares(list, Math.min(60, width - 4))
    const colorOf = (a: Agent | null) => {
      const i = parts.findIndex(p => p.agent === a)
      return a === null || i < 0 ? undefined : SHARE_COLORS[i % SHARE_COLORS.length]
    }
    // Two lines an agent, and the open ones' tool calls. The rest of the pane: hint, counts,
    // the share bar and its legend, the lead, the folded line, other loops, the last run, the
    // scroll row, the footer and the gaps.
    const extra = rows.filter(r => opened.includes(r.agent.id)).reduce((k, r) => k + 1 + Math.max(1, r.agent.recent?.length ?? 0), 0)
    const fixed = 16 + (parts.length ? 2 : 0)
    const listRows = Math.max(2, Math.floor(((e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 40) - fixed - extra) / 2))
    const view = windowOf(rows.length, await read($, offset), listRows)
    lastStart = Math.max(0, rows.length - listRows)
    const scrollList = (by: number) => update($, offset, o => windowOf(rows.length, o + by, listRows).start)
    const toggle = (id: string) => update($, expanded, ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))
    const investigate = (a: Agent) =>
      fill($, w.askInvestigate(nameOf(a), a.activity === 'thinking' ? w.thinking : (a.doing ?? w.inATool), elapsed(quietFor(a, now))))

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="column">
          <Text dimColor>{w.hint}</Text>
          <Text>
            <Text dimColor>{w.counts(running.length, done, tokens(sum))}</Text>
            {stalled > 0 && <Text color="warning" bold>{`  ${warn()} ${w.stalled(stalled)}`}</Text>}
          </Text>
        </Box>

        {parts.length > 0 && (
          <Box flexDirection="column">
            <Text>
              {parts.map(p => (
                <Text key={`share:${p.agent?.id ?? 'rest'}`} color={colorOf(p.agent)} dimColor={p.agent === null}>
                  {(p.agent === null ? '░' : '█').repeat(p.cells)}
                </Text>
              ))}
            </Text>
            <Box flexDirection="row" flexWrap="wrap" gap={2}>
              {parts.map(p => (
                <Text key={`legend:${p.agent?.id ?? 'rest'}`}>
                  <Text color={colorOf(p.agent)} dimColor={p.agent === null}>{p.agent === null ? '░ ' : '█ '}</Text>
                  <Text dimColor>{`${clip(p.agent ? nameOf(p.agent) : w.others, 20)} ${Math.round((p.tokens / sum) * 100)}%`}</Text>
                </Text>
              ))}
            </Box>
          </Box>
        )}

        <Box flexDirection="column">
          <Box flexDirection="row" gap={2}>
            <Text>
              <Text bold>{`◆ ${w.lead}`}</Text>
              <Text dimColor>{`  ${w.leadLine(tokens(total(spentLead)), tokens(spentLead.output))}`}</Text>
            </Text>
            {rows.length > 1 && (
              <Button key="sort" plain dimColor label={`⇅ ${order === 'start' ? w.sortStart : w.sortTokens}`} onPress={() => update($, sortBy, x => (x === 'start' ? 'tokens' : 'start'))} />
            )}
          </Box>
          {list.length === 0 && <Text dimColor>{`  ${w.empty} ${w.emptyNext}`}</Text>}
          {rows.slice(view.start, view.end).map(({ agent: a, prefix, rail }) => {
            const isStuck = a.isStalled && isActive(a.status)
            const state = isStuck ? stallText(a, now, lang) : isActive(a.status) ? (a.activity === 'thinking' ? w.thinking : (a.doing ?? w.starting)) : (w.statuses[a.status] ?? a.status)
            const clock = isActive(a.status) ? elapsed(now - a.startedAt) : elapsed((a.endedAt ?? now) - a.startedAt)
            const meta = `${a.type === 'general-purpose' ? 'general' : a.type}${a.model ? ` · ${shortModel(a.model)}` : ''}`
            const isExpanded = opened.includes(a.id)
            return (
              <Box key={a.id} flexDirection="column">
                <Box flexDirection="row">
                  <Text dimColor>{prefix}</Text>
                  <Text color={tone(a)} bold>{` ${glyphOf(a, n)} `}</Text>
                  <Button key={`open:${a.id}`} plain label={`${nameOf(a).slice(0, 28)} ${isExpanded ? '▾' : '▸'}`} onPress={() => toggle(a.id)} />
                  <Text dimColor>{`  ${meta}`}</Text>
                  {colorOf(a) && <Text color={colorOf(a)}>{'  ■'}</Text>}
                  {a.id.startsWith(DEMO) && <Text color="warning">{`  ${w.demoBadge}`}</Text>}
                  {isStuck && <Text>{'  '}</Text>}
                  {isStuck && <Button key={`investigate:${a.id}`} plain color="warning" label={w.investigate} onPress={() => investigate(a)} />}
                </Box>
                <Text>
                  <Text dimColor>{`${rail}   `}</Text>
                  <Text bold>{tokens(total(a.tokens)).padStart(5)}</Text>
                  <Text dimColor>{isWide ? `  in ${tokens(a.tokens.input + a.tokens.cacheRead + a.tokens.cacheWrite)} out ${tokens(a.tokens.output)}` : ''}</Text>
                  <Text dimColor>{`  ${w.tools(a.tools, a.errors)}  ${clock}  `}</Text>
                  <Text color={isStuck ? 'warning' : undefined} dimColor={!isStuck}>
                    {state.slice(0, Math.max(10, width - 50))}
                  </Text>
                </Text>
                {isExpanded && (
                  <Box flexDirection="column">
                    <Text dimColor>{`${rail}   ${w.recentTitle}`}</Text>
                    {(a.recent ?? []).length === 0 && <Text dimColor>{`${rail}     ${w.noRecent}`}</Text>}
                    {(a.recent ?? []).map((r, i) => (
                      <Text key={`recent:${a.id}:${i}`}>
                        <Text dimColor>{`${rail}     `}</Text>
                        <Text color={r.ok === false ? 'error' : r.ok === null ? 'claude' : 'success'}>{r.ok === false ? '× ' : r.ok === null ? '… ' : '✓ '}</Text>
                        <Text dimColor={r.ok !== false}>{clip(r.doing, Math.max(10, width - rail.length - 12))}</Text>
                        {r.ok === false && <Text color="error">{`  ${w.failedMark}`}</Text>}
                      </Text>
                    ))}
                  </Box>
                )}
              </Box>
            )
          })}
          {rows.length > listRows && (
            <Box flexDirection="row" gap={2}>
              <Button key="list:up" plain dimColor={view.start === 0} label={w.up} onPress={() => scrollList(-listRows + 1)} />
              <Button key="list:down" plain dimColor={view.end === rows.length} label={w.down} onPress={() => scrollList(listRows - 1)} />
              <Text dimColor>{w.range(view.start + 1, view.end, rows.length)}</Text>
            </Box>
          )}
          {done > 0 && (
            <Box flexDirection="row" gap={2}>
              <Text color="success">{'  ✓'}</Text>
              <Button key="done" plain label={w.finished(done, isOpen)} onPress={() => update($, showDone, x => !x)} />
              <Button key="clear-done" plain dimColor label={w.clearDone} onPress={() => clear($, 'done')} />
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
          {hasDemo && <Button key="clear-demo" plain dimColor label={w.clearDemo} onPress={() => clear($, 'demo')} />}
          <Button key="close" role="dismiss" label={w.close} onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
