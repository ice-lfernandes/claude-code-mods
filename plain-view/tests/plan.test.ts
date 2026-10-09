import { expect, test } from 'claude-code/testing'

import type { Agent, Item, Turn } from '../types'
import { barCells, base64, layoutOf, rasterCells } from '../hooks/card'
import { mix, paletteOf, PALETTES, stopsOf, hex, titleColor } from '../hooks/palettes'
import {
  agentsRowOf,
  agentTextOf,
  applyAnswer,
  applyTask,
  cardOf,
  checklistOf,
  doingOf,
  finishAgent,
  firstSentence,
  GONE_MS,
  keepAgents,
  reconcileAgents,
  runningOf,
  showsBlock,
  countCall,
  currentOf,
  demoOf,
  endTurn,
  estimate,
  MAX_ESTIMATE,
  spawnAgent,
  startTurn,
  titleOf,
  touch,
  windowAround,
} from '../hooks/plan'

const NOW = Date.parse('2026-10-09T12:00:00Z')
const TASKS = ['Escolher o estilo e o layout da página', 'Ver como a página pega o tempo ao vivo', 'Montar o painel do tempo', 'Publicar e compartilhar o link']

const created = (subjects = TASKS) =>
  subjects.reduce<Item[]>((list, subject, i) => applyTask(list, 'TaskCreate', { subject, description: subject }, { task: { id: String(i + 1), subject } }), [])
const fresh = (text = 'Monte um painel do tempo para São Paulo.') => startTurn(null, [], text, NOW, 'pt-BR')
const at = (items: Item[], status: Item['status'][]) => items.map((it, i) => ({ ...it, status: status[i] ?? it.status }))

test('a turn takes the first line of the request as its title, and a continuation keeps the last one', () => {
  expect(titleOf('\n  Monte um painel\n do tempo')).toBe('Monte um painel')
  const first = fresh().turn
  expect(first.title).toBe('Monte um painel do tempo para São Paulo.')
  expect(startTurn(first, [], '', NOW, 'pt-BR').turn.title).toBe(first.title)
  expect(startTurn(null, [], '', NOW, 'en').turn.title).toBe('Request with no text')
})

test('a turn a notification starts keeps the last title, or says an agent finished', () => {
  const notice = '<task-notification>\n<task-id>a1</task-id>\n<status>completed</status>\n</task-notification>'
  expect(titleOf(notice)).toBe('')
  expect(titleOf('\n  <system-reminder foo="1">x')).toBe('')
  const first = fresh().turn
  expect(startTurn(first, [], notice, NOW, 'pt-BR').turn.title).toBe(first.title)
  expect(startTurn(null, [], notice, NOW, 'pt-BR').turn.title).toBe('Um agente terminou')
  expect(startTurn(null, [], notice, NOW, 'en').turn.title).toBe('An agent finished')
  // A request that only mentions a tag, or starts with `<` and no tag, is still a title.
  expect(startTurn(first, [], 'Troque o <div> por <section>', NOW, 'pt-BR').turn.title).toBe('Troque o <div> por <section>')
  expect(titleOf('<3 obrigado')).toBe('<3 obrigado')
})

test('the task list outlives a turn only while a task is open', () => {
  const open = at(created(), ['completed', 'in_progress'])
  expect(startTurn(null, open, 'continue', NOW, 'en').items).toHaveLength(4)
  const closed = at(created(), ['completed', 'completed', 'completed', 'completed'])
  expect(startTurn(null, closed, 'next', NOW, 'en').items).toEqual([])
})

