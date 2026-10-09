import { expect, test } from 'claude-code/testing'

import { COMMAND_ICONS, GENERIC, ICONS, SOURCE_ICONS } from '../hooks/icons'
import { cells, defaults, MODS } from '../hooks/pad'

// The rules hooks/icons.ts promises its owner: break one and the tiles misalign in some terminal.

test('every emoji has default emoji presentation: two cells everywhere, no U+FE0F', async () => {
  for (const [key, { emoji }] of Object.entries(ICONS)) {
    expect([key, [...emoji].length]).toEqual([key, 1])
    expect([key, /\p{Emoji_Presentation}/u.test(emoji)]).toEqual([key, true])
    expect([key, cells(emoji)]).toEqual([key, 2])
  }
})

test('every symbol is one cell, drawn as text', async () => {
  for (const [key, { symbol }] of Object.entries(ICONS)) {
    expect([key, [...symbol].length, cells(symbol)]).toEqual([key, 1, 1])
    expect([key, /\p{Emoji_Presentation}/u.test(symbol)]).toEqual([key, false]) // ⚙ is fine: text unless U+FE0F follows
  }
})

test('no two keys share an emoji or a symbol', async () => {
  const all = Object.values(ICONS)
  expect(new Set(all.map(i => i.emoji)).size).toBe(all.length)
  expect(new Set(all.map(i => i.symbol)).size).toBe(all.length)
})

test('the maps, the defaults and the mods name only keys that exist', async () => {
  const keys = Object.keys(ICONS)
  for (const [name, key] of Object.entries({ ...COMMAND_ICONS, ...SOURCE_ICONS })) expect([name, keys.includes(key)]).toEqual([name, true])
  for (const key of GENERIC) expect([key, keys.includes(key)]).toEqual([key, true])
  for (const lang of ['pt-BR', 'en'] as const) for (const d of defaults(lang)) expect([d.id, keys.includes(d.icon)]).toEqual([d.id, true])
  for (const m of MODS) expect([m.command, Object.hasOwn(COMMAND_ICONS, m.command)]).toEqual([m.command, true])
})

test('the keys people already saved with /pad add :name: are all still there', async () => {
  const before = ['folder', 'doc', 'pen', 'search', 'compress', 'gauge', 'chart', 'table', 'mail', 'undo', 'spark', 'brain', 'sliders', 'help', 'agent', 'tool', 'plug', 'shield', 'agents']
  for (const key of before) expect([key, Object.hasOwn(ICONS, key)]).toEqual([key, true])
})
