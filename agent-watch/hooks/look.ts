// How an agent looks: a mascot and a color fixed by its slot, and the gradient of the band's bar.
// No `$`: register.tsx resolves the elements and hands them in.
//
// This is the one file of agent-watch with hex colors (design guide, "Exception: gradients",
// extended to the agents' identity on 2026-10-27). Every palette has a dark and a light set; the
// mod picks one from the `theme` row of `$.config.list()`, and an unknown theme gets the dark one.

export const SLOTS = 5

/** The agent colors, by slot: orange, blue, lilac, teal, violet. */
const DARK = ['#d97757', '#61afef', '#b1b9f9', '#48968c', '#af87ff'] as const
const LIGHT = ['#c15f3c', '#1f6feb', '#6a5acd', '#00796b', '#7e57c2'] as const

/** The sprites' eyes: the card's ground, so they read as holes. */
const EYE = { dark: '#16161e', light: '#fafaf9' } as const

/** The band bar's gradient, `from` the first filled cell `to` the last. */
const BAR = { dark: { from: '#d97757', to: '#e5c07b', track: '#5c5c68' }, light: { from: '#c15f3c', to: '#d49a3a', track: '#a0a0aa' } } as const

const isLight = (theme: unknown) => /light/i.test(String(theme ?? ''))

/** The agent's color in the person's theme. */
export const colorOf = (slot: number, theme: unknown): string => (isLight(theme) ? LIGHT : DARK)[((slot % SLOTS) + SLOTS) % SLOTS]!

/** The terminal's mascot: 4 columns by 2 rows of block characters, one per slot. */
export const SPRITES: readonly (readonly [string, string])[] = [
  ['▟██▙', '▝▘▝▘'],
  ['▗██▖', '▝██▘'],
  ['▟██▙', '█▀▀█'],
  ['▐▛▜▌', '▝▀▀▘'],
  ['▄██▄', '▀▜▛▀'],
]

/** One cell of the mascot a row: `#` the body, `o` an eye. */
const GRID = [
  ['#.......#', '##.....##', '.#######.', '#o#####o#', '.#######.', '..#####..', '.#.#.#.#.'],
  ['..#####..', '.#######.', '#########', '#o#####o#', '#########', '.#######.', '..#####..'],
  ['..#####..', '.#######.', '#o#####o#', '#########', '#########', '#########', '#.##.##.#'],
  ['.#.....#.', '.#.....#.', '.#######.', '#o#####o#', '#########', '.#######.', '..#...#..'],
  ['....#....', '....#....', '.#######.', '#o#####o#', '#########', '.#.###.#.', '.##...##.'],
] as const

/** The one-cell glyph of a slot, for a compact row and for icons set to `symbol`. */
export const GLYPHS = ['▲', '■', '●', '✦', '▼'] as const
export const glyphOfSlot = (slot: number) => GLYPHS[((slot % SLOTS) + SLOTS) % SLOTS]!

/** The desktop's mascot: an SVG document, `px` wide, in the agent's color. */
export const spriteSvg = (slot: number, theme: unknown, px: number): string => {
  const body = colorOf(slot, theme)
  const eye = isLight(theme) ? EYE.light : EYE.dark
  const rects = GRID[((slot % SLOTS) + SLOTS) % SLOTS]!.flatMap((row, y) =>
    [...row].flatMap((c, x) => (c === '.' ? [] : [`<rect x="${x}" y="${y}" width="1" height="1" fill="${c === 'o' ? eye : body}"/>`])),
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 7" width="${px}" height="${Math.round((px * 7) / 9)}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)

/** `from` to `to` by `t` (0 to 1), as a hex color. */
export const mix = (from: string, to: string, t: number): string =>
  `#${[0, 1, 2].map(i => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t).toString(16).padStart(2, '0')).join('')}`

/** The cells of the band's bar of `n`, `frac` full: filled ones in a gradient, the rest the track. */
export const barCells = (n: number, frac: number, theme: unknown): { filled: boolean; color: string }[] => {
  const set = isLight(theme) ? BAR.light : BAR.dark
  const f = Math.max(0, Math.min(n, Math.round(n * frac)))
  return Array.from({ length: n }, (_, i) => (i < f ? { filled: true, color: mix(set.from, set.to, f > 1 ? i / (f - 1) : 0) } : { filled: false, color: set.track }))
}
