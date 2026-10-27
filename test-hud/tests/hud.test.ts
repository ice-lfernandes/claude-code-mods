import { describe, expect, test } from 'claude-code/testing'

import type { Run } from '../types'
import { durationSpark, failingNames, fixed, flaky, flakyToast, fresh, greenText, groupOf, groupsOf, kindOf, parseRun, quietPass, record, redText, runnerOf, runnersOf, lineText, score, spark, testsLine, trail, wholeCommand } from '../hooks/hud'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const MIN = 60_000

const run = (n: number, failed: number, over: Partial<Run> = {}): Run => ({
  n,
  runner: 'vitest',
  command: 'npm test',
  fullCommand: 'npm test',
  failed,
  passed: 43 - failed,
  skipped: 0,
  failures: [],
  endedAt: NOW + n * MIN,
  durationMs: 10_000,
  ...over,
})

describe('runners', () => {
  test('commands that start a test runner', async () => {
    const cases: [string, string][] = [
      ['npx vitest run', 'vitest'],
      ['pnpm vitest --run src/a.test.ts', 'vitest'],
      ['npx jest --ci', 'jest'],
      ['./node_modules/.bin/jest', 'jest'],
      ['python -m pytest -q tests/', 'pytest'],
      ['uv run pytest', 'pytest'],
      ['./mvnw -q test', 'maven'],
      ['cd api && mvn clean verify -pl core', 'maven'],
      ['./gradlew :app:test --tests FooTest', 'gradle'],
      ['./gradlew build', 'gradle'],
      ['cargo test --workspace', 'cargo'],
      ['go test ./...', 'go'],
      ['bun test', 'bun'],
      ['claude plugin test ./test-hud', 'claude'],
      ['bundle exec rspec spec/models', 'rspec'],
      ['npm test 2>&1 | tail -40', 'npm'],
      ['CI=1 pnpm run test:unit', 'npm'],
      ['yarn test', 'npm'],
    ]
    for (const [command, runner] of cases) expect(`${command} -> ${runnerOf(command)}`).toBe(`${command} -> ${runner}`)
  })

  test('commands that only mention one', async () => {
    for (const command of [
      'grep -r jest package.json',
      'cat vitest.config.ts',
      'git commit -m "fix: pytest fixture"',
      'mvn -DskipTests package',
      './mvnw spring-boot:run',
      './gradlew build -x test',
      './gradlew bootRun',
      'cargo build',
      'npm run testing-library',
      'echo go test',
    ]) expect(`${command} -> ${runnerOf(command)}`).toBe(`${command} -> null`)
  })
})

