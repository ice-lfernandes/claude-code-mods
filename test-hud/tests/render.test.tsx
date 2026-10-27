import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

/** The text of a drawn tree, every node's children joined: a phrase split across a figure and its label reads whole. */
const flat = (n: unknown): string =>
  typeof n === 'string' ? n : Array.isArray(n) ? n.map(flat).join('') : n && typeof n === 'object' ? flat((n as { children?: unknown }).children) : ''

const NOW = Date.parse('2026-10-08T12:00:00Z')

// A5 (prototype buttons-quiet-a5-a7, variant B): the Buttons of a tree, with the props the variant lives in.
const buttonsOf = (tree: unknown) =>
  [...JSON.stringify(tree).matchAll(/"type":"Button","props":(\{[^{}]*\})/g)].map(m => JSON.parse(m[1]!) as { key: string; variant?: string; plain?: boolean })
const variantOf = (tree: unknown, key: string) => buttonsOf(tree).find(b => b.key === key)?.variant
const PROPS = { title: 'Tests', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }
const RUN = { command: 'test-hud', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } }
const CMD = 'npx vitest run --reporter=verbose src/a.test.ts src/b.test.ts src/c.test.ts src/d.test.ts'

const RED = ' FAIL  src/a.test.ts > parse > empty\n FAIL  src/a.test.ts > parse > commas\n\n      Tests  2 failed | 41 passed (43)'
const GREEN = '      Tests  43 passed (43)'
const PYTEST = 'FAILED tests/test_api.py::test_routes\n1 failed, 9 passed in 0.40s'

type World = { toasts: string[]; statuses: (string | undefined)[]; fills: { text: string; decorations?: unknown }[]; logs: string[]; closed: string[]; output: string }

