import { expect, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const MEASURE = {
  context: { tokens: 116_000, window: 200_000, percent: 58 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 64, resetsAt: '2026-10-08T13:12:00Z' },
    { kind: 'seven_day', percentUsed: 31, resetsAt: '2026-10-11T16:00:00Z' },
  ],
  changed: ['context', 'rateLimits'],
}
const TURN = {
  answer: 'done',
  durationMs: 12_000,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
  usage: { input_tokens: 1000, output_tokens: 1300, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 2000, model: 'claude-opus-5-5' },
}
const RUN = { command: 'limits', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 140 } }

for (const surface of ['terminal', 'desktop'] as const) {
  test(`band and pane show limits, context and turns on ${surface}`, async ($, on) => {
    on('clock.now', () => ({ value: NOW }) as never)
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    on('ui.toast', () => ({ value: undefined }) as never)
    on('session.measure', () => ({ changed: ['context', 'rateLimits'] }) as never)
    on('turn.complete', () => ({ text: 'done' }) as never)
    // The engine's own band beneath: empty.
    on('ui.render', ($, e) => $.ui.resolve(e).Box({ key: 'engine' }) as never)

    await $.session.measure(MEASURE as never)
    await $.turn.complete(TURN as never)

    const band = await $.ui.mount({ plugin: 'limits-meter', surface, component: 'AbovePrompt', props: { bodyColumns: 140, hasSurvey: false }, viewport: { columns: 140, rows: 40 } } as never)
    const drawn = JSON.stringify(await band.drawn())
    expect(drawn).toContain('64%')
    expect(drawn).toContain('↻1h12')
    expect(drawn).toContain('58%')
    expect(drawn).toContain('cache')
    await band.press({ key: 'hide' })
    await band.unmount()

    await $.command.run(RUN as never)
    const pane = await $.ui.mount({ plugin: 'limits-meter', surface, component: 'Pane', requestId: 'limits', props: { title: 'Limits & context', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }, viewport: { columns: 82, rows: 40 } } as never)
    const shown = JSON.stringify(await pane.drawn())
    expect(shown).toContain('resets in 1h12')
    expect(shown).toContain('116k of 200k')
    expect(shown).toContain('out  1.3k')
    expect(shown).toContain('opus-5-5')
    await pane.unmount()
  })
}
