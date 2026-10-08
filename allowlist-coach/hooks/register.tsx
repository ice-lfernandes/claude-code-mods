// allowlist-coach: counts permission dialogs per rule and offers the ones you keep approving.
//
//   counting  tool.call opens a record for each call; classic.PermissionRequest marks the ones
//             whose dialog the person answers (a classic hook's own decision, or auto mode,
//             is not the person); classic.PostToolUse(Failure) marks the ones that ran. When
//             the call resolves, an asked call that ran is an approval, one that did not, a
//             refusal. Counts live in $.store per project root, across sessions.
//   dialog    a line under the open dialog: approvals so far, `●●●○○ 3/5`, toward the offer.
//   toast     once, when a rule reaches THRESHOLD approvals with no refusal.
//   /allowlist  pane with every rule, numbered, ready ones first with allow and dismiss
//             buttons, each with the last call that asked and when. /allowlist allow <n> |
//             dismiss <n> | reset | help, where <n> is the pane's number or the rule itself.
//
// It writes one file, .claude/settings.local.json under the project root, and only after the
// person picks "Add" in a dialog. Reset clears the counts only after the person picks "Clear".
// It never offers a rule that is a whole tool, a bare wildcard, or a command that deletes,
// escalates or reaches the network (tally.isRisky), and never one the person refused or put
// under ask or deny.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Configured, Entry } from '../types'
import { addAllow, exampleOf, keyAt, keyOf, noticeFor, progress, record, rulesFor, setState, SETTINGS_FILE, sorted, stable, status, summary, THRESHOLD, toConfigured } from './tally'
import type { Lang, Verb } from './ui'
import { clip, fillArgs, langOf, linesOf, verbRow } from './ui'
import { COMMAND, WORDS } from './words'

const PANE = 'allowlist'
/** Modes where a dialog is not the person's answer, or is not shown at all. */
const NOT_THE_PERSON = new Set(['auto', 'dontAsk', 'bypassPermissions'])

const entries = atom({ plugin: 'allowlist-coach', key: 'entries' } as const, {} as Record<string, Entry>)
const configured = atom({ plugin: 'allowlist-coach', key: 'configured' } as const, { allow: [], ask: [], deny: [] } as Configured)

type Open = { tool: string; input: string; agentId?: string; rules: string[] | null; ran: boolean; example: string }
const open = new Map<string, Open>()
let root = ''
// Set by register from the options, and by session.start from the system's LANG.
let lang: Lang = 'en'

const storeKey = () => `entries:${root}`

const save = async ($: EngineInterface, change: (list: Record<string, Entry>) => Record<string, Entry>) => {
  await update($, entries, change)
  await $.store.set(storeKey(), await read($, entries))
}

const refresh = async ($: EngineInterface) => {
  try {
    const settings = await $.settings.read()
    await update($, configured, () => toConfigured(settings as never))
  } catch {
    // Keep the lists read last.
  }
}

const argsOf = (e: Record<string, unknown>) => {
  const { tool, tool_use_id, agentId, consent, ...args } = e
  return args
}

/** Asks, then adds the entry's rules to settings.local.json. Returns what to tell the person. */
const allow = async ($: EngineInterface, key: string): Promise<string> => {
  const w = WORDS[lang]
  const entry = (await read($, entries))[key]
  if (!entry) return w.noRule(key)
  const what = entry.rules.join(' and ')
  let answer: string
  try {
    answer = await $.ui.ask(w.askAdd(what, SETTINGS_FILE, entry.approved), { header: 'allowlist', options: [w.add, w.notNow, w.never] })
  } catch {
    return w.nothingChanged
  }
  if (answer === w.never) {
    await save($, list => setState(list, key, 'dismissed'))
    return w.neverAgain(what)
  }
  if (answer !== w.add) return w.nothingChanged
  const path = `${root}/${SETTINGS_FILE}`
  try {
    const text = (await $.fs.exists(path)) ? String(await $.fs.read(path)) : ''
    const next = addAllow(text, entry.rules)
    if (next !== null) await $.fs.write(path, next)
  } catch (error) {
    return w.leftAsIs(SETTINGS_FILE, error instanceof Error ? error.message : String(error))
  }
  await save($, list => setState(list, key, 'added'))
  await refresh($)
  return w.added(what, SETTINGS_FILE)
}

