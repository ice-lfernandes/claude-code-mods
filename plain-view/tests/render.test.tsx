import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-09T12:00:00Z')
const ON = { options: { enabled: true, language: 'pt-BR', icons: 'symbol' } }
const TASKS = ['Escolher o estilo e o layout da página', 'Ver como a página pega o tempo ao vivo', 'Montar o painel do tempo', 'Publicar e compartilhar o link']

/** The drawn tree as JSON, then its texts joined, so a word split across Texts (the gradient title) still reads. */
const show = (tree: unknown) => {
  const texts: string[] = []
  const walk = (n: any): void => void (typeof n === 'string' ? texts.push(n) : Array.isArray(n) ? n.forEach(walk) : n && typeof n === 'object' ? walk(n.children ?? []) : undefined)
  walk(tree)
  return `${JSON.stringify(tree)}\n${texts.join('')}`
}

type World = {
  answer: string
  toolUses: unknown[]
  refused: string[]
  sets: { key: string; value: unknown }[]
  logs: string[]
  toasts: string[]
  clock: ReturnType<typeof mock.clock>
  /** What $.agent.list() answers, $.command.list() answers, and the commands the mod ran. */
  listed: { id: string; description: string; type: string; status: string }[]
  commands: { name: string; description: string; source: string; plugin?: string }[]
  ran: string[]
}

/** The engine beneath the mod: options, turns and tools answered as a session would. */
function engine(on: any, theme = 'dark'): World {
  const world: World = { answer: '', toolUses: [], refused: [], sets: [], logs: [], toasts: [], clock: mock.clock(on, { now: NOW }), listed: [], commands: [], ran: [] }
  let id = 0
  let agent = 0
  on('env.get', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }) as never)
  on('config.list', () => ({ value: [{ key: 'theme', value: theme }] }) as never)
  on('config.set', ($: any, e: any) => (world.sets.push({ key: e.key, value: e.value }), { value: e.value }) as never)
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }) as never)
  on('turn.complete', () => ({ text: 'done' }) as never)
  on('turn.step', async function* ($: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: world.answer, toolUses: world.toolUses, stopReason: world.toolUses.length ? 'tool_use' : 'end_turn' }
  } as never)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'engine', scope: 'shared' }] }) as never)
  on('ui.toast', ($: any, e: any) => (world.toasts.push(e.text), { value: undefined }) as never)
  on('ui.log', ($: any, e: any) => (world.logs.push(e.text), { value: undefined }) as never)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `a${++agent}` }) as never)
  on('agent.list', () => ({ value: world.listed }) as never)
  on('command.list', () => ({ value: world.commands }) as never)
  on('command.run', ($: any, e: any) => (world.ran.push(e.command), { text: '' }) as never)
  on('tool.call', ($: any, e: any) => {
    if (e.tool === 'TaskCreate') return { result: { task: { id: String(++id), subject: e.subject } }, text: 'ok' } as never
    if (e.tool === 'TaskUpdate' && world.refused.includes(e.taskId)) return { result: { success: false, taskId: e.taskId, updatedFields: [], error: 'blocked' }, text: 'blocked' } as never
    if (e.tool === 'Bash' && e.command === 'npm test') return { result: { stdout: '', stderr: 'FAIL' }, text: 'FAIL', isError: true } as never
    return { result: 'ok', text: 'ok' } as never
  })
  // What the engine draws for any component: a box this file can tell apart.
  on('ui.render', ($: any, e: any) => {
    const { Box, Text } = $.ui.resolve(e)
    if (e.component === 'PromptHint') return Text({ children: `hint: ${e.props.hint}${e.props.tail ? ` | tail: ${e.props.tail}` : ''}` }) as never
    return Box({ key: 'engine', children: Text({ children: 'engine row' }) }) as never
  })
  return world
}

