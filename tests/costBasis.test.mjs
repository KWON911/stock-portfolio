import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { URL } from 'node:url'
import console from 'node:console'
import { setImmediate } from 'node:timers'

function load(file, imports = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, { exports, require: name => imports[name], console })
  return exports
}
const amounts = load('../src/utils/exactAmount.ts')
const { exact } = amounts
const calc = load('../src/utils/transactionCalculations.ts', { './exactAmount': amounts })
const portfolio = load('../src/utils/portfolioCalculations.ts', { './exactAmount': amounts })
const policy = load('../src/utils/openingCostPolicy.ts')
const tx = (type, quantity, price, fields = {}) => ({ id: `${type}-${quantity}`, holdingId: 'h', market: 'KR',
  symbol: '005930', name: '삼성전자', category: 'allowance', currency: 'KRW', type,
  date: type === 'opening' ? '2026-01-01' : type === 'buy' ? '2026-01-02' : '2026-01-03',
  createdAt: '2026-01-01', quantity, price, ...fields })
const opening = tx('opening', 126, 73010.9047619048, { openingCostBasis: '9199374' })
const position = transactions => calc.calculatePositionFromTransactions(transactions)
const holding = (transactions, fields = {}) => {
  const p = position(transactions)
  return { id: 'h', symbol: '005930', name: '삼성전자', market: 'KR', category: 'allowance', currency: 'KRW',
    quantity: p.quantity, averagePrice: p.averagePrice, currentPrice: 80000, previousClose: 79000,
    transactionPosition: p, ...fields }
}

