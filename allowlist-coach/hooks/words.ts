// What allowlist-coach says, in Portuguese and English. The language comes from the `language`
// option, else the system's LANG (ui.tsx's langOf).

import type { Status } from './tally'
import type { Lang } from './ui'

export const COMMAND = 'allowlist'

type Words = {
  description: string
  pane: string
  hint: (root: string, threshold: number) => string
  empty: string
  ready: string
  counted: string
  status: Record<Status, string>
  allow: string
  dismiss: string
  close: string
  /** The line under a rule: the last call that asked, and when. */
  example: (example: string, ago: string) => string
  ago: (ms: number) => string
  more: (n: number) => string
  /** Lines under an open permission dialog. */
  noticeRisky: (approved: number) => string
  noticeRefused: (approved: number, denied: number) => string
  noticeReady: (approved: number) => string
  noticeCounting: (progress: string, left: number, rule: string) => string
  offered: (rule: string, approved: number) => string
  /** The question before a rule is written, and its answers. */
  askAdd: (what: string, file: string, approved: number) => string
  add: string
  notNow: string
  never: string
  /** The question before the counts are cleared, and its answers: Cancel first. */
  askReset: (n: number) => string
  cancel: string
  clear: string
  noRule: (key: string) => string
  nothingChanged: string
  neverAgain: (what: string) => string
  added: (what: string, file: string) => string
  leftAsIs: (file: string, why: string) => string
  cleared: string
  noDialogs: string
  addHint: string
  help: string
  failedToRun: (what: string) => string
}

const minutes = (ms: number) => Math.floor(ms / 60_000)

