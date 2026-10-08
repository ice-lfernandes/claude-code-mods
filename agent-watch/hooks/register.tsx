// agent-watch: subagents at a glance.
//
//   tokens   per agent, from every model request's usage (`turn.step`), so the count moves while
//            the agent runs. Tokens a loop spends before any listing names it wait as orphans and
//            join the agent once it appears; the engine's own forks (compaction, memory) stay
//            orphans and show as "other".
//   stalls   a running agent with no model request and no tool call for `stallMinutes` gets one
//            toast, saying whether it is thinking, inside a tool, or quiet. Activity re-arms it.
//   summary  when the last active agent ends, a toast with the wave's agents, tokens, wall time
//            and the heaviest agent; the pane keeps it as "last run".
//   /watch   opens the pane: the agent tree with type, model, tokens, tool calls and what each
//            is doing. /watch clear drops finished agents; /watch demo seeds three fake ones.
//
// Reads nothing from disk, runs no process, calls no model.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, Run, Tokens } from '../types'
import {
  add,
  addStep,
  adopt,
  finish,
  fromUsage,
  isActive,
  isFailed,
  labelOf,
  nameOf,
  reconcile,
  runText,
  stalls,
  stallText,
  summarize,
  toolEnd,
  toolStart,
  total,
  touch,
  tree,
  ZERO,
} from './watch'
import { elapsed, shortModel, tokens } from './ui'

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

let shownStatus: string | undefined
let stallMs = 5 * 60_000

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
  const now = await $.clock.now()
  const listed = await $.agent.list().catch(() => [])
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
  for (const a of raised) $.ui.toast(`${nameOf(a)} looks stalled: ${stallText(a, now)}. /watch`, { timeoutMs: 10_000 })

  const list = await read($, agents)
  const active = list.filter(a => isActive(a.status) && !a.id.startsWith(DEMO)).length
  let before = 0
  await update($, live, n => {
    before = n
    return active
  })
  if (active > 0) await update($, tick, n => n + 1)
  if (before > 0 && active === 0) {
    const since = await read($, standDownAt)
    const run = summarize(list.filter(a => a.startedAt > since && !a.id.startsWith(DEMO)), now)
    await update($, standDownAt, () => now)
    if (run) {
      await update($, lastRun, () => run)
      $.ui.toast(`Agents done: ${runText(run)}. /watch`, { timeoutMs: 10_000 })
    }
  }

  const running = list.filter(a => isActive(a.status))
  const stalled = running.filter(a => a.isStalled).length
  const text = running.length
    ? `◇ ${running.length} agent${running.length === 1 ? '' : 's'} · ${tokens(running.reduce((n, a) => n + total(a.tokens), 0))}${stalled ? ` · ⚠ ${stalled} stalled` : ''}`
    : undefined
  if (text !== shownStatus) {
    shownStatus = text
    $.ui.status(text)
  }
}

const quietly = ($: EngineInterface) => void refresh($).catch(() => undefined)

