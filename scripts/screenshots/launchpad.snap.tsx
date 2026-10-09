import { mock, test } from 'claude-code/testing'
test('snap', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2026-10-08T12:00:00Z') })
  // Beneath the mod: the engine's hint on its line, nothing elsewhere.
  on('ui.render', ($, e: any) => (e.component === 'PromptHint' ? { type: 'Text', props: { dimColor: true }, children: ['? for shortcuts'] } : { type: 'Box', children: [] }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 74 }] } }) as never)
  on('config.list', () => ({ value: [] }) as never)
  on('command.run', ($, e: any, next: any) => (e.command === 'model' || e.command === 'effort' ? { text: '' } : next(e)) as never)
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' }
  } as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
  on('session.messages', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('command.list', () => ({ value: [...['compact', 'context', 'resume', 'memory', 'model', 'effort', 'help', 'pad'].map(name => ({ name, description: '', source: 'builtin' })), ...[['limits', 'limits-meter'], ['watch', 'agent-watch'], ['test-hud', 'test-hud']].map(([name, plugin]) => ({ name, description: '', source: 'plugin', plugin }))] }) as never)
  on('env.get', ($, e: any) => ({ value: ({ HOME: '/home/ana', LANG: 'pt_BR.UTF-8' } as Record<string, string>)[e.name] }) as never)
  on('fs.list', () => ({ deny: 'ENOENT' }) as never)
  on('fs.read', () => ({ deny: 'ENOENT' }) as never)
  on('prompt.fill', ($, e: any) => (console.log('FILL', e.text), { isFilled: true, text: e.text, cursor: 0 }) as never)
  await $.session.start({ cwd: '/home/ana/relatorios', surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ plugin: 'launchpad', surface: 'terminal', component: 'CommandOutput', props: { command: 'pad', args: '', text: 'Menu de atalhos do launchpad.', isErrored: false }, viewport: { columns: 78, rows: 40 } } as never)
  console.log('MENU', JSON.stringify(await ui.drawn()))
  await ui.press({ key: 'pad:explore' })
  // /pad place prompt: the same buttons in a row right above the prompt; ◆ pad on the hint line.
  await $.command.run({ command: 'pad', args: 'place prompt' } as never)
  const band = await $.ui.mount({ plugin: 'launchpad', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 78, hasSurvey: false }, viewport: { columns: 78, rows: 40 } } as never)
  console.log('BAND', JSON.stringify(await band.drawn()))
  const hint = await $.ui.mount({ plugin: 'launchpad', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' }, viewport: { columns: 78, rows: 40 } } as never)
  console.log('TREE', JSON.stringify(await hint.drawn()))
  // ◆ pad: the control panel, after a request on opus at high effort, with the 5-hour window at 74%.
  const step = ($ as any).turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 3 })
  for await (const _ of step) {
    // drain
  }
  const panel = await $.ui.mount({ plugin: 'launchpad', surface: 'terminal', component: 'Pane', requestId: 'launchpad-panel', props: { title: 'Painel', isFocused: true, bodyColumns: 76, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }, viewport: { columns: 78, rows: 40 } } as never)
  console.log('PANE', JSON.stringify(await panel.drawn()))
  // /pad place pane: the card's tiles in a pane of its own.
  await $.command.run({ command: 'pad', args: 'place pane' } as never)
  const pane = await $.ui.mount({ plugin: 'launchpad', surface: 'terminal', component: 'Pane', requestId: 'launchpad-menu', props: { title: 'Atalhos', isFocused: true, bodyColumns: 76, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} }, viewport: { columns: 78, rows: 40 } } as never)
  console.log('PANE', JSON.stringify(await pane.drawn()))
})