describe('summaries', () => {
  test('maven adds up the modules and skips the per-class lines', async () => {
    const out = [
      '[INFO] Tests run: 5, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 0.05 s -- in com.acme.FooTest',
      '[ERROR] Tests run: 3, Failures: 1, Errors: 1, Skipped: 0, Time elapsed: 0.1 s <<< FAILURE! -- in com.acme.BarTest',
      '[ERROR] Failures: ',
      '[ERROR]   BarTest.divide:23 expected: <2> but was: <3>',
      '[ERROR] Errors: ',
      '[ERROR]   BarTest.parse:41 » NullPointer',
      '[INFO] ',
      '[ERROR] Tests run: 8, Failures: 1, Errors: 1, Skipped: 0',
      '[INFO] Tests run: 35, Failures: 0, Errors: 0, Skipped: 2',
      '[INFO] BUILD FAILURE',
    ].join('\n')
    expect(parseRun('maven', out)).toEqual({ failed: 2, passed: 39, skipped: 2, failures: ['BarTest.divide', 'BarTest.parse'] })
  })

  test('gradle reads its failure line and the failing tests', async () => {
    const out = 'CalcTest > divide() FAILED\n    org.opentest4j.AssertionFailedError at CalcTest.java:12\n\n43 tests completed, 2 failed, 1 skipped\n\nFAILURE: Build failed'
    expect(parseRun('gradle', out)).toEqual({ failed: 2, passed: 40, skipped: 1, failures: ['CalcTest > divide()'] })
    expect(parseRun('gradle', 'BUILD SUCCESSFUL in 4s')).toBe(null)
    expect(quietPass('gradle')).toEqual({ failed: 0, passed: null, skipped: 0, failures: [] })
    expect(quietPass('vitest')).toBe(null)
  })

  test('jest', async () => {
    const out = '  ● parse › handles empty input\n\n  ● parse › keeps commas\n\nTest Suites: 1 failed, 3 passed, 4 total\nTests:       2 failed, 1 skipped, 40 passed, 43 total'
    expect(parseRun('jest', out)).toEqual({ failed: 2, passed: 40, skipped: 1, failures: ['parse › handles empty input', 'parse › keeps commas'] })
  })

  test('vitest, colored', async () => {
    const out = '\u001b[31m FAIL \u001b[39m src/a.test.ts > parse > empty\n\n Test Files  1 failed | 3 passed (4)\n      Tests  \u001b[31m1 failed\u001b[39m | 41 passed | 1 skipped (43)\n   Duration  1.2s'
    expect(parseRun('vitest', out)).toEqual({ failed: 1, passed: 41, skipped: 1, failures: ['src/a.test.ts > parse > empty'] })
  })

  test('pytest, with and without -q', async () => {
    const full = 'FAILED tests/test_a.py::test_x - assert 1 == 2\nERROR tests/test_b.py::test_y\n=========== 1 failed, 40 passed, 1 skipped, 1 error in 0.52s ==========='
    expect(parseRun('pytest', full)).toEqual({ failed: 2, passed: 40, skipped: 1, failures: ['tests/test_a.py::test_x', 'tests/test_b.py::test_y'] })
    expect(parseRun('pytest', '43 passed in 0.31s')).toEqual({ failed: 0, passed: 43, skipped: 0, failures: [] })
  })

  test('cargo adds up the crates', async () => {
    const out = 'test tests::adds ... ok\ntest tests::divides ... FAILED\ntest result: FAILED. 9 passed; 1 failed; 0 ignored; 0 measured\ntest result: ok. 30 passed; 0 failed; 2 ignored; 0 measured'
    expect(parseRun('cargo', out)).toEqual({ failed: 1, passed: 39, skipped: 2, failures: ['tests::divides'] })
  })

  test('go, with and without -v', async () => {
    expect(parseRun('go', '--- FAIL: TestParse (0.00s)\n    --- FAIL: TestParse/empty (0.00s)\nFAIL\tacme/parse\t0.01s')).toEqual({ failed: 1, passed: null, skipped: 0, failures: ['TestParse', 'TestParse/empty'] })
    expect(parseRun('go', 'ok  \tacme/parse\t0.01s')).toEqual({ failed: 0, passed: null, skipped: 0, failures: [] })
    expect(parseRun('go', '--- PASS: TestA (0.00s)\n--- PASS: TestB (0.00s)\nok  \tacme\t0.1s')).toEqual({ failed: 0, passed: 2, skipped: 0, failures: [] })
  })

  test('bun and claude plugin test', async () => {
    const out = '(pass) a > one [0.2ms]\n(fail) a > two [0.3ms]\n\n 16 pass\n 1 fail\nRan 17 tests across 2 files.'
    expect(parseRun('claude', out)).toEqual({ failed: 1, passed: 16, skipped: 0, failures: ['a > two'] })
  })

  test('mocha and rspec', async () => {
    expect(parseRun('mocha', '  12 passing (40ms)\n  1 pending\n  2 failing')).toEqual({ failed: 2, passed: 12, skipped: 1, failures: [] })
    expect(parseRun('rspec', '7 examples, 2 failures, 1 pending\n\nrspec ./spec/a_spec.rb:4 # A adds')).toEqual({ failed: 2, passed: 4, skipped: 1, failures: ['A adds'] })
  })

  test('no summary, no run', async () => {
    expect(parseRun('npm', 'npm ERR! missing script: test')).toBe(null)
  })

  test('failing names stop at 20', async () => {
    const out = Array.from({ length: 30 }, (_, i) => `FAILED tests/test_a.py::test_${i}`).join('\n')
    expect(failingNames(out).length).toBe(20)
  })
})