const start = ($: any, surface = 'terminal') => $.session.start({ cwd: '/repo', surface, isInteractive: true } as never)
const ask = ($: any, text = 'Monte um painel do tempo para São Paulo.') => $.turn.start({ text, turnId: 't1' } as never)
const end = ($: any, reason = 'answer') => $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: reason === 'aborted', turnId: 't1', reason } as never)
const call = ($: any, tool: string, input: Record<string, unknown> = {}) => $.tool.call({ tool, ...input } as never)
const run = ($: any, args: string) => $.command.run({ command: 'plain-view', args, origin: { kind: 'composer' } } as never) as Promise<{ text?: string }>
const card = async ($: any, surface = 'terminal', columns = 140) => {
  const ui = await $.ui.mount({ plugin: 'plain-view', surface, component: 'AbovePrompt', props: { bodyColumns: columns, hasSurvey: false, isWorking: true, maxRows: 20 }, viewport: { columns, rows: 40 } } as never)
  const drawn = show(await ui.drawn())
  await ui.unmount()
  return drawn
}
const row = async ($: any, component: string, props: Record<string, unknown>, surface = 'terminal') => {
  const ui = await $.ui.mount({ plugin: 'plain-view', surface, component, props, viewport: { columns: 120, rows: 40 } } as never)
  const drawn = JSON.stringify(await ui.drawn())
  await ui.unmount()
  return drawn
}
const toolUse = (tool: string, more: Record<string, unknown> = {}) => ({ tool_use_id: 'tu1', tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false, ...more })

/** The plan of the prototype: four tasks, the first done, the second in progress. */
const plan = async ($: any) => {
  for (const subject of TASKS) await call($, 'TaskCreate', { subject, description: subject })
  await call($, 'TaskUpdate', { taskId: '1', status: 'in_progress' })
  for (let i = 0; i < 4; i++) await call($, 'Read', { file_path: `/repo/src/f${i}.ts` })
  await call($, 'TaskUpdate', { taskId: '1', status: 'completed' })
  await call($, 'TaskUpdate', { taskId: '2', status: 'in_progress' })
  await call($, 'WebFetch', { url: 'https://api.open-meteo.com/v1/forecast', prompt: 'x' })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`entendendo o pedido, then passo 2 de 4 on ${surface}`, ON, async ($, on) => {
    const w = engine(on)
    await start($, surface)
    await ask($)
    await w.clock.advance(3000)
    let drawn = await card($, surface)
    expect(drawn).toContain('Monte um painel do tempo para São Paulo.')
    expect(drawn).toContain('Passo 1 de 2')
    expect(drawn).toContain('Entender o pedido')
    expect(drawn).toContain('Planejar os passos')
    expect(drawn).toContain('engine row') // the band beneath stays

    await plan($)
    drawn = await card($, surface)
    expect(drawn).toContain('Passo 2 de 4')
    expect(drawn).toContain('Feito')
    expect(drawn).toContain('~25%')
    expect(drawn).toContain('na web')
    expect(drawn).toContain('Próximo')
    expect(drawn).toContain('Depois')
    expect(drawn).toContain('31%')
    // The terminal draws the bars as Rasters; the desktop as text in theme keys.
    if (surface === 'terminal') expect(drawn).toContain('"columns":18')
    else expect(drawn).toContain('░')
  })

  test(`tudo pronto, with the files, on ${surface}`, ON, async ($, on) => {
    engine(on)
    await start($, surface)
    await ask($)
    for (const subject of TASKS) await call($, 'TaskCreate', { subject, description: subject })
    await call($, 'Read', { file_path: '/repo/src/api/weather.ts' })
    await call($, 'Write', { file_path: '/repo/src/Dashboard.tsx' })
    for (const taskId of ['1', '2', '3', '4']) await call($, 'TaskUpdate', { taskId, status: 'completed' })
    await end($)
    const drawn = await card($, surface)
    expect(drawn).toContain('✓ Tudo pronto')
    expect(drawn).toContain('levou')
    expect(drawn).toContain('4 de 4 passos')
    expect(drawn).toContain('100%')
    expect(drawn).toContain('mudei 1 arquivo · li 1 arquivo')
  })
}

test('plano longo: five rows around the current task and the count of the rest', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  for (let i = 1; i <= 9; i++) await call($, 'TaskCreate', { subject: `Tarefa ${i}`, description: '' })
  for (const taskId of ['1', '2', '3', '4', '5']) await call($, 'TaskUpdate', { taskId, status: 'completed' })
  await call($, 'TaskUpdate', { taskId: '6', status: 'in_progress' })
  const drawn = await card($)
  expect(drawn).toContain('✓ mais 4 feitos')
  expect(drawn).toContain('Tarefa 9')
  expect(drawn).not.toContain('Tarefa 3')
})