export const register: Register = (on, options) => {
  stallMs = Math.max(1, Number(options.stallMinutes) || 5) * 60_000

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'watch',
      description: 'Subagents: /watch opens the pane; /watch clear drops finished agents; /watch demo shows fake ones',
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
    await update($, agents, list => toolStart(list, id, labelOf(e.tool, e as unknown as Record<string, unknown>), now))
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

  on('command.run', { command: 'watch' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'clear') {
      await update($, agents, list => list.filter(a => isActive(a.status) && !a.id.startsWith(DEMO)))
      quietly($)
      return { text: 'Finished and demo agents cleared.' }
    }
    if (arg === 'demo') {
      const now = await $.clock.now()
      const t = (input: number, output: number, cacheRead: number) => ({ input, output, cacheRead, cacheWrite: 0 })
      const demo: Agent[] = [
        { id: `${DEMO}1`, label: 'Map the API routes', type: 'Explore', model: 'claude-haiku-4-5', status: 'running', startedAt: now - 140_000, lastAt: now - 4000, activity: 'tool', doing: 'reading routes.ts', tools: 14, errors: 0, steps: 15, tokens: t(9_000, 6_200, 118_000), isStalled: false },
        { id: `${DEMO}2`, label: 'Fix the flaky test', type: 'general-purpose', model: 'claude-opus-5-5', status: 'running', startedAt: now - 600_000, lastAt: now - stallMs - 60_000, activity: 'tool', doing: 'running npm test', tools: 9, errors: 2, steps: 10, tokens: t(14_000, 8_100, 210_000), isStalled: false },
        { id: `${DEMO}3`, label: 'Check sources', type: 'Explore', parentId: `${DEMO}1`, model: 'claude-haiku-4-5', status: 'completed', startedAt: now - 90_000, endedAt: now - 30_000, lastAt: now - 30_000, activity: 'idle', tools: 6, errors: 0, steps: 7, tokens: t(3_000, 1_900, 41_000), isStalled: false },
      ]
      await update($, agents, list => [...list.filter(a => !a.id.startsWith(DEMO)), ...demo])
      await $.ui.open({ id: PANE, title: 'Agents' }).catch(() => null)
      await refresh($)
      return { text: 'Three demo agents added; one is stalled. /watch clear removes them.' }
    }
    const opened = await $.ui.open({ id: PANE, title: 'Agents' }).catch(() => null)
    await refresh($).catch(() => undefined)
    if (opened?.isPlaced) return {}
    const list = await read($, agents)
    const run = await read($, lastRun)
    const running = list.filter(a => isActive(a.status))
    return {
      text: `${running.length} running, ${list.length - running.length} finished.${running.map(a => ` ${nameOf(a)} ${tokens(total(a.tokens))}.`).join('')}${run ? ` Last run: ${runText(run)}.` : ''}`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, tick)
    const now = await $.clock.now()
    const list = await read($, agents)
    const spentLead = await read($, lead)
    const other = Object.values(await read($, orphans)).reduce((t, x) => add(t, x), ZERO)
    const run = await read($, lastRun)
    const width = Math.max(40, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)
    const isWide = width >= 90

    const running = list.filter(a => isActive(a.status))
    const stalled = running.filter(a => a.isStalled).length
    const sum = list.reduce((n, a) => n + total(a.tokens), 0)
    const glyph = (a: Agent) => (isActive(a.status) ? (a.isStalled ? '!' : '●') : isFailed(a.status) ? '×' : '✓')
    const tone = (a: Agent) => (a.isStalled ? 'yellow' : isActive(a.status) ? 'cyan' : isFailed(a.status) ? 'red' : 'green')

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text>
          <Text dimColor>{`${running.length} running · ${list.length - running.length} finished · ${tokens(sum)} tokens`}</Text>
          {stalled > 0 && <Text color="yellow" bold>{`  ⚠ ${stalled} stalled`}</Text>}
        </Text>

        <Box flexDirection="column">
          <Text>
            <Text bold>◆ lead</Text>
            <Text dimColor>{`  ${tokens(total(spentLead))} tokens · out ${tokens(spentLead.output)}`}</Text>
          </Text>
          {list.length === 0 && <Text dimColor>  No subagents yet this session. /watch demo shows what this looks like.</Text>}
          {tree(list).map(({ agent: a, prefix, rail }) => {
            const state = a.isStalled && isActive(a.status) ? stallText(a, now) : isActive(a.status) ? (a.activity === 'thinking' ? 'thinking' : (a.doing ?? 'starting')) : a.status === 'completed' ? 'done' : a.status
            const clock = isActive(a.status) ? elapsed(now - a.startedAt) : elapsed((a.endedAt ?? now) - a.startedAt)
            const meta = `${a.type === 'general-purpose' ? 'general' : a.type}${a.model ? ` · ${shortModel(a.model)}` : ''}`
            return (
              <Box key={a.id} flexDirection="column">
                <Text>
                  <Text dimColor>{prefix}</Text>
                  <Text color={tone(a)} bold>{` ${glyph(a)} `}</Text>
                  <Text bold>{nameOf(a).slice(0, 28)}</Text>
                  <Text dimColor>{`  ${meta}`}</Text>
                </Text>
                <Text>
                  <Text dimColor>{`${rail}   `}</Text>
                  <Text bold>{tokens(total(a.tokens)).padStart(5)}</Text>
                  <Text dimColor>{isWide ? `  in ${tokens(a.tokens.input + a.tokens.cacheRead + a.tokens.cacheWrite)} out ${tokens(a.tokens.output)}` : ''}</Text>
                  <Text dimColor>{`  ${a.tools} tool${a.tools === 1 ? '' : 's'}${a.errors ? ` (${a.errors} failed)` : ''}  ${clock}  `}</Text>
                  <Text color={a.isStalled && isActive(a.status) ? 'yellow' : undefined} dimColor={!(a.isStalled && isActive(a.status))}>
                    {state.slice(0, Math.max(10, width - 50))}
                  </Text>
                </Text>
              </Box>
            )
          })}
          {total(other) > 0 && <Text dimColor>{`  other loops (compaction, memory)  ${tokens(total(other))}`}</Text>}
        </Box>

        {run && (
          <Text>
            <Text bold>Last run  </Text>
            <Text dimColor>{runText(run)}</Text>
          </Text>
        )}

        <Box gap={2}>
          <Button key="clear" label="clear finished" onPress={() => update($, agents, l => l.filter(a => isActive(a.status) && !a.id.startsWith(DEMO)))} />
        </Box>
      </Box>
    )
  })
}
