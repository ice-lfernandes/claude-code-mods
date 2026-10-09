// allowlist-coach: counts permission dialogs per rule and offers the ones you keep approving.
//
//   counting  tool.call opens a record for each call; classic.PermissionRequest marks the ones
//             whose dialog the person answers (a classic hook's own decision, or auto mode,
//             is not the person); classic.PostToolUse(Failure) marks the ones that ran. When
//             the call resolves, an asked call that ran is an approval, one that did not, a
//             refusal. Counts live in $.store per project root, across sessions.
//   dialog    a line under the open dialog: approvals so far, `●●●○○ 3/5`, toward the offer.
//   toast     once, when a rule reaches `threshold` approvals (5 by default) with no refusal.
//   /allowlist  pane with every rule, numbered, ready ones first, each with the last call that
//             asked and when, and its actions: allow, dismiss, reset count, remove from allow.
//             Tabs and a filter narrow the list; it scrolls. /allowlist allow <n> | dismiss <n>
//             | remove <n> | reset [<n>] | help, where <n> is the pane's number or the rule.
//
// It writes the project's .claude/settings.local.json, or its .claude/settings.json when the
// person picks that file, and only after the person picks one in a dialog. It takes a rule
// out of allow only after the person picks "Remove". Reset clears counts only after the person
// picks "Clear" or "Reset". It never offers or adds a rule that is a whole tool, a broad
// wildcard, or a command that deletes, escalates or reaches the network (tally.riskOf), and
// never one the person refused or put under ask or deny.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Configured, Entry, Tab } from '../types'
import {
  addAllow,
  exampleOf,
  keyAt,
  keyOf,
  noticeFor,
  progress,
  record,
  removeAllow,
  riskOfEntry,
  rulesFor,
  setState,
  setThreshold,
  SETTINGS_FILE,
  SHARED_FILE,
  shows,
  sorted,
  stable,
  status,
  summary,
  TABS,
  thresholdNow,
  toConfigured,
  zero,
} from './tally'
import type { Lang, Verb } from './ui'
import { clip, fillArgs, langOf, linesOf, verbRow, windowOf } from './ui'
import { COMMAND, WORDS } from './words'

const PANE = 'allowlist'
/** Modes where a dialog is not the person's answer, or is not shown at all. */
const NOT_THE_PERSON = new Set(['auto', 'dontAsk', 'bypassPermissions'])

const entries = atom({ plugin: 'allowlist-coach', key: 'entries' } as const, {} as Record<string, Entry>)
const configured = atom({ plugin: 'allowlist-coach', key: 'configured' } as const, { allow: [], ask: [], deny: [] } as Configured)
const offset = atom({ plugin: 'allowlist-coach', key: 'offset' } as const, 0)
const tab = atom({ plugin: 'allowlist-coach', key: 'tab' } as const, 'all' as Tab)
const filter = atom({ plugin: 'allowlist-coach', key: 'filter' } as const, '')

type Open = { tool: string; input: string; agentId?: string; rules: string[] | null; ran: boolean; example: string }
const open = new Map<string, Open>()
let root = ''
// The last first row the list can start at, from the last render: the wheel stops there.
let lastStart = 0
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

/** Asks with Cancel first, so a stray Enter changes nothing; true only on `yes`. */
const confirm = async ($: EngineInterface, question: string, yes: string) => {
  try {
    return (await $.ui.ask(question, { header: 'allowlist', options: [WORDS[lang].cancel, yes] })) === yes
  } catch {
    return false
  }
}

/** A settings file's text through `change`, written back unless `change` returns null. Throws as addAllow does. */
const edit = async ($: EngineInterface, file: string, change: (text: string) => string | null) => {
  const path = `${root}/${file}`
  const text = (await $.fs.exists(path)) ? String(await $.fs.read(path)) : ''
  const next = change(text)
  if (next !== null) await $.fs.write(path, next)
  return next !== null
}

/**
 * Asks, showing the line it adds, then adds the entry's rules to settings.local.json or, when
 * the person picks it, the shared settings.json. Returns what to tell the person.
 */
