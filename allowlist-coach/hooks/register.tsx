// allowlist-coach: counts permission dialogs per rule and offers the ones you keep approving.
//
//   counting  tool.call opens a record for each call; classic.PermissionRequest marks the ones
//             whose dialog the person answers (a classic hook's own decision, or auto mode,
//             is not the person); classic.PostToolUse(Failure) marks the ones that ran. When
//             the call resolves, an asked call that ran is an approval, one that did not, a
//             refusal. Counts live in $.store per project root, across sessions.
//   dialog    a line under the open dialog: approvals so far, `███░░ 3/5`, toward the offer.
//   toast     once, when a rule reaches `threshold` approvals (5 by default) with no refusal.
//   /allowlist  pane with every rule, numbered, ready ones first, each with the last call that
//             asked and when, and its actions: allow, dismiss, reset count, remove from allow.
//             Tabs and a filter narrow the list; it scrolls. /allowlist allow <n> | dismiss <n>
//             | remove <n> | reset [<n>] | demo | help, where <n> is the pane's number or the rule.
//
//   /allowlist demo  the pane with sample rules, kept in memory: nothing is counted, read or written
//             until `exit demo` (or /allowlist demo off) brings the real counts back.
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
  DEMO_CONFIGURED,
  demoEntries,
  exampleOf,
  holdsSecret,
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
import { PRIMARY, SECONDARY, clip, fig, fillArgs, langOf, linesOf, verbRow, windowOf } from './ui'
import { switchOf, switchWords } from './switch'
import type { Switch } from './switch'
import { COMMAND, WORDS } from './words'

const PANE = 'allowlist'
/** A link only underlines under the pointer; the engine would otherwise invert it. */
const hoverLink = (key: string) => ({ scope: `hover:${key}`, underline: true, inverse: false }) as const
/** A bracketed button fills with the accent under the pointer. */
const hoverFill = (key: string) => ({ scope: `hover:${key}`, backgroundColor: 'claude', color: 'inverseText' }) as const
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
/** The `enabled` option; off, only the command answers. */
let isOn = true
/** On but silent: it counts, but offers no toast and writes no note in the dialog. Kept in the store. */
let isHidden = false
/** The `quiet` option, set in every mod by `/pad quiet`: hides what the mod draws by itself, as hide does. `show` does not undo it. */
let isQuiet = false
/** `/allowlist demo`: the pane shows sample rules, and nothing reaches the store or a settings file. */
let isDemo = false
const KEY_HIDDEN = 'hidden'
// The last first row the list can start at, from the last render: the wheel stops there.
let lastStart = 0
// Set by register from the options, and by session.start from the system's LANG.
let lang: Lang = 'en'

const storeKey = () => `entries:${root}`

const save = async ($: EngineInterface, change: (list: Record<string, Entry>) => Record<string, Entry>) => {
  await update($, entries, change)
  if (!isDemo) await $.store.set(storeKey(), await read($, entries))
}

const refresh = async ($: EngineInterface) => {
  if (isDemo) return
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

/** A demo's answers start with the demo tag, so none reads as real. */
const say = (text: string) => (isDemo ? `${WORDS[lang].demo.tag}${text}` : text)

const where = ($: EngineInterface, path: string) => $.fs.stat(path, { resolve: true }).then(s => s, () => null)

/**
 * Throws unless the file is a plain file, or nothing yet, in the project's own .claude folder:
 * a link there, which a cloned repository can hold, would send the rule to another file.
 */
const guard = async ($: EngineInterface, file: string) => {
  const [top, dir, at] = await Promise.all([where($, root), where($, `${root}/.claude`), where($, `${root}/${file}`)])
  if (dir && (dir.isLink || !top?.realPath || dir.realPath !== `${top.realPath}/.claude`)) throw new Error('.claude is a link; the coach writes only a plain file')
  if (at && (at.isLink || at.kind !== 'file')) throw new Error(`${file} is a link or not a file; the coach writes only a plain file`)
}

/** A settings file's text through `change`, written back unless `change` returns null. Throws as addAllow does, and on a link. */
const edit = async ($: EngineInterface, file: string, change: (text: string) => string | null) => {
  await guard($, file)
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
    answer = await $.ui.ask(say(`${w.askAdd(what, entry.approved)}\n${w.preview(entry.rules)}`), { header: 'allowlist', options: [w.notNow, w.addLocal, w.addShared, w.never] })
  } catch {
    return w.nothingChanged
  }
  if (answer === w.never) {
    await save($, list => setState(list, key, 'dismissed'))
    return say(w.neverAgain(what))
  }
  const file = answer === w.addLocal ? SETTINGS_FILE : answer === w.addShared ? SHARED_FILE : null
  if (!file) return w.nothingChanged
  if (isDemo) {
    await save($, list => setState(list, key, 'added', file))
    return w.demo.added(what)
  }
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
  if (!(await confirm($, say(w.askRemove(what, file)), w.removeOpt))) return w.nothingChanged
  if (isDemo) {
    await save($, list => setState(list, key, 'dismissed'))
    return w.demo.removed(what)
  }
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
  if (!(await confirm($, say(w.askZero(key, entry.approved, entry.denied)), w.zeroOpt))) return w.nothingChanged
  await save($, list => zero(list, key))
  return say(w.zeroed(key))
}

