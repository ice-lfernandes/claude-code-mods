import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-09T12:00:00Z')

// A5 (prototype buttons-quiet-a5-a7, variant B): the Buttons of a tree, with the props the variant lives in.
const buttonsOf = (tree: unknown) =>
  [...JSON.stringify(tree).matchAll(/"type":"Button","props":(\{[^{}]*\})/g)].map(m => JSON.parse(m[1]!) as { key: string; variant?: string; plain?: boolean })
const variantOf = (tree: unknown, key: string) => buttonsOf(tree).find(b => b.key === key)?.variant
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
  /** The chunks the step streams before its result, as the model's response arrives. */
  chunks: unknown[]
  refused: string[]
  sets: { key: string; value: unknown }[]
  logs: string[]
  toasts: string[]
  clock: ReturnType<typeof mock.clock>
  /** What $.agent.list() answers, $.command.list() answers, and the commands the mod ran. */
  listed: { id: string; description: string; type: string; status: string }[]
  commands: { name: string; description: string; source: string; plugin?: string }[]
  ran: string[]
  /** The plugin's /config rows, a refusal for $.config.set, the dialog's answer, and the panes opened and closed. */
  rows: { key: string; value: unknown; isLocked?: boolean }[]
  deny: string | null
  choice: string | null
  asked: string[]
  opened: string[]
  closed: string[]
  isPlaced: boolean
}

/** The engine beneath the mod: options, turns and tools answered as a session would. */
function engine(on: any, theme = 'dark'): World {
  const world: World = {
    answer: '', toolUses: [], chunks: [], refused: [], sets: [], logs: [], toasts: [], clock: mock.clock(on, { now: NOW }), listed: [], commands: [], ran: [],
    rows: [], deny: null, choice: null, asked: [], opened: [], closed: [], isPlaced: true,
  }
  let id = 0
  let agent = 0
  on('env.get', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }) as never)
  on('config.list', () => ({ value: [{ key: 'theme', value: theme }, ...world.rows] }) as never)
  on('config.set', ($: any, e: any) => {
    if (world.deny) return { deny: world.deny } as never
    world.sets.push({ key: e.key, value: e.value })
    const row = world.rows.find(r => r.key === e.key)
    if (row) row.value = e.value
    else world.rows.push({ key: e.key, value: e.value })
    return { value: e.value } as never
  })
  on('ui.open', ($: any, e: any) => (world.opened.push(e.id), { value: { isPlaced: world.isPlaced } }) as never)
  on('ui.close', ($: any, e: any) => (world.closed.push(e.id), { value: undefined }) as never)
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }) as never)
  on('turn.complete', () => ({ text: 'done' }) as never)
  on('turn.step', async function* ($: any, e: any) {
    yield* world.chunks
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
    if (e.tool === 'AskUserQuestion') {
      const question = String(e.questions[0].question)
      world.asked.push(question)
      if (world.choice === null) return { deny: 'dismissed' } as never
      return { result: { questions: e.questions, answers: { [question]: world.choice } } } as never
    }
    if (e.tool === 'TaskCreate') return { result: { task: { id: String(++id), subject: e.subject } }, text: 'ok' } as never
    if (e.tool === 'TaskUpdate' && world.refused.includes(e.taskId)) return { result: { success: false, taskId: e.taskId, updatedFields: [], error: 'blocked' }, text: 'blocked' } as never
    if (e.tool === 'Bash' && e.command === 'npm test') return { result: { stdout: '', stderr: 'FAIL' }, text: 'FAIL', isError: true } as never
    return { result: 'ok', text: 'ok' } as never
  })
  // What the engine draws for any component: a box this file can tell apart.
  on('ui.render', ($: any, e: any) => {
    const { Box, Text } = $.ui.resolve(e)
    if (e.component === 'PromptHint') return Text({ children: `hint: ${e.props.hint}${e.props.tail ? ` | tail: ${e.props.tail}` : ''}` }) as never
    return Box({ key: 'engine', children: Text({ children: `engine row${e.props.isExpanded ? ' unfolded' : ''}` }) }) as never
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

  test(`a group with a failed or interrupted call unfolds, so its failure draws, on ${surface}`, ON, async ($, on) => {
    engine(on)
    await start($, surface)
    const ok = { tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false }
    const group = (calls: unknown[]) => ({ calls, isActive: false, isExpanded: false })
    expect(await row($, 'ToolGroup', group([ok, { ...ok, tool: 'Bash', isErrored: true }]), surface)).toContain('engine row unfolded')
    expect(await row($, 'ToolGroup', group([{ ...ok, tool: 'Bash', isInterrupted: true }]), surface)).toContain('engine row unfolded')
    // A group with no failure is not unfolded: it steps aside, or draws as the engine does.
    expect(await row($, 'ToolGroup', group([ok, ok]), surface)).not.toContain('engine row')
    expect(await row($, 'ToolGroup', group([ok, { ...ok, tool: 'Agent' }]), surface)).not.toContain('unfolded')
    // The unfolded rows: the ones that worked step aside, the failed one draws.
    expect(await row($, 'ToolUse', toolUse('Read'), surface)).not.toContain('engine row')
    expect(await row($, 'ToolUse', toolUse('Bash', { isErrored: true, output: 'Exit code 254' }), surface)).toContain('engine row')
  })

  test(`with the mod off, a group with a failure draws as the engine does on ${surface}`, { options: { ...ON.options, enabled: false } }, async ($, on) => {
    engine(on)
    await start($, surface)
    const failed = { tool: 'Bash', input: {}, isRunning: false, isErrored: true, isInterrupted: false }
    const drawn = await row($, 'ToolGroup', { calls: [failed], isActive: false, isExpanded: false }, surface)
    expect(drawn).toContain('engine row')
    expect(drawn).not.toContain('unfolded')
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

test('a checklist is read when the text before the first tool call is whole, so that call counts toward its step', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await ask($)
  // The engine runs the step's tools while the response streams: the Write starts before the step ends.
  const text = `Plano:\n\n${checklist(1).split('\n').slice(0, 2).join('\n')}`
  w.answer = `${checklist(1)}`
  w.toolUses = [{ name: 'Write', input: { file_path: 'caprese.md' } }]
  w.chunks = [
    { kind: 'text', index: 0, text: text.slice(0, 9) },
    { kind: 'text', index: 0, text: `${text.slice(9)}\n${checklist(1).split('\n').slice(2).join('\n')}` },
    { kind: 'tool', index: 1, id: 'tu1', name: 'Write' },
    { kind: 'input', index: 1, json: '{"file_path":"caprese.md"}' },
  ]
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 } as never)
  const seen: string[] = []
  for await (const chunk of stream) {
    seen.push((chunk as { kind: string }).kind)
    if ((chunk as { kind: string }).kind !== 'tool') continue
    // The tool chunk came out with the checklist already read: step 2 is the current one.
    await call($, 'Write', { file_path: 'caprese.md' })
    const drawn = await card($)
    expect(drawn).toContain('Passo 2 de 4')
    expect(drawn).toContain('~25%')
  }
  // Every chunk passed on, in order; the end reads the same checklist again and changes nothing.
  expect(seen).toEqual(['text', 'text', 'tool', 'input'])
  const drawn = await card($)
  expect(drawn).toContain('Passo 2 de 4')
  expect(drawn).toContain('~25%')
})

test('a step with no tool call reads its checklist at the end, as before', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await ask($)
  w.chunks = [{ kind: 'text', index: 0, text: checklist(0) }]
  await step($, w, checklist(0))
  expect(await card($)).toContain('Passo 1 de 4')
})

