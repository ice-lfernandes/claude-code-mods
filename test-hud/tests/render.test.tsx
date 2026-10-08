import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const PROPS = { title: 'Tests', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }
const RUN = { command: 'tests', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } }

const RED = ' FAIL  src/a.test.ts > parse > empty\n FAIL  src/a.test.ts > parse > commas\n\n      Tests  2 failed | 41 passed (43)'
const GREEN = '      Tests  43 passed (43)'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`status line, pane and green toast on ${surface}`, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const toasts: string[] = []
    const statuses: (string | undefined)[] = []
    let output = RED
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    on('ui.toast', (_$, e: any) => (toasts.push(e.text), { value: undefined }) as never)
    on('ui.status', (_$, e: any) => (statuses.push(e.text), { value: undefined }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('session.start', () => ({ cwd: '/repo' }) as never)
    on('tool.call', (async () => {
      await clock.advance(12_000)
      return output === RED ? { result: undefined, text: `Exit code 1\n${output}`, isError: true } : { result: { stdout: output, stderr: '', interrupted: false }, text: output }
    }) as never)

    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    await $.tool.call({ tool: 'Bash', command: 'ls src', tool_use_id: 'tu0' } as never)
    expect(statuses).toEqual([])

    await $.tool.call({ tool: 'Bash', command: 'npx vitest run', tool_use_id: 'tu1' } as never)
    expect(statuses.at(-1)).toBe('✗ tests 41/43')
    await $.command.run(RUN as never)

    const pane = await $.ui.mount({ plugin: 'test-hud', surface, component: 'Pane', requestId: 'test-hud', props: PROPS, viewport: { columns: 102, rows: 40 } } as never)
    let drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('41/43 passing')
    expect(drawn).toContain('2 failed')
    expect(drawn).toContain('src/a.test.ts > parse > commas')
    expect(drawn).toContain('vitest · #1 · 12s')

    output = RED.replace('parse > commas', 'parse > quotes')
    await $.tool.call({ tool: 'Bash', command: 'npx vitest run', tool_use_id: 'tu2', agentId: 'a1' } as never)
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('parse > quotes')
    expect(drawn).toContain('new')
    expect(drawn).toContain('subagent')

    output = GREEN
    await $.tool.call({ tool: 'Bash', command: 'npx vitest run', tool_use_id: 'tu3' } as never)
    expect(statuses.at(-1)).toBe('✓ tests 43/43 ██▁')
    expect(toasts).toEqual(['Tests green: 43/43 (vitest) after 2 red runs in 36s. /tests'])
    drawn = JSON.stringify(await pane.drawn())
    expect(drawn).toContain('43/43 passing')
    expect(drawn).not.toContain('Failing')

    await pane.press({ key: 'clear' })
    expect(statuses.at(-1)).toBe(undefined)
    expect(JSON.stringify(await pane.drawn())).toContain('No test runs yet')
    await pane.unmount()
  })
}

test('demo runs red to green, clear removes them', async ($, on) => {
  mock.clock(on, { now: NOW })
  const toasts: string[] = []
  const statuses: (string | undefined)[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', (_$, e: any) => (toasts.push(e.text), { value: undefined }) as never)
  on('ui.status', (_$, e: any) => (statuses.push(e.text), { value: undefined }) as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(statuses.at(-1)).toBe('✓ tests 43/43 █▆▇▄▂▁')
  expect(toasts).toEqual(['Tests green: 43/43 (vitest) after 5 red runs in 7m 44s. /tests'])
  const pane = await $.ui.mount({ plugin: 'test-hud', surface: 'terminal', component: 'Pane', requestId: 'test-hud', props: PROPS, viewport: { columns: 102, rows: 40 } } as never)
  expect(JSON.stringify(await pane.drawn())).toContain('#6')
  await $.command.run({ ...RUN, args: 'clear' } as never)
  expect(JSON.stringify(await pane.drawn())).toContain('No test runs yet')
  await pane.unmount()
})
