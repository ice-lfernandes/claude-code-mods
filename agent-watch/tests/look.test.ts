import { describe, expect, test } from 'claude-code/testing'

import { barCells, colorOf, glyphOfSlot, GLYPHS, mix, SLOTS, SPRITES, spriteSvg } from '../hooks/look'

describe('look', () => {
  test('five slots, each its own color, dark and light, and the dark set for an unknown theme', async () => {
    const dark = Array.from({ length: SLOTS }, (_, i) => colorOf(i, 'dark'))
    const light = Array.from({ length: SLOTS }, (_, i) => colorOf(i, 'light'))
    expect(new Set(dark).size).toBe(SLOTS)
    expect(new Set(light).size).toBe(SLOTS)
    expect(dark).not.toEqual(light)
    expect(colorOf(0, 'dark')).toBe('#d97757')
    expect(colorOf(0, 'light-ansi')).toBe(light[0])
    expect(colorOf(0, 'whatever')).toBe(dark[0])
    expect(colorOf(0, undefined)).toBe(dark[0])
    // Past the fifth, the slots start over; a negative one stays in range.
    expect(colorOf(SLOTS, 'dark')).toBe(dark[0])
    expect(colorOf(-1, 'dark')).toBe(dark[SLOTS - 1])
  })

  test('every slot has a terminal sprite of 4 by 2 cells and a one-cell glyph', async () => {
    expect(SPRITES).toHaveLength(SLOTS)
    for (const [top, bottom] of SPRITES) {
      expect([...top]).toHaveLength(4)
      expect([...bottom]).toHaveLength(4)
    }
    expect(new Set(SPRITES.map(s => s.join('/'))).size).toBe(SLOTS)
    expect(new Set(GLYPHS).size).toBe(SLOTS)
    expect(glyphOfSlot(1)).toBe('■')
    expect(glyphOfSlot(SLOTS + 1)).toBe('■')
  })

  test('the desktop mascot is an SVG in the slot\'s color, with its eyes in the ground\'s', async () => {
    const svg = spriteSvg(1, 'dark', 40)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('viewBox="0 0 9 7"')
    expect(svg).toContain('width="40" height="31"')
    expect(svg).toContain(`fill="${colorOf(1, 'dark')}"`)
    expect(svg).toContain('fill="#16161e"')
    expect(spriteSvg(1, 'light', 40)).toContain('fill="#fafaf9"')
    expect(new Set(Array.from({ length: SLOTS }, (_, i) => spriteSvg(i, 'dark', 40))).size).toBe(SLOTS)
    // No script, no event handler: markup only.
    expect(svg).not.toMatch(/<script|onload|onclick/i)
  })

  test('the band bar: filled cells in a gradient, the rest the track', async () => {
    const cells = barCells(10, 0.5, 'dark')
    expect(cells).toHaveLength(10)
    expect(cells.filter(c => c.filled)).toHaveLength(5)
    expect(cells[0]!.color).toBe('#d97757')
    expect(cells[4]!.color).toBe('#e5c07b')
    expect(cells[5]!.color).toBe('#5c5c68')
    expect(barCells(10, 0, 'dark').every(c => !c.filled)).toBe(true)
    expect(barCells(10, 1, 'light').at(-1)!.color).toBe('#d49a3a')
    expect(barCells(4, 2, 'dark').filter(c => c.filled)).toHaveLength(4)
  })

  test('mix goes from one color to the other', async () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})