const world = (on: On, env: Record<string, string> = {}, store = true): { w: World; clock: ReturnType<typeof mock.clock> } => {
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
  on('session.root', () => ({ value: '/repo' }) as never)
  if (store) mock.store(on)
  on('tool.call', (async (_$: any, e: any) => {
    await clock.advance(12_000)
    if (e.command.startsWith('pytest')) return { result: undefined, text: `Exit code 1\n${PYTEST}`, isError: true }
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
    expect(flat(JSON.parse(drawn))).toContain('41/43 passing')
    expect(flat(JSON.parse(drawn))).toContain('2 failed')
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
    expect(w.toasts).toEqual(['✓ Tests green: 43/43 (vitest) after 2 red runs in 36s. /test-hud'])
    drawn = JSON.stringify(await pane.drawn())
    expect(flat(JSON.parse(drawn))).toContain('43/43 passing')
    expect(drawn).not.toContain('Failing')
    expect(variantOf(JSON.parse(drawn), 'rerun')).toBe('secondary') // green: nothing to decide
    expect(variantOf(JSON.parse(drawn), 'close')).toBe('secondary')
    expect(drawn).toContain('Fixed since the previous run (2)')
    await pane.unmount()
  })
}

test('a failing test and run again fill the prompt with the whole command; nothing runs', async ($, on) => {
  const { w } = world(on)
  await start($)
  await vitest($, 'tu1')
  const pane = await mount($)
  const red = await pane.drawn()
  expect(variantOf(red, 'rerun')).toBe('primary') // red: run again is the decision
  expect(buttonsOf(red).filter(b => b.variant === 'primary')).toHaveLength(1)
  expect(variantOf(red, 'close')).toBe('secondary')
  for (const b of buttonsOf(red).filter(b => b.variant)) expect(b.plain).toBeUndefined()
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
  expect(flat(await pane.drawn())).toContain('41/43 passing')
  await pane.press({ key: 'verb:help' })
  expect(w.logs[0]).toBe('/test-hud          open the pane')
  expect(w.logs).toHaveLength(6)
  await pane.press({ key: 'close' })
  expect(w.closed).toEqual(['test-hud'])
  await pane.unmount()
})

test('demo runs red to green, clear removes them', async ($, on) => {
  const { w } = world(on)
  await start($)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(w.statuses.at(-1)).toBe('✓ tests 43/43 █▆▇▄▂▁')
  // Run 3 leaves "rounds half up" flaky (red, green, red): the toast names it once, then the green one.
  expect(w.toasts).toEqual(['! Flaky test: totals > rounds half up (3 runs) /test-hud', '✓ Tests green: 43/43 (vitest) after 5 red runs in 7m 44s. /test-hud'])
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
  expect(w.toasts).toEqual(['✗ Tests turned red: 41/43 (vitest), 2 failing. /test-hud'])
})

test('Portuguese from LANG: status line, pane and prompt', async ($, on) => {
  const { w } = world(on, { LANG: 'pt_BR.UTF-8' })
  await start($)
  await vitest($, 'tu1')
  expect(w.statuses.at(-1)).toBe('✗ testes 41/43')
  const pane = await mount($)
  const drawn = JSON.stringify(await pane.drawn())
  expect(flat(JSON.parse(drawn))).toContain('41/43 passando')
  expect(flat(JSON.parse(drawn))).toContain('2 falharam')
  expect(drawn).toContain('Falhando (2 em 1 arquivo)')
  expect(drawn).toContain('"label":"ver"')
  expect(drawn).toContain('"label":"rodar"')
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

test('a run in the list shows it, flaky tests are marked, and latest goes back', async ($, on) => {
  const { w } = world(on)
  await start($)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  const pane = await mount($)
  let drawn = JSON.stringify(await pane.drawn())
  expect(flat(JSON.parse(drawn))).toContain('43/43 passing')
  expect(drawn).toContain('duration of the last 6 runs (11s to 14s)')
  expect(drawn).toContain('press one to see it')

  // Run 3: "rounds half up" failed in run 1, passed in run 2 and failed again.
  await pane.press({ key: 'run:3' })
  drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('showing run #3')
  expect(drawn).toContain('vitest · #3')
  expect(drawn).toContain('flaky?')
  expect(drawn.match(/flaky\?/g)).toHaveLength(1)
  // The first group is open; the cart group opens with a press, as the header says.
  await pane.press({ key: 'fold:src/cart.test.ts' })
  await pane.press({ key: 'fix:src/cart.test.ts > totals > rounds half up' })
  expect(w.fills.at(-1)?.text).toContain('rounds half up')

  await pane.press({ key: 'latest' })
  drawn = JSON.stringify(await pane.drawn())
  expect(drawn).not.toContain('showing run')
  expect(drawn).toContain('vitest · #6')
  await pane.unmount()
})

test('with two runners, tabs pick which one the pane shows', async ($, on) => {
  const { w } = world(on)
  await start($)
  await vitest($, 'tu1')
  await $.tool.call({ tool: 'Bash', command: 'pytest -q', tool_use_id: 'tu2' } as never)
  expect(w.statuses.at(-1)).toBe('✗ tests 9/10')
  const pane = await mount($)
  let drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('▸ pytest')
  expect(drawn).toContain('tests/test_api.py::test_routes')
  expect(drawn).not.toContain('parse > empty')

  await pane.press({ key: 'tab:vitest' })
  drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('▸ vitest')
  expect(flat(JSON.parse(drawn))).toContain('41/43 passing')
  expect(drawn).toContain('parse > empty')
  expect(drawn).not.toContain('pytest -q')
  await pane.unmount()
})

test('one runner: no tabs, and one run: no duration line', async ($, on) => {
  world(on)
  await start($)
  await vitest($, 'tu1')
  const pane = await mount($)
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).not.toContain('tab:')
  expect(drawn).not.toContain('duration of')
  await pane.unmount()
})

test('keepHistory: the next session in the project starts with the runs, demo left out', { options: { keepHistory: true } }, async ($, on) => {
  const { w } = world(on)
  await start($)
  await vitest($, 'tu1')
  await $.command.run({ ...RUN, args: 'demo' } as never)
  await start($) // a new session reads the store
  expect(w.statuses.at(-1)).toBe('✗ tests 41/43')
  await $.command.run({ ...RUN, args: 'clear' } as never)
  await start($)
  const pane = await mount($)
  expect(JSON.stringify(await pane.drawn())).toContain('No test runs yet')
  await pane.unmount()
})

test('without keepHistory nothing is stored', async ($, on) => {
  const { w } = world(on, {}, false)
  let writes = 0
  on('store.set', () => (writes++, { value: undefined }) as never)
  await start($)
  await vitest($, 'tu1')
  expect(writes).toBe(0)
  expect(w.statuses.at(-1)).toBe('✗ tests 41/43')
})

test('a saved copy named in the output is read only from tool-results under the config folder', async ($, on) => {
  const { w } = world(on, { HOME: '/home/u' })
  // Each file the stub holds, by where it really lands: the second one a test reached with `..`.
  const files: Record<string, string> = { '/home/u/.claude/projects/p/s/tool-results/b1.txt': RED, '/home/u/.ssh/id_ed25519': GREEN }
  const fold = (path: string) => path.split('/').reduce<string[]>((acc, part) => (part === '..' ? acc.slice(0, -1) : part === '.' || part === '' ? acc : [...acc, part]), []).join('/')
  const read: string[] = []
  on('fs.stat', (_$, e: any) => {
    const real = `/${fold(e.path)}`
    if (real === '/home/u/.claude') return { value: { kind: 'dir', size: 0, mtimeMs: NOW, isLink: false, realPath: real } } as never
    if (!(real in files)) throw new Error('ENOENT')
    return { value: { kind: 'file', size: files[real]!.length, mtimeMs: NOW, isLink: false, realPath: real } } as never
  })
  on('fs.read', (_$, e: any) => (read.push(e.path), { value: files[`/${fold(e.path)}`] }) as never)
  await start($)

  w.output = 'Output too large. Full output saved to: /repo/tool-results/../../home/u/.ssh/id_ed25519'
  await vitest($, 'tu1')
  expect(read).toEqual([])
  expect(w.statuses).toEqual([])

  w.output = 'Output too large. Full output saved to: /home/u/.claude/projects/p/s/tool-results/b1.txt'
  await vitest($, 'tu2')
  expect(read).toEqual(['/home/u/.claude/projects/p/s/tool-results/b1.txt'])
  expect(w.statuses.at(-1)).toBe('✗ tests 41/43')
})

// /test-hud on, off, hide and show

test('hide: the status line and the green toast go quiet, the run is still counted; show brings them back', async ($, on) => {
  const { w } = world(on)
  await start($)
  await vitest($, 'tu1')
  expect(w.statuses.at(-1)).toBe('✗ tests 41/43')
  expect((await $.command.run({ ...RUN, args: 'hide' } as never)).text).toBe('test-hud hidden but on · /test-hud show brings it back')
  expect(w.statuses.at(-1)).toBeUndefined()
  w.output = GREEN
  await vitest($, 'tu2')
  expect(w.statuses.at(-1)).toBeUndefined()
  expect(w.toasts).toEqual([])
  expect((await $.command.run({ ...RUN, args: 'show' } as never)).text).toBe('test-hud shown · /test-hud hide hides it')
  expect(w.statuses.at(-1)).toBe('✓ tests 43/43 █▁')
})

test('hide is kept for the next session', async ($, on) => {
  const { w } = world(on)
  await start($)
  await $.command.run({ ...RUN, args: 'hide' } as never)
  await start($)
  await vitest($, 'tu1')
  expect(w.statuses.filter(s => s !== undefined)).toEqual([])
})

test('on and off write the enabled option', async ($, on) => {
  world(on)
  const sets: { key: string; value: unknown }[] = []
  on('config.set', (_$: any, e: any) => (sets.push({ key: e.key, value: e.value }), { value: e.value }) as never)
  await start($)
  expect((await $.command.run({ ...RUN, args: 'on' } as never)).text).toBe('test-hud is already on.')
  expect((await $.command.run({ ...RUN, args: 'off' } as never)).text).toBe('test-hud off in every conversation · /test-hud on turns it on')
  expect(sets).toEqual([{ key: 'test-hud.enabled', value: false }])
})

test('off: runs are not counted and the status line stays empty, but the command still answers', { options: { enabled: false } }, async ($, on) => {
  const { w } = world(on)
  on('config.set', (_$: any, e: any) => ({ value: e.value }) as never)
  await start($)
  await vitest($, 'tu1')
  expect(w.statuses).toEqual([])
  expect((await $.command.run({ ...RUN, args: 'off' } as never)).text).toBe('test-hud is already off.')
  expect((await $.command.run({ ...RUN, args: 'on' } as never)).text).toBe('test-hud on · /test-hud off turns it off')
})

test('a refused option says why', async ($, on) => {
  world(on)
  on('config.set', () => ({ deny: 'managed by policy' }) as never)
  await start($)
  expect((await $.command.run({ ...RUN, args: 'off' } as never)).text).toBe('Could not change the option: managed by policy')
})

// The quiet option, set in every mod by /pad quiet: silent like hide, and `show` does not undo it.
test('quiet: no status line and no toast, the run is still counted, and show does not undo it', { options: { quiet: true } }, async ($, on) => {
  const { w } = world(on)
  await start($)
  await vitest($, 'tu1')
  expect(w.statuses.at(-1)).toBeUndefined()
  w.output = GREEN
  await vitest($, 'tu2')
  expect(w.toasts).toEqual([])
  await $.command.run({ ...RUN, args: 'show' } as never)
  expect(w.statuses.at(-1)).toBeUndefined()
  const pane = await mount($)
  expect(flat(JSON.parse(JSON.stringify(await pane.drawn())))).toContain('43/43')
  await pane.unmount()
})

// T1: failures grouped by file (prototype test-hud-0.7.0, variant B).
const HOVER = /"type":"Button","props":(\{[^{}]*\}),"press":\{[^{}]*\}(?:,"hover":(\{[^{}]*\}))?/g
const hoverOf = (tree: unknown, key: string) => {
  for (const m of JSON.stringify(tree).matchAll(HOVER)) if ((JSON.parse(m[1]!) as { key: string }).key === key) return m[2] ? (JSON.parse(m[2]) as Record<string, unknown>) : undefined
  throw new Error(`no Button keyed ${key}`)
}
const keysOf = (tree: unknown) => buttonsOf(tree).map(b => b.key)

const TWO_FILES = ' FAIL  src/a.test.ts > parse > empty\n FAIL  src/b.test.ts > cart > rounds\n FAIL  src/b.test.ts > cart > coupon\n\n      Tests  3 failed | 40 passed (43)'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`failures are grouped by file, the first group open, a press opens and closes one on ${surface}`, async ($, on) => {
    const { w } = world(on)
    w.output = TWO_FILES
    await start($)
    await vitest($, 'tu1')
    const pane = await mount($, surface)
    let drawn = await pane.drawn()
    expect(flat(drawn)).toContain('Failing (3 in 2 files)')
    expect(flat(drawn)).toContain('2 ✗') // src/b.test.ts
    expect(keysOf(drawn)).toContain('fix:src/a.test.ts > parse > empty')
    expect(keysOf(drawn)).not.toContain('fix:src/b.test.ts > cart > rounds') // closed
    expect(JSON.stringify(drawn)).toContain('"label":"parse > empty"') // the label is the test's own name, not the whole one

    await pane.press({ key: 'fold:src/b.test.ts' })
    drawn = await pane.drawn()
    expect(keysOf(drawn)).toContain('fix:src/b.test.ts > cart > rounds')
    expect(keysOf(drawn)).toContain('fix:src/a.test.ts > parse > empty') // the first stays open
    await pane.press({ key: 'fold:src/a.test.ts' })
    expect(keysOf(await pane.drawn())).not.toContain('fix:src/a.test.ts > parse > empty')

    await pane.press({ key: 'fix:src/b.test.ts > cart > coupon' })
    expect(w.fills.at(-1)?.text).toBe(`Investigate and fix the failure in src/b.test.ts > cart > coupon. Command: ${CMD}`)
    await pane.unmount()
  })
}

