import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const LIMITS = [
  { kind: 'five_hour', percentUsed: 64, resetsAt: '2026-10-08T13:12:00Z' },
  { kind: 'seven_day', percentUsed: 31, resetsAt: '2026-10-11T16:00:00Z' },
]
const MEASURE = { context: { tokens: 116_000, window: 200_000, percent: 58 }, rateLimits: LIMITS, changed: ['context', 'rateLimits'] }
const FULL = { context: { tokens: 172_000, window: 200_000, percent: 86 }, rateLimits: LIMITS, changed: ['context'] }
const turn = (n: number) => ({
  answer: 'done',
  durationMs: 12_000,
  isAborted: false,
  turnId: `t${n}`,
  reason: 'answer',
  usage: { input_tokens: 1000, output_tokens: 1300, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 2000, model: 'claude-opus-5-5' },
})

type World = { toasts: string[]; fills: string[]; logs: string[]; opened: string[]; closed: string[]; clock: ReturnType<typeof mock.clock> }

function engine(on: any, env: Record<string, string> = {}, beneath?: string): World {
  const world: World = { toasts: [], fills: [], logs: [], opened: [], closed: [], clock: mock.clock(on, { now: NOW }) }
  mock.store(on)
  on('env.get', ($: any, e: any) => ({ value: env[e.name] }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }) as never)
  on('ui.open', ($: any, e: any) => (world.opened.push(e.id), { value: { isPlaced: true } }) as never)
  on('ui.close', ($: any, e: any) => (world.closed.push(e.id), { value: undefined }) as never)
  on('ui.toast', ($: any, e: any) => (world.toasts.push(e.text), { value: undefined }) as never)
  on('ui.log', ($: any, e: any) => (world.logs.push(e.text), { value: undefined }) as never)
  on('prompt.fill', ($: any, e: any) => (world.fills.push(e.text), { isFilled: true, text: e.text, cursor: e.text.length }) as never)
  on('session.measure', () => ({ changed: ['context', 'rateLimits'] }) as never)
  on('turn.complete', () => ({ text: 'done' }) as never)
  // What is beneath on the same line: empty, or another mod's row.
  on('ui.render', ($: any, e: any) => {
    const { Box, Text } = $.ui.resolve(e)
    return (beneath ? Box({ key: 'beneath', children: Text({ children: beneath }) }) : Box({ key: 'engine' })) as never
  })
  return world
}

const start = ($: any, surface = 'terminal') => $.session.start({ cwd: '/repo', surface, isInteractive: true } as never)
const run = ($: any, args: string) => $.command.run({ command: 'limits', args, origin: { kind: 'composer' } } as never) as Promise<{ text?: string }>
const band = ($: any, surface = 'terminal') =>
  $.ui.mount({ plugin: 'limits-meter', surface, component: 'AbovePrompt', props: { bodyColumns: 140, hasSurvey: false }, viewport: { columns: 140, rows: 40 } } as never)
const pane = ($: any, surface = 'terminal', bodyRows = 40) =>
  $.ui.mount({ plugin: 'limits-meter', surface, component: 'Pane', requestId: 'limits', props: { title: 'Limits & context', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} }, viewport: { columns: 82, rows: 40 } } as never)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`band and pane show limits, context and turns on ${surface}`, async ($, on) => {
    const world = engine(on)
    await start($, surface)
    await $.session.measure(MEASURE as never)
    await $.turn.complete(turn(1) as never)

    const b = await band($, surface)
    const drawn = JSON.stringify(await b.drawn())
    expect(drawn).toContain('64%')
    expect(drawn).toContain('↻1h12')
    expect(drawn).toContain('58%')
    expect(drawn).toContain('cache')
    expect(drawn).toContain('details')
    expect(drawn).not.toContain('compact')
    await b.press({ key: 'details' })
    expect(world.opened).toEqual(['limits'])
    await b.unmount()

    expect(await run($, '')).toEqual({})
    const p = await pane($, surface)
    const shown = JSON.stringify(await p.drawn())
    expect(shown).toContain('Figures the engine reports after each turn')
    expect(shown).toContain('resets in 1h12')
    expect(shown).toContain('116k of 200k')
    expect(shown).toContain('\"    1.3k\"')
    expect(shown).toContain('model')
    expect(shown).toContain('opus 5.5')
    expect(shown).toContain('Close')
    await p.unmount()
  })
}