const allow = async ($: EngineInterface, key: string): Promise<string> => {
  const w = WORDS[lang]
  const entry = (await read($, entries))[key]
  if (!entry) return w.noRule(key)
  // The command takes any number, and the list re-sorts as calls are counted: check it again here.
  const s = status(entry, await read($, configured))
  if (s === 'risky' || s === 'refused' || s === 'pinned') {
    const risk = s === 'risky' ? riskOfEntry(entry) : null
    return w.notOffered(key, risk ? `${w.status[s]} (${w.risk(risk)})` : w.status[s])
  }
  const what = entry.rules.join(' and ')
  let answer: string
  try {
    // Not now first, so a stray Enter writes nothing.
    answer = await $.ui.ask(`${w.askAdd(what, entry.approved)}\n${w.preview(entry.rules)}`, { header: 'allowlist', options: [w.notNow, w.addLocal, w.addShared, w.never] })
  } catch {
    return w.nothingChanged
  }
  if (answer === w.never) {
    await save($, list => setState(list, key, 'dismissed'))
    return w.neverAgain(what)
  }
  const file = answer === w.addLocal ? SETTINGS_FILE : answer === w.addShared ? SHARED_FILE : null
  if (!file) return w.nothingChanged
  try {
    await edit($, file, text => addAllow(text, entry.rules, file))
  } catch (error) {
    return w.leftAsIs(file, error instanceof Error ? error.message : String(error))
  }
  await save($, list => setState(list, key, 'added', file))
  await refresh($)
  return w.added(what, file)
}

/** Asks, then takes the rules the coach added out of the file it added them to; the rule is not offered again. */
const remove = async ($: EngineInterface, key: string): Promise<string> => {
  const w = WORDS[lang]
  const entry = (await read($, entries))[key]
  if (!entry) return w.noRule(key)
  if (entry.state !== 'added') return w.notAdded(key)
  const what = entry.rules.join(' and ')
  const file = entry.file ?? SETTINGS_FILE
  if (!(await confirm($, w.askRemove(what, file), w.removeOpt))) return w.nothingChanged
  let changed: boolean
  try {
    changed = await edit($, file, text => removeAllow(text, entry.rules, file))
  } catch (error) {
    return w.leftAsIs(file, error instanceof Error ? error.message : String(error))
  }
  if (!changed) return w.notInFile(what, file)
  await save($, list => setState(list, key, 'dismissed'))
  await refresh($)
  return w.removed(what, file)
}

