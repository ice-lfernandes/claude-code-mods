import { expect, test } from 'claude-code/testing'

import type { Item, Turn } from '../types'
import { barCells, base64, layoutOf, rasterCells } from '../hooks/card'
import { mix, paletteOf, PALETTES, stopsOf, hex, titleColor } from '../hooks/palettes'
import { applyTask, cardOf, countCall, currentOf, demoOf, endTurn, estimate, MAX_ESTIMATE, startTurn, titleOf, touch, windowAround } from '../hooks/plan'

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
  expect(items[0]).toEqual({ id: '1', subject: TASKS[0], status: 'in_progress', calls: 0, activeForm: 'Escolhendo o estilo' })
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

test('sem lista de tarefas: the tool in flight; fim sem lista: no card', () => {
  const turn = touch(fresh('O que o weather.ts faz?').turn, 'Read', { file_path: 'src/weather.ts' }, 'pt-BR', null)
  expect(cardOf(turn, [], NOW + 4000, 'pt-BR')).toEqual({ kind: 'phrase', title: 'O que o weather.ts faz?', time: '4s', doing: 'Lendo weather.ts' })
  expect(cardOf(endTurn(turn, 'answer', NOW + 12_000), [], NOW + 12_000, 'pt-BR')).toBeNull()
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
  expect(card.rows[2]!.kind).toBe('halted')
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