const RECIPES = ['Escolher 3 pratos', 'Escrever 3 receitas', 'Montar a lista de compras', 'Revisar']
const checklist = (done: number) => RECIPES.map((t, i) => `${i + 1}. [${i < done ? 'x' : ' '}] ${t}`).join('\n')

/** A request whose checklist is left open: the first task done, two calls on the second. */
const leaveOpen = async ($: any, w: World) => {
  await ask($, 'Escreva 3 receitas')
  await step($, w, checklist(1))
  await call($, 'Read', { file_path: '/repo/a.md' })
  await call($, 'Read', { file_path: '/repo/b.md' })
  await end($)
}

test('an open checklist stays off the next request\'s card and counts none of its calls', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await leaveOpen($, w)
  await ask($, 'Analise os frames do vídeo')
  let drawn = await card($)
  expect(drawn).toContain('Entender o pedido')
  expect(drawn).not.toContain('Escrever 3 receitas')
  await call($, 'Read', { file_path: '/repo/frame1.png' })
  await step($, w, 'Os frames mostram uma cozinha.')
  drawn = await card($)
  expect(drawn).toContain('frame1.png')
  expect(drawn).not.toContain('Escrever 3 receitas')
  await end($)
  expect(await card($)).not.toContain('Escrever 3 receitas')
})

test('a continuation that writes the checklist again wakes it with the calls it counted', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await leaveOpen($, w)
  await ask($, 'continue')
  expect(await card($)).not.toContain('Escrever 3 receitas')
  // Calls before the checklist comes back count for no task.
  for (let i = 0; i < 3; i++) await call($, 'Read', { file_path: `/repo/r${i}.md` })
  await step($, w, `Receitas prontas.\n\n${checklist(2)}`)
  await call($, 'Read', { file_path: '/repo/c.md' })
  const drawn = await card($)
  expect(drawn).toContain('Passo 3 de 4')
  // One call against the two the woken task kept: ~50%, not the 25% of a fresh list.
  expect(drawn).toContain('~50%')
})