test('from 85% context the band and the pane offer compact, which only fills the prompt', async ($, on) => {
  const world = engine(on)
  await start($)
  await $.session.measure(FULL as never)
  expect(world.toasts).toEqual(['Context 86% full: a good moment for /compact with a focus'])

  const b = await band($)
  expect(JSON.stringify(await b.drawn())).toContain('compact')
  await b.press({ key: 'compact' })
  expect(world.fills).toEqual(['/compact [focus]'])
  await b.unmount()

  const p = await pane($)
  await p.press({ key: 'compact' })
  expect(world.fills).toEqual(['/compact [focus]', '/compact [focus]'])
  expect(world.logs).toEqual([])
  await p.unmount()
})

test('hide is kept for the next session, and show brings the band back', async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(MEASURE as never)

  const b = await band($)
  await b.press({ key: 'hide' })
  expect(JSON.stringify(await b.drawn())).not.toContain('64%')
  await b.unmount()

  await start($) // a new session reads the store
  const again = await band($)
  expect(JSON.stringify(await again.drawn())).not.toContain('64%')
  expect((await run($, 'show')).text).toBe('Band shown.')
  expect(JSON.stringify(await again.drawn())).toContain('64%')
  await again.unmount()

  await start($)
  const shown = await band($)
  expect(JSON.stringify(await shown.drawn())).toContain('64%')
  await shown.unmount()
})

test('the pane footer: hide and show run, help writes to the transcript, Close closes', async ($, on) => {
  const world = engine(on)
  await start($)
  await $.session.measure(MEASURE as never)
  const p = await pane($)
  await p.press({ key: 'verb:help' })
  expect(world.logs[0]).toContain('/limits          open the pane')
  expect(world.logs).toHaveLength(3)
  await p.press({ key: 'verb:hide' })
  expect(world.logs.at(-1)).toBe('Band hidden. /limits show brings it back.')
  const b = await band($)
  expect(JSON.stringify(await b.drawn())).not.toContain('64%')
  await p.press({ key: 'verb:show' })
  expect(JSON.stringify(await b.drawn())).toContain('64%')
  await b.unmount()
  await p.press({ key: 'close' })
  expect(world.closed).toEqual(['limits'])
  await p.unmount()
  expect((await run($, 'nope')).text).toContain('/limits hide')
})

test('the pane fits the turns to its rows', async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(MEASURE as never)
  for (let i = 1; i <= 20; i++) await $.turn.complete(turn(i) as never)
  // 20 rows: 15 for the rest of the pane with two plan windows and the trend line, 5 turns.
  const p = await pane($, 'terminal', 20)
  const shown = JSON.stringify(await p.drawn())
  expect(shown).toContain('#20')
  expect(shown).toContain('#16')
  expect(shown).not.toContain('#15')
  await p.unmount()
})

test('Portuguese from LANG: band, pane, toasts and answers', async ($, on) => {
  const world = engine(on, { LANG: 'pt_BR.UTF-8' })
  await start($)
  await $.session.measure({ ...FULL, rateLimits: [{ kind: 'five_hour', percentUsed: 92, resetsAt: '2026-10-08T13:12:00Z' }, LIMITS[1]] } as never)
  expect(world.toasts).toEqual(['Janela 5h em 92%, reinicia em 1h12', 'Contexto 86% cheio: bom momento para /compact com um foco'])

  const b = await band($)
  const drawn = JSON.stringify(await b.drawn())
  expect(drawn).toContain('sem ')
  expect(drawn).toContain('detalhes')
  expect(drawn).toContain('ocultar')
  await b.press({ key: 'compact' })
  expect(world.fills).toEqual(['/compact [foco]'])
  await b.unmount()

  const p = await pane($)
  const shown = JSON.stringify(await p.drawn())
  expect(shown).toContain('Janelas do plano')
  expect(shown).toContain('reinicia em 1h12')
  expect(shown).toContain('172k de 200k')
  expect(shown).toContain('Fechar')
  await p.unmount()
  expect((await run($, 'hide')).text).toBe('Banda oculta. /limits show traz de volta.')
})

