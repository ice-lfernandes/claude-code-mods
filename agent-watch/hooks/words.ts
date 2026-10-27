// What agent-watch says, in Portuguese and English. The language comes from the `language`
// option, else the system's LANG (ui.tsx's langOf).

import type { Lang } from './ui'

export const COMMAND = 'watch'

type Words = {
  description: string
  pane: string
  hint: string
  lead: string
  leadLine: (tokens: string, output: string) => string
  empty: string
  emptyNext: string
  otherLoops: (tokens: string) => string
  lastRun: string
  thinking: string
  starting: string
  /** An agent's status once it ended, or while it waits: the engine's word, in this language. */
  statuses: Record<string, string>
  /** The pane's group headers. */
  groupRunning: (n: number) => string
  groupFinished: (n: number) => string
  clearDone: string
  clearDemo: string
  demoBadge: string
  close: string
  statusLine: (n: number, tokens: string, stalled: number, warn: string) => string
  stalledToast: (name: string, why: string) => string
  doneToast: (run: string) => string
  /** What a stalled agent is stuck on. */
  thinkingFor: (span: string) => string
  doingFor: (doing: string, span: string) => string
  inATool: string
  quietFor: (span: string) => string
  run: (count: number, tokens: string, span: string) => string
  heaviest: (label: string, tokens: string, share: number) => string
  windowUsed: (points: number) => string
  failedMark: string
  /** The card: its step line, the end of a finished agent, and the child's parent. */
  step: (n: number) => string
  stepsDone: (n: number) => string
  inParent: (name: string) => string
  /** What the card says of the plan's windows, from the estimates `~1%` and `~0,1%`. */
  windowShare: (five: string, week: string) => string
  /** The summary row's labels. */
  sum: { agents: string; tokens: string; time: string; five: string; week: string; stalled: string }
  /** A compact row opened, and the button that closes it. */
  closeCard: (name: string) => string
  /** The mascot's description, for a reader that cannot see it. */
  mascot: (name: string) => string
  /** The band above the prompt. */
  band: { agents: string; open: string; hide: string; now: (name: string, doing: string) => string; stalled: (name: string, span: string) => string; done: (n: number, tokens: string, span: string) => string }
  /** The button on a stalled agent, and the request it puts in the prompt. */
  investigate: string
  askInvestigate: (name: string, doing: string, span: string) => string
  sortStart: string
  sortTokens: string
  range: (from: number, to: number, of: number) => string
  up: string
  down: string
  clearedDone: string
  clearedDemo: string
  clearedBoth: string
  demoAdded: string
  answer: (running: number, finished: number) => string
  lastRunAnswer: (run: string) => string
  demoLabels: readonly [string, string, string]
  help: string
  failedToRun: (what: string) => string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const WORDS: Record<Lang, Words> = {
  'pt-BR': {
    description: 'Subagentes: /watch abre o painel; on, off, hide, show, clear [done|demo], demo, help',
    pane: 'Agentes',
    hint: 'Subagentes desta sessão: passo, últimas ações e tokens de cada um, e um toast quando um deles trava. Os percentuais das janelas são estimativas.',
    lead: 'principal',
    leadLine: (t, out) => `${t} tokens · saída ${out}`,
    empty: 'Nenhum subagente nesta sessão ainda.',
    emptyNext: '/watch demo mostra como fica.',
    otherLoops: t => `outros loops (compactação, memória)  ${t}`,
    lastRun: 'Última rodada',
    thinking: 'pensando',
    starting: 'iniciando',
    statuses: { completed: 'concluído', failed: 'falhou', killed: 'interrompido', idle: 'ocioso', waiting: 'aguardando', pending: 'pendente', running: 'rodando' },
    groupRunning: n => `Rodando · ${n}`,
    groupFinished: n => `${n === 1 ? 'Concluído' : 'Concluídos'} · ${n}`,
    clearDone: 'limpar concluídos',
    clearDemo: 'limpar demo',
    demoBadge: 'demo',
    close: 'Fechar',
    statusLine: (n, t, stalled, warn) => `◇ ${plural(n, 'agente', 'agentes')} · ${t}${stalled ? ` · ${warn} ${plural(stalled, 'travado', 'travados')}` : ''}`,
    stalledToast: (name, why) => `${name} parece travado: ${why}. /watch`,
    doneToast: run => `Agentes concluídos: ${run}. /watch`,
    thinkingFor: span => `pensando há ${span}`,
    doingFor: (doing, span) => `${doing} há ${span}`,
    inATool: 'numa chamada de ferramenta',
    quietFor: span => `parado há ${span}`,
    run: (count, t, span) => `${plural(count, 'agente', 'agentes')}, ${t} tokens em ${span}`,
    heaviest: (label, t, share) => `. Mais pesado: ${label} ${t} (${share}%)`,
    windowUsed: p => `. Usou ~${p}% da janela de 5h`,
    failedMark: 'erro',
    step: n => `Passo ${n}`,
    stepsDone: n => `Concluído · ${n} ${n === 1 ? 'passo' : 'passos'}`,
    inParent: name => `em ${name}`,
    windowShare: (five, week) => `${five} da janela 5h · ${week} da semana`,
    sum: { agents: 'agentes', tokens: 'tokens', time: 'tempo', five: 'janela 5h', week: 'semana', stalled: 'travado' },
    closeCard: name => `▾ fechar ${name}`,
    mascot: name => `Mascote do agente ${name}`,
    band: {
      agents: 'Agentes',
      open: 'abrir',
      hide: 'ocultar',
      now: (name, doing) => `${name} · ${doing}`,
      stalled: (name, span) => `${name} parado há ${span}`,
      done: (n, t, span) => `${plural(n, 'agente pronto', 'agentes prontos')} · ${t} · ${span}`,
    },
    investigate: 'investigar',
    askInvestigate: (name, doing, span) => `O agente "${name}" parece travado: ${doing}, há ${span}. Verifique o que aconteceu e diga o que fazer.`,
    sortStart: 'por início',
    sortTokens: 'por tokens',
    range: (from, to, of) => `${from}–${to} de ${of}`,
    up: '▲ acima',
    down: '▼ abaixo',
    clearedDone: 'Agentes concluídos removidos.',
    clearedDemo: 'Agentes de demo removidos.',
    clearedBoth: 'Agentes concluídos e de demo removidos.',
    demoAdded: 'Três agentes de demo adicionados; um está travado. /watch clear demo remove.',
    answer: (r, f) => `${r} rodando, ${plural(f, 'concluído', 'concluídos')}.`,
    lastRunAnswer: run => `Última rodada: ${run}.`,
    demoLabels: ['Mapear as rotas da API', 'Corrigir o teste instável', 'Conferir as fontes'],
    help: [
      '/watch              abre o painel: um cartão por agente com passo, últimas ações e tokens',
      '/watch demo         adiciona três agentes falsos, um deles travado',
      '/watch clear        remove os agentes concluídos e os de demo',
      '/watch clear done   remove só os concluídos',
      '/watch clear demo   remove só os de demo',
      '/watch hide         segue ligado, sem toast nem linha de status; o painel abre',
      '/watch show         traz de volta os avisos',
      '/watch off | on     desliga em todas as conversas | liga',
    ].join('\n'),
    failedToRun: what => `Não deu para rodar: ${what}`,
  },
  en: {
    description: 'Subagents: /watch opens the pane; on, off, hide, show, clear [done|demo], demo, help',
    pane: 'Agents',
    hint: "This session's subagents: step, latest actions and tokens of each, and a toast when one stalls. The window percentages are estimates.",
    lead: 'lead',
    leadLine: (t, out) => `${t} tokens · out ${out}`,
    empty: 'No subagents yet this session.',
    emptyNext: '/watch demo shows what this looks like.',
    otherLoops: t => `other loops (compaction, memory)  ${t}`,
    lastRun: 'Last run',
    thinking: 'thinking',
    starting: 'starting',
    statuses: { completed: 'done' },
    groupRunning: n => `Running · ${n}`,
    groupFinished: n => `Finished · ${n}`,
    clearDone: 'clear finished',
    clearDemo: 'clear demo',
    demoBadge: 'demo',
    close: 'Close',
    statusLine: (n, t, stalled, warn) => `◇ ${n} agent${n === 1 ? '' : 's'} · ${t}${stalled ? ` · ${warn} ${stalled} stalled` : ''}`,
    stalledToast: (name, why) => `${name} looks stalled: ${why}. /watch`,
    doneToast: run => `Agents done: ${run}. /watch`,
    thinkingFor: span => `thinking for ${span}`,
    doingFor: (doing, span) => `${doing} for ${span}`,
    inATool: 'in a tool call',
    quietFor: span => `quiet for ${span}`,
    run: (count, t, span) => `${count} agent${count === 1 ? '' : 's'}, ${t} tokens in ${span}`,
    heaviest: (label, t, share) => `. Heaviest: ${label} ${t} (${share}%)`,
    windowUsed: p => `. Used ~${p}% of the 5h window`,
    failedMark: 'failed',
    step: n => `Step ${n}`,
    stepsDone: n => `Done · ${n} ${n === 1 ? 'step' : 'steps'}`,
    inParent: name => `in ${name}`,
    windowShare: (five, week) => `${five} of the 5h window · ${week} of the week`,
    sum: { agents: 'agents', tokens: 'tokens', time: 'time', five: '5h window', week: 'week', stalled: 'stalled' },
    closeCard: name => `▾ close ${name}`,
    mascot: name => `Mascot of the agent ${name}`,
    band: {
      agents: 'Agents',
      open: 'open',
      hide: 'hide',
      now: (name, doing) => `${name} · ${doing}`,
      stalled: (name, span) => `${name} quiet for ${span}`,
      done: (n, t, span) => `${plural(n, 'agent done', 'agents done')} · ${t} · ${span}`,
    },
    investigate: 'investigate',
    askInvestigate: (name, doing, span) => `The agent "${name}" looks stalled: ${doing}, for ${span}. Check what happened and tell me what to do.`,
    sortStart: 'by start',
    sortTokens: 'by tokens',
    range: (from, to, of) => `${from}–${to} of ${of}`,
    up: '▲ up',
    down: '▼ down',
    clearedDone: 'Finished agents cleared.',
    clearedDemo: 'Demo agents cleared.',
    clearedBoth: 'Finished and demo agents cleared.',
    demoAdded: 'Three demo agents added; one is stalled. /watch clear demo removes them.',
    answer: (r, f) => `${r} running, ${f} finished.`,
    lastRunAnswer: run => `Last run: ${run}.`,
    demoLabels: ['Map the API routes', 'Fix the flaky test', 'Check sources'],
    help: [
      '/watch              open the pane: a card per agent with step, latest actions and tokens',
      '/watch demo         add three fake agents, one of them stalled',
      '/watch clear        drop finished and demo agents',
      '/watch clear done   drop finished agents only',
      '/watch clear demo   drop demo agents only',
      '/watch hide         stays on, with no toast or status line; the pane still opens',
      '/watch show         bring the notices back',
      '/watch off | on     turn it off in every conversation | on',
    ].join('\n'),
    failedToRun: what => `Could not run: ${what}`,
  },
}