test('show puts the file in the prompt, run asks for only that group; nothing runs', async ($, on) => {
  const { w } = world(on)
  w.output = TWO_FILES
  await start($)
  await vitest($, 'tu1')
  const pane = await mount($)
  await pane.press({ key: 'view:src/b.test.ts' })
  expect(w.fills.at(-1)?.text).toBe('Show the failing tests in @src/b.test.ts')
  await pane.press({ key: 'only:src/b.test.ts' })
  expect(w.fills.at(-1)?.text).toBe(`Run only the tests in src/b.test.ts, with the same runner as: ${CMD}`)
  expect(w.statuses.at(-1)).toBe('✗ tests 40/43')
  await pane.unmount()
})

test('a closed group names what is in it: flaky before new', async ($, on) => {
  const { w } = world(on)
  await start($)
  w.output = ' FAIL  src/a.test.ts > parse > empty\n FAIL  src/b.test.ts > cart > rounds\n\n      Tests  2 failed | 41 passed (43)'
  await vitest($, 'tu1')
  w.output = ' FAIL  src/a.test.ts > parse > empty\n\n      Tests  1 failed | 42 passed (43)'
  await vitest($, 'tu2')
  w.output = ' FAIL  src/a.test.ts > parse > empty\n FAIL  src/b.test.ts > cart > rounds\n\n      Tests  2 failed | 41 passed (43)'
  await vitest($, 'tu3')
  const pane = await mount($)
  const drawn = JSON.stringify(await pane.drawn())
  expect(keysOf(JSON.parse(drawn))).not.toContain('fix:src/b.test.ts > cart > rounds')
  expect(drawn.match(/flaky\?/g)).toHaveLength(1) // on the closed b.test.ts header, where the test is
  await pane.unmount()
})

