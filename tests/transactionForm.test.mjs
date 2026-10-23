import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { URL } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const holdings = ['investment', 'allowance', 'pension'].map(category => ({
  id: category, category, symbol: '005930', name: '삼성전자', market: 'KR',
  quantity: 10, averagePrice: 70000, currency: 'KRW',
}))

function harness(props = {}) {
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
  }
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../src/components/TransactionForm.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(code, { exports, require: name => imports[name], crypto: { randomUUID: () => 'new-transaction' } })
  const render = () => {
    cursor = 0
    return exports.TransactionForm({ holdings, onSave: async value => { saved = value; return null }, onClose() {}, ...props })
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