test('TaskCreate adds with its id, TaskUpdate changes and deletes, TodoWrite replaces', () => {
  let items = created()
  expect(items.map(i => i.id)).toEqual(['1', '2', '3', '4'])
  expect(items.every(i => i.status === 'pending' && i.calls === 0)).toBe(true)
  items = applyTask(items, 'TaskUpdate', { taskId: '1', status: 'in_progress', activeForm: 'Escolhendo o estilo' })
  expect(items[0]).toEqual({ id: '1', subject: TASKS[0], status: 'in_progress', calls: 0 })
  items = applyTask(items, 'TaskUpdate', { taskId: '4', status: 'deleted' })
  expect(items).toHaveLength(3)
  expect(applyTask(items, 'TaskUpdate', { taskId: '99', status: 'completed' })).toBe(items)
  expect(applyTask(items, 'TaskCreate', { subject: '  ' }, { task: { id: '5' } })).toBe(items)

  const todos = applyTask([], 'TodoWrite', {
    todos: [
      { content: 'Ler a API', status: 'completed', activeForm: 'Lendo a API' },
      { content: 'Montar o painel', status: 'in_progress', activeForm: 'Montando o painel' },
      { content: '', status: 'pending', activeForm: '' },
    ],
  })
  expect(todos.map(t => [t.subject, t.status])).toEqual([['Ler a API', 'completed'], ['Montar o painel', 'in_progress']])
  // A rewrite keeps the calls a task already counted.
  const counted = countCall(todos)
  expect(applyTask(counted, 'TodoWrite', { todos: [{ content: 'Ler a API', status: 'completed', activeForm: 'x' }, { content: 'Montar o painel', status: 'completed', activeForm: 'y' }] })[1]!.calls).toBe(1)
})

test('a tool call counts for the task being worked on, else the first pending one', () => {
  const items = at(created(), ['completed', 'pending'])
  expect(currentOf(items)).toBe(1)
  expect(countCall(items)[1]!.calls).toBe(1)
  expect(currentOf(at(created(), ['completed', 'completed', 'in_progress']))).toBe(2)
  expect(currentOf(at(created(), ['completed', 'completed', 'completed', 'completed']))).toBe(-1)
})

test('the estimate weighs the step against the finished ones, and never says done', () => {
  const items: Item[] = [
    { subject: 'a', status: 'completed', calls: 6 },
    { subject: 'b', status: 'completed', calls: 4 },
    { subject: 'c', status: 'in_progress', calls: 2 },
  ]
  expect(Math.round(estimate(items, 2) * 100)).toBe(40)
  expect(estimate([{ subject: "c", status: "in_progress", calls: 2 }], 0)).toBe(0.5)
  expect(estimate([{ subject: 'c', status: 'in_progress', calls: 40 }], 0)).toBe(MAX_ESTIMATE)
  expect(estimate(items, 9)).toBe(0)
})

test('a call says what it is doing, and a finished one counts the file it changed or read', () => {
  let t = fresh().turn
  t = touch(t, 'Read', { file_path: '/repo/src/api/weather.ts' }, 'pt-BR', null)
  expect(t.doing).toBe('lendo weather.ts')
  expect(t.calls).toBe(1)
  t = touch(t, 'Read', { file_path: '/repo/src/api/weather.ts' }, 'pt-BR', true)
  t = touch(t, 'Read', { file_path: '/repo/src/api/weather.ts' }, 'pt-BR', true)
  t = touch(t, 'Write', { file_path: '/repo/src/Dashboard.tsx' }, 'pt-BR', true)
  t = touch(t, 'Edit', { file_path: '/repo/src/App.tsx' }, 'pt-BR', false)
  expect(t.read).toEqual(['/repo/src/api/weather.ts'])
  expect(t.changed).toEqual(['/repo/src/Dashboard.tsx'])
  const done = endTurn(t, 'answer', NOW + 107_000)
  expect(done.end).toBe('answer')
  expect(done.doing).toBeUndefined()
  expect(endTurn(t, 'aborted', NOW).end).toBe('aborted')
  expect(endTurn(t, 'refusal', NOW).end).toBe('error')
})

// The prototype's tabs, as data.

test('entendendo o pedido: two first steps before a task list', () => {
  const card = cardOf(fresh().turn, [], NOW + 3000, 'pt-BR')!
  expect(card.kind).toBe('plan')
  if (card.kind !== 'plan') return
  expect(card.label).toBe('Passo 1 de 2')
  expect(card.rows.map(r => [r.kind, r.text, r.status])).toEqual([
    ['now', 'Entender o pedido', '~30%'],
    ['next', 'Planejar os passos', 'Próximo'],
  ])
  expect(card.pct).toBe('15%')
  expect(card.time).toBe('3s')
})