test('a request that ends without writing the checklist again drops it', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await leaveOpen($, w)
  await ask($, 'Uma pergunta à parte')
  await end($)
  await ask($, 'continue')
  await step($, w, checklist(2))
  await call($, 'Read', { file_path: '/repo/c.md' })
  const drawn = await card($)
  expect(drawn).toContain('Passo 3 de 4')
  // A fresh list: the calls of the first request are gone.
  expect(drawn).toContain('~25%')
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
    expect(variantOf(JSON.parse(drawn), 'use:aurora')).toBe('secondary')
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

// The settings pane (prototype plain-view-0.1.6, variant B).

const PANE = 'plain-view-settings'
const pane = ($: any, surface = 'terminal', columns = 100) =>
  $.ui.mount({ plugin: 'plain-view', surface, component: 'Pane', requestId: PANE, props: { title: 'plain-view', isFocused: true, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} }, viewport: { columns: columns + 2, rows: 60 } } as never)
const PT = { options: { language: 'pt-BR', icons: 'symbol' } }

test('/plain-view and /plain-view config open the pane; the help stays at help', PT, async ($, on) => {
  const w = engine(on)
  await start($)
  expect(await run($, '')).toEqual({})
  expect(await run($, 'config')).toEqual({})
  expect(w.opened).toEqual([PANE, PANE])
  expect((await run($, 'help')).text).toContain('`/plain-view` ou `config` abre o painel')
})

test('a pane that does not seat: the help instead', PT, async ($, on) => {
  const w = engine(on)
  w.isPlaced = false
  await start($)
  expect((await run($, '')).text).toContain('**plain-view** · transcript sem ruído')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`aba Transcript: each value with what it does, the current one marked, on ${surface}`, PT, async ($, on) => {
    engine(on)
    await start($, surface)
    const ui = await pane($, surface)
    const drawn = show(await ui.drawn())
    expect(drawn).toContain('✻ plain-view · configuração')
    expect(drawn).toContain('Fica salvo em /config → plain-view.')
    expect(drawn).toContain('▸ Transcript')
    expect(drawn).toContain('"key":"tab:1"')
    expect(drawn).toContain('"key":"tab:2"')
    expect(drawn).toContain('● não')
    expect(drawn).toContain('"key":"set:enabled:true"')
    expect(drawn).toContain('● final')
    expect(drawn).toContain('A resposta final fica. (padrão)')
    for (const v of ['none', 'card', 'all']) expect(drawn).toContain(`"key":"set:agentText:${v}"`)
    expect(drawn).not.toContain('"key":"set:agentText:final"')
    expect(drawn).toContain('Pedir lista de tarefas')
    expect(drawn).toContain('"key":"reset"')
    expect(drawn).toContain('"key":"close"')
    for (const verb of ['on', 'off', 'demo', 'help']) expect(drawn).toContain(`"key":"verb:${verb}"`)
    await ui.unmount()
  })

  test(`aba Cartão: the eight palettes with a sample, and a preview of the card, on ${surface}`, PT, async ($, on) => {
    engine(on)
    await start($, surface)
    const ui = await pane($, surface)
    await ui.press({ key: 'tab:1' })
    const drawn = show(await ui.drawn())
    expect(drawn).toContain('▸ Cartão')
    expect(drawn).toContain('● claude')
    expect(drawn).toContain('"key":"set:palette:aurora"')
    expect(drawn).toContain('verde-água → azul → violeta')
    expect(drawn).toContain('Animação')
    expect(drawn).toContain('Prévia')
    expect(drawn).toContain('Passo 2 de 4')
    if (surface === 'terminal') expect(drawn).toContain('"key":"swatch:neon"')
    else expect(drawn).not.toContain('swatch:')
    await ui.unmount()
  })
}

test('aba Geral: language and icons', { options: { language: 'en', icons: 'symbol' } }, async ($, on) => {
  engine(on)
  await start($)
  const ui = await pane($)
  await ui.press({ key: 'tab:2' })
  const drawn = show(await ui.drawn())
  expect(drawn).toContain('✻ plain-view · settings')
  expect(drawn).toContain('▸ General')
  expect(drawn).toContain('● en')
  expect(drawn).toContain('● symbol')
  expect(drawn).toContain("Follows the system's LANG.")
  expect(drawn).toContain('"key":"set:language:auto"')
  expect(drawn).toContain('"key":"set:icons:emoji"')
  expect(drawn).not.toContain('Bar colors')
  await ui.unmount()
})