test('a class group (Maven) has run but no show: the mod never guesses where a file is', async ($, on) => {
  const { w } = world(on)
  w.output = '[ERROR]   PricingTest.roundsHalfUp:35 expected: <1> but was: <2>\n[ERROR]   PricingTest.appliesCoupon:22 expected: <1> but was: <2>\n[ERROR] Tests run: 5, Failures: 2, Errors: 0, Skipped: 0'
  await start($)
  await $.tool.call({ tool: 'Bash', command: './mvnw test', tool_use_id: 'm1' } as never)
  const pane = await mount($)
  const drawn = await pane.drawn()
  expect(flat(drawn)).toContain('Failing (2 in 1 class)')
  expect(keysOf(drawn)).toContain('only:PricingTest')
  expect(keysOf(drawn)).not.toContain('view:PricingTest')
  await pane.press({ key: 'only:PricingTest' })
  expect(w.fills.at(-1)?.text).toBe('Run only the tests in PricingTest, with the same runner as: ./mvnw test')
  await pane.unmount()
})

test('a pytest path is a file; names that carry no group stay a flat list', async ($, on) => {
  const { w } = world(on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'pytest -q', tool_use_id: 'p1' } as never)
  let pane = await mount($)
  let drawn = await pane.drawn()
  expect(flat(drawn)).toContain('Failing (1 in 1 file)')
  expect(keysOf(drawn)).toContain('view:tests/test_api.py')
  await pane.unmount()

  w.output = '--- FAIL: TestRoundHalfUp (0.00s)\nFAIL\nFAIL\texample.com/pkg\t0.01s'
  await $.tool.call({ tool: 'Bash', command: 'go test ./...', tool_use_id: 'g1' } as never)
  pane = await mount($)
  await pane.press({ key: 'tab:go' })
  drawn = await pane.drawn()
  expect(flat(drawn)).toContain('Failing (1)')
  expect(keysOf(drawn).filter(k => k.startsWith('fold:') || k.startsWith('only:'))).toEqual([])
  expect(keysOf(drawn)).toContain('fix:TestRoundHalfUp')
  await pane.unmount()
})

