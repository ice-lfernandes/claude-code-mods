import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// A5 (prototype buttons-quiet-a5-a7, variant B): the Buttons of a tree, with the props the variant lives in.
const buttonsOf = (tree: unknown) =>
  [...JSON.stringify(tree).matchAll(/"type":"Button","props":(\{[^{}]*\})/g)].map(m => JSON.parse(m[1]!) as { key: string; variant?: string; plain?: boolean })
const variantOf = (tree: unknown, key: string) => buttonsOf(tree).find(b => b.key === key)?.variant

// /pad's own output row, as the transcript hands it to the hook.
const ROW = { command: 'pad', args: '', text: 'Menu de atalhos do launchpad.', isErrored: false }
const COMMANDS = [
  { name: 'compact', description: 'Clear history but keep a summary', source: 'builtin' },
  { name: 'context', description: 'Show context usage', source: 'builtin' },
  { name: 'cost', description: 'Show the session cost', source: 'builtin' },
  { name: 'code-review', description: 'Review the diff', source: 'plugin' },
  { name: 'pad', description: 'Shortcuts', source: 'plugin' },
]
const PROJECT = JSON.stringify({
  buttons: [
    { icon: '🧾', label: 'Fechamento', text: '/cost' },
    { label: 'Texto livre', text: 'Feche o mês' },
  ],
})
const AGENT_FILE = '---\nname: revisor\ndescription: Revisa textos\n---\nVocê revisa.'

type World = {
  fills: { text: string; decorations?: unknown }[]
  commands: string[]
  opened: string[]
  closed: string[]
  toasts: string[]
  logs: string[]
  /** What the engine's dialog asked, and the answer it gives next (null: dismissed). */
  asked: { question: string; options: string[] }[]
  answer: string | null
}

const world = (
  on: On,
  files: Record<string, string> = {},
  env: Record<string, string> = { HOME: '/home/ana', LANG: 'pt_BR.UTF-8' },
  commands: object[] = COMMANDS,
  beneath?: string,
  engine: { model?: string; fiveHour?: number; rows?: object[] } = {},
): World => {
  const w: World = { fills: [], commands: [], opened: [], closed: [], toasts: [], logs: [], asked: [], answer: null }
  mock.store(on)
  mock.clock(on, { now: Date.parse('2026-10-08T12:00:00Z') })
  // The drawing beneath the plugin: empty, as when nothing else draws there, or the engine's hint
  // with another mod's row.
  on('ui.render', () => ({ type: 'Box', children: beneath ? [{ type: 'Text', children: [beneath] }] : [] }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
  on('session.messages', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('command.list', () => ({ value: commands }) as never)
  on('command.describe', ($, e: any) => ({ description: e.description, argumentHint: e.argumentHint, isHidden: false }) as never)
  on('env.get', ($, e: any) => ({ value: env[e.name] }) as never)
  on('fs.list', ($, e: any) => (e.path === '/repo/.claude/agents' ? { value: [{ name: 'revisor.md', kind: 'file', size: 1, mtimeMs: 0 }] } : { deny: 'ENOENT' }) as never)
  on('fs.read', ($, e: any) => (e.path in files ? { value: files[e.path] } : { deny: 'ENOENT' }) as never)
  on('prompt.fill', ($, e: any) => (w.fills.push({ text: e.text, decorations: e.decorations }), { isFilled: true, text: e.text, cursor: e.text.length }) as never)
  on('command.run', ($, e: any) => (w.commands.push(e.args ? `${e.command} ${e.args}` : e.command), { text: '' }) as never)
  on('session.model', () => ({ value: engine.model ?? 'claude-opus-5-5' }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: engine.fiveHour == null ? [] : [{ kind: 'five_hour', percentUsed: engine.fiveHour }] } }) as never)
  on('config.list', () => ({ value: engine.rows ?? [] }) as never)
  on('tool.call', (_$, e: any) => {
    const q = e.questions[0]
    w.asked.push({ question: String(q.question), options: q.options.map((o: { label: string }) => o.label) })
    if (w.answer === null) return { deny: 'dismissed' } as never
    return { result: { questions: e.questions, answers: { [q.question]: w.answer } } } as never
  })
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' }
  } as never)
  on('ui.open', ($, e: any) => (w.opened.push(e.id), { value: { isPlaced: true } }) as never)
  on('ui.close', ($, e: any) => (w.closed.push(e.id), { value: undefined }) as never)
  on('ui.toast', ($, e: any) => (w.toasts.push(e.text), { value: undefined }) as never)
  on('ui.log', ($, e: any) => (w.logs.push(e.text), { value: undefined }) as never)
  return w
}

const files = { '/repo/.claude/agents/revisor.md': AGENT_FILE }
const start = ($: any) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
const pad = ($: any, args: string) => $.command.run({ command: 'pad', args } as never) as Promise<{ text?: string }>
const row = ($: any, surface = 'terminal', props: object = ROW) =>
  $.ui.mount({ plugin: 'launchpad', surface, component: 'CommandOutput', props, viewport: { columns: 102, rows: 40 } } as never)
const pane = ($: any, surface = 'terminal', bodyRows = 40) =>
  $.ui.mount({ plugin: 'launchpad', surface, component: 'Pane', requestId: 'launchpad', props: { title: 'Launchpad', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} }, viewport: { columns: 102, rows: 40 } } as never)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`welcome menu: only installed commands and agents, and presses, on ${surface}`, async ($, on) => {
    const w = world(on)
    await start($)
    expect((await pad($, '')).text).toBe('Menu de atalhos do launchpad.')
    const ui = await row($, surface)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('O que você quer fazer?')
    expect(drawn).toContain('📦 Compactar conversa')
    expect(drawn).toContain('📊 Ver contexto')
    expect(drawn).toContain('🔍 Explorar código')
    expect(drawn).not.toContain('Ver limites') // /limits is not installed in this session
    expect(drawn).not.toContain('Ajuda') // nor /help

    await ui.press({ key: 'pad:compact' })
    expect(w.commands).toEqual(['compact'])

    await ui.press({ key: 'pad:explore' })
    expect(w.fills).toEqual([{ text: 'Use o agente Explore para [tarefa]', decorations: [{ start: 26, end: 34, bold: true, underline: true }] }])
    await ui.unmount()
  })
}

