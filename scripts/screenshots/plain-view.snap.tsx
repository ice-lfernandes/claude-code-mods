import { test } from 'claude-code/testing'
const NOW = Date.parse('2026-10-09T12:00:00Z')
const TASKS = ['Pick the page style and layout', 'Check how the page gets live weather', 'Build the weather dashboard', 'Publish it and share the link']
test('snap', { options: { enabled: true, language: 'en', icons: 'symbol' } }, async ($, on) => {
  let now = NOW
  let id = 0
  on('clock.now', () => ({ value: now }) as never)
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark' }] }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', () => ({ cwd: '/repo' }) as never)
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }) as never)
  on('turn.complete', () => ({ text: 'done' }) as never)
  on('tool.call', ($: any, e: any) => (e.tool === 'TaskCreate' ? { result: { task: { id: String(++id) } }, text: 'ok' } : { result: 'ok', text: 'ok' }) as never)
  on('ui.render', ($, e) => $.ui.resolve(e).Box({ key: 'engine' }) as never)
  const band = async () => {
    const ui = await $.ui.mount({ plugin: 'plain-view', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 110, hasSurvey: false, isWorking: true, maxRows: 20 }, viewport: { columns: 110, rows: 40 } } as never)
    console.log('BAND', JSON.stringify(await ui.drawn()))
    await ui.unmount()
  }
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.turn.start({ text: 'Build a weather dashboard for New York City.', turnId: 't1' } as never)
  for (const subject of TASKS) await $.tool.call({ tool: 'TaskCreate', subject, description: subject } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' } as never)
  for (const f of ['index.html', 'style.css', 'layout.md', 'theme.json', 'fonts.css']) await $.tool.call({ tool: 'Read', file_path: `/repo/${f}` } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' } as never)
  await $.tool.call({ tool: 'WebFetch', url: 'https://api.open-meteo.com/v1/forecast', prompt: 'x' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/weather.ts' } as never)
  now += 11_000
  await band()
  await $.tool.call({ tool: 'Write', file_path: '/repo/src/Dashboard.tsx' } as never)
  for (const taskId of ['2', '3', '4']) await $.tool.call({ tool: 'TaskUpdate', taskId, status: 'completed' } as never)
  now += 96_000
  await $.turn.complete({ answer: 'ok', durationMs: 107_000, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await band()
  const out = await $.ui.mount({ plugin: 'plain-view', surface: 'terminal', component: 'CommandOutput', props: { command: 'plain-view', args: 'palette', text: '', isErrored: false }, viewport: { columns: 110, rows: 40 } } as never)
  console.log('TREE', JSON.stringify(await out.drawn()))
})