test('clear forgets which groups were open', async ($, on) => {
  const { w } = world(on)
  w.output = TWO_FILES
  await start($)
  await vitest($, 'tu1')
  const pane = await mount($)
  await pane.press({ key: 'fold:src/b.test.ts' })
  await $.command.run({ ...RUN, args: 'clear' } as never)
  await vitest($, 'tu2')
  expect(keysOf(await pane.drawn())).not.toContain('fix:src/b.test.ts > cart > rounds')
  await pane.unmount()
})

// T2: the flaky toast.
test('flaky toast: once per test, the green toast after it', async ($, on) => {
  const { w } = world(on)
  await start($)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never) // the same tests turn flaky again: no second announcement
  expect(w.toasts.filter(x => x.startsWith('! Flaky'))).toEqual(['! Flaky test: totals > rounds half up (3 runs) /test-hud'])
})

test('flakyToast off: no flaky toast, the green one stays', { options: { flakyToast: false } }, async ($, on) => {
  const { w } = world(on)
  await start($)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(w.toasts).toEqual(['✓ Tests green: 43/43 (vitest) after 5 red runs in 7m 44s. /test-hud'])
})

test('hide and quiet keep the flaky toast silent too', async ($, on) => {
  const { w } = world(on)
  await start($)
  await $.command.run({ ...RUN, args: 'hide' } as never)
  await $.command.run({ ...RUN, args: 'demo' } as never)
  expect(w.toasts).toEqual([])
})