test('passo 2 de 4: done, now with ~% and what it is doing, next, later', () => {
  let items = at(created(), ['completed', 'in_progress'])
  items[0] = { ...items[0]!, calls: 5 }
  items = countCall(countCall(items))
  const turn: Turn = { ...fresh().turn, calls: 7, doing: 'na web' }
  const card = cardOf(turn, items, NOW + 11_000, 'pt-BR')!
  if (card.kind !== 'plan') throw new Error('plan card expected')
  expect(card.state).toBe('work')
  expect(card.label).toBe('Passo 2 de 4')
  expect(card.rows.map(r => [r.kind, r.status])).toEqual([['done', 'Feito'], ['now', '~40%'], ['next', 'Próximo'], ['later', 'Depois']])
  expect(card.rows[1]!.doing).toBe('na web')
  expect(card.pct).toBe('35%')
  expect(card.badge).toBeUndefined()
  expect(card.files).toBeUndefined()
})

test('plano longo: a window of five around the current task', () => {
  const subjects = Array.from({ length: 9 }, (_, i) => `Tarefa ${i + 1}`)
  const items = at(created(subjects), ['completed', 'completed', 'completed', 'completed', 'completed', 'in_progress'])
  const card = cardOf(fresh().turn, items, NOW, 'pt-BR')!
  if (card.kind !== 'plan') throw new Error('plan card expected')
  expect(card.before).toBe('✓ mais 4 feitos')
  expect(card.rows.map(r => r.text)).toEqual(['Tarefa 5', 'Tarefa 6', 'Tarefa 7', 'Tarefa 8', 'Tarefa 9'])
  expect(card.after).toBeUndefined()
  expect(windowAround(6, 3)).toEqual({ start: 0, end: 6 })
  expect(windowAround(12, 0)).toEqual({ start: 0, end: 5 })
  expect(windowAround(12, 6)).toEqual({ start: 5, end: 10 })
})

test('sem lista de tarefas: the tool in flight; fim sem lista: the small card', () => {
  const turn = touch(fresh('O que o weather.ts faz?').turn, 'Read', { file_path: 'src/weather.ts' }, 'pt-BR', null)
  expect(cardOf(turn, [], NOW + 4000, 'pt-BR')).toEqual({ kind: 'phrase', title: 'O que o weather.ts faz?', time: '4s', doing: 'Lendo weather.ts' })
  const read = touch(turn, 'Read', { file_path: 'src/weather.ts' }, 'pt-BR', true)
  expect(cardOf(endTurn(read, 'answer', NOW + 12_000), [], NOW + 12_000, 'pt-BR')).toEqual({
    kind: 'summary', state: 'done', title: 'O que o weather.ts faz?', badge: '✓ Pronto', time: 'levou 12s', detail: 'li 1 arquivo',
  })
  expect(cardOf(null, [], NOW, 'pt-BR')).toBeNull()
})

test('tudo pronto: the badge, the time it took, 100% and the files', () => {
  const items = at(created(), ['completed', 'completed', 'completed', 'completed'])
  const turn = endTurn({ ...fresh().turn, changed: ['a.tsx', 'b.tsx'], read: ['c.ts', 'd.ts', 'e.json'] }, 'answer', NOW + 107_000)
  const card = cardOf(turn, items, NOW + 200_000, 'pt-BR')!
  if (card.kind !== 'plan') throw new Error('plan card expected')
  expect(card.state).toBe('done')
  expect(card.badge).toBe('✓ Tudo pronto')
  expect(card.time).toBe('levou 1m 47s')
  expect(card.label).toBe('4 de 4 passos')
  expect(card.pct).toBe('100%')
  expect(card.files).toBe('mudei 2 arquivos · li 3 arquivos')
  const en = cardOf(turn, items, NOW, 'en')!
  expect(en.kind === 'plan' && [en.badge, en.time, en.files]).toEqual(['✓ All done', 'took 1m 47s', 'changed 2 files · read 3 files'])
})