test('the terminal card frames bordered tiles in columns that fit', async ($, on) => {
  world(on)
  await start($)
  const ui = await row($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('"borderColor":"claude"')
  expect(drawn).toContain('"key":"tile:compact"')
  expect(drawn).toContain('"hover":{"borderColor":"claude","borderDimColor":false,"backgroundColor":"claude"}')
  expect(drawn).toContain('"hover":{"color":"inverseText","bold":true}')
  expect(drawn).toContain('"label":" 📦 Compactar conversa "') // 23 cells: 26 less the gap and the two borders
  expect(drawn).toContain('"key":"row:0"')
  expect(drawn).not.toContain('"key":"row:1"') // 3 tiles of 26 cells fit in 98
  await ui.unmount()
})

test('other /pad rows and other commands stay text', async ($, on) => {
  world(on)
  await start($)
  for (const props of [{ ...ROW, args: 'list', text: '1. x' }, { ...ROW, command: 'compact', text: 'ok' }, { ...ROW, isErrored: true }]) {
    const ui = await row($, 'terminal', props)
    expect(JSON.stringify(await ui.drawn())).not.toContain('pad:compact')
    await ui.unmount()
  }
})

test('/pad add takes only installed commands, skills and agents, up to 8 that work', async ($, on) => {
  world(on, files)
  await start($)
  expect((await pad($, 'add Planilha | Converta [arquivo] em xlsx')).text).toContain('/pad add')
  expect((await pad($, 'add Nada | /nada')).text).toBe('/nada não está instalado nesta sessão. /pad configuration mostra o que está.')
  expect((await pad($, 'add Ninguém | @ninguem')).text).toContain('@ninguem não está instalado')
  expect((await pad($, 'add 🔎 Revisão | /code-review')).text).toBe('Atalho 4 criado: 🔎 Revisão.')
  expect((await pad($, 'add Revisor | @revisor')).text).toBe('Atalho 5 criado: 🤖 Revisor.')
  expect((await pad($, 'add Revisão de novo | /code-review')).text).toBe('/code-review já está no menu.')
  // 3 defaults work here; the 5 others (/limits, /help, ...) are kept and take no place.
  for (const add of ['Custo | /cost', 'Plano | @Plan', 'Geral | @general-purpose']) expect((await pad($, `add ${add}`)).text).toContain('criado')
  expect((await pad($, 'add Foco | /compact focus')).text).toBe('O menu já tem 8 atalhos. Tire um com /pad remove ou no painel.')

  const list = (await pad($, 'list')).text ?? ''
  expect(list).toContain('1. 📦 Compactar conversa  /compact  (comando, padrão)')
  expect(list).toContain('5. 🤖 Revisor  @revisor  (agente, seu)')
  expect((await pad($, 'remove 1')).text).toBe('Atalho removido: Compactar conversa.')
  expect((await pad($, 'remove 9')).text).toContain('Não existe atalho 9')
  expect((await pad($, 'reset')).text).toBe('Atalhos de volta aos padrões.')
  expect((await pad($, 'list')).text).toContain('1. 📦 Compactar conversa')
  expect((await pad($, 'ajuda')).text).toContain('/pad configuration')
})

test('/pad configuration opens the pane: order, remove, filter and add', async ($, on) => {
  const w = world(on, files)
  await start($)
  expect((await pad($, 'configuration')).text).toBeUndefined()
  expect(w.opened).toEqual(['launchpad'])

  const ui = await pane($)
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('No menu (3/8)')
  expect(drawn).toContain('/limits (não instalado)')
  expect(drawn).toContain('add:command:cost')
  expect(drawn).toContain('add:agent:revisor')
  expect(drawn).toContain('add:agent:Plan')
  expect(drawn).not.toContain('add:command:pad')
  expect(drawn).not.toContain('add:command:compact') // already in the menu

  await ui.press({ key: 'remove:limits' })
  await ui.press({ key: 'down:compact' })
  await ui.input({ key: 'filter', kind: 'change', text: 'review' })
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('add:command:code-review')
  expect(drawn).not.toContain('add:command:cost')
  await ui.press({ key: 'add:command:code-review' })
  expect(JSON.stringify(await ui.drawn())).toContain('No menu (4/8)')

  const list = (await pad($, 'list')).text ?? ''
  expect(list.split('\n').map(l => l.split('  ')[1])).toEqual(['/context', '/compact', '@Explore', '/code-review'])

  const config5 = await ui.drawn()
  expect(variantOf(config5, 'reset')).toBe('secondary')
  expect(variantOf(config5, 'close')).toBe('secondary')
  expect(buttonsOf(config5).filter(b => b.variant === 'primary')).toHaveLength(0) // no decision: shortcuts are peers
  await ui.press({ key: 'close' })
  expect(w.closed).toEqual(['launchpad'])
  await ui.unmount()
})

test('project buttons only fill the prompt, and cannot be removed here', async ($, on) => {
  const w = world(on, { '/repo/.claude/launchpad.json': PROJECT })
  await start($)
  await pad($, 'reset')
  const ui = await row($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('🧾 Fechamento')
  expect(drawn).not.toContain('Texto livre')
  await ui.press({ key: 'pad:project:0' })
  expect(w.fills.map(f => f.text)).toEqual(['/cost'])
  expect(w.commands).toEqual([])
  await ui.unmount()
  expect((await pad($, 'remove 4')).text).toContain('.claude/launchpad.json')
})

test('symbol icons and English', { options: { icons: 'symbol', language: 'en' } }, async ($, on) => {
  world(on)
  await start($)
  const ui = await row($, 'terminal', { ...ROW, text: 'Launchpad shortcuts menu.' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('What do you want to do?')
  expect(drawn).toContain('⇲ Compact chat')
  expect(drawn).not.toContain('🗜️')
  await ui.unmount()
})

test('/pad hide hides every card until /pad show, across sessions', async ($, on) => {
  world(on)
  await start($)
  const ui = await row($)
  expect(JSON.stringify(await ui.drawn())).toContain('pad:compact')

  expect((await pad($, 'hide')).text).toContain('Launchpad oculto')
  expect(JSON.stringify(await ui.drawn())).not.toContain('pad:compact') // the card already drawn goes too
  expect((await pad($, '')).text).toBe('O launchpad está oculto. /pad show mostra de novo.')
  expect((await pad($, 'list')).text).toContain('/compact') // the list still works

  await start($) // a new session reads the store
  expect((await pad($, '')).text).toBe('O launchpad está oculto. /pad show mostra de novo.')

  expect((await pad($, 'show')).text).toContain('Menu de atalhos')
  expect(JSON.stringify(await ui.drawn())).toContain('pad:compact')
  await ui.unmount()
})

test('the language follows LANG unless the option names one; English when LANG is unset', async ($, on) => {
  world(on, {}, { HOME: '/home/ana' })
  await start($)
  expect((await pad($, '')).text).toBe('Launchpad shortcuts menu.')
  const ui = await row($)
  expect(JSON.stringify(await ui.drawn())).toContain('What do you want to do?')
  await ui.unmount()
})

test('the language option wins over LANG', { options: { language: 'en' } }, async ($, on) => {
  world(on)
  await start($)
  expect((await pad($, '')).text).toBe('Launchpad shortcuts menu.')
})

test('a command with a [blank] waits in the prompt; the pane gives a hinted command its blanks', async ($, on) => {
  const w = world(on)
  await start($)
  // The engine lists the commands for the typeahead: the hint of /code-review is learned.
  await ($ as any).command.describe({ command: 'code-review', description: 'Review the diff', argumentHint: '<level>', isHidden: false })
  await ($ as any).command.describe({ command: 'cost', description: 'Show the session cost', isHidden: false })

  await pad($, 'configuration')
  const ui = await pane($)
  expect(JSON.stringify(await ui.drawn())).toContain(' [level]')
  await ui.press({ key: 'add:command:code-review' })
  await ui.press({ key: 'add:command:cost' })
  await ui.unmount()
  expect((await pad($, 'list')).text).toContain('/code-review [level]')

  expect((await pad($, 'add Resumo | /cost [periodo]')).text).toContain('Atalho')
  const card = await row($)
  const drawn = JSON.stringify(await card.drawn())
  const id = (text: string) => new RegExp(`"key":"pad:([^"]+)","label":"[^"]*${text}`).exec(drawn)?.[1]
  await card.press({ key: `pad:${id('code-review')}` })
  await card.press({ key: `pad:${id('Resumo')}` })
  await card.press({ key: `pad:${id('cost')}` })
  expect(w.fills.map(f => f.text)).toEqual(['/code-review [level]', '/cost [periodo]'])
  expect(w.fills[0]!.decorations).toEqual([{ start: 13, end: 20, bold: true, underline: true }])
  expect(w.commands).toEqual(['cost'])
  await card.unmount()
})

test('the pane lists the catalog in a window the arrows and the wheel move', async ($, on) => {
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `cmd-${String(i).padStart(2, '0')}`, description: '', source: 'user' }))
  world(on, {}, undefined, [...COMMANDS, ...many])
  await start($)
  await pad($, 'configuration')
  // 34 rows less 27 for the rest (8 buttons in the menu, and the Mods section with four missing
  // mods in two lines of bordered buttons): 7 for the list.
  const ui = await pane($, 'terminal', 34)
  const shown = async () => {
    const drawn = JSON.stringify(await ui.drawn())
    return { keys: [...drawn.matchAll(/"key":"add:command:([^"]+)"/g)].map(m => m[1]), drawn }
  }
  let now = await shown()
  expect(now.keys).toEqual(['cmd-00', 'cmd-01', 'cmd-02', 'cmd-03', 'cmd-04', 'cmd-05', 'cmd-06'])
  expect(now.drawn).toContain('1–7 de 35')

  await ui.press({ key: 'list:down' }) // a page less one row, so the last stays in view
  now = await shown()
  expect(now.keys[0]).toBe('cmd-06')
  expect(now.drawn).toContain('7–13 de 35')

  await ($ as any).ui.scroll({ component: 'Pane', requestId: 'launchpad', by: 100 })
  now = await shown()
  expect(now.drawn).toContain('29–35 de 35') // the wheel stops at the end
  expect(now.keys.at(-1)).toBe('cost')

  await ui.press({ key: 'list:up' })
  expect((await shown()).drawn).toContain('23–29 de 35')

  await ui.input({ key: 'filter', kind: 'change', text: 'cmd-2' })
  now = await shown()
  expect(now.keys).toEqual(['cmd-20', 'cmd-21', 'cmd-22', 'cmd-23', 'cmd-24', 'cmd-25', 'cmd-26'])
  expect(now.drawn).toContain('list:down') // 10 match, 7 fit: the scroll row stays
  await ui.input({ key: 'filter', kind: 'change', text: 'cmd-21' })
  now = await shown()
  expect(now.keys).toEqual(['cmd-21'])
  expect(now.drawn).not.toContain('list:down') // all fit: no scroll row
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the row under the menu presses /pad's own arguments on ${surface}`, async ($, on) => {
    const w = world(on)
    await start($)
    const ui = await row($, surface)
    const drawn = JSON.stringify(await ui.drawn())
    for (const verb of ['configuration', 'list', 'add', 'remove', 'reset', 'hide', 'help']) expect(drawn).toContain(`"key":"cmd:${verb}"`)

    await ui.press({ key: 'cmd:configuration' })
    expect(w.opened).toEqual(['launchpad'])
    await ui.press({ key: 'cmd:list' })
    await ui.press({ key: 'cmd:help' })
    expect(w.logs[0]).toBe('1. 📦 Compactar conversa  /compact  (comando, padrão)') // one row a line
    expect(w.logs[1]).toBe('2. 📊 Ver contexto  /context  (comando, padrão)')
    expect(w.logs.some(l => l.includes('\n'))).toBe(false)
    expect(w.logs).toContain('/pad configuration     abre o painel para escolher e ordenar os atalhos')
    expect(w.commands).toEqual([]) // run here, not as a command
    // Nothing waits in the prompt to be typed: add and remove open /pad configuration.
    w.opened.length = 0
    await ui.press({ key: 'cmd:add' })
    await ui.press({ key: 'cmd:remove' })
    expect(w.opened).toEqual(['launchpad', 'launchpad'])
    expect(w.fills).toEqual([])

    await ui.press({ key: 'cmd:hide' })
    expect(JSON.stringify(await ui.drawn())).not.toContain('cmd:hide') // hide: the card goes
    expect((await pad($, '')).text).toBe('O launchpad está oculto. /pad show mostra de novo.')
    await ui.unmount()
  })
}

test('a JetBrains terminal gets symbols on auto', async ($, on) => {
  world(on, {}, { HOME: '/home/ana', LANG: 'pt_BR.UTF-8', TERMINAL_EMULATOR: 'JetBrains-JediTerm' })
  await start($)
  const ui = await row($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('⇲ Compactar conversa')
  expect(drawn).not.toContain('🗜️')
  await ui.unmount()
})

test('the pane numbers the buttons as /pad list does, and its edits read the list as it is now', async ($, on) => {
  world(on, files)
  await start($)
  await pad($, 'configuration')
  const ui = await pane($)
  const drawn = JSON.stringify(await ui.drawn())
  // compact, context, limits (not installed), resume (not installed), ..., explore
  expect(drawn).toContain('" 1"')
  expect(drawn).toContain('" –"')
  expect((await pad($, 'list')).text).toContain('3. 🔍 Explorar código')
  // Two removes in a row on one drawing: the second must not bring the first back.
  await ui.press({ key: 'remove:limits' })
  await ui.press({ key: 'remove:resume' })
  await ui.press({ key: 'up:explore' })
  await ui.press({ key: 'up:explore' })
  const texts = (await pad($, 'list')).text!.split('\n').map(l => l.split('  ')[1])
  expect(texts).toEqual(['/compact', '/context', '@Explore'])
  await ui.unmount()
})

test('an agent button with a task fills it; a project button cannot be added twice', async ($, on) => {
  const w = world(on, { ...files, '/repo/.claude/launchpad.json': PROJECT })
  await start($)
  expect((await pad($, 'add Revisar | @revisor revise o texto de [arquivo]')).text).toContain('criado')
  expect((await pad($, 'add Custo | /cost')).text).toBe('/cost já está no menu.') // the project has it
  const card = await row($)
  const drawn = JSON.stringify(await card.drawn())
  const id = /"key":"pad:([^"]+)","label":" 🤖 Revisar/.exec(drawn)?.[1]
  await card.press({ key: `pad:${id}` })
  expect(w.fills.map(f => f.text)).toEqual(['Use o agente revisor para revise o texto de [arquivo]'])
  await card.unmount()
})