test('sem lista de tarefas: the tool in flight; fim sem lista: the small card over the engine band', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($, 'O que o weather.ts faz?')
  await call($, 'Read', { file_path: '/repo/src/weather.ts' })
  let drawn = await card($)
  expect(drawn).toContain('Lendo weather.ts')
  expect(drawn).toContain('O que o weather.ts faz?')
  await end($)
  drawn = await card($)
  expect(drawn).not.toContain('Lendo weather.ts')
  expect(drawn).toContain(' ✓ Pronto ')
  expect(drawn).toContain('li 1 arquivo')
  expect(drawn).toContain('engine row')
})

test('interrompido: the grey badge and where it stopped', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  await plan($)
  await end($, 'aborted')
  const drawn = await card($)
  expect(drawn).toContain('■ Interrompido')
  expect(drawn).toContain('parou em')
  expect(drawn).toContain('Parado')
  expect(drawn).toContain('li 4 arquivos')
})

test('a new request clears the card of the last one', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  for (const subject of TASKS) await call($, 'TaskCreate', { subject, description: subject })
  for (const taskId of ['1', '2', '3', '4']) await call($, 'TaskUpdate', { taskId, status: 'completed' })
  await end($)
  await ask($, 'E agora em inglês?')
  const drawn = await card($)
  expect(drawn).not.toContain('Tudo pronto')
  expect(drawn).toContain('E agora em inglês?')
  expect(drawn).toContain('Entender o pedido')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`tool rows step aside; a failure, an interrupt and the agent's questions draw in full on ${surface}`, ON, async ($, on) => {
    engine(on)
    await start($, surface)
    expect(await row($, 'ToolUse', toolUse('Read'), surface)).not.toContain('engine row')
    expect(await row($, 'ToolUse', toolUse('Bash', { isErrored: true }), surface)).toContain('engine row')
    expect(await row($, 'ToolUse', toolUse('Edit', { isInterrupted: true }), surface)).toContain('engine row')
    for (const tool of ['AskUserQuestion', 'ExitPlanMode', 'Agent']) expect(await row($, 'ToolUse', toolUse(tool), surface)).toContain('engine row')
    expect(await row($, 'ToolResult', { tool_use_id: 'tu1', tool: 'Write', output: {}, isErrored: false }, surface)).not.toContain('engine row')
    expect(await row($, 'ToolResult', { tool_use_id: 'tu1', tool: 'Bash', output: {}, isErrored: true }, surface)).toContain('engine row')
    const calls = [
      { tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
      { tool: 'Grep', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
    ]
    expect(await row($, 'ToolGroup', { calls, isActive: false, isExpanded: false }, surface)).not.toContain('engine row')
    expect(await row($, 'ToolGroup', { calls: [...calls, { ...calls[0], isErrored: true }], isActive: false, isExpanded: false }, surface)).toContain('engine row')
  })
}

test('tool falhou: the failed call counts in the turn and the card goes on', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  await plan($)
  await call($, 'Bash', { command: 'npm test' })
  const drawn = await card($)
  expect(drawn).toContain('Passo 2 de 4')
  expect(drawn).toContain('rodando npm test')
  await call($, 'Bash', { command: 'python3 x.py', description: 'Extrair a série horária' })
  await call($, 'Skill', { skill: 'artifact-design' })
  expect(await card($)).toContain('usando a skill artifact-design')
  await call($, 'Artifact', { file_path: 'x' })
  expect(await card($)).toContain('usando Artifact')
})

test('desligado (padrão): nothing changes', async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  await call($, 'Read', { file_path: '/repo/a.ts' })
  expect(await card($)).not.toContain('a.ts')
  expect(await row($, 'ToolUse', toolUse('Read'))).toContain('engine row')
  expect(await row($, 'PromptHint', { isDraft: false, isWorking: false, hint: '? for shortcuts' })).not.toContain('plain view')
})

test('the hint line names the mode while it is on, after any tail', ON, async ($, on) => {
  engine(on)
  await start($)
  expect(await row($, 'PromptHint', { isDraft: false, isWorking: true, hint: 'esc to interrupt' })).toContain('tail: plain view')
  expect(await row($, 'PromptHint', { isDraft: false, isWorking: true, hint: 'x', tail: 'other' })).toContain('tail: other · plain view')
})

const step = async ($: any, w: World, answer: string, toolUses: unknown[] = []) => {
  w.answer = answer
  w.toolUses = toolUses
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 } as never)
  for await (const _ of stream) {
    // drain
  }
}

