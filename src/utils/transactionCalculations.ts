import type { Holding } from '../types/portfolio'
import type { SaleResult, Transaction, TransactionPosition } from '../types/transaction'

const amount = (value: number | undefined) => Number.isFinite(value) && value! > 0 ? value! : 0
const sorted = (transactions: Transaction[]) => [...transactions].sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'opening' ? -1 : b.type === 'opening' ? 1 : 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
export const transactionKey = (transaction: Pick<Transaction, 'holdingId' | 'market' | 'symbol' | 'category'>) => transaction.holdingId ?? `${transaction.market}:${transaction.symbol}:${transaction.category}`

export function calculatePositionFromTransactions(transactions: Transaction[]): TransactionPosition {
  let quantity = 0, averagePrice = 0, averageCostKrw: number | undefined = 0
  let totalBuyQuantity = 0, totalSellQuantity = 0, totalBuyAmount = 0, totalBuyAmountKrw: number | undefined = 0, realizedProfit = 0, realizedProfitKrw: number | undefined = 0
  for (const transaction of sorted(transactions)) {
    const fee = amount(transaction.fee), tax = amount(transaction.tax)
    const fx = transaction.currency === 'USD' && Number.isFinite(transaction.fxRate) && transaction.fxRate! > 0 ? transaction.fxRate! : transaction.currency === 'KRW' ? 1 : undefined
    if (transaction.type === 'opening') {
      quantity = transaction.quantity
      averagePrice = transaction.price
      averageCostKrw = fx === undefined ? undefined : transaction.price * fx
      totalBuyQuantity += transaction.quantity
      totalBuyAmount += transaction.quantity * transaction.price
      totalBuyAmountKrw = totalBuyAmountKrw !== undefined && fx !== undefined ? totalBuyAmountKrw + transaction.quantity * transaction.price * fx : undefined
      continue
    }
    if (transaction.type === 'buy') {
      const gross = transaction.quantity * transaction.price + fee
      const nextQuantity = quantity + transaction.quantity
      averagePrice = nextQuantity ? (quantity * averagePrice + gross) / nextQuantity : 0
      averageCostKrw = averageCostKrw !== undefined && fx !== undefined ? (quantity * averageCostKrw + gross * fx) / nextQuantity : undefined
      quantity = nextQuantity
      totalBuyQuantity += transaction.quantity
      totalBuyAmount += gross
      totalBuyAmountKrw = totalBuyAmountKrw !== undefined && fx !== undefined ? totalBuyAmountKrw + gross * fx : undefined
      continue
    }
    const soldQuantity = Math.min(transaction.quantity, quantity)
    const proceeds = transaction.quantity * transaction.price - fee - tax
    realizedProfit += proceeds - soldQuantity * averagePrice
    realizedProfitKrw = realizedProfitKrw !== undefined && averageCostKrw !== undefined && fx !== undefined
      ? realizedProfitKrw + proceeds * fx - soldQuantity * averageCostKrw
      : undefined
    quantity -= soldQuantity
    totalSellQuantity += transaction.quantity
    if (quantity === 0) { averagePrice = 0; averageCostKrw = 0 }
  }
  return { quantity, averagePrice, averageCostKrw, totalBuyQuantity, totalSellQuantity, totalBuyAmount, totalBuyAmountKrw, realizedProfit, realizedProfitKrw }
}