const CLEAR = { name: 'clear', description: 'Start a new conversation', source: 'builtin' }
const hint = ($: any, surface = 'terminal') =>
  $.ui.mount({ plugin: 'launchpad', surface, component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' }, viewport: { columns: 122, rows: 40 } } as never)
const band = ($: any, surface = 'terminal', hasSurvey = false) =>
  $.ui.mount({ plugin: 'launchpad', surface, component: 'AbovePrompt', props: { bodyColumns: 122, hasSurvey }, viewport: { columns: 122, rows: 40 } } as never)
const panel = ($: any, surface = 'terminal') =>
  $.ui.mount({ plugin: 'launchpad', surface, component: 'Pane', requestId: 'launchpad-panel', props: { title: 'Painel', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }, viewport: { columns: 102, rows: 40 } } as never)
// /model and /effort are built in; this collection's mods by their plugins.
const CONTROLS = [
  { name: 'model', description: 'Set the AI model', source: 'builtin' },
  { name: 'effort', description: 'Set the effort level', source: 'builtin' },
]
const MOD_COMMANDS = [
  { name: 'limits', description: 'Plan limits', source: 'plugin', plugin: 'limits-meter' },
  { name: 'allowlist', description: 'Allowlist', source: 'plugin', plugin: 'allowlist-coach' },
  { name: 'watch', description: 'Subagents', source: 'plugin', plugin: 'agent-watch' },
  { name: 'test-hud', description: 'Tests', source: 'plugin', plugin: 'test-hud' },
  { name: 'plain-view', description: 'A quiet transcript', source: 'plugin', plugin: 'plain-view' },
]
const step = async ($: any, model: string, effort?: string | number, agentId?: string) => {
  const stream = $.turn.step({ turnId: 't1', index: 0, model, messageCount: 3, ...(effort !== undefined ? { effort } : {}), ...(agentId ? { agentId } : {}) })
  for await (const _ of stream) {
    // drain
  }
}
const menuPane = ($: any, surface = 'terminal') =>
  $.ui.mount({ plugin: 'launchpad', surface, component: 'Pane', requestId: 'launchpad-menu', props: { title: 'Atalhos', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} }, viewport: { columns: 102, rows: 40 } } as never)

test('a command whose hint is optional runs bare: /clear [name] is /clear', async ($, on) => {
  const w = world(on, files, undefined, [...COMMANDS, CLEAR])
  await start($)
  await ($ as any).command.describe({ command: 'clear', description: 'Start a new conversation', argumentHint: '[name]', isHidden: false })
  await pad($, 'configuration')
  const ui = await pane($)
  await ui.press({ key: 'add:command:clear' })
  await ui.unmount()
  expect((await pad($, 'list')).text).toContain('/clear  (comando, seu)')

  const card = await row($)
  const drawn = JSON.stringify(await card.drawn())
  const id = new RegExp(`"key":"pad:([^"]+)","label":"[^"]*clear`).exec(drawn)?.[1]
  await card.press({ key: `pad:${id}` })
  expect(w.commands).toEqual(['clear'])
  expect(w.fills).toEqual([])
  await card.unmount()
})

test('a button saved as /clear [name] is saved back bare once the hint is known', async ($, on) => {
  const w = world(on, files, undefined, [...COMMANDS, CLEAR])
  await start($)
  expect((await pad($, 'add Limpar | /clear [name]')).text).toContain('Atalho')
  await ($ as any).command.describe({ command: 'clear', description: 'Start a new conversation', argumentHint: '[name]', isHidden: false })
  const listed = (await pad($, 'list')).text!
  expect(listed).toContain('Limpar  /clear  (comando, seu)')
  expect(listed).not.toContain('[name]')
  const card = await row($)
  const drawn = JSON.stringify(await card.drawn())
  const id = new RegExp(`"key":"pad:([^"]+)","label":"[^"]*Limpar`).exec(drawn)?.[1]
  await card.press({ key: `pad:${id}` })
  expect(w.commands).toEqual(['clear'])
  await card.unmount()
})

test('/pad place prompt: the menu in a row right above the prompt, kept across sessions', async ($, on) => {
  const w = world(on)
  await start($)
  expect((await pad($, 'place prompt')).text).toBe('O menu agora fica numa linha logo acima do prompt, sempre à mão.')
  // The card is gone from /pad's row; /pad points at the band.
  const card = await row($)
  expect(JSON.stringify(await card.drawn())).not.toContain('pad:compact')
  await card.unmount()
  expect((await pad($, '')).text).toBe('O menu está na linha acima do prompt. /pad place header volta ao cartão.')

  await start($) // a new session reads the store
  const ui = await band($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('"key":"pad:compact"')
  expect(drawn).toContain('⋯ configurar')
  expect(drawn).toContain('"hover":{"backgroundColor":"claude","color":"inverseText","bold":true}')
  expect(drawn).toContain('"key":"cell:compact"') // each button its own hover scope
  await ui.press({ key: 'pad:compact' })
  expect(w.commands).toEqual(['compact'])
  await ui.press({ key: 'band:settings' })
  expect(w.opened).toEqual(['launchpad'])
  await pad($, 'hide')
  expect(JSON.stringify(await ui.drawn())).not.toContain('pad:compact')
  await ui.unmount()
})

test('the row above the prompt goes after the other mods\' bands, against the box, never in their place', async ($, on) => {
  world(on, files, undefined, COMMANDS, 'other mod band')
  await start($)
  await pad($, 'place prompt')
  const ui = await band($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('"key":"pad:compact"')
  expect(drawn).toContain('other mod band')
  expect(drawn.indexOf('other mod band')).toBeLessThan(drawn.indexOf('"key":"pad:compact"'))
  await pad($, 'hide')
  const off = JSON.stringify(await ui.drawn())
  expect(off).not.toContain('pad:compact')
  expect(off).toContain('other mod band')
  await ui.unmount()
})

test('no row above the prompt unless the menu is placed there, nor over a survey', async ($, on) => {
  world(on)
  await start($)
  let ui = await band($)
  expect(JSON.stringify(await ui.drawn())).not.toContain('pad:compact')
  await ui.unmount()
  await pad($, 'place prompt')
  ui = await band($, 'terminal', true)
  expect(JSON.stringify(await ui.drawn())).not.toContain('pad:compact')
  await ui.unmount()
})

// Prototype notes/prototypes/launchpad-0.5.0.html, approved 2026-10-09: one test per state and interaction.

for (const place of ['header', 'prompt', 'pane'] as const) {
  test(`start: a bordered ◆ pad under the engine's hint line, at its left, opens the panel, under place ${place}`, async ($, on) => {
    const w = world(on, files, undefined, COMMANDS, 'auto mode on')
    await start($)
    await pad($, `place ${place}`)
    const ui = await hint($)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('auto mode on')
    expect(drawn).toContain('"label":" ◆ pad "')
    expect(drawn).toContain('"borderStyle":"round"')
    expect(drawn).toContain('"hover":{"borderColor":"claude","borderDimColor":false,"backgroundColor":"claude"}')
    expect(drawn).toContain('"flexDirection":"column","alignItems":"flex-start"') // under the hint, at its left
    expect(drawn.indexOf('auto mode on')).toBeLessThan(drawn.indexOf('◆ pad'))
    expect(w.opened).not.toContain('launchpad-panel')
    await ui.press({ key: 'pad:panel' })
    expect(w.opened.at(-1)).toBe('launchpad-panel')
    await ui.unmount()
  })
}

test('start: ◆ pad stays while the menu is off, and the panel\'s /pad row offers on', async ($, on) => {
  world(on, files, undefined, COMMANDS, 'auto mode on')
  await start($)
  await pad($, 'hide')
  const ui = await hint($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('auto mode on')
  expect(drawn).toContain('◆ pad')
  await ui.unmount()
  const p = await panel($)
  let rows = JSON.stringify(await p.drawn())
  expect(rows).toContain('"key":"cmd:show"')
  expect(rows).not.toContain('"key":"cmd:hide"')
  await p.press({ key: 'cmd:show' })
  rows = JSON.stringify(await p.drawn())
  expect(rows).toContain('"key":"cmd:hide"')
  expect((await pad($, '')).text).toBe('Menu de atalhos do launchpad.')
  await p.unmount()
})

test('start: ◆ pad on the desktop is the surface\'s own button', async ($, on) => {
  world(on)
  await start($)
  const ui = await hint($, 'desktop')
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('"label":"◆ pad"')
  expect(drawn).not.toContain('borderDimColor') // only the card's own frame is a Box border
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`panel: model and effort chips, the mods, the shortcuts less /model, on ${surface}`, async ($, on) => {
    const w = world(on, files, undefined, [...COMMANDS, ...CONTROLS, ...MOD_COMMANDS, { name: 'help', description: 'Help', source: 'builtin' }])
    await start($)
    await step($, 'claude-opus-5-5', 'high')
    expect((await pad($, 'panel')).text).toBeUndefined()
    expect(w.opened).toEqual(['launchpad-panel'])
    const ui = await panel($, surface)
    let drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('✻ Painel')
    expect(drawn).toContain('Controles')
    for (const v of ['haiku', 'sonnet', 'low', 'medium', 'xhigh', 'max']) expect(drawn).toContain(`"key":"${['haiku', 'sonnet'].includes(v) ? 'model' : 'effort'}:${v}"`)
    expect(drawn).toContain('● opus')
    expect(drawn).toContain('● high')
    expect(drawn).not.toContain('"key":"model:opus"') // the current one is not a button
    for (const m of ['limits-meter', 'allowlist-coach', 'agent-watch']) expect(drawn).toContain(`"key":"mod:${m}"`)
    expect(drawn).toContain('"key":"mod:test-hud"') // back in 0.10.0
    // each mod by its plugin's name, the same in every language, with its command's icon
    for (const l of ['⏳ limits-meter', '🔐 allowlist-coach', '👀 agent-watch', '📜 plain-view', '🧪 test-hud']) expect(drawn).toContain(l)
    for (const l of ['⏱️ limites', '🛡️ permissões', '🛰️ agentes', 'transcript limpo']) expect(drawn).not.toContain(l)
    expect(drawn).toContain('Relógio do cache, limites de 5h e da semana, contexto') // P3: what each mod does
    expect(drawn).toContain('Atalhos')
    expect(drawn).not.toContain('"key":"pad:compact"') // the shortcuts are the other tab
    await ui.press({ key: 'tab:shortcuts' })
    drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('"key":"pad:compact"')
    expect(drawn).not.toContain('"key":"pad:model"')
    expect(drawn).not.toContain('5h em')
    await ui.unmount()
  })
}

test('P2: the shortcuts and close are one-line secondary buttons, the chips plain text on the terminal and boxes on desktop, no tile', async ($, on) => {
  world(on, files, undefined, [...COMMANDS, ...CONTROLS])
  await start($)
  await step($, 'claude-opus-5-5', 'high')
  const ui = await panel($)
  let tree = await ui.drawn()
  let drawn = JSON.stringify(tree)
  expect(variantOf(tree, 'model:sonnet')).toBeUndefined() // terminal: plain text, no brackets
  expect(button(tree, 'model:sonnet')?.props?.plain).toBe(true)
  expect(button(tree, 'effort:low')?.props?.plain).toBe(true)
  expect(variantOf(tree, 'close')).toBe('secondary')
  expect(drawn).toContain('"label":"○ sonnet"')
  expect(drawn).not.toContain('borderStyle') // the 3-line tile is gone from the panel
  expect(drawn).not.toContain('"key":"box:')
  await ui.press({ key: 'tab:shortcuts' })
  tree = await ui.drawn()
  drawn = JSON.stringify(tree)
  expect(variantOf(tree, 'pad:compact')).toBe('secondary')
  expect(drawn).not.toContain('borderStyle')
  for (const b of buttonsOf(tree).filter(b => b.variant)) expect(b.plain).toBeUndefined()
  await ui.unmount()
})

test('before the first request: no effort marked, and a line saying so', async ($, on) => {
  world(on, files, undefined, [...COMMANDS, ...CONTROLS])
  await start($)
  const ui = await panel($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('● opus') // from $.session.model() at the start
  expect(drawn).not.toContain('● high')
  expect(drawn).toContain('esforço: o do modelo, até o 1º pedido')
  await ui.unmount()
})

test('switched to sonnet, then effort low: two presses, each runs its command and moves the chip', async ($, on) => {
  const w = world(on, files, undefined, [...COMMANDS, ...CONTROLS], undefined, { model: 'claude-sonnet-5-5' })
  await start($)
  await step($, 'claude-opus-5-5', 'high')
  const ui = await panel($)
  await ui.press({ key: 'model:sonnet' })
  expect(w.commands).toEqual(['model sonnet'])
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('● sonnet')
  expect(drawn).toContain('"key":"model:opus"')
  await ui.press({ key: 'effort:low' })
  expect(w.commands).toEqual(['model sonnet', 'effort low'])
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('● low')
  expect(drawn).toContain('"key":"effort:high"')
  await ui.unmount()
})

test('a subagent\'s request does not move the chips', async ($, on) => {
  world(on, files, undefined, [...COMMANDS, ...CONTROLS])
  await start($)
  await step($, 'claude-opus-5-5', 'high')
  await step($, 'claude-haiku-4-5', 'low', 'a1')
  const drawn = JSON.stringify(await (await panel($)).drawn())
  expect(drawn).toContain('● opus')
  expect(drawn).toContain('● high')
})

test('5h at 74%: opus and max get a warning border and a warning line, and still switch on one press', async ($, on) => {
  const w = world(on, files, undefined, [...COMMANDS, ...CONTROLS], undefined, { model: 'claude-sonnet-5-5', fiveHour: 74 })
  await start($)
  await step($, 'claude-sonnet-5-5', 'high')
  const ui = await panel($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('! 5h em 74%: opus e max gastam a janela mais rápido')
  // the warned chips keep their one-line button and draw the label in the warning color
  expect(drawn).toMatch(/"key":"model:opus".*?"color":"warning"[^}]*\}[^]*?"children":\["○ opus"\]/)
  expect(drawn).toMatch(/"key":"effort:max".*?"color":"warning"/)
  expect(drawn).toContain('"label":"○ haiku"') // not warned: a plain label
  await ui.press({ key: 'model:opus' })
  expect(w.commands).toEqual(['model opus']) // no confirmation
  await ui.unmount()
})

test('below 70% there is no warning', async ($, on) => {
  world(on, files, undefined, [...COMMANDS, ...CONTROLS], undefined, { fiveHour: 64 })
  await start($)
  const drawn = JSON.stringify(await (await panel($)).drawn())
  expect(drawn).not.toContain('5h em')
  expect(drawn).not.toContain('"color":"warning"')
})

test('the model chips come from the /config model row when it lists them', async ($, on) => {
  world(on, files, undefined, [...COMMANDS, ...CONTROLS], undefined, { rows: [{ key: 'model', label: 'Model', kind: 'choice', value: 'opus', options: ['default', 'sonnet', 'opus', 'fable', 'sonnet[1m]'] }] })
  await start($)
  const drawn = JSON.stringify(await (await panel($)).drawn())
  expect(drawn).toContain('"key":"model:fable"')
  expect(drawn).not.toContain('haiku')
  expect(drawn).not.toContain('[1m]')
})

test('a mod button opens the mod\'s pane by its command', async ($, on) => {
  const w = world(on, files, undefined, [...COMMANDS, ...MOD_COMMANDS])
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'mod:agent-watch' })
  expect(w.commands).toEqual(['watch'])
  await ui.unmount()
})

test('no mods: the section says none is installed, with a button to install each', async ($, on) => {
  const w = world(on)
  await start($)
  const ui = await panel($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Nenhum mod desta coleção instalado.')
  for (const m of ['limits-meter', 'allowlist-coach', 'agent-watch']) expect(drawn).toContain(`"key":"install:${m}"`)
  expect(drawn).not.toContain('Controles') // no /model nor /effort in this session
  await ui.press({ key: 'install:agent-watch' })
  expect(w.fills.map(f => f.text)).toEqual(['/plugin install agent-watch --marketplace ice-lfernandes/claude-code-mods'])
  await ui.unmount()
})

test('panel: some mods missing, their install buttons after the installed ones; all installed, a line says so', async ($, on) => {
  world(on, files, undefined, [...COMMANDS, MOD_COMMANDS[0]!])
  await start($)
  let drawn = JSON.stringify(await (await panel($)).drawn())
  expect(drawn).toContain('Faltam (o comando vai para o prompt; Enter instala):')
  expect(drawn.indexOf('"key":"mod:limits-meter"')).toBeLessThan(drawn.indexOf('"key":"install:allowlist-coach"'))
  expect(drawn).not.toContain('"key":"install:limits-meter"')
})

test('panel and /pad configuration: every mod installed, /pad configuration says so', async ($, on) => {
  world(on, files, undefined, [...COMMANDS, ...MOD_COMMANDS])
  await start($)
  const drawn = JSON.stringify(await (await panel($)).drawn())
  expect(drawn).not.toContain('install:') // nothing is missing, so the Mods tab has no install buttons
  await pad($, 'configuration')
  expect(JSON.stringify(await (await pane($)).drawn())).toContain('Todos os mods desta coleção já estão instalados.')
})

test('a command of the same name from another plugin is not the mod', async ($, on) => {
  world(on, files, undefined, [...COMMANDS, { name: 'watch', description: 'x', source: 'plugin', plugin: 'someone-else' }])
  await start($)
  const drawn = JSON.stringify(await (await panel($)).drawn())
  expect(drawn).not.toContain('mod:agent-watch')
})

test('close and Esc: the close button closes the panel', async ($, on) => {
  const w = world(on)
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'close' })
  expect(w.closed).toEqual(['launchpad-panel'])
  await ui.unmount()
})

test('/pad configuration: the mods installed, and the missing ones as install commands for the prompt', async ($, on) => {
  const w = world(on, files, undefined, [...COMMANDS, MOD_COMMANDS[0]!, MOD_COMMANDS[2]!])
  await start($)
  await pad($, 'configuration')
  const ui = await pane($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('limits-meter')
  expect(drawn).toContain('agent-watch')
  expect(drawn).toContain('Faltam (o comando vai para o prompt; Enter instala):')
  expect(drawn).toContain('"key":"install:allowlist-coach"')
  expect(drawn).toContain('"key":"install:test-hud"') // missing like the others, since 0.10.0
  expect(drawn).not.toContain('"key":"install:limits-meter"')
  await ui.press({ key: 'install:allowlist-coach' })
  expect(w.fills.map(f => f.text)).toEqual(['/plugin install allowlist-coach --marketplace ice-lfernandes/claude-code-mods'])
  expect(w.commands).toEqual([]) // nothing installs on a press
  w.opened.length = 0
  await ui.press({ key: 'panel' })
  expect(w.opened).toEqual(['launchpad-panel'])
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the placement option pane: the menu opens in its own pane at the start, on ${surface}`, { options: { placement: 'pane' } }, async ($, on) => {
    const w = world(on)
    await start($)
    expect(w.opened).toEqual(['launchpad-menu'])
    expect(w.commands).toEqual([]) // no card in the transcript
    const ui = await menuPane($, surface)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('O que você quer fazer?')
    expect(drawn).toContain('"key":"cmd:place"')
    // The header card's look: bordered tiles on the terminal, native buttons elsewhere.
    if (surface === 'terminal') expect(drawn).toContain('"key":"tile:compact"')
    else expect(drawn).not.toContain('tile:')
    await ui.press({ key: 'pad:compact' })
    expect(w.commands).toEqual(['compact'])
    await ui.press({ key: 'close' })
    expect(w.closed).toEqual(['launchpad-menu'])
    await ui.unmount()

    expect(await pad($, '')).toEqual({})
    expect(w.opened).toEqual(['launchpad-menu', 'launchpad-menu'])
    expect((await pad($, 'place header')).text).toContain('cartão sob o cabeçalho')
    expect(w.closed).toEqual(['launchpad-menu', 'launchpad-menu'])
    expect((await pad($, 'place nowhere')).text).toBe('Use: /pad place header | prompt | pane')
  })
}

test('place from the /pad row: the engine\'s dialog with the three places, the current marked; no typing', async ($, on) => {
  const w = world(on)
  await start($)
  const ui = await row($)
  w.answer = 'Acima do prompt'
  await ui.press({ key: 'cmd:place' })
  expect(w.asked).toEqual([{ question: 'Onde o menu deve ficar?', options: ['Sob o cabeçalho (atual)', 'Acima do prompt', 'Num painel'] }])
  expect(w.logs).toContain('O menu agora fica numa linha logo acima do prompt, sempre à mão.')
  expect(w.fills).toEqual([])
  expect((await pad($, '')).text).toBe('O menu está na linha acima do prompt. /pad place header volta ao cartão.')
  await ui.unmount()
})

test('place dismissed, or answered with free text: nothing changes', async ($, on) => {
  const w = world(on)
  await start($)
  const ui = await row($)
  await ui.press({ key: 'cmd:place' }) // dismissed
  w.answer = 'no topo'
  await ui.press({ key: 'cmd:place' })
  expect(w.asked).toHaveLength(2)
  expect(w.logs).toEqual([])
  expect(w.toasts).toEqual([])
  expect((await pad($, '')).text).toBe('Menu de atalhos do launchpad.')
  await ui.unmount()
})

test('reset from the /pad row asks first; only "Voltar aos padrões" resets', async ($, on) => {
  const w = world(on, files)
  await start($)
  await pad($, 'remove 1')
  const ui = await row($)
  w.answer = 'Cancelar'
  await ui.press({ key: 'cmd:reset' })
  expect(w.asked[0]!.options).toEqual(['Voltar aos padrões', 'Cancelar'])
  expect((await pad($, 'list')).text).not.toContain('Compactar conversa')
  w.answer = 'Voltar aos padrões'
  await ui.press({ key: 'cmd:reset' })
  expect(w.logs).toContain('Atalhos de volta aos padrões.')
  expect((await pad($, 'list')).text).toContain('Compactar conversa')
  expect(w.fills).toEqual([])
  await ui.unmount()
})


// /pad on and off: the launchpad itself

test('/pad on and off write the enabled option; a refused one says why', async ($, on) => {
  world(on)
  const sets: { key: string; value: unknown }[] = []
  let deny = ''
  on('config.set', (_$: any, e: any) => (deny ? ({ deny } as never) : (sets.push({ key: e.key, value: e.value }), { value: e.value } as never)))
  await start($)
  expect((await pad($, 'on')).text).toBe('pad já está ligado.')
  expect((await pad($, 'off')).text).toBe('pad desligado em todas as conversas · /pad on liga')
  expect(sets).toEqual([{ key: 'launchpad.enabled', value: false }])
  deny = 'managed by policy'
  expect((await pad($, 'off')).text).toBe('Não deu para mudar a opção: managed by policy')
})

test('off: no menu at the start, but /pad still answers and on writes the option back', { options: { enabled: false } }, async ($, on) => {
  const w = world(on)
  const sets: { key: string; value: unknown }[] = []
  on('config.set', (_$: any, e: any) => (sets.push({ key: e.key, value: e.value }), { value: e.value }) as never)
  await start($)
  expect(w.logs ?? []).toEqual([])
  expect((await pad($, 'off')).text).toBe('pad já está desligado.')
  expect((await pad($, 'on')).text).toBe('pad ligado · /pad off desliga')
  expect(sets).toEqual([{ key: 'launchpad.enabled', value: true }])
})

test('show brings back a menu that hide took away', async ($, on) => {
  world(on)
  await start($)
  await pad($, 'hide')
  expect((await pad($, '')).text).toBe('O launchpad está oculto. /pad show mostra de novo.')
  expect((await pad($, 'show')).text).toBe('Menu de atalhos do launchpad.')
  expect((await pad($, '')).text).toBe('Menu de atalhos do launchpad.')
})

// /pad quiet: every mod's `quiet` option at once, and the chip on the hint line (prototype buttons-quiet-a5-a7, A7 variant A).
const QUIET_ROWS = ['limits-meter', 'allowlist-coach', 'agent-watch', 'test-hud', 'launchpad'].map(p => ({ key: `${p}.quiet`, value: false }))
const recordSets = (on: On, deny = '') => {
  const sets: { key: string; value: unknown }[] = []
  on('config.set', (_$: any, e: any) => (deny ? ({ deny } as never) : (sets.push({ key: e.key, value: e.value }), { value: e.value } as never)))
  return sets
}

test('/pad quiet on and off set every mod\'s quiet option, the launchpad last; bare flips it', async ($, on) => {
  world(on, {}, undefined, undefined, undefined, { rows: QUIET_ROWS })
  const sets = recordSets(on)
  await start($)
  expect((await pad($, 'quiet off')).text).toBe('discreto já está desligado.')
  expect((await pad($, 'quiet on')).text).toBe('discreto ligado em 5 mods: nada aparece sozinho · /pad quiet off volta')
  expect(sets.map(s => s.key)).toEqual(['limits-meter.quiet', 'allowlist-coach.quiet', 'agent-watch.quiet', 'test-hud.quiet', 'launchpad.quiet'])
  expect(sets.every(s => s.value === true)).toBe(true)
  sets.length = 0
  expect((await pad($, 'quiet')).text).toBe('discreto ligado em 5 mods: nada aparece sozinho · /pad quiet off volta')
  expect((await pad($, 'quiet maybe')).text).toContain('/pad quiet on | off')
})

test('/pad quiet names a mod that has options but no quiet row, and says why a refusal failed', async ($, on) => {
  world(on, {}, undefined, undefined, undefined, { rows: [...QUIET_ROWS.slice(0, 2), { key: 'plain-view.enabled', value: true }, { key: 'launchpad.quiet', value: false }] })
  const sets = recordSets(on)
  await start($)
  expect((await pad($, 'quiet on')).text).toBe('discreto ligado em 3 mods: nada aparece sozinho · /pad quiet off volta Sem a opção quiet (atualize): plain-view.')
  expect(sets.map(s => s.key)).toEqual(['limits-meter.quiet', 'allowlist-coach.quiet', 'launchpad.quiet'])
})

test('/pad quiet with no mod that has the option, and a refused change', async ($, on) => {
  const w = world(on, {}, undefined, undefined, undefined, { rows: [] })
  recordSets(on)
  await start($)
  expect((await pad($, 'quiet on')).text).toBe('Nenhum mod com a opção quiet. Atualize os mods da coleção.')
  expect(w.commands).toEqual([])
})

test('/pad quiet: a refusal says why', async ($, on) => {
  world(on, {}, undefined, undefined, undefined, { rows: QUIET_ROWS })
  recordSets(on, 'managed by policy')
  await start($)
  expect((await pad($, 'quiet on')).text).toBe('Não deu para mudar a opção: managed by policy')
})

for (const surface of ['terminal', 'desktop']) {
  test(`calm: the hint line has ◆ pad and a ◦ discreto chip that turns quiet on, on ${surface}`, async ($, on) => {
    world(on, {}, undefined, undefined, undefined, { rows: QUIET_ROWS })
    const sets = recordSets(on)
    await start($, surface)
    const ui = await hint($, surface)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('pad:panel')
    expect(drawn).toContain('◦ discreto')
    await ui.press({ key: 'quiet:on' })
    expect(sets.map(s => s.key)).toContain('launchpad.quiet')
    expect(sets.every(s => s.value === true)).toBe(true)
    await ui.unmount()
  })

  test(`quiet: only ◦ discreto · mostrar remains on the hint line, and it turns quiet off, on ${surface}`, { options: { quiet: true } }, async ($, on) => {
    const w = world(on, {}, undefined, undefined, undefined, { rows: QUIET_ROWS })
    const sets = recordSets(on)
    await start($, surface)
    const ui = await hint($, surface)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).not.toContain('pad:panel')
    expect(drawn).toContain('◦ discreto · ')
    expect(drawn).toContain('mostrar')
    await ui.press({ key: 'quiet:off' })
    expect(sets.every(s => s.value === false)).toBe(true)
    expect(sets.at(-1)?.key).toBe('launchpad.quiet')
    expect(w.toasts.at(-1)).toContain('discreto desligado em 5 mods')
    await ui.unmount()
  })
}

test('quiet: no menu at the start and /pad show says it is still quiet', { options: { quiet: true } }, async ($, on) => {
  const w = world(on)
  await start($)
  expect(w.logs).toEqual([])
  expect((await pad($, 'show')).text).toBe('O launchpad está discreto. /pad quiet off mostra de novo.')
})

// P1 to P3 (prototype launchpad-0.9.0, variant A): the panel is a switchboard.
const ENABLED = ['limits-meter', 'allowlist-coach', 'agent-watch', 'plain-view', 'test-hud'].map(p => ({ key: `${p}.enabled`, value: p !== 'agent-watch' }))
const SB_COMMANDS = [...COMMANDS, ...CONTROLS, ...MOD_COMMANDS]
const sbWorld = (on: On, env?: Record<string, string>) => world(on, files, env, SB_COMMANDS, undefined, { rows: [...ENABLED, ...QUIET_ROWS] })

for (const surface of ['terminal', 'desktop'] as const) {
  test(`switchboard: a row per mod with its eye and toggle, the one that is off dim with no eye, and the quiet row, on ${surface}`, async ($, on) => {
    sbWorld(on)
    await start($)
    const ui = await panel($, surface)
    const tree = await ui.drawn()
    const drawn = JSON.stringify(tree)
    for (const m of ['limits-meter', 'allowlist-coach', 'plain-view', 'test-hud']) {
      expect(drawn).toContain(`"key":"mod:${m}"`)
      expect(drawn).toContain(`"key":"eye:${m}"`)
      expect(drawn).toContain(`"key":"toggle:${m}"`)
    }
    expect(drawn).not.toContain('"key":"mod:agent-watch"') // off: text, not a button
    expect(drawn).not.toContain('"key":"eye:agent-watch"')
    expect(drawn).toContain('"key":"toggle:agent-watch"')
    expect(drawn).toContain('/limits abre · hide oculta')
    expect(drawn).toContain('/watch on liga')
    expect(drawn).toContain('◦ discreto')
    expect(drawn).toContain('"key":"toggle:quiet"')
    expect(drawn).toContain('Desligado vale em toda conversa. Oculto mantém ligado, fora de vista.')
    expect(drawn).toContain('Mod novo da coleção aparece aqui sozinho.')
    expect(drawn).toContain('/test-hud abre · hide oculta') // T4: test-hud has its row, its eye and its toggle
    expect(drawn).toContain('Testes: contagem, falhas por arquivo, instáveis')
    if (surface === 'terminal') {
      expect(drawn).toContain('"label":"● on"')
      expect(drawn).toContain('"label":"○ off"')
      expect(variantOf(tree, 'toggle:limits-meter')).toBe('secondary')
      expect(variantOf(tree, 'eye:limits-meter')).toBe('secondary')
    } else {
      // the green block with a knob: a Button whose child is a Text on the success color; off is inactive
      expect(drawn).toMatch(/"key":"toggle:limits-meter".*?"backgroundColor":"success"/)
      expect(drawn).toMatch(/"key":"toggle:agent-watch".*?"backgroundColor":"inactive"/)
    }
    await ui.unmount()
  })
}

test('switchboard: the toggle runs /<mod> off or on and the panel redraws; the quiet toggle runs /pad quiet', async ($, on) => {
  const w = sbWorld(on)
  const sets = recordSets(on)
  await start($)
  const ui = await panel($)
  await ui.press({ key: 'toggle:limits-meter' })
  await ui.press({ key: 'toggle:agent-watch' })
  expect(w.commands).toEqual(['limits off', 'watch on'])
  await ui.press({ key: 'toggle:quiet' })
  expect(sets.map(s => s.key)).toContain('launchpad.quiet')
  expect(sets.every(s => s.value === true)).toBe(true)
  expect(w.toasts.at(-1)).toContain('discreto ligado')
  await ui.unmount()
})

test('switchboard: the eye hides and shows a mod with /<mod> hide and show, and the launchpad remembers it', async ($, on) => {
  const w = sbWorld(on)
  await start($)
  let ui = await panel($)
  await ui.press({ key: 'eye:plain-view' })
  expect(w.commands).toEqual(['plain-view hide'])
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('/plain-view show mostra')
  expect(drawn).toMatch(/"key":"eye:plain-view".*?"label":"◌"/)
  await ui.unmount()
  await start($) // a new session reads the store: the eye is remembered
  ui = await panel($)
  expect(JSON.stringify(await ui.drawn())).toContain('/plain-view show mostra')
  await ui.press({ key: 'eye:plain-view' })
  expect(w.commands).toEqual(['plain-view hide', 'plain-view show'])
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('/plain-view abre · hide oculta')
  await ui.unmount()
  await start($)
  ui = await panel($)
  expect(JSON.stringify(await ui.drawn())).toContain('/plain-view abre · hide oculta')
  await ui.unmount()
})

test('switchboard: a mod with no enabled option (an older one) shows no toggle and no eye, only its button', async ($, on) => {
  world(on, files, undefined, SB_COMMANDS, undefined, { rows: [] })
  await start($)
  const drawn = JSON.stringify(await (await panel($)).drawn())
  expect(drawn).toContain('"key":"mod:limits-meter"')
  expect(drawn).not.toContain('"key":"toggle:limits-meter"')
  expect(drawn).not.toContain('"key":"eye:limits-meter"')
})

test('tabs: Mods and Shortcuts swap the body, and model and effort stay on top', async ($, on) => {
  sbWorld(on)
  await start($)
  const ui = await panel($)
  let drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('"key":"tab:shortcuts"')
  expect(drawn).not.toContain('"key":"tab:mods"') // the open tab is bold text
  expect(drawn).toContain('"key":"model:sonnet"')
  await ui.press({ key: 'tab:shortcuts' })
  drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('"key":"tab:mods"')
  expect(drawn).not.toContain('"key":"row:') // no switchboard rows
  expect(drawn).not.toContain('toggle:limits-meter')
  expect(drawn).toContain('"key":"model:sonnet"') // controls stay
  expect(drawn).toContain('"key":"pad:compact"')
  await ui.press({ key: 'tab:mods' })
  expect(JSON.stringify(await ui.drawn())).toContain('toggle:limits-meter')
  await ui.unmount()
})

test('P1: the panel is in English from the language option: tabs, descriptions, rules, verbs', { options: { language: 'en' } }, async ($, on) => {
  sbWorld(on, { HOME: '/home/ana', LANG: 'pt_BR.UTF-8' })
  await start($)
  const ui = await panel($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Cache clock, 5h and weekly limits, context')
  expect(drawn).toContain('/limits opens · hide hides')
  expect(drawn).toContain('Off means off in every chat.')
  expect(drawn).toContain('"label":"configure"')
  expect(drawn).toContain('"label":"help"')
  expect(drawn).not.toContain('configurar')
  expect(drawn).not.toContain('Desligado')
  expect(drawn).toContain('"key":"cmd:configuration"') // the key and the command stay English
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`P1: the row under the menu has its labels in Portuguese and runs the English argument, on ${surface}`, async ($, on) => {
    const w = world(on)
    await start($)
    const ui = await row($, surface)
    const drawn = JSON.stringify(await ui.drawn())
    for (const label of ['configurar', 'listar', 'adicionar', 'remover', 'restaurar', 'posição', 'ocultar', 'ajuda']) expect(drawn).toContain(`"label":"${label}"`)
    for (const verb of ['configuration', 'list', 'add', 'remove', 'reset', 'hide', 'help']) expect(drawn).not.toContain(`"label":"${verb}"`)
    await ui.press({ key: 'cmd:list' })
    expect(w.logs.length).toBeGreaterThan(0) // /pad list ran
    await ui.unmount()
  })
}

// r5 and r6 (prototype launchpad-0.9.0, B and D): the colors of state and the filled hover on boxed buttons.
type Node = { type?: string; props?: Record<string, any>; hover?: Record<string, any>; children?: unknown[] }
const nodes = (tree: unknown, type: string, out: Node[] = []): Node[] => {
  if (Array.isArray(tree)) tree.forEach(t => nodes(t, type, out))
  else if (tree && typeof tree === 'object') {
    if ((tree as Node).type === type) out.push(tree as Node)
    Object.values(tree).forEach(v => nodes(v, type, out))
  }
  return out
}
const button = (tree: unknown, key: string) => nodes(tree, 'Button').find(b => b.props?.key === key)
const hasHover = (tree: unknown, key: string) => button(tree, key)?.hover !== undefined
const textColor = (tree: unknown, key: string) => (nodes(button(tree, key), 'Text')[0]?.props ?? {}).color

test('hover: the fill is on boxed buttons only, links get an underline and nothing else, toggles and the eye none', async ($, on) => {
  sbWorld(on)
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await panel($, surface)
    let tree = await ui.drawn()
    // never on a toggle, the eye (icon only) or the quiet toggle
    for (const k of ['toggle:limits-meter', 'toggle:agent-watch', 'toggle:quiet', 'eye:limits-meter']) expect(hasHover(tree, k)).toBe(false)
    // a link (no brackets: tabs, footer verbs, the mod's name) only underlines, and asks not to be inverted
    for (const k of ['tab:shortcuts', 'cmd:configuration', 'cmd:help', 'mod:limits-meter']) expect(button(tree, k)?.hover).toEqual({ scope: `hover:${k}`, underline: true, inverse: false })
    expect(hasHover(tree, 'close')).toBe(true)
    // the controls: a box with the fill on the desktop, a link on the terminal
    for (const k of ['model:sonnet', 'effort:low']) {
      expect(button(tree, k)?.hover).toEqual(surface === 'desktop' ? { scope: `hover:${k}`, backgroundColor: 'claude', color: 'inverseText' } : { scope: `hover:${k}`, underline: true, inverse: false })
    }
    // the fill: the accent behind the label, the inverse color on it, a scope of its own so no keyed Box is needed
    expect(button(tree, 'close')?.hover).toEqual({ scope: 'hover:close', backgroundColor: 'claude', color: 'inverseText' })
    await ui.press({ key: 'tab:shortcuts' })
    tree = await ui.drawn()
    for (const k of ['pad:compact', 'pad:context']) expect(button(tree, k)?.hover).toEqual({ scope: `hover:${k}`, backgroundColor: 'claude', color: 'inverseText' })
    await ui.press({ key: 'tab:mods' })
    await ui.unmount()
  }
})

test('state color: on is green and off is dim in the label, the hidden eye is amber, the open tab is the accent', async ($, on) => {
  sbWorld(on)
  await start($)
  const ui = await panel($)
  let tree = await ui.drawn()
  expect(textColor(tree, 'toggle:limits-meter')).toBe('success')
  expect(textColor(tree, 'toggle:agent-watch')).toBe('inactive')
  expect(textColor(tree, 'toggle:quiet')).toBe('inactive')
  expect(textColor(tree, 'eye:limits-meter')).toBeUndefined()
  expect(nodes(tree, 'Text').some(t => t.props?.color === 'claude' && t.children?.[0] === 'Mods')).toBe(true) // the open tab
  expect(nodes(tree, 'Text').some(t => t.props?.color === 'inactive' && t.children?.[0] === '/watch on liga')).toBe(true)
  for (const k of ['cmd:configuration', 'cmd:list', 'cmd:help']) expect(textColor(tree, k)).toBe('suggestion')
  await ui.press({ key: 'eye:plain-view' })
  tree = await ui.drawn()
  expect(textColor(tree, 'eye:plain-view')).toBe('warning')
  expect(nodes(tree, 'Text').some(t => t.props?.color === 'warning' && t.children?.[0] === '/plain-view show mostra')).toBe(true)
  await ui.press({ key: 'toggle:quiet' }) // runs /pad quiet; the toggle itself reads the option on the next load
  await ui.unmount()
})

test('desktop toggle: a green block with a knob, drawn from the children only (a label beside them would win)', async ($, on) => {
  sbWorld(on)
  await start($)
  const ui = await panel($, 'desktop')
  const tree = await ui.drawn()
  const on1 = button(tree, 'toggle:limits-meter')
  const off1 = button(tree, 'toggle:agent-watch')
  expect(nodes(on1, 'Text')[0]?.props).toEqual({ backgroundColor: 'success', color: 'inverseText' })
  expect(nodes(off1, 'Text')[0]?.props).toEqual({ backgroundColor: 'inactive', color: 'inverseText' })
  // the engine names the control by its children's text: the knob, not `● on`, so no explicit label was passed
  expect(on1?.props?.label).toBe('   ● ')
  expect(off1?.props?.label).toBe(' ●   ')
  await ui.unmount()
})

// Coverage of the rest of what the prototype launchpad-0.9.0 approved.
test('discreto on: the quiet toggle reads green and one press turns it off', { options: { quiet: true } }, async ($, on) => {
  sbWorld(on)
  const sets = recordSets(on)
  await start($)
  const ui = await panel($)
  const tree = await ui.drawn()
  expect(textColor(tree, 'toggle:quiet')).toBe('success')
  expect(nodes(button(tree, 'toggle:quiet'), 'Text')[0]?.children?.[0]).toBe('● on')
  await ui.press({ key: 'toggle:quiet' })
  expect(sets.at(-1)).toEqual({ key: 'launchpad.quiet', value: false })
  await ui.unmount()
})

test('a toggle press redraws the panel from the mod\'s new option', async ($, on) => {
  const rows = [...ENABLED.map(r => ({ ...r })), ...QUIET_ROWS]
  const w = world(on, files, undefined, SB_COMMANDS, undefined, { rows })
  await start($)
  const ui = await panel($)
  expect(button(await ui.drawn(), 'mod:limits-meter')).toBeDefined()
  rows.find(r => r.key === 'limits-meter.enabled')!.value = false // what `/limits off` writes
  await ui.press({ key: 'toggle:limits-meter' })
  expect(w.commands).toEqual(['limits off'])
  const tree = await ui.drawn()
  expect(textColor(tree, 'toggle:limits-meter')).toBe('inactive') // now off
  expect(button(tree, 'mod:limits-meter')).toBeUndefined() // off: its name is text
  expect(button(tree, 'eye:limits-meter')).toBeUndefined() // and it has no eye
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`in Portuguese the panel's footer verbs and tabs are links in the action color, on ${surface}`, async ($, on) => {
    sbWorld(on)
    await start($)
    const ui = await panel($, surface)
    const tree = await ui.drawn()
    for (const [key, label] of [['cmd:configuration', 'configurar'], ['cmd:list', 'listar'], ['cmd:add', 'adicionar'], ['cmd:remove', 'remover'], ['cmd:reset', 'restaurar'], ['cmd:place', 'posição'], ['cmd:hide', 'ocultar'], ['cmd:help', 'ajuda']] as const) {
      expect(button(tree, key)?.props?.label).toBe(label)
      expect(textColor(tree, key)).toBe('suggestion')
    }
    expect(button(tree, 'tab:shortcuts')?.props?.label).toBe('Atalhos')
    await ui.unmount()
  })
}

test('hidden: the panel\'s footer offers `mostrar` (/pad show) in place of `ocultar`, still a link', async ($, on) => {
  const w = sbWorld(on)
  await start($)
  await pad($, 'hide')
  const ui = await panel($)
  const tree = await ui.drawn()
  expect(button(tree, 'cmd:hide')).toBeUndefined()
  expect(button(tree, 'cmd:show')?.props?.label).toBe('mostrar')
  expect(button(tree, 'cmd:show')?.hover).toEqual({ scope: 'hover:cmd:show', underline: true, inverse: false })
  await ui.press({ key: 'cmd:show' })
  expect(w.logs).toContain('Menu de atalhos do launchpad.') // /pad show ran: the menu is back
  await ui.unmount()
})

test('desktop: the controls are native secondary buttons, the warned one keeps its fill hover and a warning label', async ($, on) => {
  world(on, files, undefined, SB_COMMANDS, undefined, { model: 'claude-sonnet-5-5', fiveHour: 74, rows: [...ENABLED, ...QUIET_ROWS] })
  await start($)
  await step($, 'claude-sonnet-5-5', 'high')
  const ui = await panel($, 'desktop')
  const tree = await ui.drawn()
  expect(button(tree, 'model:haiku')?.props?.variant).toBe('secondary')
  expect(button(tree, 'effort:low')?.props?.variant).toBe('secondary')
  expect(textColor(tree, 'model:opus')).toBe('warning')
  expect(button(tree, 'model:opus')?.hover).toEqual({ scope: 'hover:model:opus', backgroundColor: 'claude', color: 'inverseText' })
  await ui.unmount()
})

test('terminal: a warned control is a warning-colored link, with the underline hover', async ($, on) => {
  world(on, files, undefined, SB_COMMANDS, undefined, { model: 'claude-sonnet-5-5', fiveHour: 74, rows: [...ENABLED, ...QUIET_ROWS] })
  await start($)
  await step($, 'claude-sonnet-5-5', 'high')
  const ui = await panel($)
  const tree = await ui.drawn()
  expect(button(tree, 'model:opus')?.props?.plain).toBe(true)
  expect(textColor(tree, 'model:opus')).toBe('warning')
  expect(button(tree, 'model:opus')?.hover).toEqual({ scope: 'hover:model:opus', underline: true, inverse: false })
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the verbs under the menu card underline under the pointer and are not boxes, on ${surface}`, async ($, on) => {
    world(on)
    await start($)
    const ui = await row($, surface)
    const tree = await ui.drawn()
    for (const k of ['cmd:configuration', 'cmd:list', 'cmd:help']) {
      expect(button(tree, k)?.hover).toEqual({ scope: `hover:${k}`, underline: true, inverse: false })
      expect(button(tree, k)?.props?.plain).toBe(true)
    }
    await ui.unmount()
  })
}

test('the hint line is not touched: the quiet chip has no hover of the panel\'s', async ($, on) => {
  sbWorld(on)
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await hint($, surface)
    const tree = await ui.drawn()
    expect(hasHover(tree, 'quiet:on')).toBe(false)
    expect(button(tree, 'pad:panel')).toBeDefined() // ◆ pad keeps the tile hover it had before 0.9: not touched
    await ui.unmount()
  }
})

test('the Shortcuts tab says so when no shortcut is installed', async ($, on) => {
  world(on, {}, undefined, [{ name: 'pad', description: 'Shortcuts', source: 'plugin' }, ...MOD_COMMANDS])
  await start($)
  for (let i = 0; i < 12; i++) await pad($, 'remove 1') // the person drops every button
  const ui = await panel($)
  await ui.press({ key: 'tab:shortcuts' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Nenhum atalho disponível.')
  expect(drawn).not.toContain('"key":"pad:')
  await ui.unmount()
})
