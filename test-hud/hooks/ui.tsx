// Shared UI helpers, after launchpad's patterns. The same file in every mod that has one: a mod
// installs alone and cannot import another's code, so scripts/check-shared.sh keeps the copies
// equal. Change one, copy it to the others.
//
// Nothing here takes `$`: the engine follows `$` only into functions of the file that uses it,
// never across an import. A call on `$` stays in register.tsx; this file gives it its arguments.
//
//   language and icons  the `language` and `icons` options, else the system's LANG and terminal.
//   prompt              the arguments of $.prompt.fill: a text with its first `[blank]` marked.
//   lists               the window of a long list a pane shows, for ui.scroll.
//   verbs               a row of a command's arguments, one press each.
//   numbers             tokens, elapsed time, clipped text and short model names.

import type { Elements, PromptFillArgs } from 'claude-code'

export type Lang = 'pt-BR' | 'en'
export type IconStyle = 'emoji' | 'symbol'

/** The language: the `language` option when it names one, else Portuguese for a pt LANG, else English. */
export const langOf = (option: unknown, systemLang?: string | null): Lang =>
  option === 'en' || option === 'pt-BR' ? option : /^pt([_.@-]|$)/i.test(systemLang ?? '') ? 'pt-BR' : 'en'

/**
 * The icon style: the `icons` option when it names one; on `auto` (or none), symbols in a
 * JetBrains IDE's terminal (TERMINAL_EMULATOR=JetBrains-JediTerm), which gives many emoji one
 * column where Claude Code counts two, and emoji everywhere else.
 */
export const styleOf = (option: unknown, terminal?: string | null): IconStyle =>
  option === 'emoji' || option === 'symbol' ? option : /^JetBrains/i.test(terminal ?? '') ? 'symbol' : 'emoji'

/** An icon in the style: its emoji, or the one-cell symbol that stands in for it. */
export const glyph = (style: IconStyle, icon: { emoji: string; symbol: string }) => icon[style]

const BLANK = /\[[^\]\n]+\]/

/** The first `[blank]` in a text, as offsets, so the prompt can mark what to replace. */
export const blankIn = (text: string): { start: number; end: number } | null => {
  const m = BLANK.exec(text)
  return m ? { start: m.index, end: m.index + m[0].length } : null
}

/** What `$.prompt.fill` takes to put a text in the prompt, its `[blank]` marked to replace. */
export const fillArgs = (text: string): PromptFillArgs => {
  const blank = blankIn(text)
  return blank ? { text, decorations: [{ ...blank, bold: true, underline: true }] } : { text }
}

/** The rows of a list of `total` a pane shows from `offset`, kept inside the list. */
export const windowOf = (total: number, offset: number, rows: number): { start: number; end: number } => {
  const size = Math.max(1, rows)
  const start = Math.max(0, Math.min(offset, total - size))
  return { start, end: Math.min(total, start + size) }
}

/**
 * One of a command's arguments in a verb row. `fill` is the text the prompt waits with, for a
 * verb that takes an argument or undoes something: a stray click then loses nothing. A verb with
 * no `fill` runs, and its answer goes to the transcript a line at a time (`linesOf`).
 */
export type Verb = { verb: string; label?: string; fill?: string }

/** A command's answer as the lines `$.ui.log` writes, one row each; blank lines dropped. */
export const linesOf = (text: string | undefined) => (text ?? '').split('\n').filter(line => line.trim() !== '')

/** `/command verb · verb · verb`, each verb a plain button; `lead` goes dim before the command. */
export function verbRow(
  ui: Pick<Elements[keyof Elements], 'Box' | 'Text' | 'Button'>,
  command: string,
  verbs: readonly Verb[],
  onPress: (v: Verb) => void,
  lead = '',
) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="row" flexWrap="wrap">
      {lead !== '' && <Text dimColor>{`${lead} · `}</Text>}
      <Text dimColor>{`/${command} `}</Text>
      {verbs.map((v, i) => (
        <Box key={`verbrow:${v.verb}`} flexDirection="row">
          {i > 0 && <Text dimColor> · </Text>}
          <Button key={`verb:${v.verb}`} plain dimColor label={v.label ?? v.verb} onPress={() => onPress(v)} />
        </Box>
      ))}
    </Box>
  )
}

/** 950, 1.2k, 46k, 1.2M. */
export const tokens = (n: number) => {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** 42s, 6m 05s, 1h 02m. */
export const elapsed = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** The text cut to `n` characters, an ellipsis last when it was longer. */
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** claude-haiku-4-5-20251001 -> haiku 4.5 */
export const shortModel = (m?: string) => {
  if (!m) return ''
  const hit = /(opus|sonnet|haiku|fable)[-\s]?(\d+(?:[-.]\d+)?)?/i.exec(m)
  if (!hit) return m.length > 14 ? `${m.slice(0, 13)}…` : m
  return `${hit[1]!.toLowerCase()}${hit[2] ? ` ${hit[2].replace('-', '.')}` : ''}`
}
