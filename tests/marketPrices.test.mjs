import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { URL } from 'node:url'
import { setImmediate } from 'node:timers'

function load(file, imports = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, { exports, require: name => imports[name], ...globals })
  return exports
}
const pair = load('../src/utils/quotePair.ts')
const priceKey = h => `${h.market}:${h.exchange ?? ''}:${h.symbol}`
const helpers = load('../src/utils/marketSnapshot.ts', { '../services/priceService': { priceKey }, './quotePair': pair })
const holding = { id: 'h', market: 'KR', symbol: '000660', currency: 'KRW', quantity: 3, currentPrice: 1840000, previousClose: 18690000 }
const live = { currentPrice: 1788000, previousClose: 1841000, currency: 'KRW', status: 'live', updatedAt: '2026-10-06T01:00:00Z' }
const snapshot = prices => ({ prices, exchangeRates: {}, updatedAt: '2026-10-06T01:00:00Z' })

test('A-D: initial DB fallback -> live -> omitted/failed quote retains runtime pair', () => {
  assert.equal(helpers.hydrateMarketHolding(holding, null).previousClose, 18690000)
  let state = helpers.mergePriceSnapshot(null, snapshot({ 'KR::000660': live }))
  assert.equal(helpers.hydrateMarketHolding(holding, state).previousClose, 1841000)
  state = helpers.mergePriceSnapshot(state, { ...snapshot({}), partial: true, failures: [{ symbol: '000660' }] })
  const retained = helpers.hydrateMarketHolding(holding, state)
  assert.equal(retained.currentPrice, 1788000)
  assert.equal(retained.previousClose, 1841000)
  assert.equal(retained.priceStatus, 'cached')
})

test('E-F: incomplete, zero, nonfinite or invalid currency quotes cannot replace pair', () => {
  const previous = snapshot({ 'KR::000660': live })
  for (const bad of [{ currentPrice: 2000000 }, { previousClose: 1800000 }, { ...live, currentPrice: Infinity }, { ...live, previousClose: 0 }, { ...live, currency: 'EUR' }]) {
    assert.equal(pair.isCompleteQuote(bad), false)
    const state = helpers.mergePriceSnapshot(previous, snapshot({ 'KR::000660': bad }))
    assert.equal(state.prices['KR::000660'].previousClose, 1841000)
    const initial = helpers.hydrateMarketHolding(holding, snapshot({ 'KR::000660': bad }))
    assert.equal(initial.currentPrice, holding.currentPrice)
    assert.equal(initial.previousClose, holding.previousClose)
  }
})

test('G: detail selection resolves latest row by ID and closes when row disappears', () => {
  const id = holding.id
  const first = helpers.findSelectedHolding([holding], id)
  const refreshed = { ...holding, ...live }
  assert.notEqual(helpers.findSelectedHolding([refreshed], id), first)
  assert.equal(helpers.findSelectedHolding([refreshed], id).previousClose, 1841000)
  assert.equal(helpers.findSelectedHolding([], id), null)
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /findSelectedHolding\(items, selectedHoldingId\)/)
  assert.match(app, /if \(selectedHoldingId && !selected\) setSelectedHoldingId\(null\)/)
})

