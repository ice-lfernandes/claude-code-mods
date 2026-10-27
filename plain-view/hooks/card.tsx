// The plan card's drawing, with no `$`: register.tsx resolves the elements and hands them in.
//
// Bars are one Raster each on the terminal, a gradient of the palette's colors cell by cell, with
// a bright cell running along the filled part while the agent works (`tick`). With no palette
// (animation off) or on another surface they are plain text in the theme's own keys.

import type { Elements } from 'claude-code'

import type { AgentsRow, Card, RequestView, Row } from './plan'
import type { Stops } from './palettes'
import { hex, mix, titleColor } from './palettes'
import type { IconStyle } from './ui'
import type { WatchMessage } from '../types'
import { clip, glyph } from './ui'

const FULL = 0x2588 // █
const EMPTY = 0x2591 // ░
const DEFAULT = 0x01000000

/** How a bar paints: the working gradient, the done one, a stopped bar, or a comet over the track. */
export type BarMode = 'work' | 'ok' | 'off' | 'comet'

/** One cell of a bar: its character and its color. */
export type Cell = { ch: number; fg: number }

/** The cells of a bar of `n`, `frac` full; `tick` moves the shine (work) or the comet. */
export const barCells = (n: number, frac: number, mode: BarMode, s: Stops, tick: number | null): Cell[] => {
  if (mode === 'comet') {
    const head = (tick ?? 0) % (n + 4)
    return Array.from({ length: n }, (_, i) => {
      const d = head - i
      return d >= 0 && d < 4 ? { ch: FULL, fg: mix(s.g2, s.g1, d / 4) } : { ch: EMPTY, fg: s.track }
    })
  }
  const f = Math.max(0, Math.min(n, Math.round(n * frac)))
  const shineAt = tick === null || mode !== 'work' || f === 0 ? -9 : tick % (f + 8)
  return Array.from({ length: n }, (_, i) => {
    if (i >= f) return { ch: EMPTY, fg: s.track }
    if (mode === 'off') return { ch: FULL, fg: s.off }
    const x = f > 1 ? i / (f - 1) : 0
    const base = mode === 'ok' ? mix(s.k1, s.k2, x) : mix(s.g1, s.g2, x)
    const d = Math.abs(shineAt - i)
    return { ch: FULL, fg: d === 0 ? mix(base, 0xffffff, 0.55) : d === 1 ? mix(base, 0xffffff, 0.25) : base }
  })
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64 of bytes. */
export const base64 = (bytes: Uint8Array) => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += B64[a >> 2]! + B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!
    out += c === undefined ? '=' : B64[c & 63]!
  }
  return out
}

/** A Raster's `cells`: little-endian u32 triplets, code point, foreground, background (the terminal's). */
export const rasterCells = (cells: readonly Cell[]) => {
  const words = new Uint32Array(cells.length * 3)
  cells.forEach((c, i) => {
    words[i * 3] = c.ch
    words[i * 3 + 1] = c.fg
    words[i * 3 + 2] = DEFAULT
  })
  return base64(new Uint8Array(words.buffer))
}

/** The columns the card's parts take in a body of `inner` columns. */
export const layoutOf = (inner: number) => {
  const label = 14
  const item = inner >= 100 ? 18 : inner >= 70 ? 10 : 6
  const text = inner >= 100 ? 46 : Math.max(12, Math.min(30, inner - item - 30))
  const bar = Math.max(6, inner - label - 6)
  return { label, item, text, bar }
}

const ICONS = {
  done: { emoji: '✅', symbol: '✓' },
  now: { emoji: '🟠', symbol: '●' },
  wait: { emoji: '⚪', symbol: '○' },
  halted: { emoji: '⏹️', symbol: '■' },
}

type Ui = Pick<Elements[keyof Elements], 'Box' | 'Text'> & { Raster?: Elements['terminal']['Raster']; Button?: Elements[keyof Elements]['Button'] }

