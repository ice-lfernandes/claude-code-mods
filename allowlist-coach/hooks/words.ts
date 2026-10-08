// What allowlist-coach says, in Portuguese and English. The language comes from the `language`
// option, else the system's LANG (ui.tsx's langOf).

import type { Tab } from '../types'
import type { Risk, Status } from './tally'
import type { Lang } from './ui'

export const COMMAND = 'allowlist'

type Words = {
  description: string
  pane: string
  hint: (root: string, threshold: number) => string
  empty: string
  status: Record<Status, string>
  tabs: Record<Tab, string>
  filter: string
  placeholder: string
  noMatch: string
  /** The scroll row under the list: which rules show, of how many. */
  range: (from: number, to: number, of: number) => string
  up: string
  down: string
  /** Why a risky rule is never offered. */
  risk: (r: Risk) => string
  allow: string
  dismiss: string
  close: string
  /** The line under a rule: the last call that asked, and when. */
  example: (example: string, ago: string) => string
  ago: (ms: number) => string
  /** Lines under an open permission dialog. */
  noticeRisky: (approved: number) => string
  noticeRefused: (approved: number, denied: number) => string
  noticeReady: (approved: number) => string
  noticeCounting: (progress: string, left: number, rule: string) => string
  offered: (rule: string, approved: number) => string
  /** The question before a rule is written, with the line it adds, and its answers. */
  askAdd: (what: string, approved: number) => string
  preview: (rules: readonly string[]) => string
  addLocal: string
  addShared: string
  notNow: string
  never: string
  /** The question before the counts are cleared, and its answers: Cancel first. */
  askReset: (n: number) => string
  cancel: string
  clear: string
  /** Undoing an added rule: the button, the question, its answer and the outcomes. */
  remove: string
  askRemove: (what: string, file: string) => string
  removeOpt: string
  removed: (what: string, file: string) => string
  notInFile: (what: string, file: string) => string
  notAdded: (key: string) => string
  /** One rule's counts back to zero: the button, the question, its answer and the outcome. */
  resetCount: string
  askZero: (key: string, approved: number, denied: number) => string
  zeroOpt: string
  zeroed: (key: string) => string
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
    description: 'Diálogos de permissão por regra: /allowlist abre o painel; allow <n>, dismiss <n>, remove <n>, reset [<n>], help',
    pane: 'Allowlist',
    hint: (root, t) => `Diálogos de permissão respondidos em ${root}. Uma regra é oferecida depois de ${t} aprovações sem recusa.`,
    empty: 'Nenhum diálogo de permissão respondido neste projeto ainda.',
    status: { ready: 'pronta', counting: 'contando', refused: 'recusada', risky: 'arriscada', allowed: 'liberada', pinned: 'fixada', dismissed: 'dispensada' },
    tabs: { all: 'todas', ready: 'prontas', counting: 'contando', refused: 'recusadas' },
    filter: 'Filtrar',
    placeholder: 'regra ou comando',
    noMatch: 'Nenhuma regra corresponde.',
    range: (from, to, of) => `${from}–${to} de ${of}`,
    up: '▲ acima',
    down: '▼ abaixo',
    risk: r => (r.kind === 'tool' ? 'a ferramenta inteira' : r.kind === 'wildcard' ? 'curinga solto' : r.kind === 'command' ? `roda ${r.what}` : 'regra ilegível'),
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
    noticeRisky: a => `allowlist-coach: aprovada ${a} ${a === 1 ? 'vez' : 'vezes'} aqui; ampla demais para virar regra`,
    noticeRefused: (a, d) => `allowlist-coach: aprovada ${a} ${a === 1 ? 'vez' : 'vezes'}, recusada ${d} aqui`,
    noticeReady: a => `allowlist-coach: aprovada ${a} ${a === 1 ? 'vez' : 'vezes'} aqui · /allowlist`,
    noticeCounting: (progress, left, rule) => `allowlist-coach: ${progress} aprovações · ${left === 1 ? 'falta 1' : `faltam ${left}`} para /allowlist oferecer ${rule}`,
    offered: (rule, a) => `Você aprovou ${rule} ${a} vezes aqui. /allowlist para adicionar ao permissions.allow.`,
    askAdd: (what, a) => `Adicionar ${what} ao permissions.allow? Você aprovou ${a} ${a === 1 ? 'vez' : 'vezes'} aqui.`,
    preview: rules => `Linha que entra em permissions.allow: ${rules.map(r => JSON.stringify(r)).join(', ')}`,
    addLocal: 'Adicionar ao settings.local.json (só você)',
    addShared: 'Adicionar ao settings.json (o time todo)',
    notNow: 'Agora não',
    never: 'Nunca oferecer',
    askReset: n => `Apagar as contagens ${n === 1 ? 'da regra' : `das ${n} regras`} deste projeto? As regras já liberadas continuam em permissions.allow.`,
    cancel: 'Cancelar',
    clear: 'Apagar',
    remove: 'tirar do allow',
    askRemove: (what, file) => `Tirar ${what} do permissions.allow em ${file}? O diálogo de permissão volta a aparecer.`,
    removeOpt: 'Tirar',
    removed: (what, file) => `allowlist-coach: ${what} saiu do permissions.allow em ${file}; não será mais oferecida.`,
    notInFile: (what, file) => `allowlist-coach: ${what} não está no permissions.allow de ${file}; nada mudou.`,
    notAdded: key => `allowlist-coach: ${key} não foi adicionada pelo allowlist-coach; tire-a do arquivo de settings onde está.`,
    resetCount: 'zerar contagem',
    askZero: (key, a, d) => `Zerar a contagem de ${key} (${a} ${a === 1 ? 'aprovação' : 'aprovações'}, ${d} ${d === 1 ? 'recusa' : 'recusas'})?`,
    zeroOpt: 'Zerar',
    zeroed: key => `allowlist-coach: contagem de ${key} zerada.`,
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
      '/allowlist remove 1    tira do allow a regra 1 que o coach adicionou (pergunta antes)',
      '/allowlist reset 1     zera a contagem da regra 1 (pergunta antes)',
      '/allowlist reset       apaga as contagens deste projeto (pergunta antes)',
      'O número é o do painel. A regra escrita por extenso também vale.',
    ].join('\n'),
    failedToRun: what => `Não deu para rodar: ${what}`,
  },
  en: {
    description: 'Permission dialogs per rule: /allowlist opens the pane; allow <n>, dismiss <n>, remove <n>, reset [<n>], help',
    pane: 'Allowlist',
    hint: (root, t) => `Permission dialogs answered in ${root}. A rule is offered after ${t} approvals and no refusal.`,
    empty: 'No dialogs answered in this project yet.',
    status: { ready: 'ready', counting: 'counting', refused: 'refused', risky: 'risky', allowed: 'allowed', pinned: 'pinned', dismissed: 'dismissed' },
    tabs: { all: 'all', ready: 'ready', counting: 'counting', refused: 'refused' },
    filter: 'Filter',
    placeholder: 'rule or command',
    noMatch: 'No rule matches.',
    range: (from, to, of) => `${from}–${to} of ${of}`,
    up: '▲ up',
    down: '▼ down',
    risk: r => (r.kind === 'tool' ? 'the whole tool' : r.kind === 'wildcard' ? 'a bare wildcard' : r.kind === 'command' ? `runs ${r.what}` : 'unreadable rule'),
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
    noticeRisky: a => `allowlist-coach: approved ${a} time${a === 1 ? '' : 's'} here; too broad to offer as a rule`,
    noticeRefused: (a, d) => `allowlist-coach: approved ${a} time${a === 1 ? '' : 's'}, refused ${d} here`,
    noticeReady: a => `allowlist-coach: approved ${a} time${a === 1 ? '' : 's'} here · /allowlist`,
    noticeCounting: (progress, left, rule) => `allowlist-coach: ${progress} approvals · ${left} more and /allowlist offers ${rule}`,
    offered: (rule, a) => `You approved ${rule} ${a} times here. /allowlist to add it to permissions.allow.`,
    askAdd: (what, a) => `Add ${what} to permissions.allow? You approved it ${a} time${a === 1 ? '' : 's'} here.`,
    preview: rules => `The line it adds to permissions.allow: ${rules.map(r => JSON.stringify(r)).join(', ')}`,
    addLocal: 'Add to settings.local.json (just you)',
    addShared: 'Add to settings.json (the whole team)',
    notNow: 'Not now',
    never: 'Never offer it',
    askReset: n => `Clear the counts of this project's ${n === 1 ? 'rule' : `${n} rules`}? Rules already allowed stay in permissions.allow.`,
    cancel: 'Cancel',
    clear: 'Clear',
    remove: 'remove from allow',
    askRemove: (what, file) => `Remove ${what} from permissions.allow in ${file}? Its permission dialog comes back.`,
    removeOpt: 'Remove',
    removed: (what, file) => `allowlist-coach: removed ${what} from permissions.allow in ${file}; it will not be offered again.`,
    notInFile: (what, file) => `allowlist-coach: ${what} is not in permissions.allow in ${file}; nothing changed.`,
    notAdded: key => `allowlist-coach: allowlist-coach did not add ${key}; remove it from the settings file that has it.`,
    resetCount: 'reset count',
    askZero: (key, a, d) => `Reset the count of ${key} (${a} approval${a === 1 ? '' : 's'}, ${d} refusal${d === 1 ? '' : 's'})?`,
    zeroOpt: 'Reset',
    zeroed: key => `allowlist-coach: count of ${key} reset.`,
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
      '/allowlist remove 1    take rule 1 out of allow, when the coach added it (asks first)',
      "/allowlist reset 1     reset rule 1's count (asks first)",
      "/allowlist reset       clear this project's counts (asks first)",
      'The number is the one in the pane. The rule written out works too.',
    ].join('\n'),
    failedToRun: what => `Could not run: ${what}`,
  },
}