test('a turn that answers with tasks still open says so, and counts only what was done', () => {
  const turn = endTurn(fresh().turn, 'answer', NOW + 30_000)
  const card = cardOf(turn, at(created(), ['completed', 'completed', 'in_progress']), NOW, 'pt-BR')!
  if (card.kind !== 'plan') throw new Error('plan card expected')
  expect(card.badge).toBe('✓ Turno pronto')
  expect(card.pct).toBe('50%')
  // Nothing stopped it: the open task waits, it is not halted.
  expect([card.rows[2]!.kind, card.rows[2]!.status]).toEqual(['later', 'Ficou aberto'])
})

test('a long plan names the rows outside its window by what they are', () => {
  const subjects = Array.from({ length: 8 }, (_, i) => `Tarefa ${i + 1}`)
  // Tasks 1-4 still pending, task 5 in progress: the rows above are not done.
  const card = cardOf(fresh().turn, at(created(subjects), ['pending', 'pending', 'pending', 'pending', 'in_progress']), NOW, 'pt-BR')!
  if (card.kind !== 'plan') throw new Error('plan card expected')
  expect(card.before).toBe('○ mais 3 antes')
  // Completed tasks below the window count as done.
  const below = cardOf(fresh().turn, at(created(subjects), ['in_progress', 'pending', 'pending', 'pending', 'pending', 'completed', 'completed', 'completed']), NOW, 'en')!
  if (below.kind !== 'plan') throw new Error('plan card expected')
  expect(below.after).toBe('✓ 3 more done')
})

test('a demo list never carries into a real request', () => {
  const demo = demoOf(1, NOW, 'pt-BR')
  expect(startTurn(demo.turn, demo.items, 'pedido real', NOW, 'pt-BR').items).toEqual([])
})

test('interrompido: grey badge, where it stopped, the step left halted, the files', () => {
  const items = countCall(at(created(), ['completed', 'in_progress']))
  const turn = endTurn({ ...fresh().turn, changed: ['a.tsx'], read: ['b.ts', 'c.ts'] }, 'aborted', NOW + 52_000)
  const card = cardOf(turn, items, NOW + 60_000, 'pt-BR')!
  if (card.kind !== 'plan') throw new Error('plan card expected')
  expect(card.state).toBe('stopped')
  expect(card.badge).toBe('■ Interrompido')
  expect(card.time).toBe('parou em 52s')
  expect(card.rows[1]!.kind).toBe('halted')
  expect(card.rows[1]!.status).toBe('Parado')
  expect(card.files).toBe('mudei 1 arquivo · li 2 arquivos')
  expect(card.pct).toBe('25%')
  const error = cardOf(endTurn(fresh().turn, 'error', NOW), items, NOW, 'en')!
  expect(error.kind === 'plan' && error.badge).toBe('■ Stopped on an error')
})

test('only reads: the files line names them alone', () => {
  const turn = endTurn({ ...fresh().turn, read: ['a.ts'] }, 'answer', NOW)
  const card = cardOf(turn, at(created(['Ler']), ['completed']), NOW, 'pt-BR')!
  expect(card.kind === 'plan' && card.files).toBe('li 1 arquivo')
})

test('demo: four sample steps, the current one in progress', () => {
  const { turn, items } = demoOf(1, NOW, 'pt-BR')
  expect(turn.isDemo).toBe(true)
  expect(items.map(i => i.status)).toEqual(['completed', 'in_progress', 'pending', 'pending'])
  const card = cardOf(turn, items, NOW + 2000, 'pt-BR')!
  expect(card.kind === 'plan' && card.label).toBe('Passo 2 de 4')
})

test('palettes: eight, claude by default, a dark and a light set', () => {
  expect(PALETTES.map(p => p.id)).toEqual(['claude', 'clean', 'sunset', 'aurora', 'ocean', 'neon', 'forest', 'calm'])
  expect(paletteOf(undefined).id).toBe('claude')
  expect(paletteOf('AURORA').id).toBe('aurora')
  expect(paletteOf('nope').id).toBe('claude')
  const claude = paletteOf('claude')
  expect(stopsOf(claude, 'light-daltonized')).toBe(claude.light)
  expect(stopsOf(claude, 'dark')).toBe(claude.dark)
  expect(stopsOf(claude, undefined)).toBe(claude.dark)
  expect(hex(mix(0x000000, 0xffffff, 0.5))).toBe('#808080')
  expect(mix(0x102030, 0x405060, 0)).toBe(0x102030)
  expect(mix(0x102030, 0x405060, 2)).toBe(0x405060)
  expect(titleColor(claude.dark, 0)).toBe(claude.dark.g1)
  expect(titleColor(claude.dark, 1)).toBe(claude.dark.g3)
})