const dismiss = async ($: EngineInterface, key: string) => {
  const w = WORDS[lang]
  if (!(await read($, entries))[key]) return w.noRule(key)
  await save($, list => setState(list, key, 'dismissed'))
  return say(w.neverAgain(key))
}

/** Asks, with Cancel first so a stray Enter keeps the counts, then clears them. */
const reset = async ($: EngineInterface) => {
  const w = WORDS[lang]
  const n = Object.keys(await read($, entries)).length
  if (n === 0) return w.noDialogs
  if (!(await confirm($, say(w.askReset(n)), w.clear))) return w.nothingChanged
  await save($, () => ({}))
  return say(w.cleared)
}

/** Opens the pane. Returns false when this host has no pane to place it in. */
const openPane = async ($: EngineInterface) => {
  const opened = await $.ui.open({ id: PANE, title: WORDS[lang].pane, focus: true, closeOnEscape: true }).catch(() => null)
  return opened?.isPlaced === true
}

/** The demo's sample rules go into the atoms; the stored counts and the settings files stay as they are. */
const startDemo = async ($: EngineInterface): Promise<{ text?: string }> => {
  const w = WORDS[lang]
  if (!isOn) return { text: w.demo.modOff }
  if (isDemo) return { text: w.demo.alreadyOn }
  isDemo = true
  const now = await $.clock.now()
  await update($, entries, () => demoEntries(now))
  await update($, configured, () => DEMO_CONFIGURED)
  await update($, offset, () => 0)
  await update($, tab, () => 'all')
  await update($, filter, () => '')
  if (await openPane($)) return {}
  return { text: `${w.demo.started}\n${summary(await read($, entries), await read($, configured), lang)}` }
}

/** Brings the stored counts and the settings lists back; the pane, if open, draws them. */
const stopDemo = async ($: EngineInterface): Promise<{ text?: string }> => {
  const w = WORDS[lang]
  if (!isDemo) return { text: w.demo.alreadyOff }
  isDemo = false
  const stored = (await $.store.get(storeKey())) as Record<string, Entry> | undefined
  await update($, entries, () => stored ?? {})
  await refresh($)
  return { text: w.demo.stopped }
}

/** Changes the mod's `enabled` option as /config would; the engine reloads the mod with it. */
const setEnabled = async ($: EngineInterface, value: boolean): Promise<string | null> => {
  const result = await $.config.set({ key: 'allowlist-coach.enabled', value } as never)
  return result && 'deny' in result && result.deny !== undefined ? String(result.deny) : null
}

/** /allowlist on|off|hide|show: off is the option, in every conversation; hide is a stored flag. */
const runSwitch = async ($: EngineInterface, choice: Switch): Promise<{ text?: string }> => {
  const s = switchWords(lang, COMMAND)
  if (choice === 'on' || choice === 'off') {
    const want = choice === 'on'
    if (want === isOn) return { text: want ? s.alreadyOn : s.alreadyOff }
    const deny = await setEnabled($, want)
    return { text: deny ? s.denied(deny) : want ? s.on : s.off }
  }
  isHidden = choice === 'hide'
  await $.store.set(KEY_HIDDEN, isHidden)
  return { text: isHidden ? s.hidden : s.shown }
}

