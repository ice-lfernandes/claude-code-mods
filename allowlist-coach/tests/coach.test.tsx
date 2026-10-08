// The engine beneath is a stub: a Bash call raises classic.PermissionRequest as a dialog would,
// then classic.PostToolUse when the person approved, or resolves with a deny when they did not.
import { expect, test } from 'claude-code/testing'

const ROOT = '/repo'
const FILE = '/repo/.claude/settings.local.json'
const RULE = 'Bash(./mvnw test:*)'
const SUGGESTIONS = [{ type: 'addRules', behavior: 'allow', destination: 'localSettings', rules: [{ toolName: 'Bash', ruleContent: './mvnw test:*' }] }]

type World = { files: Record<string, string>; store: Record<string, unknown>; toasts: string[]; notices: string[]; asked: string[]; answer: string }

function engine($, on, world: World, approve: (command: string) => boolean, decided?: object) {
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
  on('command.register', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: JSON.parse(world.files[FILE] ?? '{}') }) as never)
  on('fs.exists', ($, e) => ({ value: e.path in world.files }) as never)
  on('fs.read', ($, e) => ({ value: world.files[e.path] }) as never)
  on('fs.write', ($, e) => {
    world.files[e.path] = e.text
    return { value: undefined } as never
  })
  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)
    return { value: undefined } as never
  })
  on('ui.notice', ($, e) => {
    if (e.text) world.notices.push(e.text)
    return { value: undefined } as never
  })
  on('ui.open', () => ({ value: { isPlaced: false } }) as never)
  on('tool.call', async (_, e) => {
    if (e.tool === 'AskUserQuestion') {
      const question = String(e.questions[0].question)
      world.asked.push(question)
      return { result: { questions: e.questions, answers: { [question]: world.answer } } } as never
    }
    const tool_input = { command: e.command }
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input, permission_suggestions: SUGGESTIONS })
    if (!approve(e.command)) return { deny: "The user doesn't want to proceed with this tool use." } as never
    await $.classic.PostToolUse({ tool_name: 'Bash', tool_input, tool_response: { stdout: 'ok' }, tool_use_id: e.tool_use_id })
    return { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' } as never
  })
}

const fresh = (): World => ({ files: {}, store: {}, toasts: [], notices: [], asked: [], answer: 'Add' })

test('five approvals offer the rule once, and Add writes settings.local.json', async ($, on) => {
  const world = fresh()
  world.files[FILE] = JSON.stringify({ permissions: { deny: ['Bash(rm:*)'] } })
  engine($, on, world, () => true)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)

  for (let i = 0; i < 6; i++) await $.tool.call({ tool: 'Bash', command: `./mvnw test -Dtest=T${i}` } as never)

  expect(world.notices[0]).toContain('approved 1 time here; 4 more')
  expect(world.toasts.filter(t => t.includes(RULE))).toHaveLength(1)
  expect(world.toasts[0]).toContain('5 times')

  const answer = await $.command.run({ command: 'allowlist', args: `allow ${RULE}`, origin: { kind: 'composer' } } as never)
  expect(world.asked[0]).toContain(RULE)
  expect(answer.text).toContain('added')
  expect(JSON.parse(world.files[FILE]!)).toEqual({ permissions: { deny: ['Bash(rm:*)'], allow: [RULE] } })

  const listed = await $.command.run({ command: 'allowlist', args: '', origin: { kind: 'composer' } } as never)
  expect(listed.text).toContain('allowed')
})

test('a refusal stops the offer and Not now writes nothing', async ($, on) => {
  const world = fresh()
  world.answer = 'Not now'
  let n = 0
  engine($, on, world, () => n++ !== 2)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)

  for (let i = 0; i < 8; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)

  expect(world.toasts).toHaveLength(0)
  expect(world.notices[world.notices.length - 1]).toContain('refused 1')
  const answer = await $.command.run({ command: 'allowlist', args: `allow ${RULE}`, origin: { kind: 'composer' } } as never)
  expect(answer.text).toContain('nothing changed')
  expect(FILE in world.files).toBe(false)
})

test('a dialog a classic hook answered is not counted', async ($, on) => {
  const world = fresh()
  engine($, on, world, () => true, { behavior: 'allow' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)
  const listed = await $.command.run({ command: 'allowlist', args: '', origin: { kind: 'composer' } } as never)
  expect(listed.text).toContain('no permission dialogs')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the pane lists ready rules with an allow button on ${surface}`, async ($, on) => {
    const world = fresh()
    engine($, on, world, () => true)
    await $.session.start({ cwd: ROOT, surface, isInteractive: true } as never)
    for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: './mvnw test' } as never)

    const pane = await $.ui.mount({ plugin: 'allowlist-coach', surface, component: 'Pane', requestId: 'allowlist', props: { title: 'Allowlist coach', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} }, viewport: { columns: 102, rows: 30 } } as never)
    const shown = JSON.stringify(await pane.drawn())
    expect(shown).toContain('Ready to allow')
    expect(shown).toContain(RULE)
    await pane.press({ key: 'allow-0' })
    expect(world.asked).toHaveLength(1)
    expect(JSON.parse(world.files[FILE]!).permissions.allow).toEqual([RULE])
    await pane.unmount()
  })
}
