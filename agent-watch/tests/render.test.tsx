import { expect, mock, test } from 'claude-code/testing'

/** The text of a drawn tree, every node's children joined: a phrase split across a figure and its label reads whole. */
const flat = (n: unknown): string =>
  typeof n === 'string' ? n : Array.isArray(n) ? n.map(flat).join('') : n && typeof n === 'object' ? flat((n as { children?: unknown }).children) : ''

const NOW = Date.parse('2026-10-08T12:00:00Z')
const MIN = 60_000

// A5 (prototype buttons-quiet-a5-a7, variant B): the Buttons of a tree, with the props the variant lives in.
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9
const buttonsOf = (tree: unknown) =>
  [...JSON.stringify(tree).matchAll(/"type":"Button","props":(\{[^{}]*\})/g)].map(m => JSON.parse(m[1]!) as { key: string; variant?: string; plain?: boolean })
const variantOf = (tree: unknown, key: string) => buttonsOf(tree).find(b => b.key === key)?.variant
const PROPS = { title: 'Agents', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 48 }, view: {} }
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


/** What a pane or band draws, for a test: the engine's own kinds. */
const world = (on: any, over: { agents?: any[]; theme?: string; beneath?: string; store?: Record<string, unknown> } = {}) => {
  const w = { toasts: [] as string[], statuses: [] as (string | undefined)[], opened: [] as string[], fills: [] as string[], agents: over.agents ?? [], submits: [] as string[] }
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, over.store)
  on('ui.open', (_$: any, e: any) => (w.opened.push(e.id), { value: { isPlaced: true } }) as never)
  on('ui.toast', (_$: any, e: any) => (w.toasts.push(e.text), { value: undefined }) as never)
  on('ui.status', (_$: any, e: any) => (w.statuses.push(e.text), { value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: '/repo' }) as never)
  on('config.list', () => ({ value: [{ key: 'theme', value: over.theme ?? 'dark' }] }) as never)
  on('agent.list', () => ({ value: w.agents }) as never)
  on('prompt.fill', (_$: any, e: any) => (w.fills.push(e.text), { isFilled: true, text: e.text, cursor: e.text.length }) as never)
  on('prompt.submit', (_$: any, e: any) => (w.submits.push(e.text), { text: e.text }) as never)
  // What is beneath the band on the same line: another mod's row, or nothing.
  on('ui.render', (_$: any, e: any) => {
    if (e.component !== 'AbovePrompt') return undefined as never
    const { Box, Text } = _$.ui.resolve(e)
    return (over.beneath ? Box({ key: 'beneath', children: Text({ children: over.beneath }) }) : Box({ key: 'engine' })) as never
  })
  return { ...w, clock }
}
const paneOf = ($: any, surface: string, rows = 48, columns = 100) =>
  $.ui.mount({ plugin: 'agent-watch', surface, component: 'Pane', requestId: 'agent-watch', props: { ...PROPS, bodyColumns: columns, scroll: { offset: 0, bodyRows: rows } }, viewport: { columns: columns + 2, rows } } as never)
const bandOf = ($: any, surface: string, columns = 100) =>
  $.ui.mount({ plugin: 'agent-watch', surface, component: 'AbovePrompt', props: { bodyColumns: columns, hasSurvey: false }, viewport: { columns, rows: 40 } } as never)
const running = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, description: `Task ${i}`, type: 'Explore', status: 'running' }))

