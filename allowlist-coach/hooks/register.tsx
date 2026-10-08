// allowlist-coach: counts permission dialogs per rule and offers the ones you keep approving.
//
//   counting  tool.call opens a record for each call; classic.PermissionRequest marks the ones
//             whose dialog the person answers (a classic hook's own decision, or auto mode,
//             is not the person); classic.PostToolUse(Failure) marks the ones that ran. When
//             the call resolves, an asked call that ran is an approval, one that did not, a
//             refusal. Counts live in $.store per project root, across sessions.
//   dialog    a line under the open dialog: how often this rule was approved here.
//   toast     once, when a rule reaches THRESHOLD approvals with no refusal.
//   /allowlist  pane with every rule, ready ones first, each with allow and dismiss buttons;
//             /allowlist allow <rule> | dismiss <rule> | reset where no pane opens.
//
// It writes one file, .claude/settings.local.json under the project root, and only after the
// person picks "Add" in a dialog. It never offers a rule that is a whole tool, a bare
// wildcard, or a command that deletes, escalates or reaches the network (tally.isRisky), and
// never one the person refused or put under ask or deny.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Configured, Entry } from '../types'
import { addAllow, exampleOf, keyOf, noticeFor, record, rulesFor, setState, SETTINGS_FILE, sorted, stable, status, summary, THRESHOLD, toConfigured } from './tally'

const PANE = 'allowlist'
const ADD = 'Add'
const NOT_NOW = 'Not now'
const NEVER = 'Never offer it'
/** Modes where a dialog is not the person's answer, or is not shown at all. */
const NOT_THE_PERSON = new Set(['auto', 'dontAsk', 'bypassPermissions'])

const entries = atom({ plugin: 'allowlist-coach', key: 'entries' } as const, {} as Record<string, Entry>)
const configured = atom({ plugin: 'allowlist-coach', key: 'configured' } as const, { allow: [], ask: [], deny: [] } as Configured)

type Open = { tool: string; input: string; agentId?: string; rules: string[] | null; ran: boolean; example: string }
const open = new Map<string, Open>()
let root = ''

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
  const entry = (await read($, entries))[key]
  if (!entry) return `allowlist-coach: no rule ${key} counted in this project.`
  const what = entry.rules.join(' and ')
  let answer: string
  try {
    answer = await $.ui.ask(`Add ${what} to permissions.allow in ${SETTINGS_FILE}? You approved it ${entry.approved} times here.`, {
      header: 'allowlist',
      options: [ADD, NOT_NOW, NEVER],
    })
  } catch {
    return 'allowlist-coach: nothing changed.'
  }
  if (answer === NEVER) {
    await save($, list => setState(list, key, 'dismissed'))
    return `allowlist-coach: ${what} will not be offered again.`
  }
  if (answer !== ADD) return 'allowlist-coach: nothing changed.'
  const path = `${root}/${SETTINGS_FILE}`
  try {
    const text = (await $.fs.exists(path)) ? String(await $.fs.read(path)) : ''
    const next = addAllow(text, entry.rules)
    if (next !== null) await $.fs.write(path, next)
  } catch (error) {
    return `allowlist-coach: ${SETTINGS_FILE} left as it was: ${error instanceof Error ? error.message : String(error)}`
  }
  await save($, list => setState(list, key, 'added'))
  await refresh($)
  return `allowlist-coach: added ${what} to permissions.allow in ${SETTINGS_FILE}.`
}

const dismiss = async ($: EngineInterface, key: string) => {
  if (!(await read($, entries))[key]) return `allowlist-coach: no rule ${key} counted in this project.`
  await save($, list => setState(list, key, 'dismissed'))
  return `allowlist-coach: ${key} will not be offered again.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'allowlist',
      description: 'Permission dialogs per rule: /allowlist opens the pane; /allowlist allow <rule> | dismiss <rule> | reset',
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
    await save($, list => record(list, call.rules!, call.ran, call.example, Date.now()))
    await refresh($)
    const entry = (await read($, entries))[key]!
    if (before !== 'ready' && entry.state === 'counting' && status(entry, await read($, configured)) === 'ready') {
      await save($, list => setState(list, key, 'offered'))
      $.ui.toast(`You approved ${key} ${entry.approved} times here. /allowlist to add it to permissions.allow.`, { timeoutMs: 10000 })
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
      const text = noticeFor((await read($, entries))[keyOf(call.rules)], await read($, configured))
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

  on('command.run', { command: 'allowlist' }, async ($, e) => {
    const args = e.args.trim()
    const [verb = '', ...rest] = args.split(/\s+/)
    const key = args.slice(verb.length).trim()
    if (verb === 'allow' && rest.length > 0) return { text: await allow($, key) }
    if (verb === 'dismiss' && rest.length > 0) return { text: await dismiss($, key) }
    if (verb === 'reset') {
      await save($, () => ({}))
      return { text: 'Counts for this project cleared.' }
    }
    await refresh($)
    const opened = await $.ui.open({ id: PANE, title: 'Allowlist coach', focus: true, closeOnEscape: true }).catch(() => null)
    if (opened?.isPlaced) return {}
    return { text: summary(await read($, entries), await read($, configured)) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const rows = sorted(await read($, entries), await read($, configured))
    const room = Math.max(3, (e.viewport?.rows ?? 30) - 8)
    const ready = rows.filter(r => r.status === 'ready')
    const rest = rows.filter(r => r.status !== 'ready')

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Text dimColor>{`Permission dialogs answered in ${root || 'this project'}. A rule is offered after ${THRESHOLD} approvals and no refusal.`}</Text>
        {rows.length === 0 && <Text dimColor>No dialogs answered yet.</Text>}
        {ready.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Ready to allow</Text>
            {ready.map((r, i) => (
              <Box key={`ready-${i}`} flexDirection="row" gap={1}>
                <Text color="green">{`✓${String(r.entry.approved).padStart(3)}`}</Text>
                <Text wrap="truncate-end">{r.key}</Text>
                <Button key={`allow-${i}`} label="allow" onPress={() => allow($, r.key).then(text => $.ui.toast(text))} />
                <Button key={`dismiss-${i}`} label="dismiss" plain onPress={() => dismiss($, r.key).then(text => $.ui.toast(text))} />
              </Box>
            ))}
          </Box>
        )}
        {rest.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Counted</Text>
            {rest.slice(0, room).map((r, i) => (
              <Text key={`row-${i}`} wrap="truncate-end">
                <Text dimColor>{r.status.padEnd(10)}</Text>
                <Text>{`✓${String(r.entry.approved).padStart(3)} `}</Text>
                <Text color={r.entry.denied > 0 ? 'yellow' : undefined}>{`✗${String(r.entry.denied).padStart(3)}  `}</Text>
                <Text>{r.key}</Text>
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