test('aba Cartão: the request option, its four values, and a press that saves one', PT, async ($, on) => {
  const w = engine(on)
  await start($)
  const ui = await pane($)
  await ui.press({ key: 'tab:1' })
  let drawn = show(await ui.drawn())
  expect(drawn).toContain('Pedido no cartão')
  expect(drawn).toContain('● line')
  for (const v of ['joined', 'auto', 'all']) expect(drawn).toContain(`"key":"set:request:${v}"`)
  expect(drawn).toContain('A primeira linha de texto corrido')
  await ui.press({ key: 'set:request:auto' })
  expect(w.sets).toEqual([{ key: 'plain-view.request', value: 'auto' }])
  drawn = show(await ui.drawn())
  expect(drawn).toContain('✓ Salvo · Pedido no cartão: auto')
  await ui.unmount()
})

test('a press saves the value as /config would, and says so', PT, async ($, on) => {
  const w = engine(on)
  await start($)
  const ui = await pane($)
  await ui.press({ key: 'set:agentText:card' })
  expect(w.sets).toEqual([{ key: 'plain-view.agentText', value: 'card' }])
  const drawn = show(await ui.drawn())
  expect(drawn).toContain('✓ Salvo · Fala do agente: card')
  expect(drawn).toContain('● card')
  expect(drawn).toContain('"key":"set:agentText:final"')
  await ui.press({ key: 'set:enabled:true' })
  expect(w.sets[1]).toEqual({ key: 'plain-view.enabled', value: true })
  expect(show(await ui.drawn())).toContain('✓ Salvo · Ligado: sim')
  await ui.unmount()
})

test('recusado: another hook refuses, the value stays and the pane says why', PT, async ($, on) => {
  const w = engine(on)
  w.deny = 'policy says no'
  await start($)
  const ui = await pane($)
  await ui.press({ key: 'set:agentText:none' })
  const drawn = show(await ui.drawn())
  expect(drawn).toContain('Não salvou: policy says no')
  expect(drawn).toContain('● final')
  expect(w.sets).toEqual([])
  await ui.unmount()
})

test('opção travada: the values show, no button, and why', PT, async ($, on) => {
  const w = engine(on)
  w.rows.push({ key: 'plain-view.palette', value: 'ocean', isLocked: true })
  await start($)
  const ui = await pane($)
  await ui.press({ key: 'tab:1' })
  const drawn = show(await ui.drawn())
  expect(drawn).toContain('● ocean')
  expect(drawn).not.toContain('set:palette:')
  expect(drawn).toContain('🔒 definido pela organização')
  expect(drawn).toContain('"key":"set:animation:false"')
  await ui.unmount()
})

test('padrões: asks first, then puts what changed back, the locked one left', { options: { language: 'pt-BR' } }, async ($, on) => {
  const w = engine(on)
  w.rows.push({ key: 'plain-view.enabled', value: true }, { key: 'plain-view.agentText', value: 'none' }, { key: 'plain-view.palette', value: 'ocean', isLocked: true })
  await start($)
  const ui = await pane($)
  w.choice = 'agora não'
  await ui.press({ key: 'reset' })
  expect(w.asked).toEqual(['Voltar as opções do plain-view ao padrão?'])
  expect(w.sets).toEqual([])
  w.choice = 'voltar'
  await ui.press({ key: 'reset' })
  expect(w.sets).toEqual([
    { key: 'plain-view.enabled', value: false },
    { key: 'plain-view.agentText', value: 'final' },
    { key: 'plain-view.language', value: 'auto' },
  ])
  expect(show(await ui.drawn())).toContain('✓ Opções no padrão')
  // Nothing left away from the defaults: no question, a dim line.
  await ui.press({ key: 'reset' })
  expect(w.asked).toHaveLength(2)
  expect(show(await ui.drawn())).toContain('As opções já estão no padrão.')
  await ui.unmount()
})

test('the reload a press causes opens the pane again; a later load does not', PT, async ($, on) => {
  const w = engine(on)
  await start($)
  const ui = await pane($)
  await ui.press({ key: 'set:agentText:none' })
  await ui.unmount()
  await start($)
  expect(w.opened).toEqual([PANE])
  await w.clock.advance(60_000)
  await start($)
  expect(w.opened).toEqual([PANE])
})

test('a reopen waits no longer than ten seconds', PT, async ($, on) => {
  const w = engine(on)
  await start($)
  const ui = await pane($)
  await ui.press({ key: 'set:agentText:none' })
  await ui.unmount()
  await w.clock.advance(11_000)
  await start($)
  expect(w.opened).toEqual([])
})

test('fechar closes the pane; a tab change clears the saved line', PT, async ($, on) => {
  const w = engine(on)
  await start($)
  const ui = await pane($)
  await ui.press({ key: 'set:agentText:all' })
  await ui.press({ key: 'tab:2' })
  expect(show(await ui.drawn())).not.toContain('✓ Salvo')
  await ui.press({ key: 'close' })
  expect(w.closed).toEqual([PANE])
  await ui.unmount()
})

