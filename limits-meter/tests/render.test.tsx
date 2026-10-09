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
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' }
  } as never)
  on('classic.PostModelSwitch', () => ({}) as never)
  on('classic.Stop', () => ({}) as never)
  on('classic.PostToolUse', () => ({}) as never)
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
  expect(world.logs).toHaveLength(4)
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
  // 25 rows: 20 for the rest of the pane with two plan windows, the trend line and the
  // costly-switch section, 5 turns.
  const p = await pane($, 'terminal', 25)
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

// 0.4.0: model and effort on the band, format compact, the costly-switch toast and its threshold.
// Test names follow the prototype's tabs (notes/prototypes/limits-meter-0.4.0.html).

const SONNET = 'claude-sonnet-5-5'
const OPUS = 'claude-opus-5-5'
const step = async ($: any, model: string, effort?: string | number, agentId?: string) => {
  const stream = $.turn.step({ turnId: 't1', index: 0, model, messageCount: 3, ...(effort !== undefined ? { effort } : {}), ...(agentId ? { agentId } : {}) })
  for await (const _ of stream) {
    // drain
  }
}
const switchTo = ($: any, from: string, to: string, source = 'command') =>
  $.classic.PostModelSwitch({ from_model: from, to_model: to, requested_model: null, source, context_tokens: 1000, cache_warm: true } as never)
/** The 5-hour window at `percent`, resetting at 15:00. */
const fiveAt = (percent: number, resetsAt = '2026-10-08T15:00:00Z') => ({
  context: { tokens: 82_000, window: 200_000, percent: 41 },
  rateLimits: [{ kind: 'five_hour', percentUsed: percent, resetsAt }, LIMITS[1]],
  changed: ['rateLimits'],
})
/** Three turns, 6 minutes apart, the 5-hour window rising from `from` by 6 points each. */
const climb = async ($: any, clock: any, from: number, resetsAt?: string) => {
  for (const [i, percent] of [from, from + 6, from + 12].entries()) {
    if (i > 0) await clock.advance(6 * 60_000)
    await $.session.measure(fiveAt(percent, resetsAt) as never)
    await $.turn.complete(turn(i) as never)
  }
}
const modelIs = (on: any, id: string) => on('session.model', () => ({ value: id }) as never)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`normal: the full band leads with model and effort on ${surface}`, async ($, on) => {
    engine(on)
    modelIs(on, SONNET)
    await start($, surface)
    await $.session.measure(MEASURE as never)
    let drawn = JSON.stringify(await (await band($, surface)).drawn())
    expect(drawn).toContain('sonnet 5.5')
    expect(drawn.indexOf('sonnet 5.5')).toBeLessThan(drawn.indexOf('64%'))
    expect(drawn).toContain('█')
    await step($, SONNET, 'high')
    drawn = JSON.stringify(await (await band($, surface)).drawn())
    expect(drawn).toContain('\"high\"')
  })
}

test('effort max on the band is in the warning color; a subagent step changes nothing', async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(MEASURE as never)
  await step($, OPUS, 'max')
  await step($, 'claude-haiku-4-5', 'low', 'agent-1')
  const drawn = JSON.stringify(await (await band($)).drawn())
  expect(drawn).toContain('opus 5.5')
  expect(drawn).toContain('{\"color\":\"warning\",\"dimColor\":false},\"children\":[\"▰▰▰▰▰ \"]')
  expect(drawn).toContain('{\"color\":\"warning\",\"bold\":true},\"children\":[\"max\"]')
  expect(drawn).toContain('{\"color\":\"claude\",\"bold\":true},\"children\":[\"opus 5.5\"]')
  expect(drawn).not.toContain('haiku')
})

test('cells without model hide model and effort', { options: { cells: '5h, ctx' } }, async ($, on) => {
  engine(on)
  modelIs(on, SONNET)
  await start($)
  await $.session.measure(MEASURE as never)
  const drawn = JSON.stringify(await (await band($)).drawn())
  expect(drawn).not.toContain('sonnet')
  expect(drawn).toContain('64%')
})

for (const columns of [80, 140]) {
  test(`compact: one line of numbers at ${columns} columns`, { options: { format: 'compact' } }, async ($, on) => {
    engine(on)
    modelIs(on, SONNET)
    await start($)
    await $.session.measure(MEASURE as never)
    await step($, SONNET, 'high')
    await $.turn.complete(turn(1) as never)
    const b = await $.ui.mount({ plugin: 'limits-meter', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: columns, hasSurvey: false }, viewport: { columns, rows: 40 } } as never)
    const drawn = JSON.stringify(await b.drawn())
    const order = ['sonnet 5.5', 'high', 'ctx ', '58%', '5h ', '64%', 'wk ', '31%'].map(x => drawn.indexOf(x))
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(drawn).toContain(' · ')
    expect(drawn).not.toContain('█')
    expect(drawn).not.toContain('↻')
    expect(drawn).not.toContain('cache')
    expect(drawn).toContain('details')
    await b.press({ key: 'hide' })
    expect(JSON.stringify(await b.drawn())).not.toContain('64%')
    await b.unmount()
  })
}