test('a checklist in the agent\'s answer becomes the plan when it keeps no task list', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await ask($)
  await step($, w, 'Plano em 4 passos:\n\n1. [ ] Carregar diretrizes\n2. [ ] Definir fonte de dados\n3. [ ] Escrever HTML\n4. [ ] Validar e publicar')
  let drawn = await card($)
  expect(drawn).toContain('Passo 1 de 4')
  expect(drawn).toContain('Carregar diretrizes')
  await step($, w, 'Feito o primeiro.\n\n1. [x] Diretrizes carregadas\n2. [ ] Definir fonte de dados\n3. [ ] Escrever HTML\n4. [ ] Validar e publicar')
  drawn = await card($)
  expect(drawn).toContain('Passo 2 de 4')
  expect(drawn).toContain('Diretrizes carregadas')
  // A task tool takes over from the text, and the text no longer moves the list.
  await call($, 'TaskCreate', { subject: 'Ler a API', description: '' })
  await call($, 'TaskCreate', { subject: 'Montar o painel', description: '' })
  await step($, w, '1. [x] Outra coisa\n2. [x] Mais outra')
  drawn = await card($)
  expect(drawn).toContain('Ler a API')
  expect(drawn).not.toContain('Outra coisa')
})

test('askForTasks: one line in the system prompt while the mod is on', { options: { enabled: true, askForTasks: true } }, async ($, on) => {
  engine(on)
  await start($)
  const result: any = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: ['Bash', 'TodoWrite'], outputStyle: null, traits: [] } as never)
  expect(result.sections.map((x: any) => x.id)).toEqual(['intro', 'plain-view:tasks'])
  expect(result.sections[1].text).toContain('TodoWrite or TaskCreate')
})

test('askForTasks with no task tool: the line asks for a checklist in the reply', ON, async ($, on) => {
  engine(on)
  await start($)
  const result: any = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: ['Bash'], outputStyle: null, traits: [] } as never)
  expect(result.sections.map((x: any) => x.id)).toEqual(['intro', 'plain-view:tasks'])
  expect(result.sections[1].text).toContain('Markdown checklist (`- [ ] step`)')
  expect(result.sections[1].text).not.toContain('TodoWrite')
})

test('askForTasks is on by default, and off when set so', ON, async ($, on) => {
  engine(on)
  await start($)
  const result: any = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: ['TodoWrite'], outputStyle: null, traits: [] } as never)
  expect(result.sections.map((x: any) => x.id)).toEqual(['intro', 'plain-view:tasks'])
})

test('askForTasks off: the system prompt stays as it is', { options: { enabled: true, askForTasks: false } }, async ($, on) => {
  engine(on)
  await start($)
  const result: any = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: ['TodoWrite'], outputStyle: null, traits: [] } as never)
  expect(result.sections.map((x: any) => x.id)).toEqual(['intro'])
})

const FINAL = 'Pronto: o painel mostra o tempo agora e as próximas 24 h em localhost:5173. Abra no navegador.'
const message = (text: string) => ({ text, isFirstOfReply: true })
const turnOver = async ($: any, answer: string) =>
  $.turn.complete({ answer, durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)

const TOOL_USE = { id: 'tu1', name: 'Read', input: {}, startedAt: 0 }

test('agentText final (the default): a step that calls tools steps aside, the final answer stays', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await ask($)
  const mid = 'Plano em 4 passos:\n1. [ ] Ler a API\n2. [ ] Montar o painel'
  const ui = await $.ui.mount({ plugin: 'plain-view', surface: 'terminal', component: 'AssistantMessage', props: message(mid), viewport: { columns: 120, rows: 40 } } as never)
  // Unknown text shows until its step ends with a tool call; then the mounted block hides.
  expect(JSON.stringify(await ui.drawn())).toContain('engine row')
  await step($, w, mid, [TOOL_USE])
  expect(JSON.stringify(await ui.drawn())).not.toContain('engine row')
  await ui.unmount()
  // The final answer's step calls no tool: it stays, during and after the turn.
  await step($, w, FINAL)
  expect(await row($, 'AssistantMessage', message(FINAL))).toContain('engine row')
  await turnOver($, FINAL)
  expect(await row($, 'AssistantMessage', message(FINAL))).toContain('engine row')
  // A block nothing is known about (an old turn, a resumed session) shows.
  expect(await row($, 'AssistantMessage', message('Uma resposta de antes.'))).toContain('engine row')
})

