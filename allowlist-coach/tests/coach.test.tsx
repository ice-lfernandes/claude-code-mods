// The engine beneath is a stub: a Bash call raises classic.PermissionRequest as a dialog would,
// then classic.PostToolUse when the person approved, or resolves with a deny when they did not.
import { expect, mock, test } from 'claude-code/testing'

const ROOT = '/repo'
const FILE = '/repo/.claude/settings.local.json'
const RULE = 'Bash(./mvnw test:*)'
const NOW = Date.parse('2026-10-08T12:00:00Z')
const SUGGESTIONS = [{ type: 'addRules', behavior: 'allow', destination: 'localSettings', rules: [{ toolName: 'Bash', ruleContent: './mvnw test:*' }] }]

type World = {
  files: Record<string, string>
  store: Record<string, unknown>
  toasts: string[]
  notices: string[]
  asked: { question: string; options: string[] }[]
  fills: string[]
  logs: string[]
  closed: string[]
  answer: string
}

function engine($, on, world: World, approve: (command: string) => boolean, decided?: object, env: Record<string, string> = {}) {
  const clock = mock.clock(on, { now: NOW })
  on('store.get', ($, e) => ({ value: world.store[e.key] }) as never)
  on('store.set', ($, e) => {
    world.store[e.key] = e.value
    return { value: undefined } as never
  })
  // Core's classic events: no settings hook configured, unless the test gives one's decision.
  on('classic.PermissionRequest', () => (decided ? { decision: decided } : {}) as never)
  on('classic.PostToolUse', () => ({}) as never)
  on('session.root', () => ({ value: ROOT }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
  on('env.get', ($, e) => ({ value: env[e.name] }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: JSON.parse(world.files[FILE] ?? '{}') }) as never)
  on('fs.exists', ($, e) => ({ value: e.path in world.files }) as never)
  on('fs.read', ($, e) => ({ value: world.files[e.path] }) as never)
  on('fs.write', ($, e) => {
    world.files[e.path] = e.text
    return { value: undefined } as never
  })
  on('ui.toast', ($, e) => (world.toasts.push(e.text), { value: undefined }) as never)
  on('ui.log', ($, e) => (world.logs.push(e.text), { value: undefined }) as never)
  on('ui.close', ($, e) => (world.closed.push(e.id), { value: undefined }) as never)
  on('prompt.fill', ($, e) => (world.fills.push(e.text), { isFilled: true, text: e.text, cursor: e.text.length }) as never)
  on('ui.notice', ($, e) => {
    if (e.text) world.notices.push(e.text)
    return { value: undefined } as never
  })
  on('ui.open', () => ({ value: { isPlaced: false } }) as never)
  on('tool.call', async (_, e) => {
    if (e.tool === 'AskUserQuestion') {
      const q = e.questions[0]
      const question = String(q.question)
      world.asked.push({ question, options: q.options.map((o: { label: string }) => o.label) })
      return { result: { questions: e.questions, answers: { [question]: world.answer } } } as never
    }
    const tool_input = { command: e.command }
    // The engine suggests a prefix rule for ./mvnw test only; other commands get their exact rule.
    const suggestions = e.command.startsWith('./mvnw test') ? SUGGESTIONS : []
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input, permission_suggestions: suggestions })
    if (!approve(e.command)) return { deny: "The user doesn't want to proceed with this tool use." } as never
    await $.classic.PostToolUse({ tool_name: 'Bash', tool_input, tool_response: { stdout: 'ok' }, tool_use_id: e.tool_use_id })
    return { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' } as never
  })
  return clock
}

const fresh = (): World => ({ files: {}, store: {}, toasts: [], notices: [], asked: [], fills: [], logs: [], closed: [], answer: 'Add' })
const start = ($: any, surface = 'terminal') => $.session.start({ cwd: ROOT, surface, isInteractive: true } as never)
const run = ($: any, args: string) => $.command.run({ command: 'allowlist', args, origin: { kind: 'composer' } } as never) as Promise<{ text?: string }>
const mount = ($: any, surface = 'terminal', bodyRows = 30) =>
  $.ui.mount({ plugin: 'allowlist-coach', surface, component: 'Pane', requestId: 'allowlist', props: { title: 'Allowlist', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} }, viewport: { columns: 102, rows: 30 } } as never)

test('five approvals offer the rule once, and Add writes settings.local.json', async ($, on) => {
  const world = fresh()
  world.files[FILE] = JSON.stringify({ permissions: { deny: ['Bash(rm:*)'] } })
  engine($, on, world, () => true)
  await start($)

  for (let i = 0; i < 6; i++) await $.tool.call({ tool: 'Bash', command: `./mvnw test -Dtest=T${i}` } as never)

  expect(world.notices[0]).toBe(`allowlist-coach: ●○○○○ 1/5 approvals · 4 more and /allowlist offers ${RULE}`)
  expect(world.notices[3]).toContain('●●●●○ 4/5')
  expect(world.toasts.filter(t => t.includes(RULE))).toHaveLength(1)
  expect(world.toasts[0]).toContain('5 times')

  const answer = await run($, `allow ${RULE}`)
  expect(world.asked[0]!.question).toContain(RULE)
  expect(world.asked[0]!.options).toEqual(['Add', 'Not now', 'Never offer it'])
  expect(answer.text).toContain('added')
  expect(JSON.parse(world.files[FILE]!)).toEqual({ permissions: { deny: ['Bash(rm:*)'], allow: [RULE] } })

  const listed = await run($, '')
  expect(listed.text).toContain(' 1 allowed')
})