describe('runs', () => {
  test('the sparkline scales failures and keeps green runs at the floor', async () => {
    expect(spark([run(1, 7), run(2, 5), run(3, 1), run(4, 0)])).toBe('█▆▂▁')
    expect(spark([])).toBe('')
  })

  test('the tests line follows the latest runner', async () => {
    const list = [run(1, 0, { runner: 'pytest' }), run(2, 4), run(3, 2)]
    expect(trail(list).map(r => r.n)).toEqual([2, 3])
    expect(lineText(list)).toBe('✗ tests 41/43 · 2 failing █▅')
    expect(lineText([run(1, 0)])).toBe('✓ tests 43/43')
    expect(lineText([run(1, 0, { runner: 'gradle', passed: null })])).toBe('✓ tests pass')
    expect(lineText([])).toBe(undefined)
  })

  // T5 (prototype test-hud-0.7.1): error with a failure, warning with skipped or flaky tests, success otherwise.
  test('the tests line is colored by the result', async () => {
    const A = 'src/a.test.ts > x > y'
    expect(testsLine([run(1, 0)])?.tone).toBe('success')
    expect(testsLine([run(1, 0, { skipped: 2 })])).toEqual({ tone: 'warning', glyph: '✓', score: 'tests 43/43', note: '2 skipped', spark: '' })
    const shaky = [run(1, 1, { failures: [A] }), run(2, 0), run(3, 1, { failures: [A] }), run(4, 0, { skipped: 1 })]
    expect(testsLine(shaky)).toMatchObject({ tone: 'warning', glyph: '!', note: '1 flaky?' })
    // A failure wins over skipped and flaky.
    expect(testsLine([...shaky, run(5, 2, { skipped: 1 })])).toMatchObject({ tone: 'error', glyph: '✗', note: '2 failing' })
  })

  test('green after red toasts once, with the streak', async () => {
    const list = [run(1, 0), run(2, 3), run(3, 1), run(4, 0)]
    expect(greenText(list, list[3]!)).toBe('✓ Tests green: 43/43 (vitest) after 2 red runs in 2m 10s.')
    expect(greenText(list, list[0]!)).toBe(null)
    expect(greenText([...list, run(5, 0)], run(5, 0))).toBe(null)
  })

  test('new failures are the ones the runner did not fail on before', async () => {
    const list = [run(1, 1, { failures: ['a'] }), run(2, 2, { failures: ['a', 'b'] })]
    expect([...fresh(list, list[1]!)]).toEqual(['b'])
    expect(fresh([run(1, 3), list[1]!], list[1]!).size).toBe(0)
  })

  test('fixed tests are the ones the runner failed on before and not now', async () => {
    const list = [run(1, 2, { failures: ['a', 'b'] }), run(2, 1, { failures: ['b'] }), run(3, 0)]
    expect(fixed(list, list[1]!)).toEqual(['a'])
    expect(fixed(list, list[2]!)).toEqual(['b'])
    expect(fixed(list, list[0]!)).toEqual([])
    // A red run with no names read says nothing about which were fixed.
    expect(fixed([list[0]!, run(2, 1)], run(2, 1))).toEqual([])
  })

  test('red right after green toasts, with the option', async () => {
    const list = [run(1, 0), run(2, 2), run(3, 1)]
    expect(redText(list, list[1]!)).toBe('✗ Tests turned red: 41/43 (vitest), 2 failing.')
    expect(redText(list, list[2]!)).toBe(null)
    expect(redText(list, list[0]!)).toBe(null)
    expect(redText([run(1, 2)], run(1, 2))).toBe(null)
  })

  test('the whole command is kept, cut only past 2000 characters', async () => {
    expect(wholeCommand('  npm test -- a b c \n')).toBe('npm test -- a b c')
    expect(wholeCommand('x'.repeat(2500))).toHaveLength(2000)
  })

  test('only the last 30 runs are kept', async () => {
    let list: Run[] = []
    for (let n = 1; n <= 35; n++) list = record(list, run(n, 0))
    expect(list.length).toBe(30)
    expect(list[0]!.n).toBe(6)
  })
})

