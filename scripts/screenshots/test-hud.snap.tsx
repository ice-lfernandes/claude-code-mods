import { mock, test } from 'claude-code/testing'
const NOW = Date.parse('2026-10-08T12:00:00Z')
const mvn = (failing: string[], total = 43) =>
  [
    '[ERROR] Failures: ',
    ...failing.map(f => `[ERROR]   ${f} expected: <true> but was: <false>`),
    '[INFO] ',
    `[ERROR] Tests run: ${total}, Failures: ${failing.length}, Errors: 0, Skipped: 1`,
    `[INFO] BUILD ${failing.length ? 'FAILURE' : 'SUCCESS'}`,
  ].join('\n')
test('snap', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', (_$, e: any) => (console.log('TOAST', e.text), { value: undefined }) as never)
  on('ui.status', (_$, e: any) => (console.log('STATUS', e.text), { value: undefined }) as never)
  let out = ''
  on('tool.call', (async () => {
    await clock.advance(38_000)
    return out.includes('FAILURE') ? { result: undefined, text: `Exit code 1\n${out}`, isError: true } : { result: { stdout: out, stderr: '', interrupted: false }, text: out }
  }) as never)
  const rounds = [
    ['OrderServiceTest.placesOrder:41', 'OrderServiceTest.rejectsEmptyCart:58', 'PricingTest.appliesCoupon:22', 'PricingTest.roundsHalfUp:35', 'InvoiceTest.totals:19'],
    ['OrderServiceTest.placesOrder:41', 'PricingTest.appliesCoupon:22', 'PricingTest.roundsHalfUp:35'],
    ['PricingTest.roundsHalfUp:35', 'InventoryTest.reservesStock:73'],
  ]
  for (const failing of rounds) {
    out = mvn(failing)
    await $.tool.call({ tool: 'Bash', command: './mvnw test', tool_use_id: 'x' } as never)
    await clock.advance(120_000)
  }
  const pane = await $.ui.mount({ plugin: 'test-hud', surface: 'terminal', component: 'Pane', requestId: 'test-hud', props: { title: 'Tests', isFocused: false, bodyColumns: 84, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }, viewport: { columns: 86, rows: 40 } } as never)
  console.log('PANE', JSON.stringify(await pane.drawn()))
  out = mvn([])
  await $.tool.call({ tool: 'Bash', command: './mvnw test', tool_use_id: 'x' } as never)
})