export const WORDS: Record<Lang, Words> = {
  'pt-BR': {
    description: 'Diálogos de permissão por regra: /allowlist abre o painel; allow <n>, dismiss <n>, reset, help',
    pane: 'Allowlist',
    hint: (root, t) => `Diálogos de permissão respondidos em ${root}. Uma regra é oferecida depois de ${t} aprovações sem recusa.`,
    empty: 'Nenhum diálogo de permissão respondido neste projeto ainda.',
    ready: 'Prontas para liberar',
    counted: 'Contadas',
    status: { ready: 'pronta', counting: 'contando', refused: 'recusada', risky: 'arriscada', allowed: 'liberada', pinned: 'fixada', dismissed: 'dispensada' },
    allow: 'liberar',
    dismiss: 'dispensar',
    close: 'Fechar',
    example: (ex, ago) => `ex.: ${ex} · ${ago}`,
    ago: ms => {
      const m = minutes(ms)
      if (m < 1) return 'agora'
      if (m < 60) return `há ${m} min`
      const h = Math.floor(m / 60)
      if (h < 24) return `há ${h} h`
      const d = Math.floor(h / 24)
      return d === 1 ? 'ontem' : `há ${d} dias`
    },
    more: n => `+${n} ${n === 1 ? 'regra que não coube' : 'regras que não couberam'} no painel`,
    noticeRisky: a => `allowlist-coach: aprovada ${a} ${a === 1 ? 'vez' : 'vezes'} aqui; ampla demais para virar regra`,
    noticeRefused: (a, d) => `allowlist-coach: aprovada ${a} ${a === 1 ? 'vez' : 'vezes'}, recusada ${d} aqui`,
    noticeReady: a => `allowlist-coach: aprovada ${a} ${a === 1 ? 'vez' : 'vezes'} aqui · /allowlist`,
    noticeCounting: (progress, left, rule) => `allowlist-coach: ${progress} aprovações · ${left === 1 ? 'falta 1' : `faltam ${left}`} para /allowlist oferecer ${rule}`,
    offered: (rule, a) => `Você aprovou ${rule} ${a} vezes aqui. /allowlist para adicionar ao permissions.allow.`,
    askAdd: (what, file, a) => `Adicionar ${what} ao permissions.allow em ${file}? Você aprovou ${a} ${a === 1 ? 'vez' : 'vezes'} aqui.`,
    add: 'Adicionar',
    notNow: 'Agora não',
    never: 'Nunca oferecer',
    askReset: n => `Apagar as contagens ${n === 1 ? 'da regra' : `das ${n} regras`} deste projeto? As regras já liberadas continuam em permissions.allow.`,
    cancel: 'Cancelar',
    clear: 'Apagar',
    noRule: key => `allowlist-coach: nenhuma regra ${key} contada neste projeto. /allowlist mostra os números.`,
    nothingChanged: 'allowlist-coach: nada mudou.',
    neverAgain: what => `allowlist-coach: ${what} não será mais oferecida.`,
    added: (what, file) => `allowlist-coach: ${what} adicionada ao permissions.allow em ${file}.`,
    leftAsIs: (file, why) => `allowlist-coach: ${file} ficou como estava: ${why}`,
    cleared: 'allowlist-coach: contagens deste projeto apagadas.',
    noDialogs: 'allowlist-coach: nenhum diálogo de permissão respondido neste projeto ainda.',
    addHint: 'Adicione uma com: /allowlist allow 1',
    help: [
      '/allowlist             abre o painel',
      '/allowlist allow 1     libera a regra 1 (pergunta antes)',
      '/allowlist dismiss 1   para de oferecer a regra 1',
      '/allowlist reset       apaga as contagens deste projeto (pergunta antes)',
      'O número é o do painel. A regra escrita por extenso também vale.',
    ].join('\n'),
    failedToRun: what => `Não deu para rodar: ${what}`,
  },
  en: {
    description: 'Permission dialogs per rule: /allowlist opens the pane; allow <n>, dismiss <n>, reset, help',
    pane: 'Allowlist',
    hint: (root, t) => `Permission dialogs answered in ${root}. A rule is offered after ${t} approvals and no refusal.`,
    empty: 'No dialogs answered in this project yet.',
    ready: 'Ready to allow',
    counted: 'Counted',
    status: { ready: 'ready', counting: 'counting', refused: 'refused', risky: 'risky', allowed: 'allowed', pinned: 'pinned', dismissed: 'dismissed' },
    allow: 'allow',
    dismiss: 'dismiss',
    close: 'Close',
    example: (ex, ago) => `e.g. ${ex} · ${ago}`,
    ago: ms => {
      const m = minutes(ms)
      if (m < 1) return 'just now'
      if (m < 60) return `${m} min ago`
      const h = Math.floor(m / 60)
      if (h < 24) return `${h} h ago`
      const d = Math.floor(h / 24)
      return d === 1 ? 'yesterday' : `${d} days ago`
    },
    more: n => `+${n} rule${n === 1 ? '' : 's'} that did not fit the pane`,
    noticeRisky: a => `allowlist-coach: approved ${a} time${a === 1 ? '' : 's'} here; too broad to offer as a rule`,
    noticeRefused: (a, d) => `allowlist-coach: approved ${a} time${a === 1 ? '' : 's'}, refused ${d} here`,
    noticeReady: a => `allowlist-coach: approved ${a} time${a === 1 ? '' : 's'} here · /allowlist`,
    noticeCounting: (progress, left, rule) => `allowlist-coach: ${progress} approvals · ${left} more and /allowlist offers ${rule}`,
    offered: (rule, a) => `You approved ${rule} ${a} times here. /allowlist to add it to permissions.allow.`,
    askAdd: (what, file, a) => `Add ${what} to permissions.allow in ${file}? You approved it ${a} time${a === 1 ? '' : 's'} here.`,
    add: 'Add',
    notNow: 'Not now',
    never: 'Never offer it',
    askReset: n => `Clear the counts of this project's ${n === 1 ? 'rule' : `${n} rules`}? Rules already allowed stay in permissions.allow.`,
    cancel: 'Cancel',
    clear: 'Clear',
    noRule: key => `allowlist-coach: no rule ${key} counted in this project. /allowlist shows the numbers.`,
    nothingChanged: 'allowlist-coach: nothing changed.',
    neverAgain: what => `allowlist-coach: ${what} will not be offered again.`,
    added: (what, file) => `allowlist-coach: added ${what} to permissions.allow in ${file}.`,
    leftAsIs: (file, why) => `allowlist-coach: ${file} left as it was: ${why}`,
    cleared: "allowlist-coach: this project's counts cleared.",
    noDialogs: 'allowlist-coach: no permission dialogs answered in this project yet.',
    addHint: 'Add one with: /allowlist allow 1',
    help: [
      '/allowlist             open the pane',
      '/allowlist allow 1     allow rule 1 (asks first)',
      '/allowlist dismiss 1   stop offering rule 1',
      "/allowlist reset       clear this project's counts (asks first)",
      'The number is the one in the pane. The rule written out works too.',
    ].join('\n'),
    failedToRun: what => `Could not run: ${what}`,
  },
}