test('80 columns: the pane draws every tab', PT, async ($, on) => {
  engine(on)
  await start($)
  const ui = await pane($, 'terminal', 78)
  for (const t of ['tab:1', 'tab:2']) {
    expect(show(await ui.drawn())).toContain('✻ plain-view')
    await ui.press({ key: t })
  }
  expect(show(await ui.drawn())).toContain('Ícones')
  await ui.unmount()
})

const MULTI = '1. sim\n2. sim\n\ntudo sobe na mesma branch e mesma versao de ajuste'
const mountCard = ($: any) =>
  $.ui.mount({ plugin: 'plain-view', surface: 'terminal', component: 'AbovePrompt', props: { bodyColumns: 120, hasSurvey: false, isWorking: true, maxRows: 20 }, viewport: { columns: 120, rows: 40 } } as never)

test('a request of several lines: the first line, +N linhas and ver pedido, which unfolds it until the next request', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($, MULTI)
  const ui = await mountCard($)
  let drawn = show(await ui.drawn())
  expect(drawn).toContain('1. sim')
  expect(drawn).toContain('+2 linhas')
  expect(drawn).toContain('"label":"ver pedido"')
  expect(drawn).not.toContain('tudo sobe')
  await ui.press({ key: 'request' })
  drawn = show(await ui.drawn())
  expect(drawn).toContain('2. sim')
  expect(drawn).toContain('tudo sobe na mesma branch')
  expect(drawn).toContain('"label":"recolher"')
  expect(drawn).not.toContain('+2 linhas')
  // A notification keeps it unfolded.
  await ask($, '<task-notification>agent done</task-notification>')
  expect(show(await ui.drawn())).toContain('"label":"recolher"')
  await ui.unmount()
  // The next request of several lines opens folded; one of one line has no count and no button.
  await ask($, 'Outro pedido\ncom duas linhas')
  drawn = await card($)
  expect(drawn).toContain('+1 linha')
  expect(drawn).toContain('"label":"ver pedido"')
  expect(drawn).not.toContain('recolher')
  await ask($, 'Adicione um comentário no topo do index.html')
  drawn = await card($)
  expect(drawn).not.toContain('linhas')
  expect(drawn).not.toContain('ver pedido')
})

test('review: a narrow card keeps the title; the button steps aside first, then the count', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($, 'Corrija o teste de login\nlinha dois\nlinha três')
  const wide = await card($, 'terminal', 100)
  expect(wide).toContain('+2 linhas')
  expect(wide).toContain('ver pedido')
  const mid = await card($, 'terminal', 44)
  expect(mid).toContain('+2 linhas')
  expect(mid).not.toContain('ver pedido')
  const narrow = await card($, 'terminal', 30)
  expect(narrow).not.toContain('+2 linhas')
  expect(narrow).toContain('Corrija')
})

test('request auto: the first line of prose leads the card, on the end card too', { options: { ...ON.options, request: 'auto' } }, async ($, on) => {
  engine(on)
  await start($)
  await ask($, MULTI)
  expect(await card($)).toContain('tudo sobe na mesma branch')
  await call($, 'Read', { file_path: 'a.md' })
  await end($)
  const drawn = await card($)
  expect(drawn).toContain('Pronto')
  expect(drawn).toContain('tudo sobe na mesma branch')
  expect(drawn).toContain('+2 linhas')
})

test('request joined: one line, and the button only when it is cut', { options: { ...ON.options, request: 'joined' } }, async ($, on) => {
  engine(on)
  await start($)
  await ask($, 'Faça isso\ne aquilo')
  let drawn = await card($)
  expect(drawn).toContain('Faça isso · e aquilo')
  expect(drawn).not.toContain('ver pedido')
  await ask($, `Faça isso\n${'e aquilo também, '.repeat(12)}`)
  drawn = await card($, 'terminal', 80)
  expect(drawn).toContain('Faça isso · e aquilo')
  expect(drawn).toContain('ver pedido')
})

test('request all: every line under the title, pasted code as one line', { options: { ...ON.options, request: 'all' } }, async ($, on) => {
  engine(on)
  await start($)
  await ask($, 'Corrija o erro:\n```\nTypeError: x\n    at a\n```\nE rode os testes.')
  const drawn = await card($)
  expect(drawn).toContain('Corrija o erro:')
  expect(drawn).toContain('⟨código · 2 linhas⟩')
  expect(drawn).toContain('E rode os testes.')
  expect(drawn).not.toContain('TypeError')
  expect(drawn).not.toContain('ver pedido')
})

// 0.1.9, issue #27: the agent writes its checklist once and then only prose.
/** A request whose checklist (all open) came in the first step, then `n` Read calls, each one's result in order. */
const prose = async ($: any, w: World, n: number) => {
  await ask($, 'Coloque cache no executor')
  await step($, w, checklist(0))
  const results: any[] = []
  for (let i = 0; i < n; i++) results.push(await call($, 'Read', { file_path: `/repo/f${i}.ts` }))
  return results
}

