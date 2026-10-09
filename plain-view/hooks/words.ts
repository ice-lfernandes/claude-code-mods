// What plain-view says, in Portuguese and English. The language comes from the `language`
// option, else the system's LANG (ui.tsx's langOf).

import type { Lang } from './ui'

export const COMMAND = 'plain-view'

/** The label the prompt footer shows while the mod is on. */
export const MODE = 'plain view'

type Words = {
  description: string
  /** The two steps the card shows before the agent writes a task list. */
  first: [string, string][]
  untitled: string
  step: (n: number, of: number) => string
  steps: (done: number, of: number) => string
  allDone: string
  turnDone: string
  interrupted: string
  stopped: string
  took: (span: string) => string
  stoppedAt: (span: string) => string
  /** A task's status beside its bar. */
  done: string
  working: string
  next: string
  later: string
  halted: string
  moreDone: (n: number) => string
  moreAfter: (n: number) => string
  /** What the turn touched: `mudei 2 arquivos · li 3 arquivos`. */
  files: (changed: number, read: number) => string
  on: string
  off: string
  alreadyOn: string
  alreadyOff: string
  denied: (why: string) => string
  demoStarted: string
  demoBusy: string
  demoTitle: string
  demoTasks: [string, string][]
  demoDoing: string
  palette: string
  paletteNow: (id: string) => string
  paletteSet: (id: string) => string
  paletteUnknown: (name: string, names: string) => string
  paletteAlso: string
  use: string
  answer: string
  using: (tool: string) => string
  usingSkill: (skill: string) => string
  /** The system prompt line the askForTasks option adds. */
  askForTasks: string
  failed: string
  inUse: string
  help: string
}

