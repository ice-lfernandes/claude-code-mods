import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const MIN = 60_000
const PROPS = { title: 'Agents', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }
const RUN = { command: 'watch', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } }
const SPAWN = { tool_use_id: 'tu1', prompt: 'go', description: 'Map the API routes', subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false }
const USAGE = { input_tokens: 2000, output_tokens: 1500, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 500, model: 'claude-haiku-4-5' }

const step = async ($: any, agentId?: string) => {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-haiku-4-5', messageCount: 3, ...(agentId ? { agentId } : {}) })
  for await (const _ of stream) {
    // drain
  }
  return stream.result
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`tokens, stall toast and run summary on ${surface}`, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    let status = 'running'
    const toasts: string[] = []
    const statuses: (string | undefined)[] = []
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    on('ui.toast', (_$, e: any) => (toasts.push(e.text), { value: undefined }) as never)
    on('ui.status', (_$, e: any) => (statuses.push(e.text), { value: undefined }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('session.start', () => ({ cwd: '/repo' }) as never)
    on('agent.list', () => ({ value: [{ id: 'a1', description: 'Map the API routes', type: 'Explore', status }] }) as never)
    on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }) as never)
    on('turn.step', async function* () {
      return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: USAGE }
    } as never)
    on('tool.call', () => ({ result: 'ok', text: 'ok' }) as never)
    on('turn.complete', () => ({ text: 'done' }) as never)

    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    await step($) // the lead's request
    await $.agent.spawn(SPAWN as never)
    await step($, 'a1')
    await $.tool.call({ tool: 'Read', file_path: '/repo/src/routes.ts', agentId: 'a1', tool_use_id: 'tu2' } as never)
    await $.command.run(RUN as never)

    const pane = await $.ui.mount({ plugin: 'agent-watch', surface, component: 'Pane', requestId: 'agent-watch', props: PROPS, viewport: { columns: 102, rows: 40 } } as never)
    let drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('Map the API routes')
    expect(drawn).toContain('haiku 4.5')
    expect(drawn).toContain('44k') // 2000 + 1500 + 40000 + 500
    expect(drawn).toContain('1 tool')
    expect(drawn).toContain('lead')
    expect(statuses.at(-1)).toBe('◇ 1 agent · 44k')

    // Six quiet minutes: one stall toast, flagged in the pane and the status line.
    await clock.advance(6 * MIN)
    expect(toasts.filter(t => t.includes('looks stalled')).length).toBe(1)
    expect(toasts.find(t => t.includes('looks stalled'))).toContain('quiet for 5m')
    expect(statuses.at(-1)).toContain('⚠ 1 stalled')
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('stalled')
    await clock.advance(MIN)
    expect(toasts.filter(t => t.includes('looks stalled')).length).toBe(1)

    // The agent ends: summary toast, status line cleared, last run in the pane.
    status = 'completed'
    await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' } as never)
    await clock.advance(5000)
    const done = toasts.find(t => t.startsWith('Agents done'))
    expect(done).toContain('1 agent, 44k tokens')
    expect(done).toContain('Heaviest: Map the API routes 44k (100%)')
    expect(statuses.at(-1)).toBe(undefined)
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('Last run')
    await pane.press({ key: 'clear' })
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).not.toContain('Map the API routes  ')
    expect(drawn).toContain('No subagents yet')
    await pane.unmount()
  })
}

test('demo seeds a stalled agent and clear removes the demo', async ($, on) => {
  mock.clock(on, { now: NOW })
  const toasts: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', (_$, e: any) => (toasts.push(e.text), { value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(toasts.some(t => t.startsWith('Fix the flaky test looks stalled: running npm test for'))).toBe(true)
  const pane = await $.ui.mount({ plugin: 'agent-watch', surface: 'terminal', component: 'Pane', requestId: 'agent-watch', props: PROPS, viewport: { columns: 102, rows: 40 } } as never)
  expect(JSON.stringify(await pane.drawn())).toContain('Check sources')
  await $.command.run({ ...RUN, args: 'clear' } as never)
  expect(JSON.stringify(await pane.drawn())).toContain('No subagents yet')
  await pane.unmount()
})