test('a refused TaskUpdate leaves the card as it was', ON, async ($, on) => {
  const w = engine(on)
  w.refused = ['2']
  await start($)
  await ask($)
  for (const subject of TASKS) await call($, 'TaskCreate', { subject, description: subject })
  await call($, 'TaskUpdate', { taskId: '2', status: 'completed' })
  expect(await card($)).not.toContain('Feito')
})

test('a demo cut by a reload ends instead of freezing', { options: { language: 'pt-BR' } }, async ($, on) => {
  engine(on)
  await start($)
  await run($, 'demo')
  expect(await card($)).toContain('Demo: monte um painel do tempo')
  await start($) // the reload runs session.start again
  expect(await card($)).not.toContain('Demo:')
})

test('agentText none: no message shows', { options: { enabled: true, agentText: 'none' } }, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  await turnOver($, FINAL)
  expect(await row($, 'AssistantMessage', message(FINAL))).not.toContain('engine row')
})

test('agentText all: every message shows', { options: { enabled: true, agentText: 'all' } }, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  expect(await row($, 'AssistantMessage', message('Plano em 4 passos:'))).toContain('engine row')
})

test('agentText card: no message, and the end card carries the answer\'s first sentence', { options: { enabled: true, agentText: 'card', language: 'pt-BR' } }, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  for (const subject of TASKS) await call($, 'TaskCreate', { subject, description: subject })
  for (const taskId of ['1', '2', '3', '4']) await call($, 'TaskUpdate', { taskId, status: 'completed' })
  await turnOver($, FINAL)
  expect(await row($, 'AssistantMessage', message(FINAL))).not.toContain('engine row')
  const drawn = await card($)
  expect(drawn).toContain('Resposta: Pronto: o painel mostra o tempo agora e as próximas 24 h em localhost:5173.')
  expect(drawn).not.toContain('Abra no navegador')
})

test('with the mod off, the agent\'s words are never touched', { options: { agentText: 'none' } }, async ($, on) => {
  engine(on)
  await start($)
  expect(await row($, 'AssistantMessage', message('qualquer coisa'))).toContain('engine row')
})

test('/plain-view on and off write the option, and say so', async ($, on) => {
  const w = engine(on)
  await start($)
  expect((await run($, 'off')).text).toBe('plain-view is already off.')
  expect((await run($, 'on')).text).toBe('plain-view on · /plain-view off turns it off')
  expect(w.sets).toEqual([{ key: 'plain-view.enabled', value: true }])
})

test('/plain-view off when on', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  expect((await run($, 'off')).text).toBe('plain-view desligado · /plain-view on liga')
  expect(w.sets).toEqual([{ key: 'plain-view.enabled', value: false }])
})

test('help: the verbs and where the palette changes, with buttons', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  const { text } = await run($, 'help')
  expect(text).toContain('`palette` mostra as 8 paletas')
  expect(text).toContain('Paleta padrão: claude')
  const ui = await $.ui.mount({ plugin: 'plain-view', surface: 'terminal', component: 'CommandOutput', props: { command: 'plain-view', args: 'help', text, isErrored: false }, viewport: { columns: 120, rows: 40 } } as never)
  const drawn = JSON.stringify(await ui.drawn())
  for (const verb of ['on', 'off', 'demo', 'palette']) expect(drawn).toContain(`"key":"verb:${verb}"`)
  await ui.press({ key: 'verb:palette' })
  expect(w.logs.join('\n')).toContain('aurora')
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`palette: the eight with a sample, the one in use, a button to switch on ${surface}`, { options: { language: 'pt-BR', palette: 'claude' } }, async ($, on) => {
    const w = engine(on)
    await start($, surface)
    const { text } = await run($, 'palette')
    expect(text).toContain('agora: claude')
    expect(text).toContain('`neon`')
    const ui = await $.ui.mount({ plugin: 'plain-view', surface, component: 'CommandOutput', props: { command: 'plain-view', args: 'palette', text, isErrored: false }, viewport: { columns: 120, rows: 40 } } as never)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('em uso')
    expect(drawn).toContain('use:aurora')
    expect(drawn).not.toContain('use:claude')
    expect(drawn).toContain('/config → plain-view → palette')
    if (surface === 'terminal') expect(drawn).toContain('work:aurora')
    await ui.press({ key: 'use:aurora' })
    expect(w.sets).toEqual([{ key: 'plain-view.palette', value: 'aurora' }])
    expect(w.toasts).toEqual(['Paleta aurora · salva em /config'])
    await ui.unmount()
  })
}

