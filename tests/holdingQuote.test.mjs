import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { URL } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

function harness() {
  const calls = []
  const exports = {}
  const quote = { currentPrice: 20000, previousClose: 19900, currency: 'KRW' }
  const quotes = {
    getDomesticQuote: async symbol => { calls.push(['quote', symbol]); return quote },
    getDomesticStockInfo: async symbol => { calls.push(['info', symbol]); return { name: 'Mock stock name' } },
    getOverseasQuote: async holding => { calls.push(['overseas', holding.symbol, holding.exchange]); return { ...quote, currency: 'USD' } },
    getOverseasProductName: async () => 'Mock US name',
  }
  const code = ts.transpileModule(readFileSync(new URL('../api/holding-quote.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, {
    exports, require: () => quotes,
    process: { env: { KIS_APP_KEY: 'test-only', KIS_APP_SECRET: 'test-only' } },
    console: { info() {}, warn() {} }, setTimeout: callback => callback(),
  })
  return { calls, async request(holding) {
    let status
    let body
    const response = { setHeader() {}, status(value) { status = value; return this }, json(value) { body = value } }
    await exports.default({ method: 'POST', body: { holding } }, response)
    return { status, body }
  } }
}

test('domestic registration accepts numeric and alphanumeric six-character codes', async () => {
  for (const input of ['0167A0', ' 0167a0 ', '005930', '000660']) {
    const h = harness()
    const symbol = input.trim().toUpperCase()
    const result = await h.request({ market: 'KR', symbol: input })
    assert.equal(result.status, 200)
    assert.equal(result.body.symbol, symbol)
    assert.equal(result.body.currency, 'KRW')
    assert.equal(result.body.name, 'Mock stock name')
    assert.deepEqual(h.calls, [['quote', symbol], ['info', symbol]])
  }
})

test('malformed domestic codes are rejected before any KIS lookup', async () => {
  for (const symbol of ['', '00593', '0059300', '0167-0', '0167 A', '삼성전자']) {
    const h = harness()
    const result = await h.request({ market: 'KR', symbol })
    assert.equal(result.status, 422)
    assert.equal(result.body.stage, 'invalid_symbol')
    assert.equal(h.calls.length, 0)
  }
})

test('US registration retains existing symbol normalization and exchange validation', async () => {
  const h = harness()
  assert.equal((await h.request({ market: 'US', symbol: 'aapl', exchange: 'NASDAQ' })).status, 200)
  assert.deepEqual(h.calls, [['overseas', 'AAPL', 'NASDAQ']])
  assert.equal((await h.request({ market: 'US', symbol: 'AAPL', exchange: 'INVALID' })).status, 422)
  assert.equal(h.calls.length, 1)
})