export type DrawOptions = {
  /** The palette's colors; null draws in theme keys with no gradient. */
  stops: Stops | null
  /** Moves the shine; null keeps the bars still. */
  tick: number | null
  /** The box the card draws into. */
  columns: number
  icons: IconStyle
  /** `Resposta: ` before the answer's first sentence. */
  answerLabel?: string
  /** Opens agent-watch's pane: the agents row shows `/watch` only when this is given. */
  onWatch?: () => void
  /** What agent-watch's band says, drawn as a child of the agents row; agent-watch's own band steps aside then. */
  message?: WatchMessage
  /** A request of several lines: `+5 linhas`, and the button that unfolds it (shown only with `onRequest`). */
  request?: { more: (n: number) => string; show: string; fold: string }
  onRequest?: () => void
}

/** The fewest columns the request's title keeps before its count and button step aside. */
const MIN_TITLE = 12

/** The plan card: a bordered box above the prompt, as the approved prototype draws it. */
export function drawCard(ui: Ui, card: Card, o: DrawOptions) {
  const { Box, Text, Raster, Button } = ui
  const inner = Math.max(30, o.columns - 4)
  const L = layoutOf(inner)
  const gradient = o.stops !== null && Raster !== undefined

  const bar = (key: string, n: number, frac: number, mode: BarMode) => {
    if (gradient) return <Raster key={key} columns={n} rows={1} cells={rasterCells(barCells(n, frac, mode, o.stops!, o.tick))} />
    if (mode === 'comet') return <Text key={key} color="claude">{'░'.repeat(n)}</Text>
    const f = Math.max(0, Math.min(n, Math.round(n * frac)))
    return (
      <Text key={key}>
        <Text color={mode === 'ok' ? 'success' : mode === 'off' ? 'inactive' : 'claude'}>{'█'.repeat(f)}</Text>
        <Text dimColor>{'░'.repeat(n - f)}</Text>
      </Text>
    )
  }

  // The figures take the color of the bar's filled end.
  const tone = (state: string) =>
    o.stops ? hex(state === 'done' ? o.stops.k2 : state === 'stopped' ? o.stops.off : o.stops.g2) : state === 'done' ? 'success' : state === 'stopped' ? 'inactive' : 'claude'

  const title = (text: string, room: number, pal: 'work' | 'ok' | 'off') => {
    const shown = clip(text, Math.max(8, room))
    if (!o.stops || pal === 'off') return <Text bold dimColor={pal === 'off'} color={pal === 'off' ? undefined : pal === 'ok' ? 'success' : 'claude'}>{shown}</Text>
    const s = o.stops
    const last = Math.max(1, shown.length - 1)
    return (
      <Text bold>
        {[...shown].map((ch, i) => (
          <Text key={`t${i}`} color={hex(pal === 'ok' ? mix(s.k1, s.k2, i / last) : titleColor(s, i / last))}>{ch}</Text>
        ))}
      </Text>
    )
  }

  // What agent-watch's band says, under the agents row: `└ Agentes 0/3 ░░░░░░░░░░ · ■ Pré-roteiro · Escrevendo pre-outline.md`.
  const watchLine = (m: WatchMessage) => {
    if (m.kind === 'done') {
      return (
        <Text key="agents-child">
          <Text dimColor>{'  └ '}</Text>
          <Text color="success" bold>{'✓ '}</Text>
          <Text bold>{clip(m.text, Math.max(10, inner - 8))}</Text>
        </Text>
      )
    }
    // The label, the count, the bar and the shape take 4 + label + count + 10 + 8 columns; the rest is the action.
    const room = Math.max(10, inner - m.label.length - m.count.length - 24)
    return (
      <Text key="agents-child">
        <Text dimColor>{'  └ '}</Text>
        <Text bold>{`${m.label} `}</Text>
        <Text bold color="success">{m.count}</Text>
        <Text>{' '}</Text>
        {m.bar.map((c, i) => (
          <Text key={`agents-bar:${i}`} color={c.color}>{c.filled ? '█' : '░'}</Text>
        ))}
        <Text dimColor>{' · '}</Text>
        <Text bold color={m.stalled ? 'warning' : m.color}>{`${m.glyph} `}</Text>
        <Text color={m.stalled ? 'warning' : undefined}>{clip(m.stalled ?? `${clip(m.name, 20)} · ${m.action}`, room)}</Text>
      </Text>
    )
  }

  // One row for the main loop's agents: `◇ 1 agente rodando · code-review · 3m 12s   /watch`, and
  // agent-watch's message under it when there is one.
  const agentsLine = (a: AgentsRow) => {
    const onWatch = o.onWatch
    const watch = onWatch !== undefined && Button !== undefined
    const room = inner - a.text.length - (a.time ? a.time.length + 3 : 0) - (watch ? 9 : 0) - 6
    const row = (
      <Box key="agents" flexDirection="row">
        <Text>
          <Text color={a.isRunning ? 'claude' : 'success'}>◇ </Text>
          <Text bold={a.isRunning}>{a.text}</Text>
          <Text dimColor>{` · ${clip(a.label, Math.max(8, room))}${a.time ? ` · ${a.time}` : ''}`}</Text>
        </Text>
        {watch ? <Text>   </Text> : null}
        {onWatch && Button ? <Button key="watch" plain dimColor label="/watch" onPress={() => onWatch()} /> : null}
      </Box>
    )
    if (o.message === undefined) return row
    return (
      <Box key="agents-group" flexDirection="column">
        {row}
        {watchLine(o.message)}
      </Box>
    )
  }

  // A request of several lines: `+5 linhas` after the title, the button that unfolds the request
  // (only when something is left out), and its lines under the title.
  const request: RequestView | undefined = card.request
  const words = o.request
  const titled = (text: string, room: number, pal: 'work' | 'ok' | 'off', badge?: { text: string; state: 'done' | 'stopped' }) => {
    const label = (request?.isOpen ? words?.fold : words?.show) ?? ''
    const onRequest = o.onRequest
    // A narrow card keeps the title: the button goes first, then the count.
    let more = request && request.more > 0 && words ? `  ${words.more(request.more)}` : ''
    let hasButton =
      request !== undefined && words !== undefined && onRequest !== undefined && Button !== undefined && (request.canOpen || (request.isJoined && text.length > room - more.length))
    if (hasButton && room - more.length - label.length - 6 < MIN_TITLE) hasButton = false
    if (room - more.length < MIN_TITLE) more = ''
    return (
      <Box flexDirection="row">
        <Text>
          {badge ? <Text bold inverse color={badge.state === 'done' ? 'success' : 'inactive'}>{` ${badge.text} `}</Text> : <Text color="claude">✦</Text>}
          <Text> </Text>
          {title(text, room - more.length - (hasButton ? label.length + 6 : 0), pal)}
          {more ? <Text dimColor>{more}</Text> : null}
        </Text>
        {hasButton ? <Text>  </Text> : null}
        {hasButton && onRequest ? <Button key="request" plain dimColor label={label} onPress={() => onRequest()} /> : null}
      </Box>
    )
  }
  const requestRows = () => request?.rest.map((line, i) => <Text key={`request${i}`} dimColor={line.startsWith('⟨')}>{`  ${clip(line, inner - 2)}`}</Text>)

  const titleRow = (text: string, time: string) => (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        {titled(text, inner - 10, 'work')}
        <Text dimColor>{time}</Text>
      </Box>
      {requestRows()}
    </Box>
  )

  if (card.kind === 'phrase') {
    return (
      <Box key="plain-view" flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
        {titleRow(card.title, card.time)}
        <Box flexDirection="row" gap={2}>
          <Text>
            <Text color="claude">{`${glyph(o.icons, ICONS.now)} `}</Text>
            <Text bold>{clip(card.doing, Math.max(10, inner - L.item - 6))}</Text>
          </Text>
          {bar('doing', L.item, 0, 'comet')}
        </Box>
        {card.agents !== undefined && agentsLine(card.agents)}
      </Box>
    )
  }

  if (card.kind === 'waiting') {
    return (
      <Box key="plain-view" flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
        {titleRow(card.title, card.time)}
        <Box flexDirection="row" gap={2}>
          <Text>
            <Text color="claude">◐ </Text>
            <Text bold>{card.text}</Text>
          </Text>
          {bar('waiting', L.item, 0, 'comet')}
        </Box>
        {agentsLine(card.agents)}
      </Box>
    )
  }

  // A badge, then the title in the end's colors.
  const badged = (badge: string, state: 'done' | 'stopped', text: string) =>
    titled(text, inner - badge.length - 18, state === 'done' ? 'ok' : 'off', { text: badge, state })

  const answerLine = (answer: string | undefined) =>
    answer !== undefined && (
      <Text>
        <Text dimColor>{`  ${o.answerLabel ?? ''}`}</Text>
        <Text>{answer}</Text>
      </Text>
    )

  if (card.kind === 'summary') {
    return (
      <Box key="plain-view" flexDirection="column" borderStyle="round" borderColor={card.state === 'done' ? 'success' : 'inactive'} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          {badged(card.badge, card.state, card.title)}
          <Text dimColor>{card.time}</Text>
        </Box>
        {requestRows()}
        {card.detail !== undefined && <Text dimColor>{`  ${card.detail}`}</Text>}
        {answerLine(card.answer)}
      </Box>
    )
  }

  const pal = card.state === 'done' ? 'ok' : card.state === 'stopped' ? 'off' : 'work'
  const border = card.state === 'done' ? 'success' : card.state === 'stopped' ? 'inactive' : 'claude'
  const head = card.badge && card.state !== 'work' ? badged(card.badge, card.state, card.title) : titled(card.title, inner - 12, pal)

  const row = (r: Row, i: number) => {
    const icon = r.kind === 'done' ? ICONS.done : r.kind === 'now' ? ICONS.now : r.kind === 'halted' ? ICONS.halted : ICONS.wait
    const iconColor = r.kind === 'done' ? 'success' : r.kind === 'now' ? 'claude' : undefined
    const mode: BarMode = r.kind === 'done' ? 'ok' : r.kind === 'now' ? 'work' : 'off'
    const isNow = r.kind === 'now'
    // The icon, the subject and the bar keep their columns; only the status shrinks, cut on one
    // row. Left to shrink, the subject took the squeeze and wrapped a word or a letter a row.
    return (
      <Box key={`row${i}`} flexDirection="row">
        <Box flexShrink={0} flexDirection="row">
          <Text color={iconColor} dimColor={iconColor === undefined}>{`${glyph(o.icons, icon)} `}</Text>
          <Text bold={isNow} dimColor={r.kind !== 'done' && !isNow}>{clip(r.text, L.text).padEnd(L.text)}</Text>
          <Text> </Text>
          {bar(`bar${i}`, L.item, r.frac, mode)}
          <Text>  </Text>
        </Box>
        <Box flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end">
            <Text bold={isNow} color={isNow ? tone('work') : undefined} dimColor={r.kind === 'next' || r.kind === 'later' || r.kind === 'halted'}>{r.status}</Text>
            {isNow && r.doing ? <Text dimColor>{` · ${clip(r.doing, inner >= 100 ? 40 : 16)}`}</Text> : null}
          </Text>
        </Box>
      </Box>
    )
  }

  // The overall bar gives back the columns its status needs ("0% · list not updated"), and the
  // label keeps its 14. Left to shrink, the label took the squeeze and wrapped a letter a row.
  const status = card.pct.length + (card.notice !== undefined ? ` · ${card.notice}`.length : 0)
  const total = Math.max(6, Math.min(L.bar, inner - L.label - status - 2))

  return (
    <Box key="plain-view" flexDirection="column" borderStyle="round" borderColor={border} paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        {head}
        <Text dimColor>{card.time}</Text>
      </Box>
      {requestRows()}
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexShrink={0} flexDirection="row">
          <Text dimColor>{clip(card.label, L.label).padEnd(L.label)}</Text>
          {bar('total', total, card.frac, pal === 'off' ? 'off' : pal)}
          <Text>  </Text>
        </Box>
        <Box flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end">
            <Text bold color={tone(card.state)}>{card.pct}</Text>
            {card.notice !== undefined ? <Text color="warning">{` · ${card.notice}`}</Text> : null}
          </Text>
        </Box>
      </Box>
      {card.before !== undefined && <Text dimColor>{`  ${card.before}`}</Text>}
      {card.rows.map(row)}
      {card.after !== undefined && <Text dimColor>{`  ${card.after}`}</Text>}
      {card.files !== undefined && <Text dimColor>{`  ${card.files}`}</Text>}
      {answerLine(card.answer)}
      {card.agents !== undefined && agentsLine(card.agents)}
    </Box>
  )
}