const dismiss = async ($: EngineInterface, key: string) => {
  const w = WORDS[lang]
  if (!(await read($, entries))[key]) return w.noRule(key)
  await save($, list => setState(list, key, 'dismissed'))
  return w.neverAgain(key)
}

/** Asks, with Cancel first so a stray Enter keeps the counts, then clears them. */
const reset = async ($: EngineInterface) => {
  const w = WORDS[lang]
  const n = Object.keys(await read($, entries)).length
  if (n === 0) return w.noDialogs
  let answer: string
  try {
    answer = await $.ui.ask(w.askReset(n), { header: 'allowlist', options: [w.cancel, w.clear] })
  } catch {
    return w.nothingChanged
  }
  if (answer !== w.clear) return w.nothingChanged
  await save($, () => ({}))
  return w.cleared
}

/** /allowlist and its arguments: what the command answers, and what the pane's verbs run. */
const runCommand = async ($: EngineInterface, args: string): Promise<{ text?: string }> => {
  const w = WORDS[lang]
  const [verb = '', ...rest] = args.trim().split(/\s+/)
  const arg = rest.join(' ')
  const key = async () => keyAt(await read($, entries), await read($, configured), arg)
  switch (verb.toLowerCase()) {
    case 'allow':
      if (arg) return { text: await allow($, await key()) }
      break
    case 'dismiss':
      if (arg) return { text: await dismiss($, await key()) }
      break
    case 'reset':
      return { text: await reset($) }
    case 'help':
      return { text: w.help }
    case '': {
      await refresh($)
      const opened = await $.ui.open({ id: PANE, title: w.pane, focus: true, closeOnEscape: true }).catch(() => null)
      if (opened?.isPlaced) return {}
      return { text: summary(await read($, entries), await read($, configured), lang) }
    }
  }
  return { text: w.help }
}

/** Puts a text in the prompt for the person to send; runs nothing. */
const fill = async ($: EngineInterface, text: string) => {
  await $.prompt.fill(fillArgs(text))
}

/** The pane's verbs: those that take a number, and reset, wait in the prompt. */
const verbs = (l: Lang): readonly Verb[] => {
  const n = l === 'en' ? '[number]' : '[número]'
  return [{ verb: 'allow', fill: `/${COMMAND} allow ${n}` }, { verb: 'dismiss', fill: `/${COMMAND} dismiss ${n}` }, { verb: 'reset', fill: `/${COMMAND} reset` }, { verb: 'help' }]
}

/** A verb pressed in the pane: fills the prompt, or runs and writes its answer to the transcript. */
const pressVerb = async ($: EngineInterface, v: Verb) => {
  try {
    if (v.fill) return await fill($, v.fill)
    const { text } = await runCommand($, v.verb)
    for (const line of linesOf(text)) $.ui.log(line)
  } catch {
    $.ui.toast(WORDS[lang].failedToRun(`/${COMMAND} ${v.verb}`))
  }
}

