// Pure test-run bookkeeping: no engine, so the tests drive it directly.
// The summary shapes follow boss-fight's parser (OneWave-AI/claude-code-mods, MIT), with Maven
// (surefire and failsafe), Gradle, skipped counts and failing test names added.

import type { Parsed, Run } from '../types'

const MAX_RUNS = 30
const MAX_NAMES = 20
export const SPARK_RUNS = 8

// Where a command starts: line start or after ; & | ( , past env assignments, wrappers and a path.
const LEAD = String.raw`(?:^|[;&|(])\s*(?:\w+=\S*\s+)*(?:(?:npx|bunx|pnpm(?:\s+exec)?|yarn|uv\s+run|poetry\s+run|pipenv\s+run|hatch\s+run|bundle\s+exec|time|nice|timeout\s+\S+)\s+)*(?:[\w.~-]*\/)*`
const at = (body: string) => new RegExp(LEAD + body, 'm')

const RUNNERS: readonly [string, RegExp][] = [
  ['maven', at(String.raw`mvnw?(?:\.cmd)?\b(?=[^;&|\n]*\b(?:test|verify|install|package|integration-test|surefire:test)\b)(?![^;&|\n]*-D(?:skipTests|maven\.test\.skip)\b)`)],
  ['gradle', at(String.raw`gradlew?(?:\.bat)?\b(?=[^;&|\n]*[\s:](?:\w*[tT]est|check|build)\b)(?![^;&|\n]*(?:-x|--exclude-task)\s+:?test\b)`)],
  ['vitest', at(String.raw`vitest\b`)],
  ['jest', at(String.raw`jest\b`)],
  ['pytest', at(String.raw`(?:pytest|py\.test|python3?\s+-m\s+pytest)\b`)],
  ['bun', at(String.raw`bun\s+test\b`)],
  ['cargo', at(String.raw`cargo\s+(?:test|nextest)\b`)],
  ['go', at(String.raw`go\s+test\b`)],
  ['claude', at(String.raw`claude\s+plugin\s+test\b`)],
  ['mocha', at(String.raw`mocha\b`)],
  ['rspec', at(String.raw`rspec\b`)],
  ['npm', at(String.raw`(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|t)(?::[\w:-]+)?(?=[\s;&|)]|$)`)],
]

/** Which runner a Bash command starts, or null when it runs no tests. */
export const runnerOf = (command: string): string | null => {
  for (const [name, re] of RUNNERS) if (re.test(command)) return name
  return null
}

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g

const num = (re: RegExp, s: string) => Number(re.exec(s)?.[1] ?? 0)

/** The last match's number: summaries come last, so it wins over per-file lines. */
const last = (text: string, re: RegExp) => {
  let out: number | null = null
  for (const m of text.matchAll(re)) out = Number(m[1])
  return out
}

/** Failing tests by name, in the shapes the common runners print. Deduplicated, at most 20. */
export const failingNames = (text: string): string[] => {
  const shapes: RegExp[] = [
    /^\s*● (.+?)\s*$/gm, // jest
    /^\s*FAIL\s+(.+ > .+?)\s*$/gm, // vitest
    /^(?:FAILED|ERROR) (\S+::\S+)/gm, // pytest
    /^\[ERROR\]\s{2,}([\w$]+(?:[.>][\w$[\]]+)+)(?=[:\s]|$)/gm, // maven
    /^(\S.*? > .+?) FAILED\s*$/gm, // gradle
    /^test (\S+) \.\.\. FAILED\s*$/gm, // cargo
    /^\s*--- FAIL: (\S+)/gm, // go
    /^\(fail\) (.+?)(?: \[[\d.]+m?s\])?\s*$/gm, // bun, claude plugin test
    /^rspec \S+ # (.+?)\s*$/gm, // rspec
  ]
  const seen = new Set<string>()
  for (const re of shapes) {
    for (const m of text.matchAll(re)) {
      const name = m[1]!.trim()
      if (name === 'Console' || seen.has(name)) continue
      seen.add(name)
      if (seen.size === MAX_NAMES) return [...seen].map(n => clip(n, 100))
    }
  }
  return [...seen].map(n => clip(n, 100))
}

/**
 * Counts from a runner's output, tolerant of the common summary shapes. Null when the output
 * carries no summary at all.
 */