test('H: actual hook keeps timer, visibility, manual cooldown and prevents overlapping requests', async () => {
  const slots = []; let cursor = 0; const effects = []
  const react = {
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial } },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect: fn => effects.push(fn),
  }
  const storage = new Map(); const stored = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) }
  const document = { visibilityState: 'hidden', addEventListener: (name,fn) => { document[name] = fn }, removeEventListener: name => { delete document[name] } }
  let interval; let duration; let cleared = false; let calls = 0; let finish
  const service = { getPortfolioPrices: async () => { calls++; return new Promise(resolve => { finish = resolve }) } }
  const window = { setInterval: (fn,ms) => { interval = fn; duration = ms; return 1 }, clearInterval: () => { cleared = true } }
  const hook = load('../src/hooks/useMarketPrices.ts', { react, '../services/priceService': service, '../utils/marketSnapshot': helpers, '../utils/quotePair': pair }, { document, window, localStorage: stored, sessionStorage: stored })
  const render = () => { cursor = 0; return hook.useMarketPrices([holding]) }
  let result = render(); const cleanup = effects[0]()
  assert.equal(duration, 300000); assert.equal(calls, 0)
  document.visibilityState = 'visible'; document.visibilitychange()
  assert.equal(calls, 1)
  await result.refresh('auto'); assert.equal(calls, 1)
  finish(snapshot({ 'KR::000660': live })); await new Promise(resolve => setImmediate(resolve))
  result = render(); assert.equal(result.holdings[0].previousClose, 1841000)
  document.visibilitychange(); assert.equal(calls, 1)
  const manual = result.refresh(); assert.equal(calls, 2)
  finish({ ...snapshot({}), partial: true }); await manual
  result = render(); assert.equal(result.holdings[0].previousClose, 1841000)
  await result.refresh(); assert.equal(calls, 2)
  document.visibilityState = 'hidden'; interval(); assert.equal(calls, 2)
  document.visibilityState = 'visible'; interval(); assert.equal(calls, 3)
  finish(snapshot({ 'KR::000660': live })); await new Promise(resolve => setImmediate(resolve))
  cleanup(); assert.equal(cleared, true); assert.equal(document.visibilitychange, undefined)
})

test('price pair source yields normal SK Hynix daily P/L, exact cost regression remains independent', () => {
  const amounts = load('../src/utils/exactAmount.ts')
  const portfolio = load('../src/utils/portfolioCalculations.ts', { './exactAmount': amounts })
  const stock = helpers.hydrateMarketHolding({ ...holding, averagePrice: 741766.6666667 }, snapshot({ 'KR::000660': live }))
  const result = portfolio.calculateHoldings([stock], 'all')[0]
  assert.equal(result.dailyProfit, -159000)
  assert.ok(Math.abs(result.dailyRate - (-53000 / 1841000 * 100)) < 1e-10)
  const samsung = portfolio.calculateHoldings([{ ...stock, symbol: '005930', quantity: 126, costBasisExact: '9199374' }], 'all')[0]
  assert.equal(samsung.quantity, 126); assert.equal(samsung.costBasisExact, '9199374')
})

test('server accepts only complete pairs and validates symbol/currency cache before fallback', async () => {
  let fail = false; let malformed = true
  const quotes = { getDomesticQuote: async () => {
    if (fail) throw new Error('mock upstream error')
    return malformed ? { currentPrice: 1788000, currency: 'KRW', status: 'live' } : live
  } }
  const api = load('../api/prices.ts', { './kis/quotes.js': quotes, './kis/exchangeRate.js': { getUsdKrwRate: async () => null }, '../src/utils/quotePair.js': pair }, {
    process: { env: { KIS_APP_KEY: 'test-only', KIS_APP_SECRET: 'test-only' } },
    console: { info() {}, warn() {} }, setTimeout: fn => fn(),
  }).default
  const request = async () => {
    let body; const response = { setHeader() {}, status() { return response }, json(value) { body = value } }
    await api({ method: 'POST', body: { holdings: [{ market: 'KR', symbol: '000660' }] } }, response)
    return body
  }
  assert.equal((await request()).failures.length, 1)
  malformed = false
  assert.equal((await request()).prices['KR::000660'].previousClose, 1841000)
  fail = true
  const cached = await request()
  assert.equal(cached.prices['KR::000660'].symbol, '000660')
  assert.equal(cached.prices['KR::000660'].currentPrice, 1788000)
  assert.equal(cached.prices['KR::000660'].previousClose, 1841000)
  assert.equal(cached.prices['KR::000660'].status, 'cached')
  assert.equal(cached.provider, undefined)
})
