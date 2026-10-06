import type { CalculatedHolding, Category, Filter, Holding } from '../types/portfolio'
import type { TransactionPosition } from '../types/transaction'
import { exact, sumExact } from './exactAmount'
const safe = (n: number) => Number.isFinite(n) ? n : 0
const percent = (n: number, d: number) => d > 0 ? safe((n / d) * 100) : 0
/** Legacy holdings have no ledger cost; only those use quantity * unit price. */
export const holdingCost = (h: Holding) => exact(h.costBasisExact ?? h.transactionPosition?.costBasisExact ?? h.costBasis ?? h.transactionPosition?.costBasis ?? exact(safe(h.quantity)).mul(safe(h.averagePrice)))

export function combineHoldings(holdings: Holding[], filter: Filter): Holding[] {
  const selected = filter === 'all' ? holdings : holdings.filter(h => h.category === filter)
  if (filter !== 'all') return selected
  const merged = new Map<string, Holding>()
  selected.forEach(h => {
    const key = `${h.market}:${h.symbol}`, found = merged.get(key)
    if (!found) merged.set(key, { ...h })
    else {
      const quantity = exact(found.quantity).add(h.quantity).toNumber()
      const cost = holdingCost(found).add(holdingCost(h))
      const { transactionPositions: existingPositions, ...base } = found
      delete base.transactionPosition
      const legacyPosition = (holding: Holding): TransactionPosition => ({ quantity: holding.quantity, averagePrice: holding.averagePrice, costBasis: holdingCost(holding).toNumber(), costBasisExact: holdingCost(holding).toString(), openingQuantity: 0, openingAmount: 0, totalBuyQuantity: 0, totalSellQuantity: 0, totalBuyAmount: 0, realizedProfit: 0, realizedProfitKrw: 0 })
      const positions = { ...existingPositions, [found.category]: found.transactionPosition ?? existingPositions?.[found.category] ?? legacyPosition(found), [h.category]: h.transactionPosition ?? legacyPosition(h) }
      merged.set(key, { ...base, displayName: found.displayName ?? h.displayName, quantity, costBasis: cost.toNumber(), costBasisExact: cost.toString(), averagePrice: quantity ? cost.div(quantity).toNumber() : 0, currentPrice: h.currentPrice, previousClose: h.previousClose, transactionPositions: Object.keys(positions).length ? positions : undefined })
    }
  })
  return [...merged.values()]
}
export function calculateHoldings(holdings: Holding[], filter: Filter, usdKrwRate?: number): CalculatedHolding[] {
  const combined = combineHoldings(holdings, filter)
  const exchangeRate = Number.isFinite(usdKrwRate) ? usdKrwRate : undefined
  const krwValue = (h: Holding, price: number) => h.currency === 'USD' ? (exchangeRate === undefined ? Number.NaN : h.quantity * price * exchangeRate) : h.quantity * price
  const total = combined.reduce((sum, h) => sum + krwValue(h, h.currentPrice), 0)
  return combined.map(h => {
    // 미국 종목의 평가액과 오늘 손익은 현재 USD/KRW로 원화 환산합니다. 누적 수익률은 USD 가격만으로 계산합니다.
    const nativeCost = holdingCost(h)
    // Portfolio uses TODAY'S FX for valuation; historical FX is for realized P/L.
    const investedExact = h.currency === 'USD' ? exchangeRate === undefined ? exact(0) : nativeCost.mul(exchangeRate!) : nativeCost
    const nativeValue = exact(h.quantity).mul(h.currentPrice)
    const valueExact = h.currency === 'USD' ? exchangeRate === undefined ? exact(0) : nativeValue.mul(exchangeRate!) : nativeValue
    const invested = investedExact.toNumber(), value = valueExact.toNumber(), profit = valueExact.sub(investedExact).toNumber()
    const categories = filter === 'all' ? holdings.filter(x => x.symbol === h.symbol && x.market === h.market).reduce<Partial<Record<Category, number>>>((o, x) => ({ ...o, [x.category]: (o[x.category] || 0) + krwValue(x, x.currentPrice) }), {}) : undefined
    return { ...h, costBasis: nativeCost.toNumber(), costBasisExact: nativeCost.toString(), invested, investedExact: investedExact.toString(), value, valueExact: valueExact.toString(), profit, returnRate: percent(nativeValue.sub(nativeCost).toNumber(), nativeCost.toNumber()), dailyProfit: safe(krwValue(h, h.currentPrice - h.previousClose)), dailyRate: percent(h.currentPrice - h.previousClose, h.previousClose), allocation: percent(value, total), categories }
  })
}
export function totals(items: CalculatedHolding[]) {
  const cost = sumExact(items.map(x => x.investedExact ?? x.invested)), valuation = sumExact(items.map(x => x.valueExact ?? x.value))
  const invested = cost.toNumber(), value = valuation.toNumber(), profit = valuation.sub(cost).toNumber(), dailyProfit = items.reduce((s, x) => s + x.dailyProfit, 0)
  const previous = value - dailyProfit
  return { invested, value, profit, returnRate: percent(profit, invested), dailyProfit, dailyRate: percent(dailyProfit, previous) }
}