test('palette by name, and a name it does not know', { options: { language: 'en' } }, async ($, on) => {
  const w = engine(on)
  await start($)
  expect((await run($, 'palette Neon')).text).toBe('Palette neon · saved in /config')
  expect((await run($, 'palette pink')).text).toContain('No palette named "pink"')
  expect(w.sets).toEqual([{ key: 'plain-view.palette', value: 'neon' }])
})

test('demo: the sample card, step by step, even with the mod off', { options: { language: 'pt-BR' } }, async ($, on) => {
  const w = engine(on)
  await start($)
  expect((await run($, 'demo')).text).toContain('Demo no cartão acima do prompt')
  let drawn = await card($)
  expect(drawn).toContain('Demo: monte um painel do tempo')
  expect(drawn).toContain('Passo 1 de 4')
  await w.clock.advance(3000)
  expect(await card($)).toContain('Passo 2 de 4')
  await w.clock.advance(9000)
  drawn = await card($)
  expect(drawn).toContain('✓ Tudo pronto')
})

test('demo waits while the agent works', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  expect((await run($, 'demo')).text).toBe('O agente está trabalhando. Rode a demo quando o pedido terminar.')
})

test('the figures take the bar end color of the palette; animation off falls back to theme keys', { options: { enabled: true, palette: 'aurora' } }, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  await plan($)
  const drawn = await card($)
  expect(drawn).toContain('#4aa8ff') // aurora's g2 in the dark set
})

test('light theme picks the light set', { options: { enabled: true, palette: 'aurora' } }, async ($, on) => {
  engine(on, 'light')
  await start($)
  await ask($)
  await plan($)
  expect(await card($)).toContain('#1f6feb')
})

test('animation off: no gradient, no Raster, theme keys', { options: { enabled: true, animation: false } }, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  await plan($)
  const drawn = await card($)
  expect(drawn).not.toContain('"cells"')
  expect(drawn).toContain('"claude"')
})

test('the shine moves while the agent works and stops when the turn ends', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await ask($)
  await plan($)
  const before = await card($)
  await w.clock.advance(100)
  const after = await card($)
  expect(after).not.toBe(before)
  await end($)
  const done = await card($)
  await w.clock.advance(500)
  expect(await card($)).toBe(done)
})

test('80 columns: the card fits', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  await plan($)
  const drawn = await card($, 'terminal', 80)
  expect(drawn).toContain('"columns":10')
  expect(drawn).toContain('"columns":56')
})

test('subagent calls do not move the card', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  await call($, 'Read', { file_path: '/repo/x.ts', agentId: 'a1' })
  expect(await card($)).toContain('Entender o pedido')
})

test('icons: emoji in the steps when asked', { options: { enabled: true, icons: 'emoji', language: 'pt-BR' } }, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  await plan($)
  const drawn = await card($)
  expect(drawn).toContain('✅')
  expect(drawn).toContain('🟠')
})

// 0.1.5: the agents the main loop spawns, and the end of a turn with no task list.
const REQUEST = 'Revise o código e abra a PR'
const SPAWN = { tool_use_id: 'tu9', prompt: 'review', description: 'code-review', subagentType: 'general-purpose', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false }
const NOTICE = '<task-notification>\n<task-id>a1</task-id>\n<status>completed</status>\n</task-notification>'
const WATCH_CMD = { name: 'watch', description: 'Agents', source: 'plugin', plugin: 'agent-watch' }
const spawn = ($: any, more: Record<string, unknown> = {}) => $.agent.spawn({ ...SPAWN, ...more } as never)
const agentDone = ($: any, agentId = 'a1', reason = 'answer') =>
  $.turn.complete({ answer: 'report', durationMs: 1000, isAborted: false, turnId: `t-${agentId}`, reason, agentId } as never)