describe('stage 2', () => {
  const A = 'a > fails now and then'
  const B = 'b > always fails'

  test('a test that failed, passed and failed again is flaky', async () => {
    const list = [run(1, 2, { failures: [A, B] }), run(2, 1, { failures: [B] }), run(3, 2, { failures: [A, B] })]
    expect([...flaky(list, list[2]!)]).toEqual([A])
    // Not yet on run 2, nor for a run of another command.
    expect([...flaky(list, list[1]!)]).toEqual([])
    const other = [...list.slice(0, 2), run(3, 2, { failures: [A, B], fullCommand: 'npm test -- a' })]
    expect([...flaky(other, other[2]!)]).toEqual([])
  })

  test('a run with no names, or with its names cut, says nothing about a pass', async () => {
    const quiet = [run(1, 1, { failures: [A] }), run(2, 1), run(3, 1, { failures: [A] })]
    expect([...flaky(quiet, quiet[2]!)]).toEqual([])
    const cut = Array.from({ length: 20 }, (_, i) => `t${i}`)
    const long = [run(1, 1, { failures: [A] }), run(2, 25, { failures: cut }), run(3, 1, { failures: [A] })]
    expect([...flaky(long, long[2]!)]).toEqual([])
  })

  test('only the last 10 runs of the command count', async () => {
    const list = [run(1, 1, { failures: [A] }), run(2, 0), ...Array.from({ length: 9 }, (_, i) => run(i + 3, 1, { failures: [A] }))]
    expect(flaky(list, list.at(-1)!).size).toBe(0)
    expect(flaky(list, list.at(-1)!, 11).size).toBe(1)
  })

  test('the duration sparkline scales from the shortest to the longest run', async () => {
    const list = [10, 20, 15, 40].map((s, i) => run(i + 1, 0, { durationMs: s * 1000 }))
    expect(durationSpark(list)).toBe('▁▃▂█')
    expect(durationSpark([run(1, 0), run(2, 0)])).toBe('▄▄')
  })

  test('runners in the order they first ran, and the trail of one of them', async () => {
    const list = [run(1, 1), run(2, 0, { runner: 'pytest' }), run(3, 0)]
    expect(runnersOf(list)).toEqual(['vitest', 'pytest'])
    expect(trail(list).map(r => r.n)).toEqual([1, 3])
    expect(trail(list, 8, 'pytest').map(r => r.n)).toEqual([2])
  })
})

