// Tests for hooks/phrases.ts. The same file in every mod that has one: scripts/check-shared.sh
// keeps the copies equal.

import { expect, test } from 'claude-code/testing'

import { phraseOf } from '../hooks/phrases'

const LONG = 'a'.repeat(80)

// tool, input, Portuguese, English
const CASES: [string, Record<string, unknown>, string, string][] = [
  ['Bash', { command: 'npm test', description: 'Run the unit tests' }, 'rodando Run the unit tests', 'running Run the unit tests'],
  ['Bash', { command: 'npm test' }, 'rodando npm test', 'running npm test'],
  ['Bash', { command: 'cd app\nnpm test' }, 'rodando cd app', 'running cd app'],
  ['Bash', { command: '  ' }, 'rodando um comando', 'running a command'],
  ['Bash', { command: LONG }, `rodando ${'a'.repeat(49)}…`, `running ${'a'.repeat(49)}…`],
  ['Read', { file_path: '/repo/docs/relatorio.pdf' }, 'lendo relatorio.pdf', 'reading relatorio.pdf'],
  ['Read', { file_path: 'C:\\repo\\notes.txt' }, 'lendo notes.txt', 'reading notes.txt'],
  ['Read', {}, 'lendo um arquivo', 'reading a file'],
  ['Write', { file_path: '/repo/src/new.ts', content: 'x' }, 'escrevendo new.ts', 'writing new.ts'],
  ['Edit', { file_path: '/repo/src/app.ts' }, 'editando app.ts', 'editing app.ts'],
  ['MultiEdit', { file_path: '/repo/src/app.ts' }, 'editando app.ts', 'editing app.ts'],
  ['Grep', { pattern: 'fatura' }, 'buscando "fatura"', 'searching "fatura"'],
  ['Grep', { pattern: LONG }, `buscando "${'a'.repeat(29)}…"`, `searching "${'a'.repeat(29)}…"`],
  ['Glob', { pattern: '**/*.test.ts' }, 'procurando **/*.test.ts', 'finding **/*.test.ts'],
  ['WebFetch', { url: 'https://example.com' }, 'na web', 'on the web'],
  ['WebSearch', { query: 'claude code mods' }, 'na web', 'on the web'],
  ['Agent', { description: 'Map the API routes' }, 'delegando "Map the API routes"', 'delegating "Map the API routes"'],
  ['Agent', {}, 'delegando "uma tarefa"', 'delegating "a task"'],
  ['mcp__claude_ai_Gmail__search_threads', {}, 'chamando search_threads', 'calling search_threads'],
  ['NotebookEdit', { notebook_path: '/repo/a.ipynb' }, 'chamando NotebookEdit', 'calling NotebookEdit'],
]

test('twenty tool calls in Portuguese', async () => {
  for (const [tool, input, pt] of CASES) expect(phraseOf(tool, input, 'pt-BR')).toBe(pt)
})

test('twenty tool calls in English', async () => {
  for (const [tool, input, , en] of CASES) expect(phraseOf(tool, input, 'en')).toBe(en)
})

test('English when no language is given', async () => {
  expect(phraseOf('Read', { file_path: '/a/b.md' })).toBe('reading b.md')
})

test('an argument of the wrong type counts as missing', async () => {
  expect(phraseOf('Read', { file_path: 42 }, 'pt-BR')).toBe('lendo um arquivo')
  expect(phraseOf('Bash', { command: ['ls'] }, 'en')).toBe('running a command')
})