test('compact stacks over the rows beneath it and offers compact from 85% context', { options: { format: 'compact' } }, async ($, on) => {
  const world = engine(on, {}, 'other mod row')
  await start($)
  await $.session.measure(FULL as never)
  const b = await band($)
  const drawn = JSON.stringify(await b.drawn())
  expect(drawn.indexOf('86%')).toBeLessThan(drawn.indexOf('other mod row'))
  await b.press({ key: 'compact' })
  expect(world.fills).toEqual(['/compact [focus]'])
  await b.unmount()
})

test('costly switch with pace: one toast with the minutes left', async ($, on) => {
  const world = engine(on)
  await start($)
  await climb($, world.clock, 70) // 70, 76, 82 over 12 minutes: 18 minutes to 100%
  world.toasts.length = 0
  await switchTo($, SONNET, OPUS)
  expect(world.toasts).toEqual(['5h at 82%: at this pace the window runs out in ~18 min · /limits'])
  expect(JSON.stringify(await (await band($)).drawn())).toContain('opus 5.5')
})

test('costly switch with no pace: no number', async ($, on) => {
  const world = engine(on, { LANG: 'pt_BR.UTF-8' })
  await start($)
  await $.session.measure(fiveAt(82) as never)
  world.toasts.length = 0
  await switchTo($, SONNET, 'claude-fable-5-1')
  expect(world.toasts).toEqual(['5h em 82%: fable gasta a janela mais rápido · /limits'])
})

test('effort max: the toast comes with the first request at max, once', async ($, on) => {
  const world = engine(on)
  await start($)
  await step($, SONNET, 'high')
  await climb($, world.clock, 70)
  world.toasts.length = 0
  await step($, SONNET, 'max')
  expect(world.toasts).toEqual(['5h at 82%: at this pace the window runs out in ~18 min · /limits'])
  await step($, SONNET, 'max')
  expect(world.toasts).toHaveLength(1)
})

test('switch below the threshold, to a cheaper model, or on resume: no toast', async ($, on) => {
  const world = engine(on)
  await start($)
  await $.session.measure(fiveAt(45) as never)
  await switchTo($, SONNET, OPUS)
  await $.session.measure(fiveAt(92) as never)
  world.toasts.length = 0
  await switchTo($, OPUS, SONNET)
  await switchTo($, SONNET, OPUS, 'resume')
  expect(world.toasts).toEqual([])
})

test('resets first: the toast says when the window resets', async ($, on) => {
  const world = engine(on, { LANG: 'pt_BR.UTF-8' })
  await start($)
  // 73, 79, 85 over 12 minutes: 15 minutes to 100%, and the window resets 12 minutes after.
  await climb($, world.clock, 73, '2026-10-08T12:24:00Z')
  world.toasts.length = 0
  await switchTo($, SONNET, OPUS)
  expect(world.toasts).toEqual(['5h em 85%: reinicia em 12m, antes de acabar · /limits'])
})

test('no plan (API key): model and context, no windows, no toast', { options: { format: 'compact' } }, async ($, on) => {
  const world = engine(on)
  modelIs(on, SONNET)
  await start($)
  await $.session.measure({ context: { tokens: 16_000, window: 200_000, percent: 8 }, rateLimits: [], changed: ['context'] } as never)
  await switchTo($, SONNET, OPUS)
  expect(world.toasts).toEqual([])
  const drawn = JSON.stringify(await (await band($)).drawn())
  expect(drawn).toContain('opus 5.5')
  expect(drawn).toContain('8%')
  expect(drawn).not.toContain('5h ')
})

