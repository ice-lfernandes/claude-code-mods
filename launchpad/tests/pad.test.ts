import { expect, test } from 'claude-code/testing'

import type { Target } from '../types'
import {
  agentName,
  agentOf,
  agentTask,
  asPads,
  available,
  blankIn,
  blanksOf,
  buttonLabel,
  cells,
  commandOf,
  defaults,
  kindOf,
  langOf,
  glyph,
  layout,
  listText,
  localize,
  matches,
  move,
  moveId,
  windowOf,
  padFor,
  parseAdd,
  parseProject,
  sameText,
  shownOf,
  styleOf,
  tileLabel,
  WORDS,
} from '../hooks/pad'

const command = (name: string, source = 'builtin', description = ''): Target => ({ kind: 'command', name, description, source })
const agent = (name: string): Target => ({ kind: 'agent', name, description: '', source: 'agent' })

test('a button is a command, skill or agent, told from its first character', async () => {
  expect(kindOf('/compact')).toBe('command')
  expect(kindOf('/code-review high')).toBe('command')
  expect(kindOf('@Explore')).toBe('agent')
  expect(kindOf('Organize esta pasta.')).toBe(null)
  expect(kindOf('/')).toBe(null)
  expect(kindOf('@ ')).toBe(null)
  expect(commandOf('/compact focus on tests')).toEqual({ command: 'compact', args: 'focus on tests' })
  expect(agentOf('@Explore')).toBe('Explore')
  expect(blankIn(WORDS['pt-BR'].useAgent('Explore'))).toEqual({ start: 26, end: 34 })
})

test('language: the option when it names one, else Portuguese for a pt LANG, else English', async () => {
  expect(langOf('pt-BR', 'en_US.UTF-8')).toBe('pt-BR')
  expect(langOf('en', 'pt_BR.UTF-8')).toBe('en')
  expect(langOf('auto', 'pt_BR.UTF-8')).toBe('pt-BR')
  expect(langOf(undefined, 'pt_PT')).toBe('pt-BR')
  expect(langOf('auto', 'pt')).toBe('pt-BR')
  expect(langOf('auto', 'en_US.UTF-8')).toBe('en')
  expect(langOf('auto', 'C')).toBe('en')
  expect(langOf('auto', 'ptx')).toBe('en')
  expect(langOf('auto', undefined)).toBe('en')
})

test('icons: the option when it names one, else symbols in a JetBrains terminal, else emoji', async () => {
  expect(styleOf('emoji', 'JetBrains-JediTerm')).toBe('emoji')
  expect(styleOf('symbol', undefined)).toBe('symbol')
  expect(styleOf('auto', 'JetBrains-JediTerm')).toBe('symbol')
  expect(styleOf(undefined, 'JetBrains-JediTerm')).toBe('symbol')
  expect(styleOf('auto', undefined)).toBe('emoji')
  expect(styleOf('auto', 'iTerm')).toBe('emoji')
})

test("with symbols, an emoji of the person's own gives way to the symbol of its kind", async () => {
  const mine = parseAdd('🧾 Fechamento | /cost', 'u1')!
  const agentPad = parseAdd('🕵️ Revisor | @revisor', 'u2')!
  const glyphPad = parseAdd('★ Favorito | /cost', 'u3')!
  expect(buttonLabel(mine, 'symbol')).toBe('⚙ Fechamento')
  expect(buttonLabel(agentPad, 'symbol')).toBe('◉ Revisor')
  expect(buttonLabel(glyphPad, 'symbol')).toBe('★ Favorito') // one cell: kept
  expect(buttonLabel(mine, 'emoji')).toBe('🧾 Fechamento')
})

test('defaults in both languages are all commands or agents', async () => {
  const pt = defaults('pt-BR')
  expect(pt.map(p => p.text)).toEqual(['/compact', '/context', '/limits', '/resume', '/memory', '/model', '@Explore', '/help'])
  expect(pt.every(p => p.origin === 'default')).toBe(true)
  expect(defaults('en')[0]!.label).toBe('Compact chat')
})

test('a saved list follows the language for the default buttons only', async () => {
  const saved = [...defaults('pt-BR').slice(0, 2), parseAdd('Limpar | /clear', 'u1')!]
  expect(localize(saved, 'en').map(p => p.label)).toEqual(['Compact chat', 'See context', 'Limpar'])
})

