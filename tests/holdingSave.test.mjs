import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { URL } from 'node:url'
import console from 'node:console'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, imports = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, { exports, require: name => imports[name], console, alert: () => {}, ...globals })
  return exports
}
const merge = load('../src/utils/holdingMerge.ts')
const base = { id: 'original', user_id: 'current-user', market: 'KR', symbol: '000660', category: 'investment',
  name: 'SK하이닉스', exchange: null, currency: 'KRW', display_name: null,
  quantity: 1, average_price: 1869000, current_price: 100000, previous_close: 99000 }
const added = { id: 'new', market: 'KR', symbol: '000660', category: 'investment', name: 'SK하이닉스',
  quantity: 3, averagePrice: 80000, currency: 'KRW', currentPrice: 110000, previousClose: 100000 }

function harness({ rows = [base], history = [], lookupError = null, historyError = null, writeError = null } = {}) {
  let state = []
  const calls = []
  const alerts = []
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'current-user' } } }) }, from(table) {
    const call = { table, filters: [], action: 'select' }
    calls.push(call)
    const query = {
      select() { return this }, eq(key, value) { call.filters.push([key, value]); return this },
      or(value) { call.or = value; return this },
      update(row) { call.action = 'update'; call.row = row; return this },
      insert(row) { call.action = 'insert'; call.row = row; return this },
      async single() { return { data: writeError ? null : call.row, error: writeError } },
      then(resolve, reject) { return Promise.resolve(table === 'portfolio_holdings'
        ? { data: rows, error: lookupError } : { data: history, error: historyError }).then(resolve, reject) },
    }
    return query
  } }
  const react = { useEffect() {}, useRef: () => ({ current: false }), useState: () => [state, next => { state = typeof next === 'function' ? next(state) : next }] }
  const hook = load('../src/hooks/usePortfolio.ts', { react, '../lib/supabaseClient': { supabase }, '../utils/holdingMerge': merge }, { alert: message => alerts.push(message) }).usePortfolio()
  return { hook, calls, alerts, state: () => state }
}

test('weighted merge preserves cost and quantity, including decimal inputs', () => {
  const result = merge.mergeHoldingPosition({ quantity: 1, averagePrice: 1869000 }, added)
  assert.equal(result.quantity, 4)
  assert.equal(result.averagePrice, 527250)
  const decimal = merge.mergeHoldingPosition({ quantity: 0.1, averagePrice: 0.1 }, { quantity: 0.2, averagePrice: 0.1 })
  assert.equal(decimal.quantity, 0.3)
  assert.equal(decimal.averagePrice, 0.1)
})
test('same identity updates canonical id instead of inserting and reflects server row', async () => {
  const h = harness()
  assert.equal(await h.hook.save(added, 'add'), true)
  const write = h.calls.find(c => c.action === 'update')
  assert.equal(write.row.id, 'original')
  assert.equal(write.row.quantity, 4)
  assert.equal(write.row.average_price, 527250)
  assert.ok(h.calls[0].filters.some(([key, value]) => key === 'user_id' && value === 'current-user'))
  assert.equal(h.calls.some(c => c.action === 'insert'), false)
  assert.equal(h.state()[0].quantity, 4)
})
test('different purpose inserts with purpose-scoped lookup', async () => {
  const h = harness({ rows: [] })
  assert.equal(await h.hook.save({ ...added, category: 'pension' }, 'add'), true)
  assert.ok(h.calls[0].filters.some(([key, value]) => key === 'category' && value === 'pension'))
  assert.equal(h.calls.find(c => c.action === 'insert').row.category, 'pension')
})
test('US lookup separates exchanges and tolerates legacy default NASDAQ', async () => {
  for (const exchange of ['NASDAQ', 'NYSE', 'AMEX']) {
    const h = harness({ rows: [] })
    assert.equal(await h.hook.save({ ...added, market: 'US', symbol: 'AAPL', exchange, currency: 'USD' }, 'add'), true)
    if (exchange === 'NASDAQ') assert.equal(h.calls[0].or, 'exchange.eq.NASDAQ,exchange.is.null')
    else assert.ok(h.calls[0].filters.some(([key, value]) => key === 'exchange' && value === exchange))
  }
})
test('query errors, existing duplicates, history and failed updates never fall back to INSERT', async () => {
  for (const options of [ { lookupError: {} }, { rows: [base, { ...base, id: 'duplicate' }] },
    { historyError: {} }, { history: [{ holding_id: 'original' }] },
    { history: [{ holding_id: null, market: 'KR', symbol: '000660', category: 'investment' }] }, { writeError: {} } ]) {
    const h = harness(options)
    assert.equal(await h.hook.save(added, 'add'), false)
    assert.equal(h.calls.some(c => c.action === 'insert'), false)
    assert.equal(h.calls.some(c => c.table === 'portfolio_transactions' && c.action !== 'select'), false)
  }
})
test('editing remains replacement, not an additive merge', async () => {
  const h = harness()
  assert.equal(await h.hook.save({ ...added, id: 'original' }, 'edit'), true)
  assert.equal(h.calls.find(c => c.action === 'update').row.quantity, 3)
})
test('in-instance simultaneous saves are not duplicated', async () => {
  const h = harness()
  const results = await Promise.all([h.hook.save(added, 'add'), h.hook.save(added, 'add')])
  assert.equal(results.filter(Boolean).length, 1)
  assert.equal(h.calls.filter(c => c.action === 'update').length, 1)
})

test('concurrent initial INSERT loser handles 23505 without retry, merge or phantom state', async () => {
  const winner = harness({ rows: [] })
  const loser = harness({ rows: [], writeError: { code: '23505' } })
  assert.deepEqual(await Promise.all([winner.hook.save(added, 'add'), loser.hook.save(added, 'add')]), [true, false])
  assert.equal(winner.state().length, 1)
  assert.equal(loser.state().length, 0)
  assert.equal(loser.calls.filter(call => call.action === 'insert').length, 1)
  assert.equal(loser.calls.some(call => call.action === 'update'), false)
  assert.match(loser.alerts[0], /먼저 등록/)
})

test('unique violation on edit also stops safely and never INSERTs', async () => {
  const h = harness({ writeError: { code: '23505' } })
  assert.equal(await h.hook.save({ ...added, id: 'original' }, 'edit'), false)
  assert.equal(h.calls.some(call => call.action === 'insert'), false)
  assert.equal(h.state().length, 0)
  assert.match(h.alerts[0], /저장을 중단/)
})