test('bars: a gradient with a shine while working, green when done, grey when stopped, a comet with no figure', () => {
  const s = paletteOf('clean').dark
  const work = barCells(10, 0.5, 'work', s, null)
  expect(work.filter(c => c.ch === 0x2588)).toHaveLength(5)
  expect(work[0]!.fg).toBe(s.g1)
  expect(work[4]!.fg).toBe(s.g2)
  expect(work[5]).toEqual({ ch: 0x2591, fg: s.track })
  const shining = barCells(10, 0.5, 'work', s, 2)
  expect(shining[2]!.fg).toBe(mix(work[2]!.fg, 0xffffff, 0.55))
  expect(shining[1]!.fg).toBe(mix(work[1]!.fg, 0xffffff, 0.25))
  expect(barCells(4, 1, 'ok', s, 3).map(c => c.fg)).toEqual([s.k1, mix(s.k1, s.k2, 1 / 3), mix(s.k1, s.k2, 2 / 3), s.k2])
  expect(barCells(4, 0.5, 'off', s, 3).map(c => c.fg)).toEqual([s.off, s.off, s.track, s.track])
  const comet = barCells(10, 0, 'comet', s, 5)
  expect(comet.filter(c => c.ch === 0x2588)).toHaveLength(4)
  expect(comet[5]!.fg).toBe(s.g2)
})

test('a Raster cell packs code point, color and the default background as base64', () => {
  expect(rasterCells([{ ch: 0x2588, fg: 0xff8800 }])).toBe('iCUAAACI/wAAAAAB')
  expect(base64(new Uint8Array([104, 105]))).toBe('aGk=')
  expect(base64(new Uint8Array([104]))).toBe('aA==')
})

test('the layout shrinks the rows at 80 columns and grows them wide', () => {
  expect(layoutOf(76)).toEqual({ label: 14, item: 10, text: 30, bar: 56 })
  expect(layoutOf(136)).toEqual({ label: 14, item: 18, text: 46, bar: 116 })
  expect(layoutOf(40).item).toBe(6)
})

test('a checklist in the answer: done, in progress, pending; under two items is no list', () => {
  const list = checklistOf('Plano:\n1. [x] Ler a API\n2. [~] **Montar** o painel\n- [ ] Testar\n* [>] Publicar\ntexto solto')!
  expect(list.map(i => [i.subject, i.status])).toEqual([
    ['Ler a API', 'completed'],
    ['Montar o painel', 'in_progress'],
    ['Testar', 'pending'],
    ['Publicar', 'in_progress'],
  ])
  expect(list.every(i => i.fromText)).toBe(true)
  expect(checklistOf('1. [ ] Só um')).toBeNull()
  // Loose list items (blank lines between them) are one list.
  expect(checklistOf('1. [x] Ler a API\n\n2. [ ] Montar o painel\n\n3. [ ] Publicar')!.map(i => i.subject)).toEqual(['Ler a API', 'Montar o painel', 'Publicar'])
  expect(checklistOf('nada aqui')).toBeNull()
})

test('the last checklist of an answer wins, keeps the calls counted, and never overrides a task tool', () => {
  const first = applyAnswer([], '1. [ ] A\n2. [ ] B')
  const counted = countCall(first)
  const next = applyAnswer(counted, 'antes\n1. [ ] A\n2. [ ] B\n\ndepois\n\n1. [x] A feita\n2. [ ] B')
  expect(next.map(i => [i.subject, i.status, i.calls])).toEqual([['A feita', 'completed', 1], ['B', 'pending', 0]])
  expect(applyAnswer(next, 'sem lista')).toBe(next)
  const tools = created(['X', 'Y'])
  expect(applyAnswer(tools, '1. [ ] A\n2. [ ] B')).toBe(tools)
  expect(applyTask(next, 'TaskCreate', { subject: 'X' }, { task: { id: '9' } }).map(i => i.subject)).toEqual(['X'])
})

