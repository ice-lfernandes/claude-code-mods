import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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

type World = { fills: { text: string; decorations?: unknown }[]; commands: string[]; opened: string[]; closed: string[]; toasts: string[]; logs: string[]; asked: { question: string; options: string[] }[]; answer?: string; clock: ReturnType<typeof mock.clock> }

const world = (
  on: On,
  files: Record<string, string> = {},
  env: Record<string, string> = { HOME: '/home/ana', LANG: 'pt_BR.UTF-8' },
  commands: object[] = COMMANDS,
): World => {
  const w: World = { fills: [], commands: [], opened: [], closed: [], toasts: [], logs: [], asked: [], clock: mock.clock(on, { now: Date.parse('2026-10-08T12:00:00Z') }) }
  mock.store(on)
  // The engine's question dialog: the test's answer, or dismissed when it gives none.
  on('tool.call', ($, e: any) => {
    const q = e.questions[0]
    w.asked.push({ question: String(q.question), options: q.options.map((o: { label: string }) => o.label) })
    return (w.answer === undefined ? { deny: 'dismissed' } : { result: { questions: e.questions, answers: { [q.question]: w.answer } } }) as never
  })
  // The engine's own drawing beneath the plugin: empty, as when nothing else draws there.
  on('ui.render', () => ({ type: 'Box', children: [] }) as never)
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
    expect(drawn).toContain('🗜️ Compactar conversa')
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
  expect(drawn).toContain('"hover":{"borderColor":"claude","borderDimColor":false,"backgroundColor":"subtle"}')
  expect(drawn).toContain('"label":" 🗜️ Compactar conversa "') // 23 cells: 26 less the gap and the two borders
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
  expect(list).toContain('1. 🗜️ Compactar conversa  /compact  (comando, padrão)')
  expect(list).toContain('5. 🤖 Revisor  @revisor  (agente, seu)')
  expect((await pad($, 'remove 1')).text).toBe('Atalho removido: Compactar conversa.')
  expect((await pad($, 'remove 9')).text).toContain('Não existe atalho 9')
  expect((await pad($, 'reset')).text).toBe('Atalhos de volta aos padrões.')
  expect((await pad($, 'list')).text).toContain('1. 🗜️ Compactar conversa')
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

test('/pad off hides every card until /pad on, across sessions', async ($, on) => {
  world(on)
  await start($)
  const ui = await row($)
  expect(JSON.stringify(await ui.drawn())).toContain('pad:compact')

  expect((await pad($, 'off')).text).toContain('Launchpad desligado')
  expect(JSON.stringify(await ui.drawn())).not.toContain('pad:compact') // the card already drawn goes too
  expect((await pad($, '')).text).toBe('O launchpad está desligado. /pad on liga de novo.')
  expect((await pad($, 'list')).text).toContain('/compact') // the list still works

  await start($) // a new session reads the store
  expect((await pad($, '')).text).toBe('O launchpad está desligado. /pad on liga de novo.')

  expect((await pad($, 'on')).text).toContain('Launchpad ligado')
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
  // 28 rows less 18 for the rest (8 buttons in the menu): 10 for the list.
  const ui = await pane($, 'terminal', 28)
  const shown = async () => {
    const drawn = JSON.stringify(await ui.drawn())
    return { keys: [...drawn.matchAll(/"key":"add:command:([^"]+)"/g)].map(m => m[1]), drawn }
  }
  let now = await shown()
  expect(now.keys).toEqual(['cmd-00', 'cmd-01', 'cmd-02', 'cmd-03', 'cmd-04', 'cmd-05', 'cmd-06', 'cmd-07', 'cmd-08', 'cmd-09'])
  expect(now.drawn).toContain('1–10 de 35')

  await ui.press({ key: 'list:down' }) // a page less one row, so the last stays in view
  now = await shown()
  expect(now.keys[0]).toBe('cmd-09')
  expect(now.drawn).toContain('10–19 de 35')

  await ($ as any).ui.scroll({ component: 'Pane', requestId: 'launchpad', by: 100 })
  now = await shown()
  expect(now.drawn).toContain('26–35 de 35') // the wheel stops at the end
  expect(now.keys.at(-1)).toBe('cost')

  await ui.press({ key: 'list:up' })
  expect((await shown()).drawn).toContain('17–26 de 35')

  await ui.input({ key: 'filter', kind: 'change', text: 'cmd-2' })
  now = await shown()
  expect(now.keys).toEqual(['cmd-20', 'cmd-21', 'cmd-22', 'cmd-23', 'cmd-24', 'cmd-25', 'cmd-26', 'cmd-27', 'cmd-28', 'cmd-29'])
  expect(now.drawn).not.toContain('list:down') // 10 fit: no scroll row
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the row under the menu presses /pad's own arguments on ${surface}`, async ($, on) => {
    const w = world(on)
    await start($)
    const ui = await row($, surface)
    const drawn = JSON.stringify(await ui.drawn())
    for (const verb of ['configuration', 'list', 'add', 'remove', 'reset', 'off', 'help']) expect(drawn).toContain(`"key":"cmd:${verb}"`)

    await ui.press({ key: 'cmd:configuration' })
    expect(w.opened).toEqual(['launchpad'])
    await ui.press({ key: 'cmd:list' })
    await ui.press({ key: 'cmd:help' })
    expect(w.logs[0]).toBe('1. 🗜️ Compactar conversa  /compact  (comando, padrão)') // one row a line
    expect(w.logs[1]).toBe('2. 📊 Ver contexto  /context  (comando, padrão)')
    expect(w.logs.some(l => l.includes('\n'))).toBe(false)
    expect(w.logs).toContain('/pad configuration     abre o painel para escolher e ordenar os atalhos')
    expect(w.commands).toEqual([]) // run here, not as a command
    await ui.press({ key: 'cmd:add' })
    await ui.press({ key: 'cmd:remove' })
    await ui.press({ key: 'cmd:reset' })
    expect(w.fills.map(f => f.text)).toEqual(['/pad add [nome] | [/comando ou @agente]', '/pad remove [número]', '/pad reset'])
    expect(w.fills[0]!.decorations).toEqual([{ start: 9, end: 15, bold: true, underline: true }])

    await ui.press({ key: 'cmd:off' })
    expect(JSON.stringify(await ui.drawn())).not.toContain('cmd:off') // off: the card goes
    expect((await pad($, '')).text).toBe('O launchpad está desligado. /pad on liga de novo.')
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
const band = ($: any, surface = 'terminal') =>
  $.ui.mount({ plugin: 'launchpad', surface, component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' }, viewport: { columns: 122, rows: 40 } } as never)
const menuPane = ($: any, surface = 'terminal') =>
  $.ui.mount({ plugin: 'launchpad', surface, component: 'Pane', requestId: 'launchpad-menu', props: { title: 'Atalhos', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} }, viewport: { columns: 102, rows: 40 } } as never)

test('a command that takes an optional argument asks which, No argument first', async ($, on) => {
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
  w.answer = 'Sem argumento'
  await card.press({ key: `pad:${id}` })
  expect(w.asked[0]).toEqual({ question: 'Rodar /clear com qual argumento? Dica: [name]. Em "Other", escreva o seu.', options: ['Sem argumento', 'Escrever no prompt'] })
  expect(w.commands).toEqual(['clear'])
  // Text typed under "Other" runs as the argument.
  w.answer = 'refactor'
  await card.press({ key: `pad:${id}` })
  expect(w.commands).toEqual(['clear', 'clear refactor'])
  expect(w.fills).toEqual([])
  await card.unmount()
})

test('a hint with alternatives offers them; Write it in the prompt fills the blank', async ($, on) => {
  const w = world(on, files, undefined, [...COMMANDS, { name: 'autocompact', description: 'Auto-compact', source: 'builtin' }])
  await start($)
  await ($ as any).command.describe({ command: 'autocompact', description: 'Auto-compact', argumentHint: '[auto|<tokens>]', isHidden: false })
  await pad($, 'add Auto | /autocompact')
  const card = await row($)
  const drawn = JSON.stringify(await card.drawn())
  const id = new RegExp(`"key":"pad:([^"]+)","label":"[^"]*Auto`).exec(drawn)?.[1]
  w.answer = 'auto'
  await card.press({ key: `pad:${id}` })
  expect(w.asked[0]!.options).toEqual(['Sem argumento', 'auto', 'Escrever no prompt'])
  expect(w.commands).toEqual(['autocompact auto'])
  w.answer = 'Escrever no prompt'
  await card.press({ key: `pad:${id}` })
  expect(w.fills.map(f => f.text)).toEqual(['/autocompact [auto|<tokens>]'])
  // Dismissed: the command waits in the prompt, as before the dialog.
  w.answer = undefined
  await card.press({ key: `pad:${id}` })
  expect(w.fills).toHaveLength(2)
  expect(w.commands).toEqual(['autocompact auto'])
  await card.unmount()
})

test('a menu button the catalog lacks reads it again: a mod that registered its command later', async ($, on) => {
  const commands = [...COMMANDS]
  const w = world(on, files, undefined, commands)
  await start($)
  await pad($, 'place prompt')
  const ui = await band($)
  expect(JSON.stringify(await ui.drawn())).not.toContain('pad:limits')
  commands.push({ name: 'limits', description: 'Plan limits', source: 'plugin' })
  await w.clock.advance(20_000)
  await pad($, 'list') // anything that draws the row again
  expect(JSON.stringify(await ui.drawn())).toContain('pad:limits')
  await ui.unmount()
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
  w.answer = 'Sem argumento'
  await card.press({ key: `pad:${id}` })
  expect(w.commands).toEqual(['clear'])
  await card.unmount()
})

test('/pad place prompt: the menu in a row under the prompt, kept across sessions', async ($, on) => {
  const w = world(on)
  await start($)
  expect((await pad($, 'place prompt')).text).toBe('O menu agora fica numa linha abaixo do prompt, sempre à mão.')
  // The card is gone from /pad's row; /pad points at the band.
  const card = await row($)
  expect(JSON.stringify(await card.drawn())).not.toContain('pad:compact')
  await card.unmount()
  expect((await pad($, '')).text).toBe('O menu está na linha abaixo do prompt. /pad place header volta ao cartão.')

  await start($) // a new session reads the store
  const ui = await band($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('"key":"pad:compact"')
  expect(drawn).toContain('⋯ configurar')
  await ui.press({ key: 'pad:compact' })
  expect(w.commands).toEqual(['compact'])
  await ui.press({ key: 'band:settings' })
  expect(w.opened).toEqual(['launchpad'])
  await pad($, 'off')
  expect(JSON.stringify(await ui.drawn())).not.toContain('pad:compact')
  await ui.unmount()
})

test('no row under the prompt unless the menu is placed there', async ($, on) => {
  world(on)
  await start($)
  const ui = await band($)
  expect(JSON.stringify(await ui.drawn())).not.toContain('pad:compact')
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