test('flaky takes the regression toast\'s place', { options: { regressionToast: true } }, async ($, on) => {
  const { w } = world(on)
  await start($)
  const out = (names: string[]) => `${names.map(n => ` FAIL  ${n}`).join('\n')}\n\n      Tests  ${names.length} failed | ${43 - names.length} passed (43)`
  w.output = out(['src/a.test.ts > parse > empty'])
  await vitest($, 'tu1')
  w.output = GREEN
  await vitest($, 'tu2')
  w.toasts.length = 0
  w.output = out(['src/a.test.ts > parse > empty'])
  await vitest($, 'tu3') // red right after green, and the same test failed before: flaky
  expect(w.toasts).toEqual(['! Flaky test: parse > empty (3 runs) /test-hud'])
})

// Project standard (2026-10-27): a bracketed button fills on hover, a link only underlines.
for (const surface of ['terminal', 'desktop'] as const) {
  test(`hover: bracketed buttons fill, links underline on ${surface}`, async ($, on) => {
    const { w } = world(on)
    w.output = TWO_FILES
    await start($)
    await vitest($, 'tu1')
    const pane = await mount($, surface)
    const drawn = await pane.drawn()
    for (const key of ['rerun', 'close']) expect(hoverOf(drawn, key)).toEqual({ scope: `hover:${key}`, backgroundColor: 'claude', color: 'inverseText' })
    for (const key of ['fold:src/a.test.ts', 'view:src/a.test.ts', 'only:src/a.test.ts', 'fix:src/a.test.ts > parse > empty', 'run:1'])
      expect(hoverOf(drawn, key)).toEqual({ scope: `hover:${key}`, underline: true, inverse: false })
    await pane.unmount()
  })
}