test('what a call is doing: the Bash description, a skill by name, any other tool as using', () => {
  expect(doingOf('Bash', { command: 'python3 x.py', description: 'Extrair a série horária' }, 'pt-BR')).toBe('Extrair a série horária')
  expect(doingOf('Bash', { command: 'npm test' }, 'pt-BR')).toBe('rodando npm test')
  expect(doingOf('Skill', { skill: 'artifact-design' }, 'pt-BR')).toBe('usando a skill artifact-design')
  expect(doingOf('Skill', { skill: 'artifact-design' }, 'en')).toBe('using the artifact-design skill')
  expect(doingOf('Artifact', {}, 'pt-BR')).toBe('usando Artifact')
  expect(doingOf('mcp__claude_ai_Gmail__search_threads', {}, 'en')).toBe('using search_threads')
  expect(doingOf('Read', { file_path: '/a/b.ts' }, 'pt-BR')).toBe('lendo b.ts')
})

test('agentText: final by default; which blocks show; the answer\'s first sentence', () => {
  expect(agentTextOf(undefined)).toBe('final')
  expect(agentTextOf('card')).toBe('card')
  expect(agentTextOf('nope')).toBe('final')
  // Under final a block hides only when it is known mid-turn text; anything unknown shows.
  const mids = ['Plano em 4 passos: 1. [ ] Ler a API 2. [ ] Montar']
  expect(showsBlock('final', 'Plano em 4 passos:', mids)).toBe(false)
  expect(showsBlock('final', '**Pronto**: o painel está em localhost:5173.', mids)).toBe(true)
  expect(showsBlock('final', 'resposta de uma sessão retomada', [])).toBe(true)
  expect(showsBlock('final', '   ', mids)).toBe(true)
  expect(showsBlock('none', 'qualquer coisa', [])).toBe(false)
  expect(showsBlock('card', 'qualquer coisa', [])).toBe(false)
  expect(showsBlock('all', mids[0]!, mids)).toBe(true)
  expect(firstSentence('**Pronto**: o painel está em localhost:5173. Abra no navegador.')).toBe('Pronto: o painel está em localhost:5173.')
  expect(firstSentence('sem ponto final')).toBe('sem ponto final')
  expect(firstSentence('x'.repeat(150)).length).toBe(100)
  expect(firstSentence('1. Criei a rota /api\n2. Testei')).toBe('Criei a rota /api')
  expect(firstSentence('e.g. o painel abre em localhost:5173. Depois')).toBe('e.g. o painel abre em localhost:5173.')
  const t = endTurn(fresh().turn, 'answer', NOW, 'Feito: o painel abriu. O resto depois.')
  expect(t.answer).toBe('Feito: o painel abriu.')
  expect(endTurn(fresh().turn, 'answer', NOW).answer).toBeUndefined()
  const items = at(created(['A', 'B']), ['completed', 'completed'])
  const withAnswer = cardOf(t, items, NOW, 'pt-BR', true)!
  expect(withAnswer.kind === 'plan' && withAnswer.answer).toBe('Feito: o painel abriu.')
  const without = cardOf(t, items, NOW, 'pt-BR')!
  expect(without.kind === 'plan' && without.answer).toBeUndefined()
})

// 0.1.5: the agents the main loop spawns, and the end of a turn with no task list.
const MIN = 60_000
const spawned = (labels: string[], every = MIN) => labels.reduce<Agent[]>((list, label, i) => spawnAgent(list, `a${i + 1}`, label, NOW + i * every), [])
const working = (text = 'Revise o código e abra a PR') => touch(fresh(text).turn, 'Agent', { description: 'code-review', prompt: 'x' }, 'pt-BR', null)

test('turno chama um agente: the phrase card carries the agents row, count, latest label and time', () => {
  const team = spawned(['code-review'])
  const card = cardOf(working(), [], NOW + 192_000, 'pt-BR', false, team)!
  if (card.kind !== 'phrase') throw new Error('phrase card expected')
  expect(card.agents).toEqual({ isRunning: true, text: '1 agente rodando', label: 'code-review', time: '3m 12s' })
  // Spawning the same id again keeps one row.
  expect(spawnAgent(team, 'a1', 'code-review', NOW + 5000)).toHaveLength(1)
})