test('a text list that stops moving: the card says so instead of ~95%, and the model is reminded', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  const before = await prose($, w, 12)
  // Up to 12 calls (three times the default): the guess stands and no reminder goes.
  let drawn = await card($)
  expect(drawn).toContain('~95%')
  expect(drawn).not.toContain('lista parada')
  expect(before.every(r => r.context === undefined)).toBe(true)

  const crossing = await call($, 'Read', { file_path: '/repo/f12.ts' })
  expect(crossing.context).toHaveLength(1)
  expect(crossing.context[0]).toContain('plain-view: your checklist has not changed for 13 tool calls')
  expect(crossing.context[0]).toContain('`- [x] <step>`')
  // The result itself is the tool's own.
  expect(crossing.result).toBe('ok')
  drawn = await card($)
  expect(drawn).toContain('lista parada há 13 calls')
  expect(drawn).toContain(' · lista parada')
  expect(drawn).not.toContain('~95%')
  expect(drawn).toContain('Passo 1 de 4')

  // Then silence for nine calls, and the second reminder on the tenth.
  for (let i = 0; i < 9; i++) expect((await call($, 'Read', { file_path: `/repo/g${i}.ts` })).context).toBeUndefined()
  expect((await call($, 'Read', { file_path: '/repo/h.ts' })).context[0]).toContain('for 23 tool calls')
})

test('the reminder goes in English and the card in the language of the mod', { options: { enabled: true, language: 'en', icons: 'symbol' } }, async ($, on) => {
  const w = engine(on)
  await start($)
  await prose($, w, 12)
  const crossing = await call($, 'Read', { file_path: '/repo/x.ts' })
  expect(crossing.context[0]).toContain('your checklist has not changed')
  expect(await card($)).toContain('list not updated for 13 calls')
})

test('no reminder when askForTasks is off, though the card still tells the truth', { options: { ...ON.options, askForTasks: false } }, async ($, on) => {
  const w = engine(on)
  await start($)
  const results = await prose($, w, 14)
  expect(results.every(r => r.context === undefined)).toBe(true)
  // The card still tells the truth: it asks nothing of the model.
  expect(await card($)).toContain('lista parada')
})

test('a failed call at the limit carries no reminder, and the next due one does', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await prose($, w, 12)
  const failed = await call($, 'Bash', { command: 'npm test' })
  expect(failed.isError).toBe(true)
  expect(failed.context).toBeUndefined()
  for (let i = 0; i < 9; i++) await call($, 'Read', { file_path: `/repo/g${i}.ts` })
  expect((await call($, 'Read', { file_path: '/repo/h.ts' })).context).toHaveLength(1)
})

test('a task tool\'s list is not stale however long the step runs, and gets no reminder of ours', ON, async ($, on) => {
  engine(on)
  await start($)
  await ask($)
  for (const subject of TASKS) await call($, 'TaskCreate', { subject, description: subject })
  await call($, 'TaskUpdate', { taskId: '1', status: 'in_progress' })
  for (let i = 0; i < 30; i++) expect((await call($, 'Read', { file_path: `/repo/f${i}.ts` })).context).toBeUndefined()
  const drawn = await card($)
  expect(drawn).toContain('~95%')
  expect(drawn).not.toContain('lista parada')
})

test('one ticked line brings a stale card back: step 2 opens and the guess starts again', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await prose($, w, 13)
  expect(await card($)).toContain('lista parada')
  await step($, w, `- [x] ${RECIPES[0]}`)
  let drawn = await card($)
  expect(drawn).toContain('Passo 2 de 4')
  expect(drawn).not.toContain('lista parada')
  expect(drawn).toContain('~0%')
  // The calls that follow count toward step 2.
  await call($, 'Read', { file_path: '/repo/a.ts' })
  await call($, 'Read', { file_path: '/repo/b.ts' })
  drawn = await card($)
  expect(drawn).toContain('Passo 2 de 4')
  expect(drawn).toContain('~50%')
})

test('a lone checklist line before any list is not a plan', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await ask($)
  await step($, w, `- [x] ${RECIPES[0]}`)
  const drawn = await card($)
  expect(drawn).toContain('Entender o pedido')
  expect(drawn).not.toContain(RECIPES[0]!)
})

test('80 columns: the stale card fits', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await prose($, w, 30)
  const drawn = await card($, 'terminal', 80)
  expect(drawn).toContain('lista parada')
  expect(drawn).toContain('"columns":10')
})

