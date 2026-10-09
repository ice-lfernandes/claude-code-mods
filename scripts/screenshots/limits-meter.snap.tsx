import { test } from 'claude-code/testing'
const NOW = Date.parse('2026-10-08T12:00:00Z')
const base = (on: any) => {
  on('clock.now', () => ({ value: NOW }) as never)
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }) as never)
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' }
  } as never)
  on('classic.PostModelSwitch', () => ({}) as never)
}
const drain = async (stream: any) => {
  for await (const _ of stream) {
    // drain
  }
}
test('snap', async ($, on) => {
  base(on)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', (_$, e: any) => (console.log('TOAST', e.text), { value: undefined }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  on('turn.complete', () => ({ text: 'done' }) as never)
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ key: 'engine' }) as never)
  const turns = [[1000, 1300, 40_000, 2000, 12_000], [800, 2600, 52_000, 900, 31_000], [1200, 900, 61_000, 300, 8_000], [3000, 4100, 18_000, 22_000, 64_000]]
  for (const [i, o, r, w, d] of turns) await $.turn.complete({ answer: 'x', durationMs: d, isAborted: false, turnId: 't', reason: 'answer', usage: { input_tokens: i, output_tokens: o, cache_read_input_tokens: r, cache_creation_input_tokens: w, model: 'claude-opus-5-5' } } as never)
  await $.session.measure({ context: { tokens: 116_000, window: 200_000, percent: 58 }, rateLimits: [{ kind: 'five_hour', percentUsed: 64, resetsAt: '2026-10-08T13:12:00Z' }, { kind: 'seven_day', percentUsed: 31, resetsAt: '2026-10-11T16:00:00Z' }], changed: ['context'] } as never)
  await $.session.measure({ context: { tokens: 172_000, window: 200_000, percent: 86 }, rateLimits: [{ kind: 'five_hour', percentUsed: 82, resetsAt: '2026-10-08T13:12:00Z' }, { kind: 'seven_day', percentUsed: 31, resetsAt: '2026-10-11T16:00:00Z' }], changed: ['context'] } as never)
  // The person switches to opus at 82%: the costly-switch toast; the band leads with opus · high.
  await $.classic.PostModelSwitch({ from_model: 'claude-sonnet-5-5', to_model: 'claude-opus-5-5', requested_model: 'opus', source: 'command', context_tokens: 172_000, cache_warm: true } as never)
  await drain($.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 3 } as never))
  // Context stays at 86%, so the band and the pane offer compact.
  const band = await $.ui.mount({ plugin: 'limits-meter', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 140, hasSurvey: false }, viewport: { columns: 140, rows: 40 } } as never)
  console.log('BAND', JSON.stringify(await band.drawn()))
  const pane = await $.ui.mount({ plugin: 'limits-meter', surface: 'terminal', component: 'Pane', requestId: 'limits', props: { title: 'Limits & context', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }, viewport: { columns: 82, rows: 40 } } as never)
  console.log('PANE', JSON.stringify(await pane.drawn()))
})

test('snap compact', { options: { format: 'compact' } }, async ($, on) => {
  base(on)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ key: 'engine' }) as never)
  await drain($.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', effort: 'high', messageCount: 3 } as never))
  await $.session.measure({ context: { tokens: 16_000, window: 200_000, percent: 8 }, rateLimits: [{ kind: 'five_hour', percentUsed: 34, resetsAt: '2026-10-08T15:12:00Z' }, { kind: 'seven_day', percentUsed: 31, resetsAt: '2026-10-11T16:00:00Z' }], changed: ['context'] } as never)
  const band = await $.ui.mount({ plugin: 'limits-meter', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 80, hasSurvey: false }, viewport: { columns: 80, rows: 40 } } as never)
  console.log('BAND', JSON.stringify(await band.drawn()))
})