test('A: Samsung authoritative opening cost survives rounded price and JSON round trip', () => {
  const p = position(JSON.parse(JSON.stringify([opening])))
  assert.equal(p.quantity, 126)
  assert.equal(p.costBasis, 9199374)
  assert.equal(p.costBasisExact, '9199374')
  assert.equal(p.averagePrice, 9199374 / 126)
  assert.equal(p.openingAmount, 9199374)
  assert.equal(p.totalBuyQuantity, 0)
  const item = portfolio.calculateHoldings([holding([opening])], 'allowance')[0]
  assert.equal(item.invested, 9199374)
  assert.equal(item.profit, 126 * 80000 - 9199374)
  assert.equal(portfolio.totals([item]).invested, 9199374)
  assert.equal(new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(p.averagePrice), '73,011')
})
test('B/G: legacy null opening and SK Hynix buy retain quantity, basis and statistics', () => {
  const p = position([tx('opening', 1, 1869000, { openingCostBasis: null }), tx('buy', 2, 178150)])
  assert.equal(p.quantity, 3)
  assert.equal(p.costBasis, 2225300)
  assert.equal(p.averagePrice, 2225300 / 3)
  assert.equal(p.openingAmount, 1869000)
  assert.equal(p.totalBuyQuantity, 2)
  assert.equal(p.totalBuyAmount, 356300)
  assert.equal(p.realizedProfit, 0)
})
test('C: buy adds to authoritative cost rather than multiplying derived average', () => {
  const p = position([opening, tx('buy', 10, 80000, { fee: 100 })])
  assert.equal(p.quantity, 136)
  assert.equal(p.costBasis, 9999474)
  assert.equal(p.averagePrice, 9999474 / 136)
  assert.equal(p.totalBuyAmount, 800100)
})
test('D: partial sell allocates exact rational basis and agrees with ledger P/L', () => {
  const sell = tx('sell', 1, 90000, { fee: 100, tax: 200 })
  const p = position([opening, sell])
  const sold = exact(9199374).div(126)
  assert.equal(p.quantity, 125)
  assert.equal(p.costBasisExact, exact(9199374).sub(sold).toString())
  assert.equal(exact(p.costBasisExact).add(sold).toString(), '9199374')
  assert.equal(p.realizedProfitExact, exact(89700).sub(sold).toString())
  assert.equal(calc.calculateSaleResults([opening, sell]).get(sell.id).profit, p.realizedProfit)
})
test('E: repeated partial sells then full close leave no lost rounding residual', () => {
  const transactions = [opening, ...Array.from({ length: 126 }, (_, i) => tx('sell', 1, 80000, { id: `sell-${i}`, createdAt: String(i).padStart(3, '0') }))]
  const p = position(transactions)
  assert.equal(p.quantity, 0)
  assert.equal(p.costBasis, 0)
  assert.equal(p.costBasisExact, '0')
  assert.equal(p.averagePrice, 0)
  assert.equal(p.realizedProfitExact, String(126 * 80000 - 9199374))
})
test('F: aggregate sums exact bases, including legacy holdings; no first-position inheritance', () => {
  const first = holding([opening])
  const second = { ...first, id: 'other', category: 'investment', quantity: 3, averagePrice: 0.1, transactionPosition: undefined }
  const combined = portfolio.combineHoldings([first, second], 'all')[0]
  assert.equal(combined.quantity, 129)
  assert.equal(combined.costBasisExact, exact(9199374).add('0.3').toString())
  assert.equal(combined.averagePrice, exact(combined.costBasisExact).div(129).toNumber())
  assert.equal(combined.transactionPosition, undefined)
  assert.equal(combined.transactionPositions.allowance.costBasis, 9199374)
  assert.equal(portfolio.calculateHoldings([first, second], 'all')[0].investedExact, combined.costBasisExact)
  assert.equal(portfolio.calculateHoldings([second], 'investment')[0].costBasisExact, '3/10')
})
test('USD decimal cost/fees and historical FX are exact; valuation still uses current FX', () => {
  const history = [tx('opening', 3, 0.1, { currency: 'USD', openingCostBasis: '0.3', fxRate: 1300 }),
    tx('buy', 1, 0.2, { currency: 'USD', fee: 0.01, fxRate: 1400 }),
    tx('sell', 1, 0.4, { currency: 'USD', fee: 0.01, tax: 0.02, fxRate: 1500 })]
  const p = position(history)
  assert.equal(p.quantity, 3)
  assert.equal(p.costBasisExact, '153/400')
  assert.equal(p.realizedProfitExact, '97/400')
  assert.equal(p.costBasisKrwExact, '513')
  assert.equal(p.realizedProfitKrw, 384)
  const item = portfolio.calculateHoldings([holding(history, { currency: 'USD', market: 'US', currentPrice: 0.4 })], 'allowance', 1600)[0]
  assert.equal(item.invested, 612)
  assert.equal(item.value, 1920)
  assert.equal(item.profit, 1308)
  const legacy = position(history.map(t => ({ ...t, openingCostBasis: undefined })))
  assert.equal(legacy.costBasisExact, p.costBasisExact)
  const missingFx = position(history.map(t => ({ ...t, fxRate: undefined })))
  assert.equal(missingFx.costBasisKrw, undefined)
  assert.equal(missingFx.realizedProfitKrw, undefined)
})
test('opening fee is never a cost correction, zero authoritative cost is not treated as absent', () => {
  assert.equal(position([{ ...opening, fee: 1234 }]).costBasis, 9199374)
  assert.equal(position([{ ...opening, openingCostBasis: '0' }]).costBasis, 0)
})
test('fractional quantity validation and replay do not accumulate binary quantity errors', () => {
  const history = [tx('opening', 0.3, 0.1, { openingCostBasis: '0.03' }), tx('sell', 0.1, 0.2),
    tx('sell', 0.2, 0.2, { id: 'final' })]
  assert.equal(calc.validateTransactionSequence(history), null)
  const p = position(history)
  assert.equal(p.quantity, 0)
  assert.equal(p.costBasisExact, '0')
  assert.equal(p.realizedProfitExact, '3/100')
})
test('ledger projection through applyTransactionsToHoldings preserves authoritative basis', () => {
  const legacy = { ...holding([opening]), quantity: 93, averagePrice: 75400, transactionPosition: undefined }
  const applied = calc.applyTransactionsToHoldings([legacy], [opening])
  assert.equal(applied[0].quantity, 126)
  assert.equal(applied[0].costBasisExact, '9199374')
  assert.equal(portfolio.calculateHoldings(applied, 'all')[0].invested, 9199374)
  assert.equal(legacy.quantity, 93)
  const summary = calc.realizedProfitSummary([opening, tx('sell', 126, 80000)])
  assert.equal(summary.krw, 880626)
})
test('invalid opening costs are rejected, never accepted for buy/sell', () => {
  for (const value of ['-1', 'NaN', 'Infinity', '1/3', 'oops']) {
    assert.ok(calc.validateTransactionSequence([{ ...opening, openingCostBasis: value }]))
  }
  assert.ok(calc.validateTransactionSequence([tx('buy', 1, 1, { openingCostBasis: '1' })]))
})
test('form policy preserves date/FX edits and clears exact cost for position or identity edits', () => {
  assert.equal(policy.preserveOpeningCost(opening, { ...opening, date: '2026-02-01', fxRate: 1350 }).openingCostBasis, '9199374')
  for (const edit of [{ quantity: 125 }, { price: 70000 }, { holdingId: 'other' }, { symbol: '000660' }, { currency: 'USD' }]) {
    assert.equal(policy.preserveOpeningCost(opening, { ...opening, ...edit }).openingCostBasis, undefined)
  }
})
test('exact module keeps decimal addition, scientific notation and non-terminating allocation', () => {
  assert.equal(exact(0.1).add(0.2).toString(), '3/10')
  assert.equal(exact('1e-7').toString(), '1/10000000')
  assert.equal(exact('9007199254740993.123456789').toString(), '9007199254740993123456789/1000000000')
  assert.equal(exact(1).div(3).mul(3).toString(), '1')
  assert.throws(() => exact(1).div(0))
})

