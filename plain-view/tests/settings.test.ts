import { expect, test } from 'claude-code/testing'

import { awayFromDefaults, KEYS, rowKey, SETTINGS, settingsOf, tabOf, TABS } from '../hooks/settings'

test('the three tabs hold each of the seven options once', () => {
  expect(TABS.flat().sort()).toEqual([...KEYS].sort())
  expect(KEYS).toHaveLength(7)
})

test('the defaults are the manifest\'s', () => {
  expect(Object.fromEntries(KEYS.map(k => [k, SETTINGS[k].initial]))).toEqual({
    enabled: false,
    agentText: 'final',
    askForTasks: true,
    palette: 'claude',
    animation: true,
    language: 'auto',
    icons: 'auto',
  })
  expect(SETTINGS.palette.values).toHaveLength(8)
})

test('a /config row wins over the options this load got, and says when it is locked', () => {
  const s = settingsOf([{ key: rowKey('palette'), value: 'aurora', isLocked: true }, { key: 'theme', value: 'dark' }], { palette: 'neon', agentText: 'card' })
  expect(s.palette).toEqual({ value: 'aurora', isLocked: true })
  expect(s.agentText).toEqual({ value: 'card', isLocked: false })
  expect(s.enabled).toEqual({ value: false, isLocked: false })
})

test('a value the option does not take reads as its default', () => {
  const s = settingsOf([{ key: rowKey('icons'), value: 'sparkles' }], { agentText: 3, animation: 'yes' })
  expect(s.icons.value).toBe('auto')
  expect(s.agentText.value).toBe('final')
  expect(s.animation.value).toBe(true)
})

test('defaults: only the options away from their default, and never a locked one', () => {
  const s = settingsOf(
    [
      { key: rowKey('enabled'), value: true },
      { key: rowKey('palette'), value: 'ocean', isLocked: true },
      { key: rowKey('language'), value: 'en' },
    ],
    {},
  )
  expect(awayFromDefaults(s)).toEqual(['enabled', 'language'])
  expect(awayFromDefaults(settingsOf([], {}))).toEqual([])
})

test('the tab stays inside the three', () => {
  expect([tabOf(-1), tabOf(0), tabOf(2), tabOf(7), tabOf(Number.NaN)]).toEqual([0, 0, 2, 2, 0])
})
