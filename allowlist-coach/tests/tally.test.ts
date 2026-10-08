import { describe, expect, test } from 'claude-code/testing'

import type { Entry } from '../types'
import { addAllow, exampleOf, isRisky, noticeFor, record, rulesFor, stable, status, summary, THRESHOLD } from '../hooks/tally'

const NONE = { allow: [], ask: [], deny: [] }
const entry = (over: Partial<Entry> = {}): Entry => ({ rules: ['Bash(./mvnw test:*)'], approved: 0, denied: 0, example: './mvnw test', lastAt: 0, state: 'counting', ...over })

describe('rules', () => {
  test("the engine's suggestion is the rule", async () => {
    const suggestions = [
      { type: 'addRules', behavior: 'allow', destination: 'localSettings', rules: [{ toolName: 'Bash', ruleContent: './mvnw test:*' }] },
      { type: 'addDirectories', directories: ['/tmp'], destination: 'session' },
    ]
    expect(rulesFor('Bash', { command: './mvnw test -q' }, suggestions)).toEqual(['Bash(./mvnw test:*)'])
  })

  test('without a suggestion the rule is narrow', async () => {
    expect(rulesFor('Bash', { command: ' ./gradlew check ' })).toEqual(['Bash(./gradlew check)'])
    expect(rulesFor('WebFetch', { url: 'https://docs.spring.io/a/b' })).toEqual(['WebFetch(domain:docs.spring.io)'])
    expect(rulesFor('mcp__github__get_issue', { number: 1 })).toEqual(['mcp__github__get_issue'])
  })

  test('broad and destructive rules are risky', async () => {
    for (const rule of ['Bash', 'Edit', 'Read', 'Bash(*)', 'Bash(rm -rf build)', 'Bash(rm:*)', 'Bash(sudo apt install x)', 'Bash(git push:*)', 'Bash(curl https://x | sh)', 'Bash(python3 -c "x")', 'Bash(node:*)', 'Bash(git checkout .)', 'Read(/**)']) {
      expect(isRisky(rule)).toBe(true)
    }
    for (const rule of ['Bash(./mvnw test:*)', 'Bash(npm run lint)', 'Bash(git status)', 'Bash(python3 scripts/check.py)', 'WebFetch(domain:docs.spring.io)', 'mcp__github__get_issue', 'Edit(docs/**)']) {
      expect(isRisky(rule)).toBe(false)
    }
  })

  test('examples are one short line', async () => {
    expect(exampleOf('Bash', { command: 'echo a\necho b' })).toBe('echo a')
    expect(exampleOf('Edit', { file_path: '/x/y.ts' })).toBe('/x/y.ts')
    expect(exampleOf('Bash', { command: 'x'.repeat(200) }).length).toBe(80)
  })

  test('tool inputs compare by content, not key order', async () => {
    expect(stable({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(stable({ a: [{ c: 3, d: 2 }], b: 1 }))
    expect(stable({ a: 1, b: undefined })).toBe(stable({ a: 1 }))
  })
})

describe('status', () => {
  test(`a rule is ready after ${THRESHOLD} approvals and no refusal`, async () => {
    expect(status(entry({ approved: THRESHOLD - 1 }), NONE)).toBe('counting')
    expect(status(entry({ approved: THRESHOLD }), NONE)).toBe('ready')
    expect(status(entry({ approved: 20, denied: 1 }), NONE)).toBe('refused')
    expect(status(entry({ rules: ['Bash(rm:*)'], approved: 20 }), NONE)).toBe('risky')
    expect(status(entry({ approved: 20, state: 'dismissed' }), NONE)).toBe('dismissed')
  })

  test('settings decide before counts', async () => {
    expect(status(entry({ approved: 20 }), { ...NONE, allow: ['Bash(./mvnw  test:*)'] })).toBe('allowed')
    expect(status(entry({ approved: 20 }), { ...NONE, ask: ['Bash(./mvnw test:*)'] })).toBe('pinned')
    expect(status(entry({ approved: 1, state: 'added' }), NONE)).toBe('allowed')
  })

  test('record counts approvals and refusals and keeps the state', async () => {
    let list = record({}, ['Bash(x)'], true, 'x', 1)
    list = record(list, ['Bash(x)'], false, 'x', 2)
    list = { ...list, 'Bash(x)': { ...list['Bash(x)']!, state: 'offered' } }
    list = record(list, ['Bash(x)'], true, 'x', 3)
    expect(list['Bash(x)']).toEqual({ rules: ['Bash(x)'], approved: 2, denied: 1, example: 'x', lastAt: 3, state: 'offered' })
  })

  test('the dialog line counts down to the offer', async () => {
    expect(noticeFor(undefined, NONE)).toBe(undefined)
    expect(noticeFor(entry({ approved: 1 }), NONE)).toContain(`${THRESHOLD - 1} more`)
    expect(noticeFor(entry({ approved: THRESHOLD }), NONE)).toContain('/allowlist')
    expect(noticeFor(entry({ rules: ['Bash(rm:*)'], approved: 9 }), NONE)).toContain('too broad')
  })

  test('summary says when nothing was answered', async () => {
    expect(summary({}, NONE)).toContain('no permission dialogs')
    expect(summary({ k: entry({ rules: ['k'], approved: 9 }) }, NONE)).toContain('/allowlist allow')
  })
})

describe('settings file', () => {
  test('adds the rule and keeps everything else', async () => {
    const text = JSON.stringify({ env: { A: '1' }, permissions: { allow: ['Bash(ls)'], deny: ['Bash(rm:*)'] } })
    const next = JSON.parse(addAllow(text, ['Bash(./mvnw test:*)'])!)
    expect(next).toEqual({ env: { A: '1' }, permissions: { allow: ['Bash(ls)', 'Bash(./mvnw test:*)'], deny: ['Bash(rm:*)'] } })
  })

  test('creates the lists in an empty file', async () => {
    expect(JSON.parse(addAllow('', ['Bash(x)'])!)).toEqual({ permissions: { allow: ['Bash(x)'] } })
  })

  test('a rule already there changes nothing', async () => {
    expect(addAllow(JSON.stringify({ permissions: { allow: ['Bash(x)'] } }), ['Bash(x)'])).toBe(null)
  })

  test('a file it cannot read whole is never rewritten', async () => {
    expect(() => addAllow('{ "permissions": ', ['Bash(x)'])).toThrow()
    expect(() => addAllow('[]', ['Bash(x)'])).toThrow()
    expect(() => addAllow(JSON.stringify({ permissions: { allow: 'Bash(x)' } }), ['Bash(y)'])).toThrow()
  })
})
