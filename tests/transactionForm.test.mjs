import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { URL } from 'node:url'
import { setImmediate } from 'node:timers/promises'
import vm from 'node:vm'
import ts from 'typescript'

const holdings = ['investment', 'allowance', 'pension'].map(category => ({
  id: category, category, symbol: '005930', name: '삼성전자', market: 'KR',
  quantity: 10, averagePrice: 70000, currency: 'KRW',
}))

function harness(props = {}, component = 'TransactionForm') {
  const states = []
  let cursor = 0
  let saved
  const react = {
    useMemo: fn => fn(), useEffect() {},
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
    },
  }
  const jsx = (type, props) => ({ type, props })
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../utils/openingCostPolicy': { preserveOpeningCost: (_item, next) => next },
    '../services/priceService': { getHoldingQuote: async () => ({ name: '삼성전자', currentPrice: 80000, previousClose: 79000, currency: 'KRW' }) },
  }
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(`../src/components/${component}.tsx`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(code, { exports, require: name => imports[name], crypto: { randomUUID: () => 'new-transaction' } })
  const render = () => {
    cursor = 0
    return exports[component]({ holdings, onSave: async value => { saved = value; return component === 'HoldingForm' ? true : null }, onClose() {}, ...props })
  }
  return { render, saved: () => saved }
}

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  const children = node.props?.children
  return [node, ...(Array.isArray(children) ? children : [children]).flatMap(nodes)]
}
const select = tree => nodes(tree).find(node => node.props?.label === '등록 종목')
const field = (tree, label) => nodes(tree).find(node => node.props?.label === label)
const submit = tree => nodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })

for (const category of ['investment', 'allowance', 'pension']) {
  test(`new transaction uses ${category} filter for holding and saved category`, async () => {
    const h = harness({ filter: category })
    let tree = h.render()
    assert.equal(select(tree).props.value, category)
    assert.equal(select(tree).props.values.length, 1)
    assert.match(select(tree).props.values[0][1], /투자|용돈|연금/)
    field(tree, '수량').props.onChange('2')
    tree = h.render()
    await submit(tree)
    assert.equal(h.saved().category, category)
    assert.equal(h.saved().holdingId, category)
  })
}

test('all filter distinguishes identical symbols by purpose and follows selection', async () => {
  const h = harness({ filter: 'all' })
  let tree = h.render()
  assert.equal(select(tree).props.values.length, 3)
  assert.equal(new Set(select(tree).props.values.map(([, label]) => label)).size, 3)
  select(tree).props.onChange('pension')
  tree = h.render()
  field(tree, '수량').props.onChange('2')
  await submit(h.render())
  assert.equal(h.saved().category, 'pension')
  assert.equal(h.saved().holdingId, 'pension')
})

test('missing pension holding shows guidance instead of falling back to investment', () => {
  const h = harness({ filter: 'pension', holdings: holdings.slice(0, 2) })
  const tree = h.render()
  assert.equal(nodes(tree).some(node => node.type === 'form'), false)
  assert.match(nodes(tree).find(node => node.props?.role === 'status').props.children.join(''), /연금 목적의 보유종목이 없습니다/)
  assert.equal(h.saved(), undefined)
})

test('editing preserves original holding regardless of active filter', async () => {
  const item = { ...holdings[0], id: 'existing', holdingId: 'investment', type: 'buy', quantity: 2, price: 70000, date: '2026-10-01' }
  const h = harness({ filter: 'pension', item })
  assert.equal(select(h.render()).props.value, 'investment')
  await submit(h.render())
  assert.equal(h.saved().category, 'investment')
  assert.equal(h.saved().id, 'existing')
})

test('opening registration preserves explicitly selected holding', async () => {
  const h = harness({ filter: 'investment', openingHolding: holdings[2] })
  const tree = h.render()
  assert.equal(select(tree), undefined)
  await submit(tree)
  assert.equal(h.saved().type, 'opening')
  assert.equal(h.saved().category, 'pension')
  assert.equal(h.saved().quantity, 10)
})

test('holding outside active purpose cannot be selected', () => {
  const h = harness({ filter: 'pension' })
  select(h.render()).props.onChange('investment')
  assert.equal(select(h.render()).props.value, 'pension')
})

