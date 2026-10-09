// The settings pane's model, with no `$`: the seven options, the pane's three tabs, each option's
// values and default (as plugin.json declares them), and what the /config rows say about each.

import { PALETTES } from './palettes'

export type SettingKey = 'enabled' | 'agentText' | 'askForTasks' | 'palette' | 'animation' | 'language' | 'icons'
export type SettingValue = boolean | string

/** The pane's tabs, in order: Transcript, Card, General. */
export const TABS: readonly (readonly SettingKey[])[] = [
  ['enabled', 'agentText', 'askForTasks'],
  ['palette', 'animation'],
  ['language', 'icons'],
]

/** Every option, as plugin.json declares it: its values in order, and its default. */
export const SETTINGS: Readonly<Record<SettingKey, { values: readonly SettingValue[]; initial: SettingValue }>> = {
  enabled: { values: [true, false], initial: false },
  agentText: { values: ['final', 'none', 'card', 'all'], initial: 'final' },
  askForTasks: { values: [true, false], initial: true },
  palette: { values: PALETTES.map(p => p.id), initial: 'claude' },
  animation: { values: [true, false], initial: true },
  language: { values: ['auto', 'pt-BR', 'en'], initial: 'auto' },
  icons: { values: ['auto', 'emoji', 'symbol'], initial: 'auto' },
}

export const KEYS = Object.keys(SETTINGS) as SettingKey[]

/** The /config row of an option: `plain-view.palette`. */
export const rowKey = (key: SettingKey) => `plain-view.${key}`

/** An option's value and whether a trusted source (managed settings) owns it. */
export type Setting = { value: SettingValue; isLocked: boolean }

type Row = { key: string; value: unknown; isLocked?: boolean }

/** A value the option takes, else its default. */
const fit = (key: SettingKey, value: unknown): SettingValue => (SETTINGS[key].values.includes(value as SettingValue) ? (value as SettingValue) : SETTINGS[key].initial)

/**
 * Each option as the pane shows it: its /config row when listed, else the options this load got,
 * else its default. A value the option does not take reads as the default.
 */
export const settingsOf = (rows: readonly Row[], options: Readonly<Record<string, unknown>>): Record<SettingKey, Setting> =>
  Object.fromEntries(
    KEYS.map(key => {
      const row = rows.find(r => r.key === rowKey(key))
      return [key, { value: fit(key, row ? row.value : options[key]), isLocked: row?.isLocked === true }]
    }),
  ) as Record<SettingKey, Setting>

/** The options `defaults` would change: away from their default and not locked. */
export const awayFromDefaults = (s: Readonly<Record<SettingKey, Setting>>): SettingKey[] =>
  KEYS.filter(key => !s[key].isLocked && s[key].value !== SETTINGS[key].initial)

/** The tab shown, kept inside the three. */
export const tabOf = (n: number) => Math.max(0, Math.min(TABS.length - 1, Math.trunc(n) || 0))