// The model reads English best; the same line in both languages.
const ASK_FOR_TASKS =
  'When a request takes more than two steps, keep its plan as a task list with the TodoWrite or TaskCreate tool, and mark each task in progress and completed as you go. The person follows your progress from that list, not from the tool calls.'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const WORDS: Record<Lang, Words> = {
  'pt-BR': {
    description: 'Transcript sem ruído: o plano do agente num cartão acima do prompt',
    first: [['Entender o pedido', 'Entendendo o pedido'], ['Planejar os passos', 'Planejando os passos']],
    untitled: 'Pedido sem texto',
    step: (n, of) => `Passo ${n} de ${of}`,
    steps: (done, of) => `${done} de ${of} passos`,
    allDone: '✓ Tudo pronto',
    turnDone: '✓ Turno pronto',
    interrupted: '■ Interrompido',
    stopped: '■ Parou com erro',
    took: span => `levou ${span}`,
    stoppedAt: span => `parou em ${span}`,
    done: 'Feito',
    working: 'Agora',
    next: 'Próximo',
    later: 'Depois',
    halted: 'Parado',
    moreDone: n => `✓ mais ${n} ${n === 1 ? 'feito' : 'feitos'}`,
    moreAfter: n => `○ mais ${n} depois`,
    files: (changed, read) =>
      changed > 0 ? `mudei ${plural(changed, 'arquivo', 'arquivos')} · li ${plural(read, 'arquivo', 'arquivos')}` : `li ${plural(read, 'arquivo', 'arquivos')}`,
    on: 'plain-view ligado · /plain-view off desliga',
    off: 'plain-view desligado · /plain-view on liga',
    alreadyOn: 'plain-view já está ligado.',
    alreadyOff: 'plain-view já está desligado.',
    denied: why => `Não deu para mudar a opção: ${why}`,
    demoStarted: 'Demo no cartão acima do prompt por 15 s. Nada roda de verdade.',
    demoBusy: 'O agente está trabalhando. Rode a demo quando o pedido terminar.',
    demoTitle: 'Demo: monte um painel do tempo',
    demoTasks: [
      ['Escolher o estilo da página', 'Escolhendo o estilo da página'],
      ['Ver como pegar o tempo ao vivo', 'Vendo como pegar o tempo ao vivo'],
      ['Montar o painel', 'Montando o painel'],
      ['Publicar o link', 'Publicando o link'],
    ],
    demoDoing: 'demo',
    palette: 'Paleta das barras',
    paletteNow: id => `agora: ${id}`,
    paletteSet: id => `Paleta ${id} · salva em /config`,
    paletteUnknown: (name, names) => `Não conheço a paleta "${name}". As paletas: ${names}.`,
    paletteAlso: 'Também: /plain-view palette aurora, ou /config → plain-view → palette.',
    use: 'usar',
    answer: 'Resposta: ',
    using: tool => `usando ${tool}`,
    usingSkill: skill => `usando a skill ${skill}`,
    askForTasks: ASK_FOR_TASKS,
    failed: 'Algo falhou no plain-view. O transcript segue como estava.',
    inUse: 'em uso',
    help: [
      '**plain-view** · transcript sem ruído',
      '- `on` esconde as linhas de tool; o plano aparece num cartão acima do prompt',
      '- `off` volta o transcript de sempre',
      '- `demo` mostra o cartão com um plano de exemplo',
      '- `palette` mostra as 8 paletas e troca a cor das barras',
      '- `help` esta ajuda',
      'Falha de tool, permissão e perguntas sempre aparecem inteiras.',
      'Opções em /config → plain-view: agentText, askForTasks, palette, animation, language, icons.',
      'agentText: final mostra só a resposta final do agente (padrão); none, nada; card, a resposta no cartão; all, tudo.',
      'Paleta padrão: claude. /plain-view palette mostra as 8.',
    ].join('\n'),
  },
  en: {
    description: 'A quiet transcript: the agent’s plan in a card above the prompt',
    first: [['Understand your request', 'Understanding your request'], ['Plan the steps', 'Planning the steps']],
    untitled: 'Request with no text',
    step: (n, of) => `Step ${n} of ${of}`,
    steps: (done, of) => `${done} of ${of} steps`,
    allDone: '✓ All done',
    turnDone: '✓ Turn done',
    interrupted: '■ Interrupted',
    stopped: '■ Stopped on an error',
    took: span => `took ${span}`,
    stoppedAt: span => `stopped at ${span}`,
    done: 'Done',
    working: 'Working',
    next: 'Next',
    later: 'Up next',
    halted: 'Stopped',
    moreDone: n => `✓ ${n} more done`,
    moreAfter: n => `○ ${n} more after`,
    files: (changed, read) =>
      changed > 0 ? `changed ${plural(changed, 'file', 'files')} · read ${plural(read, 'file', 'files')}` : `read ${plural(read, 'file', 'files')}`,
    on: 'plain-view on · /plain-view off turns it off',
    off: 'plain-view off · /plain-view on turns it on',
    alreadyOn: 'plain-view is already on.',
    alreadyOff: 'plain-view is already off.',
    denied: why => `Could not change the option: ${why}`,
    demoStarted: 'Demo in the card above the prompt for 15 s. Nothing really runs.',
    demoBusy: 'The agent is working. Run the demo once the request ends.',
    demoTitle: 'Demo: build a weather dashboard',
    demoTasks: [
      ['Pick the page style', 'Picking the page style'],
      ['Check how to get live weather', 'Checking how to get live weather'],
      ['Build the dashboard', 'Building the dashboard'],
      ['Publish the link', 'Publishing the link'],
    ],
    demoDoing: 'demo',
    palette: 'Bar palette',
    paletteNow: id => `now: ${id}`,
    paletteSet: id => `Palette ${id} · saved in /config`,
    paletteUnknown: (name, names) => `No palette named "${name}". The palettes: ${names}.`,
    paletteAlso: 'Also: /plain-view palette aurora, or /config → plain-view → palette.',
    use: 'use',
    answer: 'Answer: ',
    using: tool => `using ${tool}`,
    usingSkill: skill => `using the ${skill} skill`,
    askForTasks: ASK_FOR_TASKS,
    failed: 'Something failed in plain-view. The transcript stays as it was.',
    inUse: 'in use',
    help: [
      '**plain-view** · a quiet transcript',
      '- `on` hides tool rows; the plan shows in a card above the prompt',
      '- `off` back to the usual transcript',
      '- `demo` shows the card with a sample plan',
      '- `palette` shows the 8 palettes and changes the bar colors',
      '- `help` this help',
      'Tool failures, permissions and questions always show in full.',
      'Options in /config → plain-view: agentText, askForTasks, palette, animation, language, icons.',
      'agentText: final shows only the agent’s final answer (default); none, nothing; card, the answer in the card; all, everything.',
      'Default palette: claude. /plain-view palette shows all 8.',
    ].join('\n'),
  },
}