export const parseRun = (runner: string, raw: string): Parsed | null => {
  const text = raw.replace(ANSI, '').replace(/\r/g, '')
  const counts = summary(runner, text)
  return counts && { ...counts, failures: counts.failed ? failingNames(text) : [] }
}

const summary = (runner: string, text: string): Omit<Parsed, 'failures'> | null => {
  // maven: one "Tests run: 43, Failures: 1, Errors: 1, Skipped: 2" per module, after the
  // per-class lines (which go on with ", Time elapsed"): add the modules up.
  const maven = [...text.matchAll(/^(?:\[(?:INFO|WARNING|ERROR)\]\s+)?Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)\s*$/gm)]
  if (maven.length) {
    const [run, failures, errors, skipped] = [1, 2, 3, 4].map(i => maven.reduce((n, m) => n + Number(m[i]), 0)) as [number, number, number, number]
    return { failed: failures + errors, passed: run - failures - errors - skipped, skipped }
  }

  // gradle prints counts only when something failed: "43 tests completed, 2 failed, 1 skipped".
  const gradle = [...text.matchAll(/^\s*(\d+) tests? completed(?:, (\d+) failed)?(?:, (\d+) skipped)?/gm)]
  if (gradle.length) {
    const [done, failed, skipped] = [1, 2, 3].map(i => gradle.reduce((n, m) => n + Number(m[i] ?? 0), 0)) as [number, number, number]
    return { failed, passed: done - failed - skipped, skipped }
  }

  // jest: "Tests:       2 failed, 1 skipped, 5 passed, 8 total"
  const jest = /^\s*Tests:\s+(.*\d+ total)/m.exec(text)?.[1]
  if (jest) return { failed: num(/(\d+) failed/, jest), passed: num(/(\d+) passed/, jest), skipped: num(/(\d+) skipped/, jest) + num(/(\d+) todo/, jest) }

  // vitest: "Tests  2 failed | 5 passed | 1 skipped (8)"
  const vitest = /^\s*Tests\s+(.*?(?:failed|passed).*?)\s*\(\d+\)\s*$/m.exec(text)?.[1]
  if (vitest) return { failed: num(/(\d+) failed/, vitest), passed: num(/(\d+) passed/, vitest), skipped: num(/(\d+) skipped/, vitest) + num(/(\d+) todo/, vitest) }

  // cargo: "test result: FAILED. 3 passed; 2 failed; 1 ignored;" once per crate: add them.
  const cargo = [...text.matchAll(/test result: \w+\.\s+(\d+) passed;\s+(\d+) failed;\s+(\d+) ignored/g)]
  if (cargo.length) {
    const [passed, failed, skipped] = [1, 2, 3].map(i => cargo.reduce((n, m) => n + Number(m[i]), 0)) as [number, number, number]
    return { failed, passed, skipped }
  }

  // bun, claude plugin test: " 12 pass\n 1 fail"
  const pass = last(text, /^\s*(\d+) pass\s*$/gm)
  const fail = last(text, /^\s*(\d+) fail\s*$/gm)
  if (pass !== null || fail !== null) return { failed: fail ?? 0, passed: pass ?? 0, skipped: last(text, /^\s*(\d+) skip\s*$/gm) ?? 0 }

  // pytest: "=== 2 failed, 5 passed, 1 skipped in 0.12s ===", or the same bare with -q.
  const py = /^[=\s]*(\d+ (?:failed|passed|errors?|skipped|xfailed|xpassed|deselected|warnings?)\b.*?) in [\d.]+s\b/m.exec(text)?.[1]
  if (py) return { failed: num(/(\d+) failed/, py) + num(/(\d+) errors?/, py), passed: num(/(\d+) passed/, py), skipped: num(/(\d+) skipped/, py) }
  if (/^=+ no tests ran\b/m.test(text)) return { failed: 0, passed: 0, skipped: 0 }

  // mocha: "5 passing", "2 failing", "1 pending"
  const passing = last(text, /^\s*(\d+) passing\b/gm)
  const failing = last(text, /^\s*(\d+) failing\b/gm)
  if (passing !== null || failing !== null) return { failed: failing ?? 0, passed: passing ?? 0, skipped: last(text, /^\s*(\d+) pending\b/gm) ?? 0 }

  // rspec: "7 examples, 2 failures, 1 pending"
  const rspec = /(\d+) examples?, (\d+) failures?(?:, (\d+) pending)?/.exec(text)
  if (rspec) {
    const [all, failed, skipped] = [rspec[1], rspec[2], rspec[3]].map(n => Number(n ?? 0)) as [number, number, number]
    return { failed, passed: all - failed - skipped, skipped }
  }

  // go: "--- FAIL: TestX" per failing top-level test; "--- PASS" only with -v.
  if (runner === 'go') {
    const fails = (text.match(/^--- FAIL:/gm) ?? []).length
    const passes = (text.match(/^--- PASS:/gm) ?? []).length
    const failed = fails || (/^FAIL\b/m.test(text) ? 1 : 0)
    if (failed || passes) return { failed, passed: passes || null, skipped: (text.match(/^--- SKIP:/gm) ?? []).length }
    if (/^ok\s/m.test(text)) return { failed: 0, passed: null, skipped: 0 }
  }

  return null
}

