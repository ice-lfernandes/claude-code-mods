import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const PROPS = { title: 'Tests', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }
const RUN = { command: 'test-hud', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } }
const CMD = 'npx vitest run --reporter=verbose src/a.test.ts src/b.test.ts src/c.test.ts src/d.test.ts'

const RED = ' FAIL  src/a.test.ts > parse > empty\n FAIL  src/a.test.ts > parse > commas\n\n      Tests  2 failed | 41 passed (43)'
const GREEN = '      Tests  43 passed (43)'

type World = { toasts: string[]; statuses: (string | undefined)[]; fills: { text: string; decorations?: unknown }[]; logs: string[]; closed: string[]; output: string }

const world = (on: On, env: Record<string, string> = {}): { w: World; clock: ReturnType<typeof mock.clock> } => {
  const clock = mock.clock(on, { now: NOW })
  const w: World = { toasts: [], statuses: [], fills: [], logs: [], closed: [], output: RED }
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', (_$, e: any) => (w.closed.push(e.id), { value: undefined }) as never)
  on('ui.toast', (_$, e: any) => (w.toasts.push(e.text), { value: undefined }) as never)
  on('ui.status', (_$, e: any) => (w.statuses.push(e.text), { value: undefined }) as never)
  on('ui.log', (_$, e: any) => (w.logs.push(e.text), { value: undefined }) as never)
  on('prompt.fill', (_$, e: any) => (w.fills.push({ text: e.text, decorations: e.decorations }), { isFilled: true, text: e.text, cursor: e.text.length }) as never)
  on('env.get', (_$, e: any) => ({ value: env[e.name] }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: '/repo' }) as never)
  on('tool.call', (async () => {
    await clock.advance(12_000)
    return w.output === GREEN ? { result: { stdout: w.output, stderr: '', interrupted: false }, text: w.output } : { result: undefined, text: `Exit code 1\n${w.output}`, isError: true }
  }) as never)
  return { w, clock }
}

const start = ($: any) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
const vitest = ($: any, id: string, extra: object = {}) => $.tool.call({ tool: 'Bash', command: CMD, tool_use_id: id, ...extra } as never)
const mount = ($: any, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'test-hud', surface, component: 'Pane', requestId: 'test-hud', props: PROPS, viewport: { columns: 102, rows: 40 } } as never)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`status line, pane, fixed tests and green toast on ${surface}`, async ($, on) => {
    const { w } = world(on)
    await start($)
    await $.tool.call({ tool: 'Bash', command: 'ls src', tool_use_id: 'tu0' } as never)
    expect(w.statuses).toEqual([])

    await vitest($, 'tu1')
    expect(w.statuses.at(-1)).toBe('✗ tests 41/43')
    await $.command.run(RUN as never)

    const pane = await mount($, surface)
    let drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('Press a failing test to ask for a fix')
    expect(drawn).toContain('41/43 passing')
    expect(drawn).toContain('2 failed')
    expect(drawn).toContain('src/a.test.ts > parse > commas')
    expect(drawn).toContain('vitest · #1 · 12s')
    expect(drawn).toContain('/test-hud ')

    w.output = RED.replace('parse > commas', 'parse > quotes')
    await vitest($, 'tu2', { agentId: 'a1' })
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('parse > quotes')
    expect(drawn).toContain('new')
    expect(drawn).toContain('subagent')
    expect(drawn).toContain('Fixed since the previous run (1)')
    expect(drawn).toContain('parse > commas')

    w.output = GREEN
    await vitest($, 'tu3')
    expect(w.statuses.at(-1)).toBe('✓ tests 43/43 ██▁')
    expect(w.toasts).toEqual(['Tests green: 43/43 (vitest) after 2 red runs in 36s. /test-hud'])
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('43/43 passing')
    expect(drawn).not.toContain('Failing')
    expect(drawn).toContain('Fixed since the previous run (2)')
    await pane.unmount()
  })
}

test('a failing test and run again fill the prompt with the whole command; nothing runs', async ($, on) => {
  const { w } = world(on)
  await start($)
  await vitest($, 'tu1')
  const pane = await mount($)
  await pane.press({ key: 'fix:src/a.test.ts > parse > empty' })
  expect(w.fills.at(-1)?.text).toBe(`Investigate and fix the failure in src/a.test.ts > parse > empty. Command: ${CMD}`)
  await pane.press({ key: 'rerun' })
  expect(w.fills.at(-1)?.text).toBe(`Run the tests again: ${CMD}`)
  expect(w.statuses.at(-1)).toBe('✗ tests 41/43')
  await pane.unmount()
})

test('the verbs: clear waits in the prompt, help answers in the transcript, close closes', async ($, on) => {
  const { w } = world(on)
  await start($)
  await vitest($, 'tu1')
  const pane = await mount($)
  await pane.press({ key: 'verb:clear' })
  expect(w.fills.at(-1)?.text).toBe('/test-hud clear')
  expect(JSON.stringify(await pane.drawn())).toContain('41/43 passing')
  await pane.press({ key: 'verb:help' })
  expect(w.logs[0]).toBe('/test-hud          open the pane')
  expect(w.logs).toHaveLength(3)
  await pane.press({ key: 'close' })
  expect(w.closed).toEqual(['test-hud'])
  await pane.unmount()
})

test('demo runs red to green, clear removes them', async ($, on) => {
  const { w } = world(on)
  await start($)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(w.statuses.at(-1)).toBe('✓ tests 43/43 █▆▇▄▂▁')
  expect(w.toasts).toEqual(['Tests green: 43/43 (vitest) after 5 red runs in 7m 44s. /test-hud'])
  const pane = await mount($)
  expect(JSON.stringify(await pane.drawn())).toContain('#6')
  await $.command.run({ ...RUN, args: 'clear' } as never)
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('No test runs yet')
  expect(drawn).toContain('/test-hud demo shows what this looks like')
  await pane.unmount()
})

test('no regression toast unless the option asks for one', async ($, on) => {
  const { w } = world(on)
  await start($)
  w.output = GREEN
  await vitest($, 'tu1')
  w.output = RED
  await vitest($, 'tu2')
  expect(w.toasts).toEqual([])
})

test('regression toast when a green runner turns red', { options: { regressionToast: true } }, async ($, on) => {
  const { w } = world(on)
  await start($)
  w.output = GREEN
  await vitest($, 'tu1')
  w.output = RED
  await vitest($, 'tu2')
  await vitest($, 'tu3')
  expect(w.toasts).toEqual(['Tests turned red: 41/43 (vitest), 2 failing. /test-hud'])
})

test('Portuguese from LANG: status line, pane and prompt', async ($, on) => {
  const { w } = world(on, { LANG: 'pt_BR.UTF-8' })
  await start($)
  await vitest($, 'tu1')
  expect(w.statuses.at(-1)).toBe('✗ testes 41/43')
  const pane = await mount($)
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('41/43 passando')
  expect(drawn).toContain('2 falharam')
  expect(drawn).toContain('Falhando (2)')
  expect(drawn).toContain('Fechar')
  await pane.press({ key: 'rerun' })
  expect(w.fills.at(-1)?.text).toBe(`Rode os testes de novo: ${CMD}`)
  await pane.unmount()
})

test('the language option wins over LANG', { options: { language: 'en' } }, async ($, on) => {
  const { w } = world(on, { LANG: 'pt_BR.UTF-8' })
  await start($)
  await vitest($, 'tu1')
  expect(w.statuses.at(-1)).toBe('✗ tests 41/43')
})
