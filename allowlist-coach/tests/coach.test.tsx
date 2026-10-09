// The engine beneath is a stub: a Bash call raises classic.PermissionRequest as a dialog would,
// then classic.PostToolUse when the person approved, or resolves with a deny when they did not.
import { expect, mock, test } from 'claude-code/testing'

const ROOT = '/repo'
const FILE = '/repo/.claude/settings.local.json'
const RULE = 'Bash(./mvnw test:*)'
const NOW = Date.parse('2026-10-08T12:00:00Z')
const SHARED = '/repo/.claude/settings.json'
const ADD = 'Add to settings.local.json (just you)'
const OPTIONS = ['Not now', ADD, 'Add to settings.json (the whole team)', 'Never offer it']
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

const fresh = (): World => ({ files: {}, store: {}, toasts: [], notices: [], asked: [], fills: [], logs: [], closed: [], answer: ADD })
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
  expect(world.asked[0]!.question).toContain(`The line it adds to permissions.allow: "${RULE}"`)
  expect(world.asked[0]!.options).toEqual(OPTIONS)
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

test('a refusal stops the offer, and allow then refuses the rule', async ($, on) => {
  const world = fresh()
  let n = 0
  engine($, on, world, () => n++ !== 2)
  await start($)

  for (let i = 0; i < 8; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)

  expect(world.toasts).toHaveLength(0)
  expect(world.notices[world.notices.length - 1]).toContain('refused 1')
  const answer = await run($, `allow ${RULE}`)
  expect(answer.text).toContain('is refused; the coach does not add it')
  expect(world.asked).toHaveLength(0)
  expect(FILE in world.files).toBe(false)
})

test('Not now, the first answer, writes nothing', async ($, on) => {
  const world = fresh()
  world.answer = 'Not now'
  engine($, on, world, () => true)
  await start($)
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)

  const answer = await run($, `allow ${RULE}`)
  expect(world.asked[0]!.options[0]).toBe('Not now')
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
    expect(shown).toContain('▸ all 2')
    expect(shown).toContain('ready 1')
    expect(shown).toContain(RULE)
    expect(shown).toContain('e.g. ./mvnw test -pl core · 12 min ago')
    expect(shown).toContain('●○○○○ 1/5')
    expect(shown).toContain('counting  ')

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

test('the list scrolls: buttons, the wheel and the range it shows', async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true)
  await start($)
  for (let i = 0; i < 12; i++) await $.tool.call({ tool: 'Bash', command: `make target${i}` } as never)
  const pane = await mount($, 'terminal', 20)
  // 20 rows: 11 for the rest of the pane, then two rows a rule: 4 rules.
  expect(JSON.stringify(await pane.drawn())).toContain('1–4 of 12')
  await pane.press({ key: 'list:down' })
  expect(JSON.stringify(await pane.drawn())).toContain('4–7 of 12')
  await ($ as any).ui.scroll({ component: 'Pane', requestId: 'allowlist', by: 100 })
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('9–12 of 12')
  expect(drawn).toContain('Bash(make target11)')
  await pane.unmount()
})

test('tabs and the filter narrow the list; numbers stay those of the whole list', async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true)
  await start($)
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm run lint' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm run build' } as never)
  const pane = await mount($)
  await pane.press({ key: 'tab:counting' })
  let drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('▸ counting 2')
  expect(drawn).not.toContain(RULE)
  expect(drawn).toContain('Bash(npm run lint)')
  await pane.press({ key: 'tab:all' })
  await pane.input({ key: 'filter', kind: 'change', text: 'LINT' })
  drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('Bash(npm run lint)')
  expect(drawn).not.toContain('Bash(npm run build)')
  expect(drawn).not.toContain(RULE)
  await pane.press({ key: 'tab:refused' })
  expect(JSON.stringify(await pane.drawn())).toContain('No rule matches.')
  await pane.unmount()
})

test('a risky rule says why it is never offered', async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'rm -rf build' } as never)
  const pane = await mount($)
  const drawn = JSON.stringify(await pane.drawn())
  expect(drawn).toContain('risky')
  expect(drawn).toContain('(runs rm)')
  expect(drawn).not.toContain('allow-1')
  await pane.unmount()
})

test('the shared settings.json, and remove takes the rule back out after asking', async ($, on) => {
  const world = fresh()
  world.files[SHARED] = JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] } })
  engine($, on, world, () => true)
  await start($)
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)

  world.answer = 'Add to settings.json (the whole team)'
  expect((await run($, 'allow 1')).text).toBe(`allowlist-coach: added ${RULE} to permissions.allow in .claude/settings.json.`)
  expect(JSON.parse(world.files[SHARED]!).permissions.allow).toEqual(['Bash(ls:*)', RULE])
  expect(FILE in world.files).toBe(false)

  const pane = await mount($)
  expect(JSON.stringify(await pane.drawn())).toContain('remove from allow')
  world.answer = 'Cancel'
  await pane.press({ key: 'remove-1' })
  expect(world.asked.at(-1)!.options).toEqual(['Cancel', 'Remove'])
  expect(JSON.parse(world.files[SHARED]!).permissions.allow).toEqual(['Bash(ls:*)', RULE])
  await pane.unmount()

  world.answer = 'Remove'
  expect((await run($, 'remove 1')).text).toContain('removed')
  expect(JSON.parse(world.files[SHARED]!).permissions.allow).toEqual(['Bash(ls:*)'])
  expect((await run($, '')).text).toContain('dismissed')
})