for (const surface of ['terminal', 'desktop'] as const) {
  test(`running, stalled and finished cards, and the summary, on ${surface}`, async ($, on) => {
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
    let text = flat(JSON.parse(drawn))
    // The card: name, model, the step, the tool it is in, tokens, its share of the windows (a dash with no history).
    expect(drawn).toContain('Map the API routes')
    expect(drawn).toContain('haiku 4.5')
    expect(drawn).toContain('44k') // 2000 + 1500 + 40000 + 500
    expect(text).toContain('Running · 1')
    expect(text).toContain('Step 1 · Reading routes.ts')
    expect(text).toContain('— of the 5h window · — of the week')
    expect(drawn).toContain('lead')
    // The summary row.
    expect(text).toContain('1agents')
    expect(text).toContain('44ktokens')
    expect(text).toContain('—5h window')
    expect(text).toContain('—week')
    // The mascot: blocks on the terminal, an SVG with its description on a desktop.
    if (surface === 'terminal') {
      expect(drawn).toContain('▟██▙')
      expect(drawn).not.toContain('"type":"Svg"')
    } else {
      expect(drawn).toContain('"type":"Svg"')
      expect(drawn).toContain('Mascot of the agent Map the API routes')
      expect(drawn).not.toContain('▟██▙')
    }
    expect(drawn).toContain('"borderStyle":"round"')
    expect(drawn).toContain('"borderColor":"#d97757"')
    expect(statuses.at(-1)).toBe('◇ 1 agent · 44k')

    // Six quiet minutes: one stall toast, a warning step line and the one primary button.
    await clock.advance(6 * MIN)
    expect(toasts.filter(t => t.includes('looks stalled')).length).toBe(1)
    expect(toasts.find(t => t.includes('looks stalled'))).toContain('quiet for 5m')
    expect(statuses.at(-1)).toContain('⚠ 1 stalled')
    drawn = JSON.stringify(await pane.drawn())
    text = flat(JSON.parse(drawn))
    expect(text).toContain('⚠ Quiet for')
    expect(text).toContain('⚠ 1stalled')
    expect(variantOf(JSON.parse(drawn), 'investigate:a1')).toBe('primary')
    await clock.advance(MIN)
    expect(toasts.filter(t => t.includes('looks stalled')).length).toBe(1)

    // The agent ends: summary toast, status line cleared, the card in Finished, last run in the pane.
    status = 'completed'
    await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' } as never)
    await clock.advance(5000)
    const done = toasts.find(t => t.startsWith('Agents done'))
    expect(done).toContain('1 agent, 44k tokens')
    expect(done).toContain('Heaviest: Map the API routes 44k (100%)')
    expect(statuses.at(-1)).toBe(undefined)
    drawn = JSON.stringify(await pane.drawn())
    text = flat(JSON.parse(drawn))
    expect(text).toContain('Finished · 1')
    expect(text).toContain('✓ Done · 1 step')
    expect(text).not.toContain('Running ·')
    expect(drawn).toContain('Last run')

    // A group header folds its group.
    await pane.press({ key: 'group:finished' })
    drawn = JSON.stringify(await pane.drawn())
    expect(flat(JSON.parse(drawn))).toContain('▸ Finished · 1')
    expect(drawn).not.toContain('card:a1')
    await pane.press({ key: 'group:finished' })
    expect(JSON.stringify(await pane.drawn())).toContain('card:a1')
    await pane.press({ key: 'clear-done' })
    expect(JSON.stringify(await pane.drawn())).toContain('No subagents yet')
    await pane.unmount()
  })
}

test('demo seeds a stalled agent; clear done and clear demo drop one kind each', async ($, on) => {
  const w = world(on)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(w.toasts.some(t => t.startsWith('Fix the flaky test looks stalled: running npm test for'))).toBe(true)
  const pane = await paneOf($, 'terminal')
  let drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('Fix the flaky test')
  expect(drawn).toContain('demo')
  expect(drawn).toContain('card:demo-3')
  // The child names its parent.
  expect(flat(JSON.parse(drawn))).toContain('in Map the API rou…')
  await pane.press({ key: 'group:finished' })
  expect(JSON.stringify(await pane.drawn())).not.toContain('card:demo-3')
  await pane.press({ key: 'group:finished' })

  expect((await $.command.run({ ...RUN, args: 'clear done' } as never)).text).toBe('Finished agents cleared.')
  drawn = JSON.stringify(await pane.drawn())
  expect(drawn).not.toContain('Check sources')
  expect(drawn).toContain('card:demo-2')
  await pane.press({ key: 'clear-demo' })
  expect(JSON.stringify(await pane.drawn())).toContain('No subagents yet')
  await pane.unmount()
})