export const register: Register = (on, options) => {
  lang = langOf(options.language)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = langOf(options.language, await $.env.get('LANG').catch(() => undefined))
    await $.command.register({
      name: COMMAND,
      description: WORDS[lang].description,
      argumentHint: '[allow <n>|dismiss <n>|reset|help]',
      immediate: true,
    })
    root = await $.session.root()
    const stored = (await $.store.get(storeKey())) as Record<string, Entry> | undefined
    await update($, entries, () => stored ?? {})
    await refresh($)
    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    if (!id) return next(e)
    const input = argsOf(e as never)
    open.set(id, { tool: e.tool, input: stable(input), agentId: e.agentId, rules: null, ran: false, example: exampleOf(e.tool, input) })
    let result
    try {
      result = await next(e)
    } catch (error) {
      open.delete(id)
      throw error
    }
    const call = open.get(id)
    open.delete(id)
    if (!call?.rules) return result
    const key = keyOf(call.rules)
    const was = (await read($, entries))[key]
    const before = was ? status(was, await read($, configured)) : 'counting'
    const now = await $.clock.now()
    await save($, list => record(list, call.rules!, call.ran, call.example, now))
    await refresh($)
    const entry = (await read($, entries))[key]!
    if (before !== 'ready' && entry.state === 'counting' && status(entry, await read($, configured)) === 'ready') {
      await save($, list => setState(list, key, 'offered'))
      $.ui.toast(WORDS[lang].offered(key, entry.approved), { timeoutMs: 10000 })
    }
    return result
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', async ($, e, next) => {
    const result = await next(e)
    if (result.decision) return result
    if (e.permission_mode && NOT_THE_PERSON.has(e.permission_mode)) return result
    const input = stable(e.tool_input)
    for (const [id, call] of open) {
      if (call.rules || call.tool !== e.tool_name || call.input !== input || call.agentId !== e.agent_id) continue
      call.rules = rulesFor(e.tool_name, e.tool_input, e.permission_suggestions)
      const text = noticeFor((await read($, entries))[keyOf(call.rules)], await read($, configured), lang)
      if (text) {
        try {
          $.ui.notice(id, text)
        } catch {
          // No dialog open for it on this host.
        }
      }
      break
    }
    return result
  }).catch(($, e, next) => next(e))

  on('classic.PostToolUse', async ($, e, next) => {
    const call = open.get(e.tool_use_id)
    if (call) call.ran = true
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PostToolUseFailure', async ($, e, next) => {
    const call = open.get(e.tool_use_id)
    if (call) call.ran = true
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: COMMAND }, ($, e) => runCommand($, e.args))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const w = WORDS[lang]
    const now = await $.clock.now()
    const rows = sorted(await read($, entries), await read($, configured))
    const width = Math.max(40, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)
    const ready = rows.filter(r => r.status === 'ready')
    const rest = rows.filter(r => r.status !== 'ready')
    // Two lines a rule. The rest of the pane: hint, headings, the cut line, the footer, gaps.
    const fixed = 9 + ready.length * 2
    const room = Math.max(3, Math.floor(((e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 30) - fixed) / 2))
    const shown = rest.slice(0, room)
    const number = (i: number) => String(i + 1).padStart(2)
    const example = (entry: Entry) => <Text dimColor wrap="truncate-end">{`      ${clip(w.example(entry.example, w.ago(now - entry.lastAt)), width - 6)}`}</Text>

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text dimColor>{w.hint(root || '.', THRESHOLD)}</Text>
        {rows.length === 0 && <Text dimColor>{w.empty}</Text>}
        {ready.length > 0 && (
          <Box flexDirection="column">
            <Text bold>{w.ready}</Text>
            {ready.map((r, i) => (
              <Box key={`ready:${r.key}`} flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  <Text dimColor>{number(i)}</Text>
                  <Text color="success">{`✓${String(r.entry.approved).padStart(3)}`}</Text>
                  <Text wrap="truncate-end">{r.key}</Text>
                  <Button key={`allow-${i + 1}`} label={w.allow} onPress={() => allow($, r.key).then(text => $.ui.toast(text))} />
                  <Button key={`dismiss-${i + 1}`} label={w.dismiss} plain dimColor onPress={() => dismiss($, r.key).then(text => $.ui.toast(text))} />
                </Box>
                {example(r.entry)}
              </Box>
            ))}
          </Box>
        )}
        {rest.length > 0 && (
          <Box flexDirection="column">
            <Text bold>{w.counted}</Text>
            {shown.map((r, i) => (
              <Box key={`row:${r.key}`} flexDirection="column">
                <Text wrap="truncate-end">
                  <Text dimColor>{`${number(ready.length + i)} ${w.status[r.status].padEnd(11)}`}</Text>
                  {r.status === 'counting' ? (
                    <Text color="claude">{`${progress(r.entry.approved)}  `}</Text>
                  ) : (
                    <Text>
                      <Text>{`✓${String(r.entry.approved).padStart(3)} `}</Text>
                      <Text color={r.entry.denied > 0 ? 'warning' : undefined}>{`✗${String(r.entry.denied).padStart(3)}  `}</Text>
                    </Text>
                  )}
                  <Text>{r.key}</Text>
                </Text>
                {example(r.entry)}
              </Box>
            ))}
            {rest.length > shown.length && <Text dimColor>{w.more(rest.length - shown.length)}</Text>}
          </Box>
        )}
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {verbRow({ Box, Text, Button }, COMMAND, verbs(lang), v => pressVerb($, v))}
          <Button key="close" role="dismiss" label={w.close} onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
