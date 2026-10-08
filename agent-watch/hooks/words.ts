// What agent-watch says, in Portuguese and English. The language comes from the `language`
// option, else the system's LANG (ui.tsx's langOf).

import type { Lang } from './ui'

export const COMMAND = 'watch'

type Words = {
  description: string
  pane: string
  hint: string
  counts: (running: number, finished: number, tokens: string) => string
  stalled: (n: number) => string
  lead: string
  leadLine: (tokens: string, output: string) => string
  empty: string
  emptyNext: string
  otherLoops: (tokens: string) => string
  lastRun: string
  tools: (n: number, failed: number) => string
  thinking: string
  starting: string
  /** An agent's status once it ended, or while it waits: the engine's word, in this language. */
  statuses: Record<string, string>
  /** The collapsed finished agents: a button that opens or closes them. */
  finished: (n: number, isOpen: boolean) => string
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
  /** The share bar's legend: the rest of the agents together. */
  others: string
  shareTitle: string
  recentTitle: string
  noRecent: string
  failedMark: string
  /** The button on a stalled agent, and the request it puts in the prompt. */
  investigate: string
  askInvestigate: (name: string, doing: string, span: string) => string
  sortStart: string
  sortTokens: string
  range: (from: number, to: number, of: number) => string
  up: string
  down: string
  /** A tool call in a few words. */
  doing: {
    running: (what: string) => string
    reading: (file: string) => string
    writing: (file: string) => string
    editing: (file: string) => string
    searching: (pattern: string) => string
    finding: (pattern: string) => string
    web: string
    delegating: (what: string) => string
    aTask: string
    calling: (tool: string) => string
  }
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
    description: 'Subagentes: /watch abre o painel; clear [done|demo], demo, help',
    pane: 'Agentes',
    hint: 'Subagentes desta sessão: tokens de cada requisição ao modelo, e um toast quando um deles trava.',
    counts: (r, f, t) => `${r} rodando · ${plural(f, 'concluído', 'concluídos')} · ${t} tokens`,
    stalled: n => plural(n, 'travado', 'travados'),
    lead: 'principal',
    leadLine: (t, out) => `${t} tokens · saída ${out}`,
    empty: 'Nenhum subagente nesta sessão ainda.',
    emptyNext: '/watch demo mostra como fica.',
    otherLoops: t => `outros loops (compactação, memória)  ${t}`,
    lastRun: 'Última rodada',
    tools: (n, failed) => `${plural(n, 'ferramenta', 'ferramentas')}${failed ? ` (${failed} com erro)` : ''}`,
    thinking: 'pensando',
    starting: 'iniciando',
    statuses: { completed: 'concluído', failed: 'falhou', killed: 'interrompido', idle: 'ocioso', waiting: 'aguardando', pending: 'pendente', running: 'rodando' },
    finished: (n, isOpen) => `${plural(n, 'concluído', 'concluídos')} ${isOpen ? '▾' : '▸'}`,
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
    others: 'outros',
    shareTitle: 'Tokens por agente',
    recentTitle: 'últimas ferramentas',
    noRecent: 'nenhuma chamada de ferramenta ainda',
    failedMark: 'erro',
    investigate: 'investigar',
    askInvestigate: (name, doing, span) => `O agente "${name}" parece travado: ${doing}, há ${span}. Verifique o que aconteceu e diga o que fazer.`,
    sortStart: 'por início',
    sortTokens: 'por tokens',
    range: (from, to, of) => `${from}–${to} de ${of}`,
    up: '▲ acima',
    down: '▼ abaixo',
    doing: {
      running: what => `rodando ${what}`,
      reading: file => `lendo ${file}`,
      writing: file => `escrevendo ${file}`,
      editing: file => `editando ${file}`,
      searching: pattern => `buscando "${pattern}"`,
      finding: pattern => `procurando ${pattern}`,
      web: 'na web',
      delegating: what => `delegando "${what}"`,
      aTask: 'uma tarefa',
      calling: tool => `chamando ${tool}`,
    },
    clearedDone: 'Agentes concluídos removidos.',
    clearedDemo: 'Agentes de demo removidos.',
    clearedBoth: 'Agentes concluídos e de demo removidos.',
    demoAdded: 'Três agentes de demo adicionados; um está travado. /watch clear demo remove.',
    answer: (r, f) => `${r} rodando, ${plural(f, 'concluído', 'concluídos')}.`,
    lastRunAnswer: run => `Última rodada: ${run}.`,
    demoLabels: ['Mapear as rotas da API', 'Corrigir o teste instável', 'Conferir as fontes'],
    help: [
      '/watch              abre o painel: árvore de agentes com tokens, ferramentas e o que cada um faz',
      '/watch demo         adiciona três agentes falsos, um deles travado',
      '/watch clear        remove os agentes concluídos e os de demo',
      '/watch clear done   remove só os concluídos',
      '/watch clear demo   remove só os de demo',
    ].join('\n'),
    failedToRun: what => `Não deu para rodar: ${what}`,
  },
  en: {
    description: 'Subagents: /watch opens the pane; clear [done|demo], demo, help',
    pane: 'Agents',
    hint: "This session's subagents: tokens from each model request, and a toast when one stalls.",
    counts: (r, f, t) => `${r} running · ${f} finished · ${t} tokens`,
    stalled: n => `${n} stalled`,
    lead: 'lead',
    leadLine: (t, out) => `${t} tokens · out ${out}`,
    empty: 'No subagents yet this session.',
    emptyNext: '/watch demo shows what this looks like.',
    otherLoops: t => `other loops (compaction, memory)  ${t}`,
    lastRun: 'Last run',
    tools: (n, failed) => `${n} tool${n === 1 ? '' : 's'}${failed ? ` (${failed} failed)` : ''}`,
    thinking: 'thinking',
    starting: 'starting',
    statuses: { completed: 'done' },
    finished: (n, isOpen) => `${n} finished ${isOpen ? '▾' : '▸'}`,
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
    others: 'others',
    shareTitle: 'Tokens by agent',
    recentTitle: 'recent tools',
    noRecent: 'no tool calls yet',
    failedMark: 'failed',
    investigate: 'investigate',
    askInvestigate: (name, doing, span) => `The agent "${name}" looks stalled: ${doing}, for ${span}. Check what happened and tell me what to do.`,
    sortStart: 'by start',
    sortTokens: 'by tokens',
    range: (from, to, of) => `${from}–${to} of ${of}`,
    up: '▲ up',
    down: '▼ down',
    doing: {
      running: what => `running ${what}`,
      reading: file => `reading ${file}`,
      writing: file => `writing ${file}`,
      editing: file => `editing ${file}`,
      searching: pattern => `searching "${pattern}"`,
      finding: pattern => `finding ${pattern}`,
      web: 'on the web',
      delegating: what => `delegating "${what}"`,
      aTask: 'a task',
      calling: tool => `calling ${tool}`,
    },
    clearedDone: 'Finished agents cleared.',
    clearedDemo: 'Demo agents cleared.',
    clearedBoth: 'Finished and demo agents cleared.',
    demoAdded: 'Three demo agents added; one is stalled. /watch clear demo removes them.',
    answer: (r, f) => `${r} running, ${f} finished.`,
    lastRunAnswer: run => `Last run: ${run}.`,
    demoLabels: ['Map the API routes', 'Fix the flaky test', 'Check sources'],
    help: [
      '/watch              open the pane: agent tree with tokens, tool calls and what each one is doing',
      '/watch demo         add three fake agents, one of them stalled',
      '/watch clear        drop finished and demo agents',
      '/watch clear done   drop finished agents only',
      '/watch clear demo   drop demo agents only',
    ].join('\n'),
    failedToRun: what => `Could not run: ${what}`,
  },
}
