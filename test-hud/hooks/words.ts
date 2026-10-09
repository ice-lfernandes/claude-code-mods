// What test-hud says, in Portuguese and English. The language comes from the `language` option,
// else the system's LANG (ui.tsx's langOf).

import type { Lang } from './ui'

export const COMMAND = 'test-hud'

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
  /** The status line's word: `✗ tests 41/43`. */
  tests: string
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

export const WORDS: Record<Lang, Words> = {
  'pt-BR': {
    description: 'Testes: /test-hud abre o painel; clear, demo, help',
    pane: 'Testes',
    hint: 'Execuções de teste no Bash desta sessão. Clique numa falha para pedir a correção.',
    passing: (p, t) => `${p}/${t} passando`,
    passedNoCounts: 'passou, sem contagem impressa',
    failed: n => `${n} ${n === 1 ? 'falhou' : 'falharam'}`,
    skipped: n => `${n} ${n === 1 ? 'ignorado' : 'ignorados'}`,
    subagent: 'subagente',
    sparkNote: (runs, runner, most) => `falhas ${runs === 1 ? 'na última execução' : `nas últimas ${runs} execuções`} do ${runner}${most ? ` (máx. ${most})` : ''}`,
    failing: (shown, of) => `Falhando${shown ? ` (${shown}${shown < of ? ` de ${of}` : ''})` : ''}`,
    noNames: 'A saída não nomeou os testes que falharam num formato que este mod lê.',
    isNew: 'nova',
    flaky: 'instável?',
    durationNote: (runs, lo, hi) => `duração ${runs === 1 ? 'da última execução' : `das últimas ${runs} execuções`} (${lo === hi ? lo : `de ${lo} a ${hi}`})`,
    latest: '↩ última execução',
    earlier: n => `mostrando a execução #${n}`,
    pickRun: 'clique numa para ver',
    fixed: n => `Corrigidos desde a execução anterior (${n})`,
    runs: 'Execuções',
    runAgain: '↻ rodar de novo',
    close: 'Fechar',
    empty: 'Nenhuma execução de teste nesta sessão. Comandos de teste rodados no Bash aparecem aqui.',
    emptyNext: '/test-hud demo mostra como fica.',
    askFix: (test, command) => `Investigue e corrija a falha em ${test}. Comando: ${command}`,
    rerun: command => `Rode os testes de novo: ${command}`,
    tests: 'testes',
    failedScore: n => `${n} ${n === 1 ? 'falhou' : 'falharam'}`,
    pass: 'ok',
    green: (score, runner, reds, span) => `Testes verdes: ${score} (${runner}) depois de ${reds} ${reds === 1 ? 'execução vermelha' : 'execuções vermelhas'} em ${span}.`,
    red: (score, runner, failing) => `Testes ficaram vermelhos: ${score} (${runner}), ${failing} ${failing === 1 ? 'falha' : 'falhas'}.`,
    noRuns: 'Nenhuma execução de teste nesta sessão.',
    lastRun: (runner, score, failed) => `Última execução: ${runner} ${score}${failed ? `, ${failed} ${failed === 1 ? 'falhou' : 'falharam'}` : ''}.`,
    failingList: names => `Falhando: ${names}.`,
    cleared: 'Execuções de teste apagadas.',
    demoAdded: 'Seis execuções de demonstração, do vermelho ao verde. /test-hud clear tira.',
    help: [
      '/test-hud          abre o painel',
      '/test-hud clear    apaga as execuções',
      '/test-hud demo     mostra execuções de exemplo',
    ].join('\n'),
    failedToRun: what => `Não deu para rodar: ${what}`,
  },
  en: {
    description: 'Test runs: /test-hud opens the pane; clear, demo, help',
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
    failedScore: n => `${n} failed`,
    pass: 'pass',
    green: (score, runner, reds, span) => `Tests green: ${score} (${runner}) after ${reds} red run${reds === 1 ? '' : 's'} in ${span}.`,
    red: (score, runner, failing) => `Tests turned red: ${score} (${runner}), ${failing} failing.`,
    noRuns: 'No test runs yet this session.',
    lastRun: (runner, score, failed) => `Last run: ${runner} ${score}${failed ? `, ${failed} failed` : ''}.`,
    failingList: names => `Failing: ${names}.`,
    cleared: 'Test runs cleared.',
    demoAdded: 'Six demo runs added, red to green. /test-hud clear removes them.',
    help: [
      '/test-hud          open the pane',
      '/test-hud clear    drop the runs',
      '/test-hud demo     show sample runs',
    ].join('\n'),
    failedToRun: what => `Could not run: ${what}`,
  },
}
