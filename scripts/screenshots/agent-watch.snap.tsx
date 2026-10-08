import { mock, test } from 'claude-code/testing'
const NOW = Date.parse('2026-10-08T12:00:00Z')
test('snap', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', (_$, e: any) => (console.log('TOAST', e.text), { value: undefined }) as never)
  on('ui.status', (_$, e: any) => (console.log('STATUS', e.text), { value: undefined }) as never)
  let listed: any[] = []
  on('agent.list', () => ({ value: listed }) as never)
  on('agent.spawn', (_$, e: any) => ({ model: 'claude-sonnet-5-5', agentId: e.description }) as never)
  on('turn.step', async function* (_$: any, e: any) {
    const big = e.agentId === 'Review the diff'
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 4000, output_tokens: big ? 9000 : 3000, cache_read_input_tokens: big ? 160_000 : 60_000, cache_creation_input_tokens: 2000, model: 'claude-sonnet-5-5' } }
  } as never)
  on('turn.complete', () => ({ text: 'done' }) as never)
  const S = { tool_use_id: 'x', prompt: 'go', subagentType: 'general-purpose', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false }
  for (const d of ['Review the diff', 'Write the tests', 'Update the docs']) {
    await $.agent.spawn({ ...S, description: d } as never)
    const st = $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1, agentId: d } as never)
    for await (const _ of st) {}
    await clock.advance(70_000)
  }
  for (let i = 0; i < 6; i++) { const st = $.turn.step({ turnId: 'l', index: i, model: 'm', messageCount: 1 } as never); for await (const _ of st) {} }
  for (const d of ['Review the diff', 'Write the tests', 'Update the docs']) await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', agentId: d } as never)
  listed = []
  await clock.advance(5000)
  await $.command.run({ command: 'watch', args: 'clear', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as never)
  await $.command.run({ command: 'watch', args: 'demo', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as never)
  const pane = await $.ui.mount({ plugin: 'agent-watch', surface: 'terminal', component: 'Pane', requestId: 'agent-watch', props: { title: 'Agents', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }, viewport: { columns: 102, rows: 40 } } as never)
  console.log('TREE', JSON.stringify(await pane.drawn()))
})