test('esperando o agente: the main turn ended, no list, an agent runs', () => {
  const team = spawned(['code-review'])
  const turn = endTurn(working(), 'answer', NOW + 30_000)
  const card = cardOf(turn, [], NOW + 241_000, 'pt-BR', false, team)!
  expect(card).toEqual({
    kind: 'waiting',
    title: 'Revise o código e abra a PR',
    time: '4m 01s',
    text: 'Esperando 1 agente',
    agents: { isRunning: true, text: '1 agente rodando', label: 'code-review', time: '4m 01s' },
  })
  const en = cardOf(turn, [], NOW + 241_000, 'en', false, spawned(['code-review', 'tests']))!
  if (en.kind !== 'waiting') throw new Error('waiting card expected')
  expect(en.text).toBe('Waiting for 2 agents')
  expect(en.agents.text).toBe('2 agents running')
})

test('turno da notificação: the finished agent stays through the notification turn, a new request drops it', () => {
  const notice = '<task-notification>\n<task-id>a1</task-id>\n<status>completed</status>\n</task-notification>'
  const team = finishAgent(spawned(['code-review']), 'a1', NOW + 219_000)
  expect(runningOf(team)).toHaveLength(0)
  const kept = keepAgents(team, notice)
  expect(kept).toHaveLength(1)
  const first = working()
  const turn = touch(startTurn(first, [], notice, NOW + 220_000, 'pt-BR').turn, 'Read', { file_path: 'plan.ts' }, 'pt-BR', null)
  const card = cardOf(turn, [], NOW + 262_000, 'pt-BR', false, kept)!
  if (card.kind !== 'phrase') throw new Error('phrase card expected')
  expect(card.title).toBe('Revise o código e abra a PR')
  expect(card.agents).toEqual({ isRunning: false, text: '1 agente terminou', label: 'code-review' })
  // A new request keeps the running agents and drops the finished ones.
  const mixed = finishAgent(spawned(['code-review', 'tests']), 'a1', NOW + MIN)
  expect(keepAgents(mixed, 'E agora?').map(a => a.id)).toEqual(['a2'])
})

test('fim sem lista: badge, time, files and the agents that ran', () => {
  const team = finishAgent(spawned(['code-review']), 'a1', NOW + 200_000)
  const turn = endTurn({ ...working(), changed: ['a', 'b', 'c', 'd', 'e', 'f'], read: ['g', 'h', 'i'] }, 'answer', NOW + 454_000, 'A PR está aberta: corrigi 10 dos 11 apontamentos. Veja o link.')
  expect(cardOf(turn, [], NOW + 500_000, 'pt-BR', false, team)).toEqual({
    kind: 'summary',
    state: 'done',
    title: 'Revise o código e abra a PR',
    badge: '✓ Pronto',
    time: 'levou 7m 34s',
    detail: 'mudei 6 arquivos · li 3 arquivos · 1 agente',
  })
  const en = cardOf(turn, [], NOW + 500_000, 'en', false, team)!
  if (en.kind !== 'summary') throw new Error('summary card expected')
  expect(en.badge).toBe('✓ Done')
  expect(en.time).toBe('took 7m 34s')
  expect(en.detail).toBe('changed 6 files · read 3 files · 1 agent')
})

test('Esc sem lista: grey, where it stopped; an API error says so', () => {
  const turn = { ...working(), read: ['a', 'b'], changed: ['c'] }
  const card = cardOf(endTurn(turn, 'aborted', NOW + 52_000), [], NOW + 60_000, 'pt-BR')!
  expect(card).toEqual({ kind: 'summary', state: 'stopped', title: 'Revise o código e abra a PR', badge: '■ Interrompido', time: 'parou em 52s', detail: 'mudei 1 arquivo · li 2 arquivos' })
  const error = cardOf(endTurn(turn, 'error', NOW + 52_000), [], NOW + 60_000, 'pt-BR')!
  if (error.kind !== 'summary') throw new Error('summary card expected')
  expect(error.badge).toBe('■ Parou com erro')
})