test('transaction numeric drafts start empty and stay empty when cleared', () => {
  const h = harness()
  for (const label of ['수량', '수수료 (KRW)', '세금 (KRW)']) {
    assert.equal(field(h.render(), label).props.value, '')
    field(h.render(), label).props.onChange('5')
    assert.equal(field(h.render(), label).props.value, '5')
    field(h.render(), label).props.onChange('')
    assert.equal(field(h.render(), label).props.value, '')
  }
})

test('transaction preserves decimal typing and converts only on save; empty fees become zero', async () => {
  const h = harness()
  field(h.render(), '수량').props.onChange('0.')
  assert.equal(field(h.render(), '수량').props.value, '0.')
  field(h.render(), '수량').props.onChange('0.5')
  field(h.render(), '체결가격 (KRW)').props.onChange('123.45')
  await submit(h.render())
  assert.equal(h.saved().quantity, 0.5)
  assert.equal(h.saved().price, 123.45)
  assert.equal(h.saved().fee, 0)
  assert.equal(h.saved().tax, 0)
})

test('blank/zero/partial decimal quantity is rejected without saving', async () => {
  for (const value of ['', '0', '.']) {
    const h = harness()
    field(h.render(), '수량').props.onChange(value)
    await submit(h.render())
    assert.equal(h.saved(), undefined)
    assert.ok(nodes(h.render()).some(node => node.props?.className === 'form-error'))
  }
})

test('negative or malformed input is not silently turned into a positive number', () => {
  const h = harness()
  field(h.render(), '수량').props.onChange('3')
  for (const value of ['-5', '1.2.3', 'abc', 'Infinity']) {
    field(h.render(), '수량').props.onChange(value)
    assert.equal(field(h.render(), '수량').props.value, '3')
  }
})

test('USD optional FX can be cleared and fractional fees save as numbers', async () => {
  const h = harness({ holdings: [{ ...holdings[0], market: 'US', currency: 'USD' }], defaultFxRate: 1350 })
  field(h.render(), '거래 당시 환율 (USD/KRW)').props.onChange('')
  assert.equal(field(h.render(), '거래 당시 환율 (USD/KRW)').props.value, '')
  field(h.render(), '수량').props.onChange('1')
  field(h.render(), '수수료 (USD)').props.onChange('0.25')
  await submit(h.render())
  assert.equal(h.saved().fxRate, undefined)
  assert.equal(h.saved().fee, 0.25)
})

test('holding numeric drafts start blank, support clear and decimal typing, save numbers', async () => {
  const h = harness({}, 'HoldingForm')
  assert.equal(field(h.render(), '보유 수량').props.value, '')
  assert.equal(field(h.render(), '평균 매수가').props.value, '')
  field(h.render(), '보유 수량').props.onChange('2')
  field(h.render(), '보유 수량').props.onChange('')
  assert.equal(field(h.render(), '보유 수량').props.value, '')
  field(h.render(), '보유 수량').props.onChange('0.')
  assert.equal(field(h.render(), '보유 수량').props.value, '0.')
  field(h.render(), '보유 수량').props.onChange('0.5')
  field(h.render(), '평균 매수가').props.onChange('123.45')
  field(h.render(), '종목 코드').props.onChange('005930')
  submit(h.render())
  await setImmediate()
  assert.equal(h.saved().quantity, 0.5)
  assert.equal(h.saved().averagePrice, 123.45)
})

test('holding edit retains numeric defaults and position locks', async () => {
  const h = harness({ item: { ...holdings[0], currentPrice: 80000, previousClose: 79000 }, lockPosition: true }, 'HoldingForm')
  assert.equal(field(h.render(), '보유 수량').props.value, '10')
  assert.equal(field(h.render(), '보유 수량').props.disabled, true)
  submit(h.render())
  await setImmediate()
  assert.equal(h.saved().quantity, 10)
  assert.equal(h.saved().averagePrice, 70000)
})

test('holding blank and malformed numeric values cannot save', async () => {
  const h = harness({}, 'HoldingForm')
  field(h.render(), '종목 코드').props.onChange('005930')
  field(h.render(), '평균 매수가').props.onChange('70000')
  field(h.render(), '보유 수량').props.onChange('.')
  submit(h.render())
  await setImmediate()
  assert.equal(h.saved(), undefined)
})
