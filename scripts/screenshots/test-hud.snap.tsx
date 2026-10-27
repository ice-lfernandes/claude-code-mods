import { mock, test } from 'claude-code/testing'
const NOW = Date.parse('2026-10-08T12:00:00Z')
const vitest = (failing: string[], total = 43) =>
  [
    ...failing.map(f => ` FAIL  ${f}`),
    '',
    failing.length ? `      Tests  ${failing.length} failed | ${total - failing.length} passed | 1 skipped (${total + 1})` : `      Tests  ${total} passed | 1 skipped (${total + 1})`,
  ].join('\n')
test('snap', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', (_$, e: any) => (console.log('TOAST', e.text), { value: undefined }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  // The engine's own hint line, beneath the mod's tests line.
  on('ui.render', () => ({ type: 'Text', props: { dimColor: true }, children: ['? for shortcuts'] }) as never)
  const hint = async () => {
    const h = await $.ui.mount({ plugin: 'test-hud', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' }, viewport: { columns: 86, rows: 40 } } as never)
    console.log('TREE', JSON.stringify(await h.drawn()))
    await h.unmount()
  }
  let out = ''
  const durations = [44_000, 38_000, 35_000, 33_000]
  let i = 0
  on('tool.call', (async () => {
    await clock.advance(durations[i++]!)
    return out.includes('FAIL ') ? { result: undefined, text: `Exit code 1\n${out}`, isError: true } : { result: { stdout: out, stderr: '', interrupted: false }, text: out }
  }) as never)
  const rounds = [
    ['src/order.test.ts > places an order', 'src/order.test.ts > rejects an empty cart', 'src/pricing.test.ts > applies the coupon', 'src/pricing.test.ts > rounds half up', 'src/invoice.test.ts > totals'],
    ['src/order.test.ts > places an order', 'src/pricing.test.ts > applies the coupon', 'src/pricing.test.ts > rounds half up'],
    // src/invoice.test.ts > totals fails, passes and fails again: flaky.
    ['src/pricing.test.ts > rounds half up', 'src/inventory.test.ts > reserves stock', 'src/invoice.test.ts > totals'],
  ]
  for (const failing of rounds) {
    out = vitest(failing)
    await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'x' } as never)
    await clock.advance(120_000)
  }
  const pane = await $.ui.mount({ plugin: 'test-hud', surface: 'terminal', component: 'Pane', requestId: 'test-hud', props: { title: 'Tests', isFocused: false, bodyColumns: 84, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }, viewport: { columns: 86, rows: 40 } } as never)
  console.log('PANE', JSON.stringify(await pane.drawn()))
  await hint()
  out = vitest([])
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'x' } as never)
  await hint()
})