test('/pad add takes an optional icon, a name and a /command or @agent', async () => {
  expect(parseAdd(' 📊 Revisão | /code-review high', 'u1')).toEqual({
    id: 'u1', icon: '📊', label: 'Revisão', text: '/code-review high', kind: 'command', origin: 'user',
  })
  expect(parseAdd('Explorar | @Explore', 'u2')).toMatchObject({ icon: 'agent', kind: 'agent' })
  expect(parseAdd('Contexto | /context', 'u3')).toMatchObject({ icon: 'tool', kind: 'command' })
  expect(parseAdd('Planilha | Converta [arquivo] em xlsx', 'u4')).toBe(null)
  expect(parseAdd('Sem barra', 'u5')).toBe(null)
  expect(parseAdd('📊 | /context', 'u6')).toBe(null)
})

test('project buttons keep only commands and agents', async () => {
  const raw = JSON.stringify({
    buttons: [
      { icon: '🧾', label: 'Fechamento', text: '/fechamento março' },
      { label: 'Revisor', text: '@revisor' },
      { label: 'Texto livre', text: 'Feche o mês' },
      { label: '', text: '/clear' },
      'lixo',
    ],
  })
  expect(parseProject(raw).map(p => [p.label, p.kind, p.origin, p.icon])).toEqual([
    ['Fechamento', 'command', 'project', '🧾'],
    ['Revisor', 'agent', 'project', 'table'],
  ])
  expect(parseProject('{ not json')).toEqual([])
  expect(parseProject(null)).toEqual([])
})

test('only buttons whose command, skill or agent is installed show', async () => {
  const catalog = [command('compact'), command('context'), agent('Explore')]
  const shown = available(defaults('pt-BR'), catalog)
  expect(shown.map(p => p.text)).toEqual(['/compact', '/context', '@Explore'])
  const project = parseProject(JSON.stringify({ buttons: [{ label: 'Ctx', text: '/context' }, { label: 'X', text: '/nada' }] }))
  expect(shownOf(shown, project, catalog).map(p => p.id)).toEqual(['compact', 'context', 'explore', 'project:0'])
  expect(available(defaults('pt-BR'), [])).toEqual([])
})

test('agent files are named by their frontmatter, else by the file', async () => {
  expect(agentName('revisor.md', '---\nname: code-reviewer\ndescription: x\n---\nbody')).toBe('code-reviewer')
  expect(agentName('revisor.md', '---\nname: "quoted"\n---\n')).toBe('quoted')
  expect(agentName('revisor.md', 'no frontmatter')).toBe('revisor')
})

test('the pane lists what is not in the menu, filtered, commands first', async () => {
  const catalog = [agent('Plan'), command('cost', 'builtin', 'Show the session cost'), command('compact'), command('code-review', 'plugin')]
  const menu = [padFor(command('compact'), 'u1')]
  expect(matches(catalog, menu, '').map(t => t.name)).toEqual(['code-review', 'cost', 'Plan'])
  expect(matches(catalog, menu, '/co').map(t => t.name)).toEqual(['code-review', 'cost'])
  expect(matches(catalog, menu, 'session').map(t => t.name)).toEqual(['cost'])
  expect(padFor(command('code-review', 'plugin'), 'u2')).toMatchObject({ icon: 'spark', label: 'code-review', text: '/code-review' })
  expect(padFor(agent('Plan'), 'u3')).toMatchObject({ icon: 'agent', text: '@Plan', kind: 'agent' })
})

test('an argument hint becomes blanks on the button the pane adds', async () => {
  expect(blanksOf('[level]')).toBe('[level]')
  expect(blanksOf('[a] [b]')).toBe('[a] [b]')
  expect(blanksOf('<file>')).toBe('[file]')
  expect(blanksOf('<from> <to>')).toBe('[from] [to]')
  expect(blanksOf('message')).toBe('[message]')
  expect(blanksOf('  ')).toBe('')
  expect(blanksOf(undefined)).toBe('')
  expect(padFor(command('code-review', 'plugin'), 'u1', '<level>').text).toBe('/code-review [level]')
  expect(padFor(command('cost'), 'u2').text).toBe('/cost')
  expect(padFor(agent('Plan'), 'u3', '[x]').text).toBe('@Plan')
})

