import { mock, test } from 'claude-code/testing'
const ROOT = '/repo'
test('snap', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-08T12:00:00Z') })
  const store: Record<string, unknown> = {}
  let refuse = new Set<number>()
  let n = 0
  on('store.get', (_$, e: any) => ({ value: store[e.key] }) as never)
  on('store.set', (_$, e: any) => ((store[e.key] = e.value), { value: undefined }) as never)
  on('classic.PermissionRequest', () => ({}) as never)
  on('classic.PostToolUse', () => ({}) as never)
  on('session.root', () => ({ value: ROOT }) as never)
  on('session.start', (_$, e: any) => ({ cwd: e.cwd }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: {} }) as never)
  on('fs.exists', () => ({ value: false }) as never)
  on('ui.toast', (_$, e: any) => (console.log('TOAST', e.text), { value: undefined }) as never)
  on('ui.notice', (_$, e: any) => (e.text && console.log('NOTICE', e.text), { value: undefined }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('tool.call', async (_, e: any) => {
    const sugg = e.command.startsWith('./mvnw test') ? [{ type: 'addRules', behavior: 'allow', destination: 'localSettings', rules: [{ toolName: 'Bash', ruleContent: './mvnw test:*' }] }] : []
    const tool_input = { command: e.command }
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input, permission_suggestions: sugg } as never)
    if (refuse.has(n++)) return { deny: 'no' } as never
    await $.classic.PostToolUse({ tool_name: 'Bash', tool_input, tool_response: { stdout: 'ok' }, tool_use_id: e.tool_use_id } as never)
    return { result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' } as never
  })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true } as never)
  for (let i = 0; i < 14; i++) await $.tool.call({ tool: 'Bash', command: `./mvnw test -Dtest=T${i}` } as never)
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: 'npm run lint' } as never)
  refuse = new Set([n + 2]); for (let i = 0; i < 7; i++) await $.tool.call({ tool: 'Bash', command: 'docker compose up -d' } as never)
  for (let i = 0; i < 9; i++) await $.tool.call({ tool: 'Bash', command: 'rm -rf target' } as never)
  await clock.advance(12 * 60_000)
  const pane = await $.ui.mount({ plugin: 'allowlist-coach', surface: 'terminal', component: 'Pane', requestId: 'allowlist', props: { title: 'Allowlist coach', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} }, viewport: { columns: 92, rows: 30 } } as never)
  console.log('PANE', JSON.stringify(await pane.drawn()))
})
