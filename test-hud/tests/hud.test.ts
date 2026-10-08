import { describe, expect, test } from 'claude-code/testing'

import type { Run } from '../types'
import { failingNames, fixed, fresh, greenText, parseRun, quietPass, record, redText, runnerOf, score, spark, statusText, trail, wholeCommand } from '../hooks/hud'

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

  test('the status line follows the latest runner', async () => {
    const list = [run(1, 0, { runner: 'pytest' }), run(2, 4), run(3, 2)]
    expect(trail(list).map(r => r.n)).toEqual([2, 3])
    expect(statusText(list)).toBe('✗ tests 41/43 █▅')
    expect(statusText([run(1, 0)])).toBe('✓ tests 43/43')
    expect(statusText([run(1, 0, { runner: 'gradle', passed: null })])).toBe('✓ tests pass')
    expect(statusText([])).toBe(undefined)
  })

  test('green after red toasts once, with the streak', async () => {
    const list = [run(1, 0), run(2, 3), run(3, 1), run(4, 0)]
    expect(greenText(list, list[3]!)).toBe('Tests green: 43/43 (vitest) after 2 red runs in 2m 10s.')
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
    expect(redText(list, list[1]!)).toBe('Tests turned red: 41/43 (vitest), 2 failing.')
    expect(redText(list, list[2]!)).toBe(null)
    expect(redText(list, list[0]!)).toBe(null)
    expect(redText([run(1, 2)], run(1, 2))).toBe(null)
  })

  test('texts in Portuguese', async () => {
    const list = [run(1, 0), run(2, 2)]
    expect(statusText(list, 'pt-BR')).toBe('✗ testes 41/43 ▁█')
    expect(score(run(1, 2, { passed: null }), 'pt-BR')).toBe('2 falharam')
    expect(score(run(1, 0, { passed: null }), 'pt-BR')).toBe('ok')
    expect(redText(list, list[1]!, 'pt-BR')).toBe('Testes ficaram vermelhos: 41/43 (vitest), 2 falhas.')
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