test('askForTasks with no task tool: the line frees the checklist from terse-output rules', ON, async ($, on) => {
  engine(on)
  await start($)
  const result: any = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: ['Bash'], outputStyle: null, traits: [] } as never)
  const text: string = result.sections[1].text
  expect(text).toContain('Each time a step finishes, before the next step\'s first tool call')
  expect(text).toContain('`- [x] <that step>` (one line is enough)')
  expect(text).toContain('exempt from any brevity or terse-output rule')
})

// /plain-view hide and show

test('hide: the plan card goes away while rows still fold; show brings it back', ON, async ($, on) => {
  engine(on)
  mock.store(on)
  await start($)
  await ask($)
  await plan($)
  expect(await card($)).toContain('Montar o painel do tempo')
  expect((await run($, 'hide')).text).toBe('plain-view oculto, mas ligado · /plain-view show mostra')
  expect(await card($)).not.toContain('Montar o painel do tempo')
  expect(await row($, 'ToolUse', toolUse('Read'))).not.toContain('Read')
  expect((await run($, 'show')).text).toBe('plain-view visível · /plain-view hide oculta')
  expect(await card($)).toContain('Montar o painel do tempo')
})

test('hide is kept for the next session', ON, async ($, on) => {
  engine(on)
  mock.store(on)
  await start($)
  await run($, 'hide')
  await start($)
  await ask($)
  await plan($)
  expect(await card($)).not.toContain('Montar o painel do tempo')
})

test('hide leaves the demo card alone, so the person can see what it looks like', ON, async ($, on) => {
  engine(on)
  mock.store(on)
  await start($)
  await run($, 'hide')
  await run($, 'demo')
  expect(await card($)).toContain('Demo:')
})

// The quiet option, set in every mod by /pad quiet: the card stays away like hide, and `show` does not undo it.
test('quiet: the plan card goes away while rows still fold, and show does not undo it', { options: { enabled: true, language: 'pt-BR', icons: 'symbol', quiet: true } }, async ($, on) => {
  engine(on)
  mock.store(on)
  await start($)
  await ask($)
  await plan($)
  expect(await card($)).not.toContain('Montar o painel do tempo')
  expect(await row($, 'ToolUse', toolUse('Read'))).not.toContain('Read')
  await run($, 'show')
  expect(await card($)).not.toContain('Montar o painel do tempo')
})

test('110 columns: a long status truncates, the step subject keeps its row', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await prose($, w, 30)
  const drawn = await card($, 'terminal', 110)
  expect(drawn).toContain('lista parada')
  expect(drawn).toContain('"flexShrink":0')
  expect(drawn).toContain('"wrap":"truncate-end"')
})

test('110 columns: the overall bar leaves room for "· list not updated", so the label keeps its row', ON, async ($, on) => {
  const w = engine(on)
  await start($)
  await prose($, w, 30)
  const drawn = await card($, 'terminal', 110)
  expect(drawn).toContain(' · lista parada')
  // 106 inner columns: a full bar would be 86 and push the status past the edge.
  expect(drawn).not.toContain('"columns":86')
  expect(drawn.match(/"flexShrink":0/g)!.length).toBeGreaterThan(1)
})

// G6 (prototype agent-watch-0.7.1): agent-watch's band message, a child of the agents row, and the
// `cardOn` atom that tells agent-watch its band can step aside.
const BAR = Array.from({ length: 10 }, (_, i) => ({ filled: i < 3, color: i < 3 ? '#d97757' : '#5c5c68' }))
const RUNNING_MSG = { kind: 'run', label: 'Agentes', count: '0/1', bar: BAR, glyph: '▲', color: '#d97757', name: 'code-review', action: 'Lendo routes.ts', stalled: null }
// agent-watch's `message`, as its atom would answer: the test's handle has no `$.state`, so the read is mocked.
const withMessage = (on: any, message: unknown) => {
  const box = { message }
  on('state.get', (_$: any, e: any, next: any) =>
    e.plugin === 'agent-watch' && e.key === 'message' ? ({ value: { value: box.message, version: box.message === null || box.message === undefined ? 0 : 1 } } as never) : next(e),
  )
  return box
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`G6 running: agent-watch's message is a child of the agents row on ${surface}`, ON, async ($, on) => {
    const w = engine(on)
    withMessage(on, RUNNING_MSG)
    w.listed = [{ id: 'a1', description: 'code-review', type: 'general-purpose', status: 'running' }]
    await start($, surface)
    await delegate($)
    await w.clock.advance(5000)
    const drawn = await card($, surface)
    const text = drawn.split('\n')[1]!
    expect(text).toContain('1 agente rodando')
    // The row first, its child right under it: the label, the count, the bar and the current agent.
    expect(text.indexOf('1 agente rodando')).toBeLessThan(text.indexOf('└ Agentes'))
    expect(text).toContain('└ Agentes 0/1')
    expect(text).toContain('█░░░░░░░'.slice(0, 1))
    expect(text).toContain('▲ code-review · Lendo routes.ts')
    expect(drawn).toContain('"color":"#d97757"')
    expect(drawn).toContain('"color":"#5c5c68"')
  })
}