describe('groups', () => {
  test('the group of a failing test, from the name as each runner prints it', async () => {
    const cases: [string, string, { key: string; isFile: boolean; test: string } | null][] = [
      ['vitest', 'src/auth.test.ts > session > rejects a revoked token', { key: 'src/auth.test.ts', isFile: true, test: 'session > rejects a revoked token' }],
      ['jest', 'Pricing › rounds half up', { key: 'Pricing', isFile: false, test: 'rounds half up' }],
      ['gradle', 'com.acme.PricingTest > roundsHalfUp()', { key: 'com.acme.PricingTest', isFile: false, test: 'roundsHalfUp()' }],
      ['pytest', 'tests/test_api.py::TestRoutes::test_404', { key: 'tests/test_api.py', isFile: true, test: 'TestRoutes::test_404' }],
      ['cargo', 'parse::tests::empty_input', { key: 'parse::tests', isFile: false, test: 'empty_input' }],
      ['maven', 'com.acme.PricingTest.roundsHalfUp', { key: 'com.acme.PricingTest', isFile: false, test: 'roundsHalfUp' }],
      ['go', 'TestRoundHalfUp', null],
      ['rspec', 'Pricing rounds half up', null],
      ['maven', 'NoDot', null],
    ]
    for (const [runner, name, want] of cases) expect(`${runner} ${name} -> ${JSON.stringify(groupOf(runner, name))}`).toBe(`${runner} ${name} -> ${JSON.stringify(want)}`)
  })

  test('only a path-looking key is a file: no spaces, a slash or a known extension, not cut', async () => {
    expect(groupOf('vitest', 'a.test.ts > x')?.isFile).toBe(true)
    expect(groupOf('vitest', 'src/deep/a > x')?.isFile).toBe(true)
    expect(groupOf('vitest', 'Parser handles empty > x')?.isFile).toBe(false)
    expect(groupOf('vitest', 'Parser > x')?.isFile).toBe(false)
    expect(groupOf('vitest', 'src/some/very/long/path/that/was/cut…/a.test.ts > x')?.isFile).toBe(true)
    expect(groupOf('vitest', 'src/some/very/long/path/that/was/cut… > x')?.isFile).toBe(false)
    expect(groupOf('vitest', '@scope/a.test.ts > x')?.isFile).toBe(false) // an @ would turn the prompt text into another mention
  })

  test('groupsOf keeps first-seen order, puts nameless ones in rest, and is null when none has a group', async () => {
    const got = groupsOf('vitest', ['b.test.ts > one', 'a.test.ts > two', 'b.test.ts > three', 'Loose'])
    expect(got?.groups.map(g => [g.key, g.tests.map(t => t.test)])).toEqual([['b.test.ts', ['one', 'three']], ['a.test.ts', ['two']]])
    expect(got?.rest).toEqual(['Loose'])
    expect(groupsOf('go', ['TestA', 'TestB'])).toBeNull()
    expect(groupsOf('vitest', [])).toBeNull()
  })

  test('kindOf names the groups: files when every key is a path, else by runner', async () => {
    const files = groupsOf('vitest', ['a.test.ts > x'])!.groups
    expect(kindOf('vitest', files)).toBe('file')
    const maven = groupsOf('maven', ['PricingTest.a'])!.groups
    expect(kindOf('maven', maven)).toBe('class')
    expect(kindOf('jest', groupsOf('jest', ['Pricing › a'])!.groups)).toBe('suite')
    expect(kindOf('cargo', groupsOf('cargo', ['m::a'])!.groups)).toBe('module')
    expect(kindOf('npm', groupsOf('npm', ['Pricing › a'])!.groups)).toBe('group')
  })
})

describe('flaky toast', () => {
  const A = 'src/cart.test.ts > totals > rounds half up'
  const B = 'src/cart.test.ts > totals > applies the coupon'
  const list = [run(1, 2, { failures: [A, B] }), run(2, 0), run(3, 2, { failures: [A, B] })]

  test('names the first test and how many more, over the runs read, ', async () => {
    expect(flakyToast(list, list[2]!, new Set())).toEqual({ text: '! 2 flaky tests: totals > rounds half up +1', names: [A, B] })
  })

  test('a test already announced is left out, and one name reads with its run count', async () => {
    expect(flakyToast(list, list[2]!, new Set([A]))).toEqual({ text: '! Flaky test: totals > applies the coupon (3 runs)', names: [B] })
    expect(flakyToast(list, list[2]!, new Set([A, B]))).toBeNull()
  })

  test('nothing when no failing test is flaky', async () => {
    expect(flakyToast(list, list[1]!, new Set())).toBeNull()
    expect(flakyToast(list.slice(0, 1), list[0]!, new Set())).toBeNull()
  })
})

describe('toast glyphs', () => {
  // A toast cannot be colored, so each opens with a glyph that says the state.
  const A = 'src/a.test.ts > x > y'
  const green = [run(1, 1, { failures: [A] }), run(2, 0)]
  const red = [run(1, 0), run(2, 1, { failures: [A] })]
  const flakyList = [run(1, 1, { failures: [A] }), run(2, 0), run(3, 1, { failures: [A] })]

  test('green opens with ✓, red with ✗, flaky with !', async () => {
    expect(greenText(green, green[1]!)?.startsWith('✓ ')).toBe(true)
    expect(redText(red, red[1]!)?.startsWith('✗ ')).toBe(true)
    expect(flakyToast(flakyList, flakyList[2]!, new Set())?.text.startsWith('! ')).toBe(true)
  })

  test('the glyph is not doubled and the text stays one line', async () => {
    const texts = [greenText(green, green[1]!), redText(red, red[1]!), flakyToast(flakyList, flakyList[2]!, new Set())?.text]
    for (const text of texts) {
      expect(text).toBeDefined()
      expect(text!.match(/[✓✗!]/g)?.length).toBe(1)
      expect(text).not.toContain('\n')
    }
  })
})