/** A request that hands the code review to a background agent. */
const delegate = async ($: any) => {
  await ask($, REQUEST)
  await call($, 'Agent', { description: 'code-review', prompt: 'review', subagent_type: 'general-purpose', run_in_background: true })
  await spawn($)
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`turno chama um agente: the agents row under the tool phrase on ${surface}`, ON, async ($, on) => {
    const w = engine(on)
    w.listed = [{ id: 'a1', description: 'code-review', type: 'general-purpose', status: 'running' }]
    await start($, surface)
    await delegate($)
    await w.clock.advance(192_000)
    const drawn = await card($, surface)
    expect(drawn).toContain(REQUEST)
    expect(drawn).toContain('◇ ')
    expect(drawn).toContain('1 agente rodando')
    expect(drawn).toContain(' · code-review · 3m 12s')
    expect(drawn).not.toContain('/watch')
    expect(drawn).not.toMatch(/tokens|\$/)
  })

  test(`esperando o agente: the main turn ended, the card waits with the comet on ${surface}`, ON, async ($, on) => {
    const w = engine(on)
    await start($, surface)
    await delegate($)
    await end($)
    await w.clock.advance(1000)
    const drawn = await card($, surface)
    expect(drawn).toContain('◐ ')
    expect(drawn).toContain('Esperando 1 agente')
    expect(drawn).toContain('1 agente rodando')
    expect(drawn).not.toContain('Pronto')
    if (surface === 'terminal') expect(drawn).toContain('"cells"')
    else expect(drawn).toContain('░')
  })

  test(`turno da notificação: the finished agent in the row on ${surface}`, ON, async ($, on) => {
    const w = engine(on)
    await start($, surface)
    await delegate($)
    await end($)
    await w.clock.advance(219_000)
    await agentDone($)
    await ask($, NOTICE)
    await call($, 'Read', { file_path: '/repo/hooks/plan.ts' })
    const drawn = await card($, surface)
    expect(drawn).toContain(REQUEST)
    expect(drawn).toContain('Lendo plan.ts')
    expect(drawn).toContain('1 agente terminou · code-review')
    expect(drawn).toContain('"success"')
  })

  test(`fim sem lista: the small green card with the files and the agent on ${surface}`, ON, async ($, on) => {
    const w = engine(on)
    await start($, surface)
    await delegate($)
    await call($, 'Read', { file_path: '/repo/a.ts' })
    await call($, 'Edit', { file_path: '/repo/b.ts' })
    await w.clock.advance(60_000)
    await agentDone($)
    await end($)
    const drawn = await card($, surface)
    expect(drawn).toContain(' ✓ Pronto ')
    expect(drawn).toContain('levou 1m 00s')
    expect(drawn).toContain('mudei 1 arquivo · li 1 arquivo · 1 agente')
    expect(drawn).toContain('"borderColor":"success"')
    expect(drawn).toContain('engine row')
    // It goes on the next request.
    await ask($, 'E agora?')
    expect(await card($, surface)).not.toContain('Pronto')
  })

  test(`Esc sem lista: grey, where it stopped on ${surface}`, ON, async ($, on) => {
    const w = engine(on)
    await start($, surface)
    await ask($, REQUEST)
    await call($, 'Read', { file_path: '/repo/a.ts' })
    await w.clock.advance(52_000)
    await end($, 'aborted')
    const drawn = await card($, surface)
    expect(drawn).toContain(' ■ Interrompido ')
    expect(drawn).toContain('parou em 52s')
    expect(drawn).toContain('"borderColor":"inactive"')
  })

  test(`com plano + agente: the plan card adds the row, and keeps it once ended on ${surface}`, ON, async ($, on) => {
    engine(on)
    await start($, surface)
    await ask($)
    await plan($)
    await spawn($)
    let drawn = await card($, surface)
    expect(drawn).toContain('Passo 2 de 4')
    expect(drawn).toContain('1 agente rodando · code-review')
    await end($)
    drawn = await card($, surface)
    expect(drawn).toContain('✓ Turno pronto')
    expect(drawn).toContain('1 agente rodando · code-review')
    expect(drawn).not.toContain('Esperando')
  })
}

test('plurals: two agents running, then finished, in pt-BR and en', ON, async ($, on) => {
  engine(on)
  await start($)
  await delegate($)
  await spawn($, { description: 'tests' })
  expect(await card($)).toContain('2 agentes rodando · tests')
  await end($)
  expect(await card($)).toContain('Esperando 2 agentes')
  await agentDone($, 'a1')
  await agentDone($, 'a2')
  await ask($, NOTICE)
  expect(await card($)).toContain('2 agentes terminaram')
})

test('plurals in en', { options: { enabled: true, language: 'en', icons: 'symbol' } }, async ($, on) => {
  engine(on)
  await start($)
  await delegate($)
  await spawn($, { description: 'tests' })
  await end($)
  const drawn = await card($)
  expect(drawn).toContain('Waiting for 2 agents')
  expect(drawn).toContain('2 agents running')
  await agentDone($, 'a1')
  await agentDone($, 'a2')
  expect(await card($)).toContain(' ✓ Done ')
  expect(await card($)).toContain('2 agents')
})

