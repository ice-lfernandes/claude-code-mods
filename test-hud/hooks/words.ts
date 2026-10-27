// What test-hud says, in English only (since 0.7.1).

export const COMMAND = 'test-hud'

export type GroupKind = 'file' | 'class' | 'suite' | 'module' | 'group'

type Words = {
  description: string
  pane: string
  hint: string
  passing: (passed: number, total: number) => string
  passedNoCounts: string
  failed: (n: number) => string
  skipped: (n: number) => string
  subagent: string
  sparkNote: (runs: number, runner: string, most: number) => string
  failing: (shown: number, of: number) => string
  noNames: string
  isNew: string
  /** The badge on a test that failed, passed and failed again in the command's last runs. */
  flaky: string
  durationNote: (runs: number, shortest: string, longest: string) => string
  /** `Failing (5 in 3 files)`: the heading of a pane whose failing tests have groups. */
  failingIn: (shown: number, of: number, groups: number, kind: GroupKind) => string
  /** The group header's buttons: `show` puts the file in the prompt, `run` asks for only that group. */
  viewFile: string
  runGroup: string
  /** What those buttons put in the prompt. */
  askShow: (path: string) => string
  askRunGroup: (key: string, command: string) => string
  /** The toast for a test that turned flaky (toasts open with a glyph: ✓ green, ! flaky, ✗ red; the API cannot color them): the first name, how many more, over how many runs. */
  flakyToast: (name: string, more: number, runs: number) => string
  /** The button back to the runner's latest run, and the note while an earlier one shows. */
  latest: string
  earlier: (n: number) => string
  pickRun: string
  fixed: (n: number) => string
  runs: string
  runAgain: string
  close: string
  empty: string
  emptyNext: string
  /** What a failing test's button puts in the prompt. */
  askFix: (test: string, command: string) => string
  /** What `run again` puts in the prompt: a request, so the run goes through Bash and is read. */
  rerun: (command: string) => string
  /** The tests line's word: `✗ tests 41/43`. */
  tests: string
  /** The tests line's note after the score: `2 failing`, `1 flaky?`. */
  failingCount: (n: number) => string
  flakyCount: (n: number) => string
  /** A score with no counts: `2 failed`, `pass`. */
  failedScore: (n: number) => string
  pass: string
  green: (score: string, runner: string, reds: number, span: string) => string
  red: (score: string, runner: string, failing: number) => string
  noRuns: string
  lastRun: (runner: string, score: string, failed: number) => string
  failingList: (names: string) => string
  cleared: string
  demoAdded: string
  help: string
  failedToRun: (what: string) => string
}

export const WORDS: Words = {
  description: 'Test runs: /test-hud opens the pane; on, off, hide, show, clear, demo, help',
  pane: 'Tests',
  hint: 'Test runs in Bash this session. Press a failing test to ask for a fix.',
  passing: (p, t) => `${p}/${t} passing`,
  passedNoCounts: 'passed, no counts printed',
  failed: n => `${n} failed`,
  skipped: n => `${n} skipped`,
  subagent: 'subagent',
  sparkNote: (runs, runner, most) => `failures over the last ${runs} ${runner} run${runs === 1 ? '' : 's'}${most ? ` (most ${most})` : ''}`,
  failing: (shown, of) => `Failing${shown ? ` (${shown}${shown < of ? ` of ${of}` : ''})` : ''}`,
  noNames: 'The output named no failing tests in a shape this mod reads.',
  isNew: 'new',
  flaky: 'flaky?',
  failingIn: (shown, of, n, kind) => `Failing (${shown}${shown < of ? ` of ${of}` : ''} in ${n} ${({ file: ['file', 'files'], class: ['class', 'classes'], suite: ['suite', 'suites'], module: ['module', 'modules'], group: ['group', 'groups'] } as const)[kind][n === 1 ? 0 : 1]})`,
  viewFile: 'show',
  runGroup: 'run',
  askShow: path => `Show the failing tests in @${path}`,
  askRunGroup: (key, command) => `Run only the tests in ${key}, with the same runner as: ${command}`,
  flakyToast: (name, more, runs) => (more ? `! ${more + 1} flaky tests: ${name} +${more}` : `! Flaky test: ${name} (${runs} runs)`),
  durationNote: (runs, lo, hi) => `duration of the last ${runs} run${runs === 1 ? '' : 's'} (${lo === hi ? lo : `${lo} to ${hi}`})`,
  latest: '↩ latest run',
  earlier: n => `showing run #${n}`,
  pickRun: 'press one to see it',
  fixed: n => `Fixed since the previous run (${n})`,
  runs: 'Runs',
  runAgain: '↻ run again',
  close: 'Close',
  empty: 'No test runs yet this session. Test commands run in Bash show here.',
  emptyNext: '/test-hud demo shows what this looks like.',
  askFix: (test, command) => `Investigate and fix the failure in ${test}. Command: ${command}`,
  rerun: command => `Run the tests again: ${command}`,
  tests: 'tests',
  failingCount: n => `${n} failing`,
  flakyCount: n => `${n} flaky?`,
  failedScore: n => `${n} failed`,
  pass: 'pass',
  green: (score, runner, reds, span) => `✓ Tests green: ${score} (${runner}) after ${reds} red run${reds === 1 ? '' : 's'} in ${span}.`,
  red: (score, runner, failing) => `✗ Tests turned red: ${score} (${runner}), ${failing} failing.`,
  noRuns: 'No test runs yet this session.',
  lastRun: (runner, score, failed) => `Last run: ${runner} ${score}${failed ? `, ${failed} failed` : ''}.`,
  failingList: names => `Failing: ${names}.`,
  cleared: 'Test runs cleared.',
  demoAdded: 'Six demo runs added, red to green. /test-hud clear removes them.',
  help: [
    '/test-hud          open the pane',
    '/test-hud clear    drop the runs',
    '/test-hud demo     show sample runs',
    '/test-hud hide     stays on, with no tests line or toast; the pane still opens',
    '/test-hud show     bring the line and the notices back',
    '/test-hud off | on turn it off in every conversation | on',
  ].join('\n'),
  failedToRun: what => `Could not run: ${what}`,
}
