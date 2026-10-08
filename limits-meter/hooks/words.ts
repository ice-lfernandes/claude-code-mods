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
}

export const WORDS: Record<Lang, Words> = {
  'pt-BR': {
    description: 'Limites do plano e contexto: /limits abre o painel; hide, show, help',
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
    ].join('\n'),
    failedToRun: what => `Não deu para rodar: ${what}`,
  },
  en: {
    description: 'Plan limits and context: /limits opens the pane; hide, show, help',
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
    ].join('\n'),
    failedToRun: what => `Could not run: ${what}`,
  },
}