test('/watch shows only with agent-watch\'s command, and its press runs it', ON, async ($, on) => {
  const w = engine(on)
  w.commands = [{ ...WATCH_CMD, plugin: 'other' }]
  await start($)
  await delegate($)
  expect(await card($)).not.toContain('/watch')
  w.commands = [WATCH_CMD]
  await spawn($, { description: 'tests' })
  const ui = await $.ui.mount({ plugin: 'plain-view', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 120, hasSurvey: false, isWorking: true, maxRows: 20 }, viewport: { columns: 120, rows: 40 } } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('"label":"/watch"')
  expect(drawn).toContain('"dimColor":true')
  await ui.press({ key: 'watch' })
  expect(w.ran).toEqual(['watch'])
  await ui.unmount()
})

test('agents spawned by a subagent, or a workflow, stay out of the row', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($, REQUEST)
  await call($, 'Read', { file_path: '/repo/a.ts' })
  await spawn($, { parentAgentId: 'a0' })
  await spawn($, { workflow: { runId: 'wf_1', agentIndex: 1 } })
  expect(await card($)).not.toContain('◇')
  await end($)
  const drawn = await card($)
  expect(drawn).not.toContain('Esperando')
  expect(drawn).toContain('✓ Pronto')
  expect(drawn).not.toContain('agente')
})

test('plain conversation: no tool call, no agent, no card', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($, 'Oi, tudo bem?')
  await end($)
  const drawn = await card($)
  expect(drawn).not.toContain('Oi, tudo bem?')
  expect(drawn).toContain('engine row')
})

test('agentText card: the answer on the small card', { options: { enabled: true, agentText: 'card', language: 'pt-BR' } }, async ($, on) => {
  engine(on)
  await start($)
  await ask($, REQUEST)
  await call($, 'Read', { file_path: '/repo/a.ts' })
  await turnOver($, FINAL)
  const drawn = await card($)
  expect(drawn).toContain(' ✓ Pronto ')
  expect(drawn).toContain('Resposta: Pronto: o painel mostra o tempo agora e as próximas 24 h em localhost:5173.')
})

test('the ticker runs while an agent runs after the turn, and stops after the last one', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await delegate($)
  await end($)
  const before = await card($)
  await w.clock.advance(100)
  expect(await card($)).not.toBe(before)
  await agentDone($)
  const done = await card($)
  expect(done).toContain('✓ Pronto')
  await w.clock.advance(500)
  expect(await card($)).toBe(done)
})

test('an end the events missed: the agent list says completed, and the card stops waiting', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await delegate($)
  await end($)
  expect(await card($)).toContain('Esperando 1 agente')
  w.listed = [{ id: 'a1', description: 'code-review', type: 'general-purpose', status: 'completed' }]
  await w.clock.advance(2100)
  const drawn = await card($)
  expect(drawn).not.toContain('Esperando')
  expect(drawn).toContain('✓ Pronto')
  expect(drawn).toContain('1 agente')
})

test('animation off: the agents are still settled from the list', { options: { enabled: true, animation: false, language: 'pt-BR' } }, async ($, on) => {
  const w = engine(on)
  await start($)
  await delegate($)
  await end($)
  w.listed = [{ id: 'a1', description: 'code-review', type: 'general-purpose', status: 'failed' }]
  await w.clock.advance(2100)
  expect(await card($)).toContain('✓ Pronto')
})

test('80 columns: the waiting card and a long agent label fit', { options: { enabled: true, language: 'pt-BR', icons: 'symbol' } }, async ($, on) => {
  const w = engine(on)
  w.commands = [WATCH_CMD]
  await start($)
  await ask($, REQUEST)
  await spawn($, { description: 'revisar todo o código do repositório com muito cuidado e abrir a PR com as correções' })
  await end($)
  const drawn = await card($, 'terminal', 80)
  expect(drawn).toContain('"columns":10')
  expect(drawn).toContain('…')
  expect(drawn).toContain('"label":"/watch"')
  // The agents row (its spaces before `/watch` included) and `/watch` within the card's 76 inner columns.
  const row = drawn.split('\n')[1]!.split('◇ ')[1]!.replace('engine row', '')
  expect(row.length + 2 + '/watch'.length).toBeLessThanOrEqual(76)
})