test('DB read/write mapping keeps decimal text, omitted field and intentional NULL distinct', async () => {
  let state = [], loadEffect
  const writes = [], selects = []
  const row = { id: opening.id, user_id: 'user', holding_id: 'h', market: 'KR', symbol: '005930', name: '삼성전자',
    category: 'allowance', transaction_type: 'opening', transaction_date: '2026-01-01', quantity: 126,
    price: opening.price, opening_cost_basis: '9199374', currency: 'KRW', created_at: '2026-01-01' }
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    from: () => ({
      select(text) { selects.push(text); return this }, order() { return this },
      then(resolve) { return Promise.resolve({ data: [row], error: null }).then(resolve) },
      async upsert(payload) { writes.push(payload); return { error: null } },
    }),
  }
  const hooks = load('../src/hooks/useTransactions.ts', {
    react: { useState: () => [state, value => { state = value }], useEffect: fn => { loadEffect ??= fn } },
    '../lib/supabaseClient': { supabase }, '../utils/transactionCalculations': calc,
    '../utils/openingCostPolicy': policy,
  })
  hooks.useTransactions()
  loadEffect()
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(selects[0].includes('opening_cost_basis::text'))
  assert.equal(state[0].openingCostBasis, '9199374')
  const { openingCostBasis: omitted, ...oldCaller } = state[0]
  assert.equal(omitted, '9199374')
  assert.equal(await hooks.useTransactions().save({ ...oldCaller, date: '2026-01-02' }), null)
  assert.equal(writes[0].opening_cost_basis, '9199374')
  assert.equal(await hooks.useTransactions().save({ ...state[0], quantity: 125, openingCostBasis: undefined }), null)
  assert.equal(writes[1].opening_cost_basis, null)
  const usd = hooks.transactionFromRow({ ...row, currency: 'USD', opening_cost_basis: '123456789.123456789' })
  assert.equal(usd.openingCostBasis, '123456789.123456789')
})