test('remove refuses a rule the coach did not add', async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true)
  await start($)
  await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)
  expect((await run($, 'remove 1')).text).toContain('did not add')
  expect(world.asked).toHaveLength(0)
})

test('reset <n> sets one rule back to zero, after asking', async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true)
  await start($)
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm run lint' } as never)

  world.answer = 'Cancel'
  expect((await run($, 'reset 1')).text).toContain('nothing changed')
  world.answer = 'Reset'
  const pane = await mount($)
  await pane.press({ key: 'zero-1' })
  expect(world.asked.at(-1)!.question).toBe(`Reset the count of ${RULE} (3 approvals, 0 refusals)?`)
  expect(world.toasts.at(-1)).toBe(`allowlist-coach: count of ${RULE} reset.`)
  expect(JSON.stringify(await pane.drawn())).toContain('○○○○○ 0/5')
  await pane.unmount()
  expect((await run($, '')).text).toContain('Bash(npm run lint)')
})

test('allow by number refuses a risky, refused or pinned rule, and asks nothing', async ($, on) => {
  const world = fresh()
  world.files[FILE] = JSON.stringify({ permissions: { ask: ['Bash(npm run deploy)'] } })
  engine($, on, world, command => command !== 'npm run lint')
  await start($)
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'node *.mjs' } as never)
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'npm run lint' } as never)
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'npm run deploy' } as never)

  expect((await run($, 'allow Bash(node *.mjs)')).text).toBe(
    'allowlist-coach: Bash(node *.mjs) is risky (runs node *); the coach does not add it. Add it to permissions.allow by hand if you mean it.',
  )
  expect((await run($, 'allow Bash(npm run lint)')).text).toContain('is refused; the coach does not add it')
  expect((await run($, 'allow Bash(npm run deploy)')).text).toContain('is pinned; the coach does not add it')
  for (let n = 1; n <= 3; n++) expect((await run($, `allow ${n}`)).text).toContain('the coach does not add it')
  expect(world.asked).toHaveLength(0)
  expect(JSON.parse(world.files[FILE]!).permissions.allow).toBeUndefined()
})

test('a call that carries a credential is not counted, so it is never stored', async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true)
  await start($)
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'curl -H "Authorization: Bearer abcdefgh123" https://api.x' } as never)
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'PGPASSWORD=hunter2 psql -c "select 1"' } as never)

  expect(world.notices).toHaveLength(0)
  expect(world.toasts).toHaveLength(0)
  expect((await run($, '')).text).toContain('no permission dialogs')
  expect(JSON.stringify(world.store)).not.toContain('hunter2')
  expect(JSON.stringify(world.store)).not.toContain('abcdefgh123')
})

test('allow writes no settings file that is a link', async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true)
  // The project's settings.local.json is a link to the person's own settings.
  on('fs.stat', ($, e) => {
    if (e.path === ROOT) return { value: { kind: 'dir', size: 0, mtimeMs: NOW, isLink: false, realPath: ROOT } } as never
    if (e.path === `${ROOT}/.claude`) return { value: { kind: 'dir', size: 0, mtimeMs: NOW, isLink: false, realPath: `${ROOT}/.claude` } } as never
    if (e.path === FILE) return { value: { kind: 'file', size: 2, mtimeMs: NOW, isLink: true, realPath: '/home/u/.claude/settings.json' } } as never
    throw new Error('ENOENT')
  })
  await start($)
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)

  const answer = await run($, `allow ${RULE}`)
  expect(answer.text).toBe('allowlist-coach: .claude/settings.local.json left as it was: .claude/settings.local.json is a link or not a file; the coach writes only a plain file')
  expect(FILE in world.files).toBe(false)
})

test('the threshold option sets how many approvals an offer takes', { options: { threshold: 3 } }, async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true)
  await start($)
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)
  expect(world.notices[0]).toContain('●○○ 1/3')
  expect(world.toasts.filter(t => t.includes(RULE))).toHaveLength(1)
  const pane = await mount($)
  expect(JSON.stringify(await pane.drawn())).toContain('after 3 approvals')
  await pane.unmount()
})

test('Portuguese from LANG: the dialog line, the questions and the pane', async ($, on) => {
  const world = fresh()
  world.answer = 'Adicionar ao settings.local.json (só você)'
  engine($, on, world, () => true, undefined, { LANG: 'pt_BR.UTF-8' })
  await start($)
  for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)

  expect(world.notices[2]).toBe(`allowlist-coach: ●●●○○ 3/5 aprovações · faltam 2 para /allowlist oferecer ${RULE}`)
  expect(world.toasts[0]).toContain('Você aprovou')
  const pane = await mount($)
  const shown = JSON.stringify(await pane.drawn())
  expect(shown).toContain('prontas 1')
  expect(shown).toContain('liberar')
  expect(shown).toContain('Fechar')
  await pane.press({ key: 'allow-1' })
  expect(world.asked[0]!.options).toEqual(['Agora não', 'Adicionar ao settings.local.json (só você)', 'Adicionar ao settings.json (o time todo)', 'Nunca oferecer'])
  expect(JSON.parse(world.files[FILE]!).permissions.allow).toEqual([RULE])
  await pane.unmount()
})