const at = (percent: number, minutes: number) => ({
  context: { tokens: 116_000, window: 200_000, percent: 58 },
  rateLimits: [{ kind: 'five_hour', percentUsed: percent, resetsAt: '2026-10-08T15:00:00Z' }],
  changed: ['rateLimits'],
  minutes,
})

test('the pane says when a window reaches 100% at the current pace, before it resets', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  // 40% to 70% in 30 minutes: 100% about 30 minutes later, well before the 15:00 reset.
  for (const [percent, minutes] of [[40, 0], [50, 10], [60, 20], [70, 30]] as const) {
    await clock.advance(minutes === 0 ? 0 : 10 * 60_000)
    await $.session.measure(at(percent, minutes) as never)
  }
  const p = await pane($)
  expect(JSON.stringify(await p.drawn())).toContain('at this pace, 5h reaches 100% in ~30m, before it resets')
  await p.unmount()
})

test('no pace line when the window resets first', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  for (const percent of [10, 11, 12, 13]) {
    await $.session.measure(at(percent, 0) as never)
    await clock.advance(10 * 60_000)
  }
  const p = await pane($)
  expect(JSON.stringify(await p.drawn())).not.toContain('at this pace')
  await p.unmount()
})

test('the context trend and the heaviest turn', async ($, on) => {
  engine(on)
  await start($)
  for (const percent of [20, 35, 58]) {
    await $.session.measure({ ...MEASURE, context: { tokens: 1000, window: 200_000, percent } } as never)
    await $.turn.complete({ ...turn(percent), usage: { ...turn(0).usage, input_tokens: percent * 1000 } } as never)
  }
  const p = await pane($)
  const shown = JSON.stringify(await p.drawn())
  expect(shown).toContain('▂▃▅')
  expect(shown).toContain('context at the end of the last 3 turns')
  expect(shown).toContain('{\"color\":\"claude\",\"bold\":true},\"children\":[\"    100k\"]')
  await p.unmount()
})

test('cells and density shape the band', { options: { cells: 'ctx, cache', density: 'numbers' } }, async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(MEASURE as never)
  await $.turn.complete(turn(1) as never)
  const b = await band($)
  const drawn = JSON.stringify(await b.drawn())
  expect(drawn).not.toContain('64%')
  expect(drawn).toContain('58%')
  expect(drawn).toContain('cache')
  expect(drawn).not.toContain('█')
  await b.unmount()
})

test('below 90 columns each bar is one cell, and warnAt sets the warning color', { options: { warnAt: 50 } }, async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(MEASURE as never)
  const b = await $.ui.mount({ plugin: 'limits-meter', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 80, hasSurvey: false }, viewport: { columns: 80, rows: 40 } } as never)
  const drawn = JSON.stringify(await b.drawn())
  expect(drawn).toContain('\"▅\"')
  expect(drawn).not.toContain('█')
  expect(drawn).toContain('{\"color\":\"warning\",\"bold\":true},\"children\":[\"58%\"]')
  await b.unmount()
})

test('the band stacks over the rows of the mods beneath it, never in their place', async ($, on) => {
  engine(on, {}, 'other mod row')
  await start($)
  await $.session.measure(MEASURE as never)
  const b = await band($)
  const drawn = JSON.stringify(await b.drawn())
  expect(drawn).toContain('64%')
  expect(drawn).toContain('other mod row')
  expect(drawn.indexOf('64%')).toBeLessThan(drawn.indexOf('other mod row'))
  await run($, 'hide')
  const hidden = JSON.stringify(await b.drawn())
  expect(hidden).not.toContain('64%')
  expect(hidden).toContain('other mod row')
  await b.unmount()
})