/**
 * A run with no summary still says something when the runner stays quiet on success: Gradle
 * always, Maven with -q. Exit 0 then reads as green with no counts.
 */
export const quietPass = (runner: string): Parsed | null =>
  runner === 'gradle' || runner === 'maven' ? { failed: 0, passed: null, skipped: 0, failures: [] } : null

export const record = (list: readonly Run[], run: Run): Run[] => {
  const next = [...list, run]
  return next.length > MAX_RUNS ? next.slice(next.length - MAX_RUNS) : next
}

/** The run of the same runner before `run`. */
export const previous = (list: readonly Run[], run: Run): Run | undefined =>
  list.filter(r => r.runner === run.runner && r.n < run.n).at(-1)

/** Failing tests of `run` that were not failing in the runner's run before it. */
export const fresh = (list: readonly Run[], run: Run): Set<string> => {
  const prev = previous(list, run)
  // An earlier run that failed without names we could read says nothing about which are new.
  if (!prev || (prev.failed > 0 && prev.failures.length === 0)) return new Set()
  return new Set(run.failures.filter(f => !prev.failures.includes(f)))
}

const LEVELS = '▂▃▄▅▆▇█'

/** Failures per run, oldest first: ▁ is a green run, ▂ to █ scale to the most failures. */
export const spark = (list: readonly Run[]) => {
  const max = Math.max(0, ...list.map(r => r.failed))
  return list.map(r => (r.failed === 0 ? '▁' : LEVELS[Math.min(6, Math.ceil((r.failed / max) * 7) - 1)])).join('')
}

/** The last runs of the latest run's runner, for the sparkline. */
export const trail = (list: readonly Run[], size = SPARK_RUNS) => {
  const latest = list.at(-1)
  return latest ? list.filter(r => r.runner === latest.runner).slice(-size) : []
}

/** "41/43", "2 failed", "pass". */
export const score = (r: Run) => (r.passed === null ? (r.failed ? `${r.failed} failed` : 'pass') : `${r.passed}/${r.passed + r.failed}`)

/** "✗ tests 41/43 ▃▅█▅▂", or undefined before any run. */
export const statusText = (list: readonly Run[]) => {
  const r = list.at(-1)
  if (!r) return undefined
  const line = spark(trail(list))
  return `${r.failed ? '✗' : '✓'} tests ${score(r)}${line.length > 1 ? ` ${line}` : ''}`
}

/** The toast for a run that turned its runner green after red runs, else null. */
export const greenText = (list: readonly Run[], run: Run): string | null => {
  if (run.failed > 0) return null
  const same = list.filter(r => r.runner === run.runner && r.n < run.n)
  let reds = 0
  while (reds < same.length && same[same.length - 1 - reds]!.failed > 0) reds++
  if (reds === 0) return null
  const first = same[same.length - reds]!
  const span = elapsed(run.endedAt - (first.endedAt - first.durationMs))
  return `Tests green: ${score(run)} (${run.runner}) after ${reds} red run${reds === 1 ? '' : 's'} in ${span}.`
}

/** The command's first line, clipped. */
export const commandLine = (command: string) => clip(command.split('\n')[0]!.trim(), 60)

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** 42s, 6m 05s, 1h 02m. */
export const elapsed = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
