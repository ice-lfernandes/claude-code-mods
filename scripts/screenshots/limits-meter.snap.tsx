import { test } from 'claude-code/testing'
const NOW = Date.parse('2026-10-08T12:00:00Z')
test('snap', async ($, on) => {
  on('clock.now', () => ({ value: NOW }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', (_$, e: any) => (console.log('TOAST', e.text), { value: undefined }) as never)
  on('session.measure', () => ({ changed: [] }) as never)
  on('turn.complete', () => ({ text: 'done' }) as never)
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ key: 'engine' }) as never)
  const turns = [[1000, 1300, 40_000, 2000, 12_000], [800, 2600, 52_000, 900, 31_000], [1200, 900, 61_000, 300, 8_000], [3000, 4100, 18_000, 22_000, 64_000]]
  for (const [i, o, r, w, d] of turns) await $.turn.complete({ answer: 'x', durationMs: d, isAborted: false, turnId: 't', reason: 'answer', usage: { input_tokens: i, output_tokens: o, cache_read_input_tokens: r, cache_creation_input_tokens: w, model: 'claude-opus-5-5' } } as never)
  await $.session.measure({ context: { tokens: 116_000, window: 200_000, percent: 58 }, rateLimits: [{ kind: 'five_hour', percentUsed: 64, resetsAt: '2026-10-08T13:12:00Z' }, { kind: 'seven_day', percentUsed: 31, resetsAt: '2026-10-11T16:00:00Z' }], changed: ['context'] } as never)
  await $.session.measure({ context: { tokens: 172_000, window: 200_000, percent: 86 }, rateLimits: [{ kind: 'five_hour', percentUsed: 82, resetsAt: '2026-10-08T13:12:00Z' }, { kind: 'seven_day', percentUsed: 31, resetsAt: '2026-10-11T16:00:00Z' }], changed: ['context'] } as never)
  await $.session.measure({ context: { tokens: 116_000, window: 200_000, percent: 58 }, rateLimits: [{ kind: 'five_hour', percentUsed: 64, resetsAt: '2026-10-08T13:12:00Z' }, { kind: 'seven_day', percentUsed: 31, resetsAt: '2026-10-11T16:00:00Z' }], changed: ['context'] } as never)
  const band = await $.ui.mount({ plugin: 'limits-meter', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 140, hasSurvey: false }, viewport: { columns: 140, rows: 40 } } as never)
  console.log('BAND', JSON.stringify(await band.drawn()))
  const pane = await $.ui.mount({ plugin: 'limits-meter', surface: 'terminal', component: 'Pane', requestId: 'limits', props: { title: 'Limits & context', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }, viewport: { columns: 82, rows: 40 } } as never)
  console.log('PANE', JSON.stringify(await pane.drawn()))
})
