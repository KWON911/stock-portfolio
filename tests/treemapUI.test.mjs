import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { URL } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

// UI-only harness: no auth, storage, market API or portfolio calculations.
function harness({ supported = false, reject = false } = {}) {
  const slots = []
  let cursor = 0
  let effects = []
  const listeners = new Map()
  const calls = { request: 0, exit: 0, selected: [] }
  const action = { focus() {}, isConnected: true }
  const section = { parentElement: null, querySelectorAll: () => [action], async requestFullscreen() {
    calls.request++
    if (reject) throw new Error('unsupported')
    document.fullscreenElement = section
  } }
  const document = { fullscreenEnabled: supported, fullscreenElement: null, body: { style: { overflow: 'auto' } }, activeElement: action,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
    async exitFullscreen() { calls.exit++; document.fullscreenElement = null },
  }
  const item = { id: 'fixture', market: 'KR', symbol: '000660', name: '긴 종목명 테스트', category: 'investment', value: 100, dailyRate: -2 }
  const element = (type, props) => ({ type, props })
  const react = {
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial } },
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useId: () => 'treemap-fixture', useMemo: fn => fn(), useEffect: fn => effects.push(fn), useLayoutEffect() {},
  }
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../src/components/PortfolioTreemap.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(code, { exports, document, HTMLElement: class {}, require: name => ({
    react, 'react/jsx-runtime': { jsx: element, jsxs: element }, 'lucide-react': { Maximize2: 'expand', X: 'close' },
    '../utils/treemapLayout': { createTreemapLayout: () => [{ item, x: 0, y: 0, width: 300, height: 200, value: 100 }] },
  })[name] })
  function render() {
    cursor = 0; effects = []
    const tree = exports.PortfolioTreemap({ items: [item], onSelect: selected => calls.selected.push(selected) })
    tree.props.ref.current = section
    slots[2].current = action
    const buttons = []
    const visit = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { node.forEach(visit); return }
      if (node.type === 'button') buttons.push(node); visit(node.props?.children) }
    visit(tree)
    return { tree, action: buttons[0], tile: buttons[1], effects: [...effects] }
  }
  return { render, calls, document, listeners, item }
}

test('treemap unsupported Fullscreen API uses overlay, closes and restores scroll', async () => {
  const h = harness()
  h.render().action.props.onClick(); await setImmediate()
  const expanded = h.render()
  assert.match(expanded.tree.props.className, /treemap-fallback/)
  assert.equal(expanded.tree.props['aria-modal'], true)
  const cleanup = expanded.effects[1]()
  assert.equal(h.document.body.style.overflow, 'hidden')
  expanded.action.props.onClick(); await setImmediate()
  cleanup()
  assert.equal(h.render().tree.props.role, undefined)
  assert.equal(h.document.body.style.overflow, 'auto')
  assert.equal(h.calls.request, 0)
})

test('treemap rejected native request safely falls back; Escape exits overlay', async () => {
  const h = harness({ supported: true, reject: true })
  h.render().action.props.onClick(); await setImmediate()
  const expanded = h.render()
  assert.match(expanded.tree.props.className, /treemap-fallback/)
  const cleanup = expanded.effects[1]()
  h.listeners.get('keydown')({ key: 'Escape', preventDefault() {} })
  assert.equal(h.render().tree.props.role, undefined)
  cleanup()
})

test('treemap native expansion exits before selecting the unchanged holding', async () => {
  const h = harness({ supported: true })
  h.render().action.props.onClick(); await setImmediate()
  const expanded = h.render()
  assert.match(expanded.tree.props.className, /treemap-expanded/)
  assert.doesNotMatch(expanded.tree.props.className, /treemap-fallback/)
  expanded.tile.props.onClick(); await setImmediate()
  assert.equal(h.calls.request, 1)
  assert.equal(h.calls.exit, 1)
  assert.equal(h.calls.selected[0], h.item)
  assert.equal(h.render().tree.props.role, undefined)
})

test('treemap Escape also exits native mode and fullscreen listener is cleaned up', async () => {
  const h = harness({ supported: true })
  const initial = h.render()
  const stopListening = initial.effects[0]()
  initial.action.props.onClick(); await setImmediate()
  const cleanup = h.render().effects[1]()
  h.listeners.get('keydown')({ key: 'Escape', preventDefault() {} }); await setImmediate()
  assert.equal(h.calls.exit, 1)
  assert.equal(h.render().tree.props.role, undefined)
  cleanup(); stopListening()
  assert.equal(h.listeners.size, 0)
})