test('a rule is named by its number, as the pane numbers it', async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true)
  await start($)
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)
  for (let i = 0; i < 2; i++) await $.tool.call({ tool: 'Bash', command: 'npm run lint' } as never)

  const listed = await run($, '')
  expect(listed.text).toContain(` 1 ready      ✓5 ✗0  ${RULE}`)
  expect(listed.text).toContain('Add one with: /allowlist allow 1')

  await run($, 'allow 1')
  expect(world.asked[0]!.question).toContain(RULE)
  expect(JSON.parse(world.files[FILE]!).permissions.allow).toEqual([RULE])

  // The ready rule is now allowed, so it moves down and the counting one is first.
  expect((await run($, 'dismiss 1')).text).toContain('will not be offered again')
  expect((await run($, '')).text).toContain('dismissed')
  expect((await run($, 'allow 9')).text).toContain('no rule 9 counted')
})

test('reset asks first, with Cancel first, and only Clear clears', async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true)
  await start($)
  for (let i = 0; i < 2; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)

  world.answer = 'Cancel'
  expect((await run($, 'reset')).text).toContain('nothing changed')
  expect(world.asked[0]!.options).toEqual(['Cancel', 'Clear'])
  expect(world.asked[0]!.question).toContain("Clear the counts of this project's rule?")
  expect((await run($, '')).text).toContain(RULE)

  world.answer = 'Clear'
  expect((await run($, 'reset')).text).toContain('counts cleared')
  expect((await run($, '')).text).toContain('no permission dialogs')
})

test('a refusal stops the offer and Not now writes nothing', async ($, on) => {
  const world = fresh()
  world.answer = 'Not now'
  let n = 0
  engine($, on, world, () => n++ !== 2)
  await start($)

  for (let i = 0; i < 8; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)

  expect(world.toasts).toHaveLength(0)
  expect(world.notices[world.notices.length - 1]).toContain('refused 1')
  const answer = await run($, `allow ${RULE}`)
  expect(answer.text).toContain('nothing changed')
  expect(FILE in world.files).toBe(false)
})

test('a dialog a classic hook answered is not counted', async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true, { behavior: 'allow' })
  await start($)
  await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)
  expect((await run($, '')).text).toContain('no permission dialogs')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the pane: numbered rules, the last call that asked, an allow button and the verbs on ${surface}`, async ($, on) => {
    const world = fresh()
    const clock = engine($, on, world, () => true)
    await start($, surface)
    for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test -pl core' } as never)
    await $.tool.call({ tool: 'Bash', command: 'npm run lint -- --fix' } as never)
    await clock.advance(12 * 60_000)

    const pane = await mount($, surface)
    const shown = JSON.stringify(await pane.drawn())
    expect(shown).toContain('Ready to allow')
    expect(shown).toContain(RULE)
    expect(shown).toContain('e.g. ./mvnw test -pl core · 12 min ago')
    expect(shown).toContain('●○○○○ 1/5')
    expect(shown).toContain(' 2 counting')

    await pane.press({ key: 'verb:reset' })
    expect(world.fills).toEqual(['/allowlist reset'])
    await pane.press({ key: 'verb:allow' })
    expect(world.fills.at(-1)).toBe('/allowlist allow [number]')
    await pane.press({ key: 'verb:help' })
    expect(world.logs[0]).toBe('/allowlist             open the pane')
    expect(world.asked).toHaveLength(0)

    await pane.press({ key: 'allow-1' })
    expect(world.asked).toHaveLength(1)
    expect(JSON.parse(world.files[FILE]!).permissions.allow).toEqual([RULE])

    await pane.press({ key: 'close' })
    expect(world.closed).toEqual(['allowlist'])
    await pane.unmount()
  })
}

test('the pane says how many rules did not fit', async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true)
  await start($)
  for (let i = 0; i < 12; i++) await $.tool.call({ tool: 'Bash', command: `make target${i}` } as never)
  const pane = await mount($, 'terminal', 20)
  // 20 rows: 9 for the rest of the pane, then two rows a rule.
  expect(JSON.stringify(await pane.drawn())).toContain('+7 rules that did not fit the pane')
  await pane.unmount()
})

test('Portuguese from LANG: the dialog line, the questions and the pane', async ($, on) => {
  const world = fresh()
  world.answer = 'Adicionar'
  engine($, on, world, () => true, undefined, { LANG: 'pt_BR.UTF-8' })
  await start($)
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)

  expect(world.notices[2]).toBe(`allowlist-coach: ●●●○○ 3/5 aprovações · faltam 2 para /allowlist oferecer ${RULE}`)
  expect(world.toasts[0]).toContain('Você aprovou')
  const pane = await mount($)
  const shown = JSON.stringify(await pane.drawn())
  expect(shown).toContain('Prontas para liberar')
  expect(shown).toContain('liberar')
  expect(shown).toContain('Fechar')
  await pane.press({ key: 'allow-1' })
  expect(world.asked[0]!.options).toEqual(['Adicionar', 'Agora não', 'Nunca oferecer'])
  expect(JSON.parse(world.files[FILE]!).permissions.allow).toEqual([RULE])
  await pane.unmount()
})