test('the list window stays inside the list', async () => {
  expect(windowOf(191, 0, 12)).toEqual({ start: 0, end: 12 })
  expect(windowOf(191, 185, 12)).toEqual({ start: 179, end: 191 })
  expect(windowOf(191, -5, 12)).toEqual({ start: 0, end: 12 })
  expect(windowOf(3, 2, 12)).toEqual({ start: 0, end: 3 })
})

test('a named icon is written :name:, so a first word of the label stays in the label', async () => {
  expect(parseAdd(':chart: Vendas | /cost', 'u1')).toMatchObject({ icon: 'chart', label: 'Vendas' })
  expect(parseAdd('search docs | /cost', 'u2')).toMatchObject({ icon: 'tool', label: 'search docs' })
  expect(parseAdd('constructor Foo | /cost', 'u3')).toMatchObject({ icon: 'tool', label: 'constructor Foo' })
  expect(parseAdd(':nada: Foo | /cost', 'u4')).toMatchObject({ icon: 'tool', label: ':nada: Foo' })
  expect(glyph('constructor', 'emoji')).toBe('constructor')
  expect(glyph('toString', 'symbol')).toBe('toString')
})

test('an agent button keeps its task', async () => {
  expect(agentTask('@revisor revise [arquivo]')).toBe('revise [arquivo]')
  expect(agentTask('@Explore')).toBe('')
  expect(WORDS['pt-BR'].useAgent('revisor', 'revise [arquivo]')).toBe('Use o agente revisor para revise [arquivo]')
  expect(WORDS['en'].useAgent('Plan')).toBe('Use the Plan agent to [task]')
})

test('a saved list is cleaned before it is drawn', async () => {
  const list = asPads([
    { id: 'a', label: 'A', text: '/cost' },
    { id: 'b', label: 'B', text: '@Plan', icon: '', origin: 'weird' },
    { id: 'c', label: 'C', text: 'texto livre' },
    { label: 'D', text: '/cost' },
    null,
  ])!
  expect(list).toEqual([
    { id: 'a', icon: 'tool', label: 'A', text: '/cost', kind: 'command', origin: 'user' },
    { id: 'b', icon: 'agent', label: 'B', text: '@Plan', kind: 'agent', origin: 'user' },
  ])
  expect(asPads('x')).toBe(null)
  expect(sameText(' /compact  focus ', '/compact focus')).toBe(true)
  expect(sameText('/compact', '/compact focus')).toBe(false)
  const ids = defaults('pt-BR')
  expect(moveId(ids, 'context', -1).map(p => p.id).slice(0, 2)).toEqual(['context', 'compact'])
  expect(moveId(ids, 'nada', 1)).toEqual(ids)
})

test('move swaps neighbours and stays inside the list', async () => {
  expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
  expect(move(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
  expect(move(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
})

test('columns fit the width and emoji count two cells', async () => {
  expect(cells('📁 Organizar pasta')).toBe(18)
  expect(cells('✏️ Revisar')).toBe(10)
  expect(cells('▤ Organizar pasta')).toBe(17)
  expect(cells('⚙ Nome')).toBe(6) // a symbol drawn as text is one cell
  expect(cells('✉')).toBe(1)
  expect(cells('✉️')).toBe(2) // with its variation selector, an emoji
  expect(cells('❓')).toBe(2)
  const pads = defaults('pt-BR')
  const wide = layout(pads, 'emoji', 100)
  expect(wide.width).toBe(cells(buttonLabel(pads[0]!, 'emoji')) + 3)
  expect(wide.rows.map(r => r.length)).toEqual([4, 4])
  expect(layout(pads, 'emoji', 20).rows.length).toBe(8)
})

test('a tile label fills the row inside its border, a space each side', async () => {
  expect(tileLabel('📁 Docs', 12)).toBe(' 📁 Docs    ')
  expect(cells(tileLabel('📁 Docs', 12))).toBe(12)
  expect(tileLabel('a much longer label', 4)).toBe(' a much longer label ') // never narrower than its label
})

test('list shows number, what it runs, kind and origin', async () => {
  const text = listText(defaults('en').slice(0, 7).slice(5), 'en', 'symbol')
  expect(text).toContain('1. ≡ Switch model  /model  (command, default)')
  expect(text).toContain('2. Δ Explore code  @Explore  (agent, default)')
  expect(listText([], 'pt-BR', 'emoji')).toContain('/pad configuration')
})