/** /allowlist and its arguments: what the command answers, and what the pane's verbs run. */
const runCommand = async ($: EngineInterface, args: string): Promise<{ text?: string }> => {
  const w = WORDS[lang]
  const [verb = '', ...rest] = args.trim().split(/\s+/)
  const arg = rest.join(' ')
  if (verb.toLowerCase() === 'demo') return arg.toLowerCase() === 'off' ? stopDemo($) : startDemo($)
  const choice = switchOf(args)
  if (choice) return runSwitch($, choice)
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
      if (await openPane($)) return {}
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
    { verb: 'demo' },
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
  isOn = options.enabled !== false
  isQuiet = options.quiet === true

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = langOf(options.language, await $.env.get('LANG').catch(() => undefined))
    await $.command.register({
      name: COMMAND,
      description: WORDS[lang].description,
      argumentHint: '[on|off|hide|show|allow <n>|dismiss <n>|remove <n>|reset [<n>]|demo [off]|help]',
      immediate: true,
    })
    isHidden = (await $.store.get(KEY_HIDDEN).catch(() => undefined)) === true
    if (!isOn) return result
    root = await $.session.root()
    const stored = (await $.store.get(storeKey())) as Record<string, Entry> | undefined
    await update($, entries, () => stored ?? {})
    await refresh($)
    return result
  })

  on('command.run', { command: COMMAND }, ($, e) => runCommand($, e.args))

  // Off: only the command above answers, so `/allowlist on` can bring the rest back.
  if (!isOn) return

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    if (!id || isDemo) return next(e)
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
      if (!isHidden && !isQuiet) $.ui.toast(WORDS[lang].offered(key, entry.approved), { timeoutMs: 10000 })
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
      const rules = rulesFor(e.tool_name, e.tool_input, e.permission_suggestions)
      // A call that carries a credential is left uncounted, so it is never stored.
      if (holdsSecret(call.input) || rules.some(holdsSecret)) break
      call.rules = rules
      const text = noticeFor((await read($, entries))[keyOf(call.rules)], await read($, configured), lang)
      if (text && !isHidden && !isQuiet) {
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
    const toast = (text: Promise<string>) => text.then(t => (t ? $.ui.toast(t) : undefined))
    const count = (t: Tab) => (t === 'all' ? rows.length : rows.filter(r => r.status === t).length)

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        {isDemo && <Text color="warning">{w.demo.banner}</Text>}
        <Text dimColor>{w.hint(root || '.', thresholdNow())}</Text>
        {rows.length === 0 && (
          <Box flexDirection="column">
            <Text dimColor>{w.empty}</Text>
            <Box flexDirection="row" gap={1}>
              <Text dimColor>{w.demo.invite}</Text>
              <Button key="demo:see" {...PRIMARY} hover={hoverFill('demo:see')} label={w.demo.see} onPress={() => toast(startDemo($).then(r => r.text ?? ''))} />
            </Box>
          </Box>
        )}
        {rows.length > 0 && (
          <Box flexDirection="column">
            <Box flexDirection="row" flexWrap="wrap" gap={2}>
              {TABS.map(t => (
                <Button key={`tab:${t}`} plain dimColor={t !== picked} hover={hoverLink(`tab:${t}`)} label={`${t === picked ? '▸ ' : ''}${w.tabs[t]} ${count(t)}`} onPress={() => pickTab(t)} />
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
                        {fig({ Text }, `✓${String(r.entry.approved).padStart(3)} `, 'ok')}
                        {fig({ Text }, `✗${String(r.entry.denied).padStart(3)}`, r.entry.denied > 0 ? 'warn' : 'ok')}
                      </Text>
                    )}
                    <Text wrap="truncate-end">{r.key}</Text>
                    {risk && <Text color="warning" wrap="truncate-end">{`(${w.risk(risk)})`}</Text>}
                    {r.status === 'ready' && <Button key={`allow-${r.n}`} label={w.allow} {...PRIMARY} hover={hoverFill(`allow-${r.n}`)} onPress={() => toast(allow($, r.key))} />}
                  </Box>
                  <Box flexDirection="row" gap={2}>
                    <Text dimColor wrap="truncate-end">{`   ${clip(w.example(r.entry.example, w.ago(now - r.entry.lastAt)), Math.max(20, width - 44))}`}</Text>
                    {canDismiss && <Button key={`dismiss-${r.n}`} label={w.dismiss} {...SECONDARY} hover={hoverFill(`dismiss-${r.n}`)} onPress={() => toast(dismiss($, r.key))} />}
                    {hasCounts && <Button key={`zero-${r.n}`} label={w.resetCount} {...SECONDARY} hover={hoverFill(`zero-${r.n}`)} onPress={() => toast(zeroOne($, r.key))} />}
                    {r.entry.state === 'added' && <Button key={`remove-${r.n}`} label={w.remove} {...SECONDARY} hover={hoverFill(`remove-${r.n}`)} onPress={() => toast(remove($, r.key))} />}
                  </Box>
                </Box>
              )
            })}
            {found.length > listRows && (
              <Box flexDirection="row" gap={2}>
                <Button key="list:up" plain dimColor={view.start === 0} hover={hoverLink('list:up')} label={w.up} onPress={() => scrollList(-listRows + 1)} />
                <Button key="list:down" plain dimColor={view.end === found.length} hover={hoverLink('list:down')} label={w.down} onPress={() => scrollList(listRows - 1)} />
                <Text dimColor>{w.range(view.start + 1, view.end, found.length)}</Text>
              </Box>
            )}
          </Box>
        )}
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {verbRow({ Box, Text, Button }, COMMAND, verbs(lang), v => pressVerb($, v))}
          {isDemo && <Button key="demo:exit" {...SECONDARY} hover={hoverFill('demo:exit')} label={w.demo.exit} onPress={() => toast(stopDemo($).then(r => r.text ?? ''))} />}
          <Button key="close" role="dismiss" {...SECONDARY} hover={hoverFill('close')} label={w.close} onPress={() => (isDemo ? stopDemo($).then(() => $.ui.close({ id: PANE })) : $.ui.close({ id: PANE }))} />
        </Box>
      </Box>
    )
  })
}
