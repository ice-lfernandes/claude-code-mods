// The bar colors: the one place hex colors live (design guide, "Exception: gradients").
// Each palette has a dark and a light set: g1 → g2 → g3 while the agent works (the bars run
// g1 → g2, the title all three), k1 → k2 once the turn is done, `off` for a stopped bar, and
// `track` for a bar's empty cells.

export type PaletteId = 'claude' | 'clean' | 'sunset' | 'aurora' | 'ocean' | 'neon' | 'forest' | 'calm'

export type Stops = { g1: number; g2: number; g3: number; k1: number; k2: number; off: number; track: number }

export type Palette = {
  id: PaletteId
  /** What the colors are, in a few words, for /plain-view palette. */
  hint: { 'pt-BR': string; en: string }
  dark: Stops
  light: Stops
}

const DARK_OFF = 0x5c5c68
const DARK_TRACK = 0x34343f
const LIGHT_OFF = 0xa0a0aa
const LIGHT_TRACK = 0xd8d8de

const set = (g1: number, g2: number, g3: number, k1: number, k2: number, isDark: boolean): Stops => ({
  g1, g2, g3, k1, k2,
  off: isDark ? DARK_OFF : LIGHT_OFF,
  track: isDark ? DARK_TRACK : LIGHT_TRACK,
})

export const PALETTES: readonly Palette[] = [
  { id: 'claude', hint: { 'pt-BR': 'terracota → âmbar → creme (marca)', en: 'terracotta → amber → cream (brand)' },
    dark: set(0xd97757, 0xeaa25f, 0xf3d39b, 0x5fa86a, 0xb5dc8f, true), light: set(0xb4532f, 0xc97a22, 0xa8863a, 0x2e7d32, 0x5e9e3a, false) },
  { id: 'clean', hint: { 'pt-BR': 'laranja → rosa → violeta (vídeo)', en: 'orange → pink → violet (video)' },
    dark: set(0xf0915a, 0xe8577e, 0x9a7cf0, 0x3f9a54, 0x8fe0a6, true), light: set(0xc8622f, 0xc33a63, 0x6b4fd1, 0x2e7d32, 0x4caf68, false) },
  { id: 'sunset', hint: { 'pt-BR': 'amarelo → laranja → vermelho', en: 'yellow → orange → red' },
    dark: set(0xffd166, 0xf78c4b, 0xe0475b, 0x4caf7d, 0xa7e3a0, true), light: set(0xb7860b, 0xd1601f, 0xc0283f, 0x2e7d32, 0x4f9a45, false) },
  { id: 'aurora', hint: { 'pt-BR': 'verde-água → azul → violeta', en: 'teal → blue → violet' },
    dark: set(0x3dd6b5, 0x4aa8ff, 0x9a7cf0, 0x3dd6b5, 0xb6f2c9, true), light: set(0x0f8f78, 0x1f6feb, 0x6b4fd1, 0x0f8f78, 0x3a9d5d, false) },
  { id: 'ocean', hint: { 'pt-BR': 'ciano → azul → anil', en: 'cyan → blue → indigo' },
    dark: set(0x5ee7df, 0x3a8dde, 0x5b5bd6, 0x3fb6a8, 0x9be8c8, true), light: set(0x0e8f88, 0x1d5fb8, 0x3c3cb0, 0x0e7c6f, 0x2f9a6a, false) },
  { id: 'neon', hint: { 'pt-BR': 'rosa-choque → roxo → ciano', en: 'hot pink → purple → cyan' },
    dark: set(0xff4ecd, 0xa45cff, 0x3ee0ff, 0x39ff9f, 0xc6ffde, true), light: set(0xc4198f, 0x7a2fd6, 0x0a8fb0, 0x0f9a5a, 0x3cb57b, false) },
  { id: 'forest', hint: { 'pt-BR': 'verde-escuro → folha → limão', en: 'deep green → leaf → lime' },
    dark: set(0x2f9e6e, 0x8bd17c, 0xe5e27a, 0x2f9e6e, 0xc9f0a8, true), light: set(0x1d7a52, 0x4f9a3a, 0x8f8a12, 0x1d7a52, 0x4f9a3a, false) },
  { id: 'calm', hint: { 'pt-BR': 'cinza → texto; verde só no fim', en: 'grey → text; green only at the end' },
    dark: set(0x5c5c68, 0x8a8a98, 0xd4d4d8, 0x5f8f6a, 0x98c379, true), light: set(0xa0a0aa, 0x6b6b76, 0x1f1f24, 0x4f7d58, 0x2e7d32, false) },
]

export const DEFAULT_PALETTE: PaletteId = 'claude'

/** The palette an option names, else the default. */
export const paletteOf = (option: unknown): Palette =>
  PALETTES.find(p => p.id === String(option ?? '').trim().toLowerCase()) ?? PALETTES.find(p => p.id === DEFAULT_PALETTE)!

/** The palette's set for the person's theme: light when the theme's name says light, dark otherwise. */
export const stopsOf = (p: Palette, theme: unknown): Stops => (/light/i.test(String(theme ?? '')) ? p.light : p.dark)

/** A color `t` of the way from `a` to `b` (0..1), channel by channel. */
export const mix = (a: number, b: number, t: number): number => {
  const k = Math.max(0, Math.min(1, t))
  const ch = (shift: number) => {
    const x = (a >> shift) & 0xff
    const y = (b >> shift) & 0xff
    return Math.round(x + (y - x) * k) << shift
  }
  return ch(16) | ch(8) | ch(0)
}

/** `#rrggbb`, what a Text's color takes. */
export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`

/** The title's color at `x` (0..1) of its length: g1 → g2 → g3. */
export const titleColor = (s: Stops, x: number) => (x < 0.5 ? mix(s.g1, s.g2, x * 2) : mix(s.g2, s.g3, (x - 0.5) * 2))
