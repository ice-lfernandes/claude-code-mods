// What limits-meter says, in Portuguese and English. The language comes from the `language`
// option, else the system's LANG (ui.tsx's langOf).

import type { Lang } from './ui'

export const COMMAND = 'limits'

type Words = {
  description: string
  pane: string
  hint: string
  /** Short names of the plan windows, for the band and the pane's first column. */
  labels: Record<string, string>
  now: string
  resetsIn: (reset: string) => string
  /** Toasts, once per threshold. */
  windowAlert: (label: string, percent: string, reset: string) => string
  contextAlert: (percent: string) => string
  /** The one-line answer where no pane can open. */
  context: string
  noReadings: string
  planWindows: string
  noWindows: string
  contextHeading: string
  ofWindow: (used: string, window: string) => string
  turns: string
  noTurns: string
  /** The turns table's column heads: input, output, cache, time, model. */
  columns: readonly [string, string, string, string, string]
  /** Under a plan window: when it reaches 100% at the current pace, before it resets. */
  pace: (label: string, span: string) => string
  /** After the context sparkline. */
  trend: (turns: number) => string
  /** Band and pane buttons. */
  compact: string
  /** What `compact` puts in the prompt, its blank marked to replace. */
  compactFill: string
  details: string
  hide: string
  close: string
  hidden: string
  shown: string
  help: string
  failedToRun: (what: string) => string
  /** Toasts on a costly switch: with a pace, with the window resetting first, with no pace. */
  switchPace: (percent: string, span: string) => string
  switchResets: (percent: string, reset: string) => string
  switchFaster: (percent: string, what: string) => string
  /** The pane's model section. */
  modelHeading: string
  effort: (effort: string) => string
  /** The pane's costly-switch section and /limits warn. */
  warnHeading: string
  warnHint: string
  warnOrder: string
  warnSet: (percent: number) => string
  warnIs: (percent: number) => string
}

export const WORDS: Record<Lang, Words> = {
  'pt-BR': {
    description: 'Limites do plano e contexto: /limits abre o painel; hide, show, warn, help',
    pane: 'Limites e contexto',
    hint: 'Números que o engine informa a cada turno. Tokens e percentual, nunca dinheiro.',
    labels: { five_hour: '5h', seven_day: 'sem', spend_limit: 'gasto' },
    now: 'agora',
    resetsIn: reset => `reinicia em ${reset}`,
    windowAlert: (label, percent, reset) => `Janela ${label} em ${percent}${reset ? `, reinicia em ${reset}` : ''}`,
    contextAlert: percent => `Contexto ${percent} cheio: bom momento para /compact com um foco`,
    context: 'contexto',
    noReadings: 'sem leituras de limite do plano (chave de API, ou antes da primeira resposta)',
    planWindows: 'Janelas do plano',
    noWindows: 'Sem leituras: uma chave de API não tem janelas do plano, e uma assinatura as mostra depois da primeira resposta.',
    contextHeading: 'Contexto',
    ofWindow: (used, window) => `${used} de ${window}`,
    turns: 'Turnos (thread principal)',
    noTurns: 'Nenhum turno terminado ainda.',
    columns: ['entrada', 'saída', 'cache', 'tempo', 'modelo'],
    pace: (label, span) => `no ritmo atual, ${label} chega a 100% em ~${span}, antes de reiniciar`,
    trend: n => `contexto ao fim ${n === 1 ? 'do último turno' : `dos últimos ${n} turnos`}`,
    compact: 'compactar',
    compactFill: '/compact [foco]',
    details: 'detalhes',
    hide: 'ocultar',
    close: 'Fechar',
    hidden: 'Banda oculta. /limits show traz de volta.',
    shown: 'Banda visível.',
    help: [
      '/limits          abre o painel: janelas do plano, contexto em tokens, os últimos 20 turnos',
      '/limits hide     oculta a banda acima do prompt, também nas próximas sessões',
      '/limits show     traz a banda de volta',
      '/limits warn N   avisa na troca cara com a janela de 5h a partir de N% (padrão 70)',
    ].join('\n'),
    failedToRun: what => `Não deu para rodar: ${what}`,
    switchPace: (percent, span) => `5h em ${percent}: neste ritmo a janela acaba em ~${span} · /limits`,
    switchResets: (percent, reset) => `5h em ${percent}: reinicia em ${reset}, antes de acabar · /limits`,
    switchFaster: (percent, what) => `5h em ${percent}: ${what} gasta a janela mais rápido · /limits`,
    modelHeading: 'Modelo',
    effort: effort => `effort ${effort}`,
    warnHeading: 'Aviso de troca cara',
    warnHint: 'Toast ao trocar para modelo maior ou effort max com 5h a partir de:',
    warnOrder: 'ordem: haiku < sonnet < opus < fable',
    warnSet: percent => `Aviso de troca cara a partir de ${percent}%. Vale nas próximas sessões.`,
    warnIs: percent => `Aviso de troca cara a partir de ${percent}%. /limits warn N muda (1 a 100).`,
  },
  en: {
    description: 'Plan limits and context: /limits opens the pane; hide, show, warn, help',
    pane: 'Limits & context',
    hint: 'Figures the engine reports after each turn. Tokens and percent, never money.',
    labels: { five_hour: '5h', seven_day: 'wk', spend_limit: 'spend' },
    now: 'now',
    resetsIn: reset => `resets in ${reset}`,
    windowAlert: (label, percent, reset) => `${label} window at ${percent}${reset ? `, resets in ${reset}` : ''}`,
    contextAlert: percent => `Context ${percent} full: a good moment for /compact with a focus`,
    context: 'context',
    noReadings: 'no plan-limit readings (API key, or before the first response)',
    planWindows: 'Plan windows',
    noWindows: 'No readings: an API key has no plan windows, and a subscription shows them after the first response.',
    contextHeading: 'Context',
    ofWindow: (used, window) => `${used} of ${window}`,
    turns: 'Turns (main thread)',
    noTurns: 'No finished turns yet.',
    columns: ['in', 'out', 'cache', 'time', 'model'],
    pace: (label, span) => `at this pace, ${label} reaches 100% in ~${span}, before it resets`,
    trend: n => `context at the end of the last ${n} turn${n === 1 ? '' : 's'}`,
    compact: 'compact',
    compactFill: '/compact [focus]',
    details: 'details',
    hide: 'hide',
    close: 'Close',
    hidden: 'Band hidden. /limits show brings it back.',
    shown: 'Band shown.',
    help: [
      '/limits          open the pane: plan windows, context in tokens, the last 20 turns',
      '/limits hide     hide the band above the prompt, in later sessions too',
      '/limits show     bring the band back',
      '/limits warn N   warn on a costly switch with the 5-hour window from N% (default 70)',
    ].join('\n'),
    failedToRun: what => `Could not run: ${what}`,
    switchPace: (percent, span) => `5h at ${percent}: at this pace the window runs out in ~${span} · /limits`,
    switchResets: (percent, reset) => `5h at ${percent}: resets in ${reset}, before it runs out · /limits`,
    switchFaster: (percent, what) => `5h at ${percent}: ${what} uses the window faster · /limits`,
    modelHeading: 'Model',
    effort: effort => `effort ${effort}`,
    warnHeading: 'Costly switch warning',
    warnHint: 'Toast on a switch to a bigger model or effort max with 5h from:',
    warnOrder: 'order: haiku < sonnet < opus < fable',
    warnSet: percent => `Costly switch warning from ${percent}%. Kept for later sessions.`,
    warnIs: percent => `Costly switch warning from ${percent}%. /limits warn N changes it (1 to 100).`,
  },
}
