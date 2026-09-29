import type { CalculatedHolding, Category, Filter, Holding } from '../types/portfolio'
const safe = (n: number) => Number.isFinite(n) ? n : 0
const percent = (n: number, d: number) => d > 0 ? safe((n / d) * 100) : 0

export function combineHoldings(holdings: Holding[], filter: Filter): Holding[] {
  const selected = filter === 'all' ? holdings : holdings.filter(h => h.category === filter)
  if (filter !== 'all') return selected
  const merged = new Map<string, Holding>()
  selected.forEach(h => {
    const key = `${h.market}:${h.symbol}`, found = merged.get(key)
    if (!found) merged.set(key, { ...h, category: 'investment' })
    else {
      const quantity = found.quantity + h.quantity
      merged.set(key, { ...found, displayName: found.displayName ?? h.displayName, quantity, averagePrice: safe((found.quantity * found.averagePrice + h.quantity * h.averagePrice) / quantity), currentPrice: h.currentPrice, previousClose: h.previousClose })
    }
  })
  return [...merged.values()]
}
export function calculateHoldings(holdings: Holding[], filter: Filter, usdKrwRate = 1): CalculatedHolding[] {
  const combined = combineHoldings(holdings, filter)
  const krwValue = (h: Holding, price: number) => h.currency === 'USD' ? h.quantity * price * usdKrwRate : h.quantity * price
  const total = combined.reduce((sum, h) => sum + krwValue(h, h.currentPrice), 0)
  return combined.map(h => {
    // 미국 종목의 평가액과 오늘 손익은 현재 USD/KRW로 원화 환산합니다. 누적 수익률은 USD 가격만으로 계산합니다.
    const invested = safe(krwValue(h, h.averagePrice)), value = safe(krwValue(h, h.currentPrice)), profit = value - invested
    const categories = filter === 'all' ? holdings.filter(x => x.symbol === h.symbol && x.market === h.market).reduce<Partial<Record<Category, number>>>((o, x) => ({ ...o, [x.category]: (o[x.category] || 0) + (x.currency === 'USD' ? x.quantity * x.currentPrice * usdKrwRate : x.quantity * x.currentPrice) }), {}) : undefined
    return { ...h, invested, value, profit, returnRate: percent(h.currentPrice - h.averagePrice, h.averagePrice), dailyProfit: safe((h.currentPrice - h.previousClose) * h.quantity * (h.currency === 'USD' ? usdKrwRate : 1)), dailyRate: percent(h.currentPrice - h.previousClose, h.previousClose), allocation: percent(value, total), categories }
  })
}
export function totals(items: CalculatedHolding[]) {
  const invested = items.reduce((s, x) => s + x.invested, 0), value = items.reduce((s, x) => s + x.value, 0), profit = value - invested, dailyProfit = items.reduce((s, x) => s + x.dailyProfit, 0)
  const previous = value - dailyProfit
  return { invested, value, profit, returnRate: percent(profit, invested), dailyProfit, dailyRate: percent(dailyProfit, previous) }
}