/** Asks, then sets one rule's counts back to zero. */
const zeroOne = async ($: EngineInterface, key: string): Promise<string> => {
  const w = WORDS[lang]
  const entry = (await read($, entries))[key]
  if (!entry) return w.noRule(key)
  if (!(await confirm($, w.askZero(key, entry.approved, entry.denied), w.zeroOpt))) return w.nothingChanged
  await save($, list => zero(list, key))
  return w.zeroed(key)
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
  if (!(await confirm($, w.askReset(n), w.clear))) return w.nothingChanged
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
    case 'remove':
      if (arg) return { text: await remove($, await key()) }
      break
    case 'reset':
      return { text: arg ? await zeroOne($, await key()) : await reset($) }
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
  return [
    { verb: 'allow', fill: `/${COMMAND} allow ${n}` },
    { verb: 'dismiss', fill: `/${COMMAND} dismiss ${n}` },
    { verb: 'remove', fill: `/${COMMAND} remove ${n}` },
    { verb: 'reset', fill: `/${COMMAND} reset` },
    { verb: 'help' },
  ]
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
  setThreshold(options.threshold)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = langOf(options.language, await $.env.get('LANG').catch(() => undefined))
    await $.command.register({
      name: COMMAND,
      description: WORDS[lang].description,
      argumentHint: '[allow <n>|dismiss <n>|remove <n>|reset [<n>]|help]',
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

  // The wheel over the pane moves the list.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await update($, offset, o => Math.max(0, Math.min(lastStart, o + e.by)))
    return {}
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // The mobile app draws no field yet: there the list shows unfiltered.
    const Input = 'Input' in els ? els.Input : null
    const w = WORDS[lang]
    const now = await $.clock.now()
    const rows = sorted(await read($, entries), await read($, configured))
    const width = Math.max(40, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)
    const picked = await read($, tab)
    const query = Input ? await read($, filter) : ''
    // Numbered over every rule, as /allowlist allow <n> reads the number, whatever shows.
    const numbered = rows.map((r, i) => ({ ...r, n: i + 1 }))
    const found = numbered.filter(r => shows(r, picked, query))
    // Two lines a rule. The rest of the pane: hint, tabs, filter, scroll row, footer, gaps.
    const fixed = 11
    const listRows = Math.max(2, Math.floor(((e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 30) - fixed) / 2))
    const view = windowOf(found.length, await read($, offset), listRows)
    lastStart = Math.max(0, found.length - listRows)
    const scrollList = (by: number) => update($, offset, o => windowOf(found.length, o + by, listRows).start)
    const pickTab = async (t: Tab) => {
      await update($, tab, () => t)
      await update($, offset, () => 0)
    }
    const toast = (text: Promise<string>) => text.then(t => $.ui.toast(t))
    const count = (t: Tab) => (t === 'all' ? rows.length : rows.filter(r => r.status === t).length)

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text dimColor>{w.hint(root || '.', thresholdNow())}</Text>
        {rows.length === 0 && <Text dimColor>{w.empty}</Text>}
        {rows.length > 0 && (
          <Box flexDirection="column">
            <Box flexDirection="row" flexWrap="wrap" gap={2}>
              {TABS.map(t => (
                <Button key={`tab:${t}`} plain dimColor={t !== picked} label={`${t === picked ? '▸ ' : ''}${w.tabs[t]} ${count(t)}`} onPress={() => pickTab(t)} />
              ))}
            </Box>
            {Input && (
              <Input
                key="filter"
                label={w.filter}
                placeholder={w.placeholder}
                value={query}
                onInput={async (value: string) => {
                  await update($, filter, () => value)
                  await update($, offset, () => 0)
                }}
                onSubmit={(value: string) => update($, filter, () => value)}
              />
            )}
          </Box>
        )}
        {rows.length > 0 && (
          <Box flexDirection="column">
            {found.length === 0 && <Text dimColor>{w.noMatch}</Text>}
            {found.slice(view.start, view.end).map(r => {
              const risk = r.status === 'risky' ? riskOfEntry(r.entry) : null
              const canDismiss = r.status === 'ready' || r.status === 'counting' || r.status === 'refused' || r.status === 'risky'
              const hasCounts = r.entry.approved + r.entry.denied > 0 && r.entry.state !== 'added'
              return (
                <Box key={`row:${r.key}`} flexDirection="column">
                  <Box flexDirection="row" gap={1}>
                    <Text dimColor>{String(r.n).padStart(2)}</Text>
                    <Text color={r.status === 'ready' ? 'success' : r.status === 'risky' || r.status === 'refused' ? 'warning' : undefined} dimColor={r.status !== 'ready' && r.status !== 'risky' && r.status !== 'refused'}>
                      {w.status[r.status].padEnd(10)}
                    </Text>
                    {r.status === 'counting' ? (
                      <Text color="claude">{progress(r.entry.approved)}</Text>
                    ) : (
                      <Text>
                        <Text>{`✓${String(r.entry.approved).padStart(3)} `}</Text>
                        <Text color={r.entry.denied > 0 ? 'warning' : undefined}>{`✗${String(r.entry.denied).padStart(3)}`}</Text>
                      </Text>
                    )}
                    <Text wrap="truncate-end">{r.key}</Text>
                    {risk && <Text color="warning" wrap="truncate-end">{`(${w.risk(risk)})`}</Text>}
                    {r.status === 'ready' && <Button key={`allow-${r.n}`} label={w.allow} onPress={() => toast(allow($, r.key))} />}
                  </Box>
                  <Box flexDirection="row" gap={2}>
                    <Text dimColor wrap="truncate-end">{`   ${clip(w.example(r.entry.example, w.ago(now - r.entry.lastAt)), Math.max(20, width - 44))}`}</Text>
                    {canDismiss && <Button key={`dismiss-${r.n}`} label={w.dismiss} plain dimColor onPress={() => toast(dismiss($, r.key))} />}
                    {hasCounts && <Button key={`zero-${r.n}`} label={w.resetCount} plain dimColor onPress={() => toast(zeroOne($, r.key))} />}
                    {r.entry.state === 'added' && <Button key={`remove-${r.n}`} label={w.remove} plain dimColor onPress={() => toast(remove($, r.key))} />}
                  </Box>
                </Box>
              )
            })}
            {found.length > listRows && (
              <Box flexDirection="row" gap={2}>
                <Button key="list:up" plain dimColor={view.start === 0} label={w.up} onPress={() => scrollList(-listRows + 1)} />
                <Button key="list:down" plain dimColor={view.end === found.length} label={w.down} onPress={() => scrollList(listRows - 1)} />
                <Text dimColor>{w.range(view.start + 1, view.end, found.length)}</Text>
              </Box>
            )}
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
