// A tool call in a few words, in Portuguese and English: `lendo routes.ts`, `buscando "fatura"`.
// The same file in every mod that names tool calls: scripts/check-shared.sh keeps the copies
// equal, so it imports from nothing but ui.tsx, which is shared too. Phrases start in lower case;
// a mod that shows one alone capitalizes it.

import type { Lang } from './ui'
import { clip } from './ui'

type Phrases = {
  running: (what: string) => string
  reading: (file: string) => string
  writing: (file: string) => string
  editing: (file: string) => string
  searching: (pattern: string) => string
  finding: (pattern: string) => string
  web: string
  delegating: (what: string) => string
  calling: (tool: string) => string
  /** Stand-ins for an argument the call left out. */
  aCommand: string
  aFile: string
  aTask: string
}

export const PHRASES: Record<Lang, Phrases> = {
  'pt-BR': {
    running: what => `rodando ${what}`,
    reading: file => `lendo ${file}`,
    writing: file => `escrevendo ${file}`,
    editing: file => `editando ${file}`,
    searching: pattern => `buscando "${pattern}"`,
    finding: pattern => `procurando ${pattern}`,
    web: 'na web',
    delegating: what => `delegando "${what}"`,
    calling: tool => `chamando ${tool}`,
    aCommand: 'um comando',
    aFile: 'um arquivo',
    aTask: 'uma tarefa',
  },
  en: {
    running: what => `running ${what}`,
    reading: file => `reading ${file}`,
    writing: file => `writing ${file}`,
    editing: file => `editing ${file}`,
    searching: pattern => `searching "${pattern}"`,
    finding: pattern => `finding ${pattern}`,
    web: 'on the web',
    delegating: what => `delegating "${what}"`,
    calling: tool => `calling ${tool}`,
    aCommand: 'a command',
    aFile: 'a file',
    aTask: 'a task',
  },
}

/** The last part of a path, `/` or `\` separated. */
const base = (p: unknown) => (typeof p === 'string' ? (p.split(/[/\\]/).filter(Boolean).pop() ?? '') : '')

/** A tool call in a few words: the tool's verb and its main argument. */
export const phraseOf = (tool: string, input: Readonly<Record<string, unknown>>, lang: Lang = 'en'): string => {
  const w = PHRASES[lang]
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string).trim() : '')
  const file = () => base(input.file_path) || w.aFile
  switch (tool) {
    case 'Bash':
      return w.running(clip(s('description') || s('command').split('\n')[0]!.trim() || w.aCommand, 50))
    case 'Read':
      return w.reading(file())
    case 'Write':
      return w.writing(file())
    case 'Edit':
    case 'MultiEdit':
      return w.editing(file())
    case 'Grep':
      return w.searching(clip(s('pattern'), 30))
    case 'Glob':
      return w.finding(clip(s('pattern'), 30))
    case 'WebFetch':
    case 'WebSearch':
      return w.web
    case 'Agent':
      return w.delegating(clip(s('description') || w.aTask, 30))
    default:
      return w.calling(clip(tool.startsWith('mcp__') ? (tool.split('__').pop() ?? tool) : tool, 30))
  }
}
