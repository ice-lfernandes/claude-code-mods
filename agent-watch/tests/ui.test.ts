// Tests for hooks/ui.tsx. The same file in every mod that has one: scripts/check-shared.sh keeps
// the copies equal.

import { expect, test } from 'claude-code/testing'

import { blankIn, clip, elapsed, fillArgs, glyph, langOf, linesOf, shortModel, styleOf, tokens, windowOf } from '../hooks/ui'

test('language: the option when it names one, else Portuguese for a pt LANG, else English', async () => {
  expect(langOf('pt-BR', 'en_US.UTF-8')).toBe('pt-BR')
  expect(langOf('en', 'pt_BR.UTF-8')).toBe('en')
  expect(langOf('auto', 'pt_BR.UTF-8')).toBe('pt-BR')
  expect(langOf(undefined, 'pt_PT')).toBe('pt-BR')
  expect(langOf('auto', 'pt')).toBe('pt-BR')
  expect(langOf('auto', 'en_US.UTF-8')).toBe('en')
  expect(langOf('auto', 'ptx')).toBe('en')
  expect(langOf('auto', undefined)).toBe('en')
})

test('icons: the option when it names one, else symbols in a JetBrains terminal, else emoji', async () => {
  expect(styleOf('emoji', 'JetBrains-JediTerm')).toBe('emoji')
  expect(styleOf('symbol', undefined)).toBe('symbol')
  expect(styleOf('auto', 'JetBrains-JediTerm')).toBe('symbol')
  expect(styleOf('auto', 'iTerm')).toBe('emoji')
  expect(glyph('symbol', { emoji: '🗜️', symbol: '⇲' })).toBe('⇲')
  expect(glyph('emoji', { emoji: '🗜️', symbol: '⇲' })).toBe('🗜️')
})

test('the first [blank] of a text, as offsets, marked when the prompt takes it', async () => {
  expect(blankIn('/compact [foco]')).toEqual({ start: 9, end: 15 })
  expect(blankIn('/compact')).toBeNull()
  expect(fillArgs('/compact [foco]')).toEqual({ text: '/compact [foco]', decorations: [{ start: 9, end: 15, bold: true, underline: true }] })
  expect(fillArgs('/compact')).toEqual({ text: '/compact' })
})

test('an answer goes to the transcript a line at a time', async () => {
  expect(linesOf('a\n\n  \nb')).toEqual(['a', 'b'])
  expect(linesOf(undefined)).toEqual([])
})

test('the list window stays inside the list', async () => {
  expect(windowOf(191, 0, 12)).toEqual({ start: 0, end: 12 })
  expect(windowOf(191, 185, 12)).toEqual({ start: 179, end: 191 })
  expect(windowOf(191, -5, 12)).toEqual({ start: 0, end: 12 })
  expect(windowOf(3, 2, 12)).toEqual({ start: 0, end: 3 })
})

test('numbers: tokens, elapsed time, clipped text, short model names', async () => {
  expect(tokens(950)).toBe('950')
  expect(tokens(1234)).toBe('1.2k')
  expect(tokens(45_600)).toBe('46k')
  expect(tokens(1_234_567)).toBe('1.2M')
  expect(elapsed(42_000)).toBe('42s')
  expect(elapsed(365_000)).toBe('6m 05s')
  expect(elapsed(3_720_000)).toBe('1h 02m')
  expect(clip('abcdef', 4)).toBe('abc…')
  expect(clip('abc', 4)).toBe('abc')
  expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku 4.5')
  expect(shortModel('claude-opus-5-5')).toBe('opus 5.5')
  expect(shortModel(undefined)).toBe('')
})