test('com plano + agente: the plan card adds the agents row, working and once it ended', () => {
  const items = at(created(), ['completed', 'in_progress'])
  const team = spawned(['code-review'])
  const card = cardOf(working(), items, NOW + 41_000, 'pt-BR', false, team)!
  if (card.kind !== 'plan') throw new Error('plan card expected')
  expect(card.state).toBe('work')
  expect(card.agents?.text).toBe('1 agente rodando')
  // The turn ended with the agent running: the plan keeps its ended state, with the row.
  const ended = cardOf(endTurn(working(), 'answer', NOW + 60_000), items, NOW + 90_000, 'pt-BR', false, team)!
  if (ended.kind !== 'plan') throw new Error('plan card expected')
  expect(ended.state).toBe('done')
  expect(ended.agents).toEqual({ isRunning: true, text: '1 agente rodando', label: 'code-review', time: '1m 30s' })
})

test('agents: plurals in both languages, the latest label, time since the oldest running one', () => {
  const team = spawned(['code-review', 'tests', 'docs'])
  expect(agentsRowOf(team, NOW + 3 * MIN, 'pt-BR')).toEqual({ isRunning: true, text: '3 agentes rodando', label: 'docs', time: '3m 00s' })
  expect(agentsRowOf(team, NOW + 3 * MIN, 'en')!.text).toBe('3 agents running')
  const done = finishAgent(finishAgent(finishAgent(team, 'a3', NOW + 4 * MIN), 'a1', NOW + 5 * MIN), 'a2', NOW + 4.5 * MIN)
  expect(agentsRowOf(done, NOW + 6 * MIN, 'pt-BR')).toEqual({ isRunning: false, text: '3 agentes terminaram', label: 'code-review' })
  expect(agentsRowOf(done.slice(0, 2), NOW, 'en')!.text).toBe('2 agents finished')
  expect(agentsRowOf(done.slice(0, 1), NOW, 'en')!.text).toBe('1 agent finished')
  expect(agentsRowOf([], NOW, 'pt-BR')).toBeUndefined()
  const turn = endTurn(working(), 'answer', NOW + MIN)
  const two = cardOf(turn, [], NOW + 2 * MIN, 'pt-BR', false, done.slice(0, 2))!
  if (two.kind !== 'summary') throw new Error('summary card expected')
  expect(two.detail).toBe('2 agentes')
})

test('the agent list settles agents whose end the events missed', () => {
  const team = spawned(['code-review', 'tests', 'docs', 'lint'], 1000)
  const listed = [
    { id: 'a1', status: 'completed' },
    { id: 'a2', status: 'running' },
    { id: 'a3', status: 'killed' },
  ]
  // a4 is not listed: it counts as ended only GONE_MS after it started.
  const soon = reconcileAgents(team, listed, NOW + 5000)
  expect(runningOf(soon).map(a => a.id)).toEqual(['a2', 'a4'])
  expect(runningOf(reconcileAgents(soon, listed, NOW + 3000 + GONE_MS)).map(a => a.id)).toEqual(['a2'])
  // An agent that already ended keeps its end.
  expect(reconcileAgents(soon, [], NOW + 99_000).find(a => a.id === 'a1')!.endedAt).toBe(NOW + 5000)
})

test('plain conversation leaves no card; agentText card puts the answer on the small card', () => {
  const chat = endTurn(fresh('Oi, tudo bem?').turn, 'answer', NOW + 3000, 'Tudo ótimo, e você?')
  expect(cardOf(chat, [], NOW + 4000, 'pt-BR', true)).toBeNull()
  const turn = endTurn(touch(working(), 'Agent', {}, 'pt-BR', true), 'answer', NOW + MIN, 'A PR está aberta: corrigi 10 dos 11 apontamentos. Veja o link.')
  const card = cardOf(turn, [], NOW + MIN, 'pt-BR', true)!
  if (card.kind !== 'summary') throw new Error('summary card expected')
  expect(card.answer).toBe('A PR está aberta: corrigi 10 dos 11 apontamentos.')
  const stopped = cardOf(endTurn(working(), 'aborted', NOW + MIN, 'x y z w.'), [], NOW + MIN, 'pt-BR', true)!
  if (stopped.kind !== 'summary') throw new Error('summary card expected')
  expect(stopped.answer).toBeUndefined()
})