test('G6 stalled: the child says it in warning, with the shape in warning too', ON, async ($, on) => {
  const w = engine(on)
  withMessage(on, { ...RUNNING_MSG, stalled: 'code-review parado há 6m 00s' })
  w.listed = [{ id: 'a1', description: 'code-review', type: 'general-purpose', status: 'running' }]
  await start($)
  await delegate($)
  const drawn = await card($)
  expect(drawn.split('\n')[1]).toContain('▲ code-review parado há 6m 00s')
  expect(drawn).toContain('"color":"warning"')
})

test('G6 done: the summary is the child of the finished row', ON, async ($, on) => {
  const w = engine(on)
  withMessage(on, { kind: 'done', text: '1 agente pronto · 44k · 1m 54s' })
  w.listed = [{ id: 'a1', description: 'code-review', type: 'general-purpose', status: 'running' }]
  await start($)
  await delegate($)
  await end($)
  w.listed = [{ id: 'a1', description: 'code-review', type: 'general-purpose', status: 'completed' }]
  await agentDone($)
  await ask($, NOTICE)
  const text = (await card($)).split('\n')[1]!
  expect(text).toContain('1 agente terminou')
  expect(text).toContain('└ ✓ 1 agente pronto · 44k · 1m 54s')
})

test('G6 without agent-watch, or with nothing to say, there is no child', ON, async ($, on) => {
  const w = engine(on)
  const box = withMessage(on, undefined)
  w.listed = [{ id: 'a1', description: 'code-review', type: 'general-purpose', status: 'running' }]
  await start($)
  await delegate($)
  // Not installed: the value was never written.
  expect(await card($)).not.toContain('└')
  // Installed, its band silent (hidden, quiet): null.
  box.message = null
  expect(await card($)).not.toContain('└')
})

test('G6 no agents row, no child: a turn without agents and a demo card stay as they were', ON, async ($, on) => {
  engine(on)
  withMessage(on, RUNNING_MSG)
  await start($)
  await ask($, REQUEST)
  expect(await card($)).not.toContain('└')
  await run($, 'demo')
  expect(await card($)).not.toContain('└')
})

test('G6 80 columns: a long name and action are cut, and the child fits the card', { options: { enabled: true, language: 'pt-BR', icons: 'symbol' } }, async ($, on) => {
  const w = engine(on)
  withMessage(on, { ...RUNNING_MSG, name: 'revisar todo o código do repositório', action: 'Lendo um arquivo com um nome muito longo em um diretório muito fundo.ts' })
  w.listed = [{ id: 'a1', description: 'code-review', type: 'general-purpose', status: 'running' }]
  await start($)
  await delegate($)
  const drawn = await card($, 'terminal', 80)
  const text = drawn.split('\n')[1]!
  const child = text.slice(text.indexOf('└ Agentes'))
  expect(child).toContain('…')
  expect(child).not.toContain('muito fundo.ts')
  // Inside the card's 76 columns, with the engine row that follows it in the same string left out.
  expect(child.replace(/engine row.*$/, '').length).toBeLessThanOrEqual(76)
})

test('G6 cardOn: written true while the card can draw, false when hidden, and back on show', ON, async ($, on) => {
  engine(on)
  mock.store(on)
  const seen: boolean[] = []
  on('state.set', (_$: any, e: any, next: any) => {
    if (e.plugin === 'plain-view' && e.key === 'cardOn') seen.push(e.value)
    return next(e)
  })
  await start($)
  expect(seen).toEqual([true])
  await run($, 'hide')
  await run($, 'show')
  expect(seen).toEqual([true, false, true])
  // Hiding twice writes nothing new.
  await run($, 'show')
  expect(seen).toEqual([true, false, true])
})

test('G6 cardOn: quiet keeps it false', { options: { enabled: true, quiet: true } }, async ($, on) => {
  engine(on)
  mock.store(on)
  const seen: boolean[] = []
  on('state.set', (_$: any, e: any, next: any) => {
    if (e.plugin === 'plain-view' && e.key === 'cardOn') seen.push(e.value)
    return next(e)
  })
  await start($)
  // false is the atom's start value: nothing to write.
  expect(seen).toEqual([])
  await run($, 'show')
  expect(seen).toEqual([])
})

test('G6 cardOn: off by default, and /plain-view show does not turn it on', { options: { language: 'pt-BR' } }, async ($, on) => {
  engine(on)
  mock.store(on)
  const seen: boolean[] = []
  on('state.set', (_$: any, e: any, next: any) => {
    if (e.plugin === 'plain-view' && e.key === 'cardOn') seen.push(e.value)
    return next(e)
  })
  await start($)
  await run($, 'show')
  expect(seen).toEqual([])
})
