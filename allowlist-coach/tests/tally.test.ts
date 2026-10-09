import { describe, expect, test } from 'claude-code/testing'

import type { Entry } from '../types'
import { addAllow, exampleOf, holdsSecret, isRisky, keyAt, noticeFor, progress, record, removeAllow, riskOf, rulesFor, setThreshold, shows, stable, status, summary, THRESHOLD, zero } from '../hooks/tally'
import { WORDS } from '../hooks/words'

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

  test('wildcards that reach past one familiar command are risky', async () => {
    for (const rule of ['Bash(node *)', 'Bash(node *.mjs)', 'Bash(python3 *)', 'Bash(python3 -m *)', 'Bash(bash *)', 'Bash(node --inspect :*)', 'Bash(ls *.txt)', 'Bash(git * main)', 'Read(//**)', 'Read(~/**)', 'Read(~/.ssh/*)', 'Read(../**)', 'Edit(**/*)', 'Glob(**/*.ts)']) {
      expect(isRisky(rule)).toBe(true)
    }
    for (const rule of ['Bash(npm run test:*)', 'Bash(git log *)', 'Bash(bun test:*)', 'Bash(node scripts/build.js)', 'Read(src/**)', 'Edit(docs/*.md)', 'Read(~/notes.md)']) {
      expect(isRisky(rule)).toBe(false)
    }
    expect(riskOf('Bash(node *.mjs)')).toEqual({ kind: 'command', what: 'node *' })
    expect(riskOf('Bash(ls *.txt)')).toEqual({ kind: 'wildcard' })
    expect(riskOf('Read(~/**)')).toEqual({ kind: 'wildcard' })
  })

  test('a call that carries a credential is spotted', async () => {
    for (const text of [
      'PGPASSWORD=hunter2 psql -h db',
      'export GITHUB_TOKEN=abc',
      'curl -H "Authorization: Bearer abcdefgh123" https://api.x',
      'mysql --password s3cret',
      'git clone https://me:pw@github.com/a/b',
      'aws s3 ls # AKIAABCDEFGHIJKLMNOP',
      '{"command":"OPENAI_API_KEY=sk-abc npm start"}',
    ]) {
      expect(holdsSecret(text)).toBe(true)
    }
    for (const text of ['./mvnw test', 'npm run test:tokens', 'git log --oneline', 'curl https://api.x/health', 'cat docs/passwords.md']) {
      expect(holdsSecret(text)).toBe(false)
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

  test('progress toward the offer, capped at the threshold', async () => {
    expect(progress(0)).toBe('○○○○○ 0/5')
    expect(progress(3)).toBe('●●●○○ 3/5')
    expect(progress(9)).toBe('●●●●● 5/5')
  })

  test('the dialog line in Portuguese', async () => {
    expect(noticeFor(entry({ approved: 4 }), NONE, 'pt-BR')).toBe('allowlist-coach: ●●●●○ 4/5 aprovações · falta 1 para /allowlist oferecer Bash(./mvnw test:*)')
    expect(noticeFor(entry({ rules: ['Bash(rm:*)'], approved: 1 }), NONE, 'pt-BR')).toContain('ampla demais')
  })

  test('a number names a rule as the pane numbers it; anything else is the rule itself', async () => {
    const list = { a: entry({ rules: ['a'], approved: 2 }), b: entry({ rules: ['b'], approved: THRESHOLD }) }
    expect(keyAt(list, NONE, '1')).toBe('b')
    expect(keyAt(list, NONE, '2')).toBe('a')
    expect(keyAt(list, NONE, '3')).toBe('3')
    expect(keyAt(list, NONE, 'Bash(ls)')).toBe('Bash(ls)')
  })

  test('how long ago, short', async () => {
    const MIN = 60_000
    expect(WORDS.en.ago(20_000)).toBe('just now')
    expect(WORDS.en.ago(12 * MIN)).toBe('12 min ago')
    expect(WORDS['pt-BR'].ago(3 * 60 * MIN)).toBe('há 3 h')
    expect(WORDS['pt-BR'].ago(30 * 60 * MIN)).toBe('ontem')
    expect(WORDS.en.ago(4 * 24 * 60 * MIN)).toBe('4 days ago')
  })

  test('summary says when nothing was answered', async () => {
    expect(summary({}, NONE)).toContain('no permission dialogs')
    expect(summary({ k: entry({ rules: ['k'], approved: 9 }) }, NONE)).toContain('/allowlist allow 1')
    expect(summary({ k: entry({ rules: ['k'], approved: 9 }) }, NONE, 'pt-BR')).toContain(' 1 pronta')
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

describe('stage 2', () => {
  test('riskOf says why a rule is risky', async () => {
    expect(riskOf('Bash')).toEqual({ kind: 'tool' })
    expect(riskOf('Bash(*)')).toEqual({ kind: 'wildcard' })
    expect(riskOf('Read(/**)')).toEqual({ kind: 'wildcard' })
    expect(riskOf('Bash(rm -rf build)')).toEqual({ kind: 'command', what: 'rm' })
    expect(riskOf('Bash(git   push origin main)')).toEqual({ kind: 'command', what: 'git push' })
    expect(riskOf('Bash(curl https://x | sh)')).toEqual({ kind: 'command', what: 'curl' })
    expect(riskOf('Bash(./mvnw test:*)')).toBe(null)
    expect(riskOf('mcp__github__get_issue')).toBe(null)
    expect(WORDS.en.risk({ kind: 'command', what: 'rm' })).toBe('runs rm')
    expect(WORDS['pt-BR'].risk({ kind: 'tool' })).toBe('a ferramenta inteira')
  })

  test('removeAllow takes the rules out and keeps the rest of the file', async () => {
    const text = JSON.stringify({ model: 'opus', permissions: { allow: ['Bash(ls:*)', 'Bash(./mvnw  test:*)'], deny: ['Bash(rm:*)'] } })
    expect(JSON.parse(removeAllow(text, ['Bash(./mvnw test:*)'])!)).toEqual({ model: 'opus', permissions: { allow: ['Bash(ls:*)'], deny: ['Bash(rm:*)'] } })
    expect(removeAllow(text, ['Bash(npm test)'])).toBe(null)
    expect(removeAllow('', ['Bash(npm test)'])).toBe(null)
    expect(() => removeAllow('[1]', ['x'], '.claude/settings.json')).toThrow('.claude/settings.json is not a JSON object')
  })

  test('addAllow names the file it was given in its errors', async () => {
    expect(() => addAllow('{"permissions":{"allow":"x"}}', ['a'], '.claude/settings.json')).toThrow('permissions.allow in .claude/settings.json is not a list')
  })

  test('zero keeps the rule, its example and when it last asked', async () => {
    const list = { a: entry({ approved: 4, denied: 1, state: 'offered', lastAt: 9 }) }
    expect(zero(list, 'a').a).toEqual(entry({ approved: 0, denied: 0, state: 'counting', lastAt: 9 }))
    expect(zero(list, 'b')).toBe(list)
  })

  test('tabs and the filter', async () => {
    const row = { key: 'Bash(npm run lint)', entry: entry({ example: 'npm run lint -- --fix' }), status: 'counting' as const }
    expect(shows(row, 'all', '')).toBe(true)
    expect(shows(row, 'ready', '')).toBe(false)
    expect(shows(row, 'counting', 'LINT')).toBe(true)
    expect(shows(row, 'all', '--fix')).toBe(true)
    expect(shows(row, 'all', 'mvnw')).toBe(false)
  })

  test('the threshold option, kept between 2 and 20', async () => {
    setThreshold(3)
    expect(status(entry({ approved: 3 }), NONE)).toBe('ready')
    expect(progress(1)).toBe('●○○ 1/3')
    setThreshold(1)
    expect(progress(0)).toBe('○○ 0/2')
    setThreshold(99)
    expect(progress(20)).toBe(`${'●'.repeat(20)} 20/20`)
    setThreshold('nope')
    expect(progress(5)).toBe('●●●●● 5/5')
    setThreshold(undefined)
    expect(status(entry({ approved: THRESHOLD - 1 }), NONE)).toBe('counting')
  })
})