test('/limits pane: model, effort and the threshold; a click sets it for later sessions', async ($, on) => {
  const world = engine(on)
  modelIs(on, SONNET)
  await start($)
  await $.session.measure(fiveAt(75) as never)
  await step($, SONNET, 'high')
  const p = await pane($)
  let shown = JSON.stringify(await p.drawn())
  expect(shown).toContain('Model')
  expect(shown).toContain('{\"color\":\"claude\",\"bold\":true},\"children\":[\"sonnet 5.5\"]')
  expect(shown).toContain('▰▰▰▱▱ ')
  expect(shown).toContain('Costly switch warning')
  expect(shown).toContain('{\"color\":\"claude\",\"bold\":true},\"children\":[\"70%\"]')
  expect(shown).toContain('order: haiku < sonnet < opus < fable')
  await p.press({ key: 'warn:80' })
  expect(world.toasts.at(-1)).toBe('Costly switch warning from 80%. Kept for later sessions.')
  shown = JSON.stringify(await p.drawn())
  expect(shown).toContain('{\"color\":\"claude\",\"bold\":true},\"children\":[\"80%\"]')
  await p.unmount()

  // 75% is now under the threshold: no toast.
  world.toasts.length = 0
  await switchTo($, SONNET, OPUS)
  expect(world.toasts).toEqual([])

  await start($) // a new session reads the store
  expect((await run($, 'warn')).text).toBe('Costly switch warning from 80%. /limits warn N changes it (1 to 100).')
})

test('/limits warn N: any whole percent from 1 to 100, shown in the pane in order', async ($, on) => {
  const world = engine(on)
  await start($)
  expect((await run($, 'warn 75')).text).toBe('Costly switch warning from 75%. Kept for later sessions.')
  expect((await run($, 'warn 0')).text).toContain('/limits warn N')
  expect((await run($, 'warn abc')).text).toContain('/limits warn N')
  const shown = JSON.stringify(await (await pane($)).drawn())
  expect(shown.indexOf('70%')).toBeLessThan(shown.indexOf('75%'))
  expect(shown.indexOf('75%')).toBeLessThan(shown.indexOf('80%'))
  await $.session.measure(fiveAt(76) as never)
  world.toasts.length = 0
  await switchTo($, SONNET, OPUS)
  expect(world.toasts).toEqual(['5h at 76%: opus uses the window faster · /limits'])
})

test('hidden: the band goes, the toast still comes', async ($, on) => {
  const world = engine(on)
  await start($)
  await $.session.measure(fiveAt(82) as never)
  await run($, 'hide')
  world.toasts.length = 0
  await switchTo($, SONNET, OPUS)
  expect(world.toasts).toEqual(['5h at 82%: opus uses the window faster · /limits'])
})

// Effort, from wherever the engine gives it: a request may carry none (seen live, 2026-10-09).

test('effort: a request with none keeps the known one; the turn end brings it', async ($, on) => {
  engine(on)
  modelIs(on, OPUS)
  await start($)
  await $.session.measure(MEASURE as never)
  await step($, OPUS) // no effort on the request
  let drawn = JSON.stringify(await (await band($)).drawn())
  expect(drawn).toContain('opus 5.5')
  expect(drawn).not.toContain('high')
  await $.classic.Stop({ stop_hook_active: false, effort: { level: 'high' } } as never)
  drawn = JSON.stringify(await (await band($)).drawn())
  expect(drawn).toContain('\"high\"')
  await step($, OPUS)
  drawn = JSON.stringify(await (await band($)).drawn())
  expect(drawn).toContain('\"high\"')
})

test('effort: a tool call on main brings it; one in a subagent does not', async ($, on) => {
  engine(on)
  await start($)
  await $.session.measure(MEASURE as never)
  await $.classic.PostToolUse({ tool_name: 'Read', tool_input: {}, tool_response: {}, tool_use_id: 'u1', agent_id: 'a1', effort: { level: 'low' } } as never)
  expect(JSON.stringify(await (await band($)).drawn())).not.toContain('low')
  await $.classic.PostToolUse({ tool_name: 'Read', tool_input: {}, tool_response: {}, tool_use_id: 'u2', effort: { level: 'medium' } } as never)
  expect(JSON.stringify(await (await band($)).drawn())).toContain('medium')
})

test('effort: the /config row gives the first reading', async ($, on) => {
  engine(on)
  on('config.list', () => ({ value: [{ key: 'effortLevel', label: 'Effort', kind: 'choice', value: 'xhigh' }] }) as never)
  await start($)
  await $.session.measure(MEASURE as never)
  expect(JSON.stringify(await (await band($)).drawn())).toContain('xhigh')
})

test('effort max from the turn end warns once, as from a request', async ($, on) => {
  const world = engine(on)
  await start($)
  await step($, SONNET, 'high')
  await climb($, world.clock, 70)
  world.toasts.length = 0
  await $.classic.Stop({ stop_hook_active: false, effort: { level: 'max' } } as never)
  await step($, SONNET, 'max')
  expect(world.toasts).toEqual(['5h at 82%: at this pace the window runs out in ~18 min · /limits'])
})