test('the pane footer: clear waits in the prompt, help writes to the transcript, Close closes', async ($, on) => {
  mock.clock(on, { now: NOW })
  const fills: string[] = []
  const logs: string[] = []
  const closed: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.log', (_$, e: any) => (logs.push(e.text), { value: undefined }) as never)
  on('ui.close', (_$, e: any) => (closed.push(e.id), { value: undefined }) as never)
  on('prompt.fill', (_$, e: any) => (fills.push(e.text), { isFilled: true, text: e.text, cursor: e.text.length }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  const pane = await $.ui.mount({ plugin: 'agent-watch', surface: 'terminal', component: 'Pane', requestId: 'agent-watch', props: PROPS, viewport: { columns: 102, rows: 40 } } as never)
  expect(JSON.stringify(await pane.drawn())).toContain('/watch demo shows what this looks like')
  await pane.press({ key: 'verb:clear' })
  expect(fills).toEqual(['/watch clear'])
  await pane.press({ key: 'verb:help' })
  expect(logs).toHaveLength(8)
  expect(logs[1]).toContain('/watch demo')
  await pane.press({ key: 'close' })
  expect(closed).toEqual(['agent-watch'])
  await pane.unmount()
  expect((await $.command.run({ ...RUN, args: 'nope' } as never)).text).toContain('/watch clear done')
})

test('Portuguese from LANG, and ! for the warning in a JetBrains terminal', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const toasts: string[] = []
  const statuses: (string | undefined)[] = []
  const env: Record<string, string> = { LANG: 'pt_BR.UTF-8', TERMINAL_EMULATOR: 'JetBrains-JediTerm' }
  on('env.get', (_$, e: any) => ({ value: env[e.name] }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', (_$, e: any) => (toasts.push(e.text), { value: undefined }) as never)
  on('ui.status', (_$, e: any) => (statuses.push(e.text), { value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: '/repo' }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(toasts.some(t => t.startsWith('Corrigir o teste instável parece travado: rodando npm test há'))).toBe(true)
  expect(statuses.at(-1)).toBe('◇ 2 agentes · 365k · ! 1 travado')
  const pane = await $.ui.mount({ plugin: 'agent-watch', surface: 'terminal', component: 'Pane', requestId: 'agent-watch', props: PROPS, viewport: { columns: 102, rows: 40 } } as never)
  const drawn = JSON.stringify(await pane.drawn())
  const text = flat(JSON.parse(drawn))
  expect(text).toContain('Rodando · 2')
  expect(text).toContain('Concluído · 1')
  expect(text).toContain('Passo 15 · Lendo routes.ts')
  expect(text).toContain('! Rodando npm test há 6m 00s')
  expect(text).toContain('Concluído · 7 passos')
  expect(text).toContain('— da janela 5h · — da semana')
  expect(text).toContain('janela 5h')
  expect(text).toContain('em Mapear as rotas…')
  expect(drawn).toContain('limpar demo')
  expect(drawn).toContain('Fechar')
  await clock.advance(5000)
  await pane.unmount()
})

test('the one primary is investigate, on a stalled agent; the rest are secondary; investigate fills the prompt', async ($, on) => {
  const w = world(on)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  const pane = await paneOf($, 'terminal')
  let drawn = JSON.stringify(await pane.drawn())
  expect(variantOf(JSON.parse(drawn), 'investigate:demo-2')).toBe('primary')
  expect(buttonsOf(JSON.parse(drawn)).filter(b => b.variant === 'primary')).toHaveLength(1)
  expect(variantOf(JSON.parse(drawn), 'sort')).toBe('secondary')
  expect(variantOf(JSON.parse(drawn), 'close')).toBe('secondary')
  // G7: on the terminal `clear finished` is text on the Finished bar; a desktop draws it as a secondary button.
  expect(variantOf(JSON.parse(drawn), 'clear-done')).toBeUndefined()
  expect(buttonsOf(JSON.parse(drawn)).find(b => b.key === 'clear-done')?.plain).toBe(true)
  for (const b of buttonsOf(JSON.parse(drawn)).filter(b => b.variant)) expect(b.plain).toBeUndefined()
  expect(drawn).not.toContain('investigate:demo-1')

  await pane.press({ key: 'investigate:demo-2' })
  expect(w.fills).toEqual(['The agent "Fix the flaky test" looks stalled: running npm test, for 6m 00s. Check what happened and tell me what to do.'])

  // ⇅ switches the order of each group between start and tokens (the order itself is groupsOf's, tested in watch.test.ts).
  drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('⇅ by start')
  await pane.press({ key: 'sort' })
  drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('⇅ by tokens')
  await pane.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`compact mode (G4): from five agents a line each, a name opens its card, on ${surface}`, async ($, on) => {
    world(on, { agents: running(6) })
    await $.command.run(RUN as never)
    const pane = await paneOf($, surface)
    let drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('open:a0')
    expect(drawn).toContain('row:a5')
    expect(drawn).not.toContain('card:a0')
    // G7: a line is a rounded box, and its name a secondary button.
    expect(drawn).toContain('"borderStyle":"round"')
    expect(variantOf(JSON.parse(drawn), 'open:a0')).toBe('secondary')
    // A desktop draws a small mascot on each line; the terminal a one-cell glyph.
    if (surface === 'desktop') expect(drawn).toContain('"type":"Svg"')
    else expect(drawn).toContain('▲')

    await pane.press({ key: 'open:a0' })
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('card:a0')
    expect(drawn).not.toContain('card:a1')
    expect(drawn).toContain('▾ close Task 0')
    await pane.press({ key: 'open:a0' })
    expect(JSON.stringify(await pane.drawn())).not.toContain('card:a0')
    await pane.unmount()
  })
}

test('compact mode follows the compactAt option', { options: { compactAt: 7 } }, async ($, on) => {
  world(on, { agents: running(6) })
  await $.command.run(RUN as never)
  const pane = await paneOf($, 'terminal')
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('card:a0')
  expect(drawn).not.toContain('row:a0')
  await pane.unmount()
})

test('a long agent list scrolls by rows, and the range counts agents', async ($, on) => {
  world(on, { agents: running(30) })
  await $.command.run(RUN as never)
  const pane = await paneOf($, 'terminal', 50)
  // 50 rows: 14 for the rest of the pane, then the group bar (2 rows) and 3 rows a line.
  expect(JSON.stringify(await pane.drawn())).toContain('1–11 of 30')
  await ($ as any).ui.scroll({ component: 'Pane', requestId: 'agent-watch', by: 5 })
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('5–16 of 30')
  expect(drawn).not.toContain('row:a0')
  expect(drawn).toContain('row:a4')
  await pane.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`group bars (G7): a bar to the right edge with a gap above, clear finished at its end, folding it keeps the bar, on ${surface}`, async ($, on) => {
    world(on)
    await $.command.run({ ...RUN, args: 'demo' } as never)
    const pane = await paneOf($, surface)
    let tree = JSON.parse(JSON.stringify(await pane.drawn()))
    const bar = (id: string, t = tree) => {
      const hit = [...JSON.stringify(t).matchAll(/\{"type":"Box","props":(\{[^{}]*"key":"grouprow:[a-z]+"[^{}]*\})/g)].map(m => JSON.parse(m[1]!)).find(p => p.key === `grouprow:${id}`)
      return hit as { flexDirection: string; justifyContent: string; backgroundColor: string; marginTop: number; paddingX: number } | undefined
    }
    // Each bar: a row across the pane in its group's color, a blank row above, the button at the far end.
    expect(bar('running')).toMatchObject({ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'claude', marginTop: 1, paddingX: 1 })
    expect(bar('finished')).toMatchObject({ justifyContent: 'space-between', backgroundColor: 'success', marginTop: 1 })
    let text = flat(tree)
    expect(text).toContain('▾ Running · 2')
    expect(text).toContain('▾ Finished · 1')
    // Terminal: the clear button is text on the bar, in brackets. Desktop: a native secondary button.
    if (surface === 'terminal') expect(text).toContain('[ clear finished ]')
    else expect(variantOf(tree, 'clear-done')).toBe('secondary')
    expect(JSON.stringify(tree)).toContain('"key":"clear-done"')
    // The whole bar is the toggle: the Finished one folds and keeps its bar, without the clear button.
    await pane.press({ key: 'group:finished' })
    tree = JSON.parse(JSON.stringify(await pane.drawn()))
    text = flat(tree)
    expect(text).toContain('▸ Finished · 1')
    expect(JSON.stringify(tree)).not.toContain('clear-done')
    expect(bar('finished', tree)?.backgroundColor).toBe('success')
    // Running has no button: nothing to do to all running agents.
    expect(text).not.toContain('clear running')
    await pane.unmount()
  })

  test(`group bars (G7): in Portuguese the bar and its button follow the language, on ${surface}`, async ($, on) => {
    const env: Record<string, string> = { LANG: 'pt_BR.UTF-8' }
    world(on)
    on('env.get', (_$: any, e: any) => ({ value: env[e.name] }) as never)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    await $.command.run({ ...RUN, args: 'demo' } as never)
    const pane = await paneOf($, surface)
    const tree = JSON.parse(JSON.stringify(await pane.drawn()))
    const text = flat(tree)
    expect(text).toContain('▾ Rodando · 2')
    expect(text).toContain('▾ Concluído · 1')
    // The button's words: the terminal's are the bar's text, the desktop's are the button's label.
    if (surface === 'terminal') expect(text).toContain('[ limpar concluídos ]')
    else expect(JSON.stringify(tree)).toContain('"label":"limpar concluídos"')
    await pane.unmount()
  })

  test(`boxed lines (G7): a compact line is a rounded box with the name as a button and tokens · time at the right edge, on ${surface}`, async ($, on) => {
    world(on, { agents: running(6) })
    await $.command.run(RUN as never)
    const pane = await paneOf($, surface)
    const tree = JSON.parse(JSON.stringify(await pane.drawn()))
    const box = [...JSON.stringify(tree).matchAll(/\{"type":"Box","props":(\{[^{}]*"key":"row:a0"[^{}]*\})/g)].map(m => JSON.parse(m[1]!))[0]
    expect(box).toMatchObject({ flexDirection: 'row', justifyContent: 'space-between', borderStyle: 'round', borderDimColor: true, paddingX: 1 })
    expect(variantOf(tree, 'open:a0')).toBe('secondary')
    expect(JSON.stringify(tree)).toContain('"label":"Task 0 ▸"')
    await pane.unmount()
  })
}

test('the rows of a bar and a boxed line: 2 and 3, so a pane with 6 agents in lines needs 20 rows and scrolls with fewer', async ($, on) => {
  world(on, { agents: running(6) })
  await $.command.run(RUN as never)
  // 26 rows of room: the bar (2) and 6 boxed lines (18) fit.
  const roomy = await paneOf($, 'terminal', 40)
  expect(JSON.stringify(await roomy.drawn())).not.toContain('of 6')
  await roomy.unmount()
  // 20 rows of room: 6 left after the rest, the bar (2) and one line (3) fit, a second does not.
  const tight = await paneOf($, 'terminal', 20)
  expect(JSON.stringify(await tight.drawn())).toContain('1–2 of 6')
  await tight.unmount()
})

test('the summary says how much of the 5h window the wave used, and the wave teaches the rate', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  const toasts: string[] = []
  let status = 'running'
  let fiveHour = 40
  let week = 10
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', (_$, e: any) => (toasts.push(e.text), { value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('session.usage', () => ({ value: { context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: fiveHour }, { kind: 'seven_day', percentUsed: week }] } }) as never)
  on('agent.list', () => ({ value: [{ id: 'a1', description: 'Map the API routes', type: 'Explore', status }] }) as never)
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }) as never)
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  } as never)
  on('turn.complete', () => ({ text: 'done' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: '/repo' }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.agent.spawn(SPAWN as never)
  await step($, 'a1')
  await clock.advance(5000) // the wave starts at 40%
  fiveHour = 46
  await clock.advance(5000)
  const live = await paneOf($, 'terminal')
  // While it runs: the measured change in the 5h window, the week still a dash (no rate yet).
  const liveText = flat(JSON.parse(JSON.stringify(await live.drawn())))
  expect(liveText).toContain('+6%5h window')
  expect(liveText).toContain('—week')
  week = 11
  status = 'completed'
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' } as never)
  await clock.advance(5000)
  expect(toasts.find(t => t.startsWith('Agents done'))).toContain('. Used ~6% of the 5h window. /watch')
  // The wave's tokens and the points each window moved are kept, and the card uses them as a rate.
  const drawn = JSON.stringify(await live.drawn())
  const text = flat(JSON.parse(drawn))
  expect(text).toContain('~6% of the 5h window · ~1.0% of the week')
  expect(text).toContain('+6%5h window')
  expect(text).toContain('+1.0%week')
  await live.unmount()
})

test('a rate kept from earlier waves is read at the start, and a card says its estimate', async ($, on) => {
  world(on, { store: { rates: [{ tokens: 100_000, five: 1, week: 0.2 }] } })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  const pane = await paneOf($, 'terminal')
  const text = flat(JSON.parse(JSON.stringify(await pane.drawn())))
  // 232k tokens: 2.3 points of the 5h window, 0.46 of the week.
  expect(text).toContain('~2% of the 5h window · ~0.5% of the week')
  // 46k tokens: under a point of the 5h window, 0.09 of the week.
  expect(text).toContain('<1% of the 5h window · ~0.1% of the week')
  expect(near(0.2 / 100_000 * 232_000, 0.464)).toBe(true)
  await pane.unmount()
})

test('the mascots follow the theme: the dark set, or the light one when the theme says light', async ($, on) => {
  world(on, { theme: 'light' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  const pane = await paneOf($, 'terminal')
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('"borderColor":"#c15f3c"')
  expect(drawn).not.toContain('"borderColor":"#d97757"')
  await pane.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band above the prompt: progress while agents run, done after, gone at the next prompt, on ${surface}`, async ($, on) => {
    const w = world(on, { beneath: 'other mod row' })
    on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }) as never)
    on('tool.call', () => ({ result: 'ok', text: 'ok' }) as never)
    on('turn.complete', () => ({ text: 'done' }) as never)
    on('turn.step', async function* () {
      return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: USAGE }
    } as never)
    await $.session.start({ cwd: '/repo', surface, isInteractive: true } as never)
    const b = await bandOf($, surface)
    // Nothing runs: the band leaves the row to the mods beneath.
    expect(JSON.stringify(await b.drawn())).not.toContain('Agents')
    expect(JSON.stringify(await b.drawn())).toContain('other mod row')

    w.agents = [{ id: 'a1', description: 'Map the API routes', type: 'Explore', status: 'running' }]
    await $.agent.spawn(SPAWN as never)
    await step($, 'a1')
    await $.tool.call({ tool: 'Read', file_path: '/repo/src/routes.ts', agentId: 'a1', tool_use_id: 'tu2' } as never)
    await w.clock.advance(5000)
    let drawn = JSON.stringify(await b.drawn())
    let text = flat(JSON.parse(drawn))
    expect(text).toContain('Agents0/1')
    expect(text).toContain('Map the API routes · Reading routes.ts')
    expect(drawn).toContain('band:open')
    expect(drawn).toContain('band:hide')
    // Its row first, the other mod's under it; the bar is a gradient from the palette.
    expect(drawn.indexOf('Agents')).toBeLessThan(drawn.indexOf('other mod row'))
    expect(drawn).toContain('"color":"#d97757"')
    expect(drawn).toContain('░')
    await b.press({ key: 'band:open' })
    expect(w.opened).toContain('agent-watch')

    // The agent ends: the band says they are done.
    w.agents = [{ id: 'a1', description: 'Map the API routes', type: 'Explore', status: 'completed' }]
    await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' } as never)
    await w.clock.advance(5000)
    drawn = JSON.stringify(await b.drawn())
    text = flat(JSON.parse(drawn))
    expect(text).toContain('✓ 1 agent done · 44k')
    expect(drawn.indexOf('agent done')).toBeLessThan(drawn.indexOf('other mod row'))

    // The next prompt clears it.
    await $.prompt.submit({ text: 'next' } as never)
    drawn = JSON.stringify(await b.drawn())
    expect(drawn).not.toContain('agent done')
    expect(drawn).toContain('other mod row')
    await b.unmount()
  })
}

test('the band: a stalled agent turns it warning, hide hides it, show brings it back', async ($, on) => {
  const w = world(on, { agents: running(2) })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  const b = await bandOf($, 'terminal')
  let drawn = JSON.stringify(await b.drawn())
  expect(flat(JSON.parse(drawn))).toContain('Fix the flaky test quiet for 6m 00s')
  expect(drawn).toContain('"color":"warning"')
  await b.press({ key: 'band:hide' })
  expect(JSON.stringify(await b.drawn())).not.toContain('Agents')
  expect(w.statuses.at(-1)).toBe(undefined)
  await $.command.run({ ...RUN, args: 'show' } as never)
  expect(JSON.stringify(await b.drawn())).toContain('Agents')
  await b.unmount()
})

test('clearing the agents takes the band with them', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  const b = await bandOf($, 'terminal')
  expect(JSON.stringify(await b.drawn())).toContain('Agents')
  await $.command.run({ ...RUN, args: 'clear' } as never)
  expect(JSON.stringify(await b.drawn())).not.toContain('Agents')
  await b.unmount()
})

test('the band at 80 columns cuts the current action short', async ($, on) => {
  world(on, { agents: running(1) })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  const narrow = flat(JSON.parse(JSON.stringify(await (await bandOf($, 'terminal', 80)).drawn())))
  const wide = flat(JSON.parse(JSON.stringify(await (await bandOf($, 'terminal', 140)).drawn())))
  expect(narrow.length).toBeLessThanOrEqual(wide.length)
})

test('quiet: no band, and a survey takes the row', { options: { quiet: true } }, async ($, on) => {
  world(on, { beneath: 'other mod row' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  const b = await bandOf($, 'terminal')
  const drawn = JSON.stringify(await b.drawn())
  expect(drawn).not.toContain('Agents')
  expect(drawn).toContain('other mod row')
  await b.unmount()
})

test('a survey takes the row from the band', async ($, on) => {
  world(on, { beneath: 'other mod row' })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  const b = await $.ui.mount({ plugin: 'agent-watch', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 100, hasSurvey: true }, viewport: { columns: 100, rows: 40 } } as never)
  const drawn = JSON.stringify(await b.drawn())
  expect(drawn).not.toContain('Agents')
  expect(drawn).toContain('other mod row')
  await b.unmount()
})

// /watch on, off, hide and show

const switchWorld = (on: any) => {
  const w = { toasts: [] as string[], statuses: [] as (string | undefined)[], sets: [] as { key: string; value: unknown }[], deny: '' }
  mock.clock(on, { now: NOW })
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', (_$: any, e: any) => (w.toasts.push(e.text), { value: undefined }) as never)
  on('ui.status', (_$: any, e: any) => (w.statuses.push(e.text), { value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: '/repo' }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('config.set', (_$: any, e: any) => {
    if (w.deny) return { deny: w.deny } as never
    w.sets.push({ key: e.key, value: e.value })
    return { value: e.value } as never
  })
  return w
}

test('hide: on but silent, so the demo stall raises no toast, and show brings the toast back', async ($, on) => {
  const w = switchWorld(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  expect((await $.command.run({ ...RUN, args: 'hide' } as never)).text).toBe('watch hidden but on · /watch show brings it back')
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(w.toasts).toEqual([])
  expect((await $.command.run({ ...RUN, args: 'show' } as never)).text).toBe('watch shown · /watch hide hides it')
  await $.command.run({ ...RUN, args: 'clear demo' } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(w.toasts.some(t => t.includes('looks stalled'))).toBe(true)
})

test('hide is kept for the next session', async ($, on) => {
  const w = switchWorld(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'hide' } as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(w.toasts).toEqual([])
})

test('on and off write the enabled option; on says it is already on', async ($, on) => {
  const w = switchWorld(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  expect((await $.command.run({ ...RUN, args: 'on' } as never)).text).toBe('watch is already on.')
  expect((await $.command.run({ ...RUN, args: 'off' } as never)).text).toBe('watch off in every conversation · /watch on turns it on')
  expect(w.sets).toEqual([{ key: 'agent-watch.enabled', value: false }])
})

test('off: only the command answers, and on writes the option back', { options: { enabled: false, language: 'pt-BR' } }, async ($, on) => {
  const w = switchWorld(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  expect((await $.command.run({ ...RUN, args: 'off' } as never)).text).toBe('watch já está desligado.')
  expect((await $.command.run({ ...RUN, args: 'on' } as never)).text).toBe('watch ligado · /watch off desliga')
  expect(w.sets).toEqual([{ key: 'agent-watch.enabled', value: true }])
})

test('a refused option says why', async ($, on) => {
  const w = switchWorld(on)
  w.deny = 'managed by policy'
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  expect((await $.command.run({ ...RUN, args: 'off' } as never)).text).toBe('Could not change the option: managed by policy')
})

// The quiet option, set in every mod by /pad quiet: silent like hide, and `show` does not undo it.
test('quiet: no toast from the demo stall, and show does not undo it', { options: { quiet: true } }, async ($, on) => {
  const w = switchWorld(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(w.toasts).toEqual([])
  expect((await $.command.run({ ...RUN, args: 'show' } as never)).text).toBe('watch shown · /watch hide hides it')
  await $.command.run({ ...RUN, args: 'clear demo' } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(w.toasts).toEqual([])
})

// G6 (prototype agent-watch-0.7.1): with plain-view's card drawn and its agents row there, the band's
// message is plain-view's child row; the band keeps the message above the prompt otherwise.
const plainView = (on: any, state: { cardOn?: unknown; agents?: unknown }) => {
  // The version moves with the value, as the engine's own would: it caches a read at its version.
  const seen: Record<string, { json: string; version: number }> = {}
  on('state.get', (_$: any, e: any, next: any) => {
    if (e.plugin !== 'plain-view') return next(e)
    const value = e.key === 'cardOn' ? state.cardOn : e.key === 'agents' ? state.agents : undefined
    const json = JSON.stringify(value)
    const was = seen[e.key]
    const entry = was && was.json === json ? was : { json, version: (was?.version ?? 0) + 1 }
    seen[e.key] = entry
    return { value: { value, version: value === undefined ? 0 : entry.version } } as never
  })
}
// What the mod last wrote to its `message` atom: the test's handle has no `$.state`, so the write is watched.
const watchMessage = (on: any) => {
  const seen = { value: null as unknown }
  on('state.set', (_$: any, e: any, next: any) => {
    if (e.plugin === 'agent-watch' && e.key === 'message') seen.value = e.value
    return next(e)
  })
  return seen
}

test('G6 band yields to plain-view: its card and an agents row take the message, anything less keeps it above the prompt', async ($, on) => {
  const w = world(on, { agents: running(1), beneath: 'other mod row' })
  const pv: { cardOn?: unknown; agents?: unknown } = {}
  plainView(on, pv)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  const b = await bandOf($, 'terminal')
  const shown = async () => JSON.stringify(await b.drawn()).includes('Agents')
  // plain-view not installed: nothing to read.
  expect(await shown()).toBe(true)
  // Its card on, but no agents row: the band stays.
  pv.cardOn = true
  pv.agents = []
  await w.clock.advance(5000)
  expect(await shown()).toBe(true)
  // The card off (hide, quiet, off) with agents listed: the band stays.
  pv.cardOn = false
  pv.agents = [{ id: 'a1' }]
  await w.clock.advance(5000)
  expect(await shown()).toBe(true)
  // The card on with its agents row: the band goes and the other mod's row stays.
  pv.cardOn = true
  await w.clock.advance(5000)
  const drawn = JSON.stringify(await b.drawn())
  expect(drawn).not.toContain('Agents')
  expect(drawn).not.toContain('band:open')
  expect(drawn).toContain('other mod row')
  // plain-view goes quiet again: the band is back.
  pv.cardOn = false
  await w.clock.advance(5000)
  expect(await shown()).toBe(true)
  await b.unmount()
})

test('G6 band also yields the done summary', async ($, on) => {
  const w = world(on, { agents: [{ id: 'a1', description: 'Map the API routes', type: 'Explore', status: 'running' }] })
  const pv = { cardOn: true, agents: [{ id: 'a1' }] }
  plainView(on, pv)
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }) as never)
  on('turn.complete', () => ({ text: 'done' }) as never)
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  } as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.agent.spawn(SPAWN as never)
  await step($, 'a1')
  await w.clock.advance(5000)
  w.agents = [{ id: 'a1', description: 'Map the API routes', type: 'Explore', status: 'completed' }]
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' } as never)
  await w.clock.advance(5000)
  const b = await bandOf($, 'terminal')
  expect(JSON.stringify(await b.drawn())).not.toContain('agent done')
  // plain-view's card goes (hide, quiet): the band is back with the summary. A new mount stands for the redraw plain-view's own write would cause.
  await b.unmount()
  pv.cardOn = false
  const again = await bandOf($, 'terminal')
  expect(flat(JSON.parse(JSON.stringify(await again.drawn())))).toContain('✓ 1 agent done · 44k')
  await again.unmount()
})

test('G6 message: what plain-view reads follows the wave, and goes with hide and the next prompt', async ($, on) => {
  const message = watchMessage(on)
  const messageNow = async (_$: any) => message.value
  const w = world(on, { agents: [{ id: 'a1', description: 'Map the API routes', type: 'Explore', status: 'running' }] })
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }) as never)
  on('tool.call', () => ({ result: 'ok', text: 'ok' }) as never)
  on('turn.complete', () => ({ text: 'done' }) as never)
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  } as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  expect(await messageNow($)).toBeNull()
  await $.agent.spawn(SPAWN as never)
  await step($, 'a1')
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/routes.ts', agentId: 'a1', tool_use_id: 'tu2' } as never)
  await w.clock.advance(5000)
  expect(await messageNow($)).toMatchObject({ kind: 'run', label: 'Agents', count: '0/1', name: 'Map the API routes', action: 'Reading routes.ts', stalled: null, glyph: '▲', color: '#d97757' })

  // hide takes it away, show brings it back.
  await $.command.run({ ...RUN, args: 'hide' } as never)
  expect(await messageNow($)).toBeNull()
  await $.command.run({ ...RUN, args: 'show' } as never)
  await w.clock.advance(5000)
  expect(await messageNow($)).toMatchObject({ kind: 'run' })

  // The wave ends: the summary, until the next prompt.
  w.agents = [{ id: 'a1', description: 'Map the API routes', type: 'Explore', status: 'completed' }]
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' } as never)
  await w.clock.advance(5000)
  expect(await messageNow($)).toMatchObject({ kind: 'done' })
  expect(((await messageNow($)) as { text: string }).text).toMatch(/^1 agent done · 44k · \d+s$/)
  await $.prompt.submit({ text: 'next' } as never)
  expect(await messageNow($)).toBeNull()
})

test('G6 message: a stalled agent is in it', async ($, on) => {
  const message = watchMessage(on)
  const messageNow = async (_$: any) => message.value
  const w = world(on, { agents: running(2) })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  await w.clock.advance(5000)
  const m = (await messageNow($)) as { kind: string; name: string; stalled: string | null }
  expect(m).toMatchObject({ kind: 'run', name: 'Fix the flaky test' })
  expect(m.stalled).toMatch(/^Fix the flaky test quiet for 6m \d\ds$/)
})

test('G6 message: quiet publishes nothing', { options: { quiet: true } }, async ($, on) => {
  const message = watchMessage(on)
  const messageNow = async (_$: any) => message.value
  const w = world(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  await w.clock.advance(5000)
  expect(await messageNow($)).toBeNull()
})