export function calculateSaleResults(transactions: Transaction[]): Map<string, SaleResult> {
  const results = new Map<string, SaleResult>()
  const groups = new Map<string, Transaction[]>()
  transactions.forEach(transaction => groups.set(transactionKey(transaction), [...(groups.get(transactionKey(transaction)) ?? []), transaction]))
  for (const group of groups.values()) {
    let quantity = 0, averagePrice = 0, averageCostKrw: number | undefined = 0
    for (const transaction of sorted(group)) {
      const fee = amount(transaction.fee), tax = amount(transaction.tax)
      const fx = transaction.currency === 'USD' && Number.isFinite(transaction.fxRate) && transaction.fxRate! > 0 ? transaction.fxRate! : transaction.currency === 'KRW' ? 1 : undefined
      if (transaction.type === 'opening') {
        quantity = transaction.quantity
        averagePrice = transaction.price
        averageCostKrw = fx === undefined ? undefined : transaction.price * fx
      } else if (transaction.type === 'buy') {
        const gross = transaction.quantity * transaction.price + fee, nextQuantity = quantity + transaction.quantity
        averagePrice = (quantity * averagePrice + gross) / nextQuantity
        averageCostKrw = averageCostKrw !== undefined && fx !== undefined ? (quantity * averageCostKrw + gross * fx) / nextQuantity : undefined
        quantity = nextQuantity
      } else {
        const proceeds = transaction.quantity * transaction.price - fee - tax
        results.set(transaction.id, { profit: proceeds - transaction.quantity * averagePrice, profitKrw: averageCostKrw !== undefined && fx !== undefined ? proceeds * fx - transaction.quantity * averageCostKrw : undefined })
        quantity -= transaction.quantity
        if (quantity === 0) { averagePrice = 0; averageCostKrw = 0 }
      }
    }
  }
  return results
}

export function validateTransactionSequence(transactions: Transaction[]): string | null {
  const groups = new Map<string, Transaction[]>()
  transactions.forEach(transaction => groups.set(transactionKey(transaction), [...(groups.get(transactionKey(transaction)) ?? []), transaction]))
  for (const group of groups.values()) {
    const openings = group.filter(transaction => transaction.type === 'opening')
    if (openings.length > 1) return '종목과 투자 목적별 초기 보유는 한 번만 등록할 수 있습니다.'
    if (openings.length && group.some(transaction => transaction.type !== 'opening' && transaction.date < openings[0].date)) return '초기 보유 기준일보다 이전 거래는 저장할 수 없습니다.'
    let quantity = 0
    for (const transaction of sorted(group)) {
      if (!Number.isFinite(transaction.quantity) || transaction.quantity <= 0) return '수량은 0보다 커야 합니다.'
      if (!Number.isFinite(transaction.price) || transaction.price <= 0) return '체결가격은 0보다 커야 합니다.'
      if (transaction.type === 'sell' && transaction.quantity > quantity) return '보유수량보다 많은 수량을 매도할 수 없습니다.'
      quantity = transaction.type === 'sell' ? quantity - transaction.quantity : transaction.type === 'opening' ? transaction.quantity : quantity + transaction.quantity
    }
  }
  return null
}

export function hasOpeningTransaction(transactions: Transaction[], holding: Holding) {
  return transactions.some(transaction => transaction.type === 'opening' && (transaction.holdingId === holding.id || (!transaction.holdingId && transaction.market === holding.market && transaction.symbol === holding.symbol && transaction.category === holding.category)))
}

export function applyTransactionsToHoldings(holdings: Holding[], transactions: Transaction[]): Holding[] {
  const groups = new Map<string, Transaction[]>()
  transactions.forEach(transaction => groups.set(transactionKey(transaction), [...(groups.get(transactionKey(transaction)) ?? []), transaction]))
  return holdings.flatMap(holding => {
    const group = groups.get(holding.id) ?? groups.get(`${holding.market}:${holding.symbol}:${holding.category}`)
    if (!group?.length) return [holding]
    const position = calculatePositionFromTransactions(group)
    if (position.quantity <= 0) return []
    return [{ ...holding, quantity: position.quantity, averagePrice: position.averagePrice, transactionPosition: position }]
  })
}

export function realizedProfitSummary(transactions: Transaction[], category?: Transaction['category']) {
  const groups = new Map<string, Transaction[]>()
  transactions.filter(transaction => !category || transaction.category === category).forEach(transaction => groups.set(transactionKey(transaction), [...(groups.get(transactionKey(transaction)) ?? []), transaction]))
  let krw = 0, usd = 0, hasIncompleteKrw = false
  for (const group of groups.values()) {
    const position = calculatePositionFromTransactions(group)
    if (group[0].currency === 'USD') {
      usd += position.realizedProfit
      if (position.realizedProfitKrw === undefined) hasIncompleteKrw = true
      else krw += position.realizedProfitKrw
    } else krw += position.realizedProfit
  }
  return { krw: hasIncompleteKrw ? undefined : krw, usd }
}
