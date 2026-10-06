import type { Holding } from '../types/portfolio'
import type { SaleResult, Transaction, TransactionPosition } from '../types/transaction'
import { exact, sumExact, validOpeningCost, type ExactAmount } from './exactAmount'

const amount = (value: number | undefined) => Number.isFinite(value) && value! > 0 ? value! : 0
const sorted = (transactions: Transaction[]) => [...transactions].sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'opening' ? -1 : b.type === 'opening' ? 1 : 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
export const transactionKey = (transaction: Pick<Transaction, 'holdingId' | 'market' | 'symbol' | 'category'>) => transaction.holdingId ?? `${transaction.market}:${transaction.symbol}:${transaction.category}`

/** Returns every purpose's transaction for a single listed security. */
export const transactionsForSymbol = (transactions: Transaction[], market: Transaction['market'], symbol: string) =>
  transactions.filter(transaction => transaction.market === market && transaction.symbol === symbol)

export function calculatePositionFromTransactions(transactions: Transaction[]): TransactionPosition {
  return replay(transactions).position
}

/** Average cost allocation stays rational: sold + remaining cost equals prior cost.
 * No per-sale rounding; a full close consumes the entire remaining basis.
 */
function replay(transactions: Transaction[]) {
  let quantity = exact(0), cost = exact(0), costKrw: ExactAmount | undefined = exact(0)
  let openingQuantity = 0, openingAmount = 0, openingAmountKrw: number | undefined = 0
  let buyQuantity = exact(0), sellQuantity = exact(0), buyAmount = exact(0), buyKrw: ExactAmount | undefined = exact(0)
  let realized = exact(0), realizedKrw: ExactAmount | undefined = exact(0)
  const sales = new Map<string, SaleResult>()
  for (const transaction of sorted(transactions)) {
    const qty = exact(transaction.quantity)
    const fee = amount(transaction.fee), tax = amount(transaction.tax)
    const fx = transaction.currency === 'USD' && Number.isFinite(transaction.fxRate) && transaction.fxRate! > 0 ? transaction.fxRate! : transaction.currency === 'KRW' ? 1 : undefined
    if (transaction.type === 'opening') {
      quantity = qty
      cost = transaction.openingCostBasis != null ? exact(transaction.openingCostBasis) : qty.mul(transaction.price)
      if (quantity.isZero) cost = exact(0)
      costKrw = fx === undefined ? undefined : cost.mul(fx)
      openingQuantity = transaction.quantity
      openingAmount = cost.toNumber()
      openingAmountKrw = costKrw?.toNumber()
      continue
    }
    if (transaction.type === 'buy') {
      const gross = qty.mul(transaction.price).add(fee)
      cost = cost.add(gross)
      costKrw = costKrw !== undefined && fx !== undefined ? costKrw.add(gross.mul(fx)) : undefined
      quantity = quantity.add(qty)
      buyQuantity = buyQuantity.add(qty)
      buyAmount = buyAmount.add(gross)
      buyKrw = buyKrw !== undefined && fx !== undefined ? buyKrw.add(gross.mul(fx)) : undefined
      continue
    }
    const soldQuantity = qty.sub(quantity).isNegative ? qty : quantity
    const soldCost = quantity.isZero ? exact(0) : cost.mul(soldQuantity).div(quantity)
    const soldKrw = costKrw === undefined ? undefined : quantity.isZero ? exact(0) : costKrw.mul(soldQuantity).div(quantity)
    const proceeds = qty.mul(transaction.price).sub(fee).sub(tax)
    const profit = proceeds.sub(soldCost)
    const profitKrw = soldKrw !== undefined && fx !== undefined ? proceeds.mul(fx).sub(soldKrw) : undefined
    sales.set(transaction.id, { profit: profit.toNumber(), profitKrw: profitKrw?.toNumber() })
    realized = realized.add(profit)
    realizedKrw = realizedKrw !== undefined && profitKrw !== undefined ? realizedKrw.add(profitKrw) : undefined
    cost = cost.sub(soldCost)
    costKrw = costKrw !== undefined && soldKrw !== undefined ? costKrw.sub(soldKrw) : undefined
    quantity = quantity.sub(soldQuantity)
    sellQuantity = sellQuantity.add(qty)
    if (quantity.isZero) { cost = exact(0); costKrw = exact(0) }
  }
  const position: TransactionPosition = {
    quantity: quantity.toNumber(), costBasis: cost.toNumber(), costBasisExact: cost.toString(),
    costBasisKrw: costKrw?.toNumber(), costBasisKrwExact: costKrw?.toString(),
    averagePrice: quantity.isZero ? 0 : cost.div(quantity).toNumber(),
    averageCostKrw: costKrw === undefined ? undefined : quantity.isZero ? 0 : costKrw.div(quantity).toNumber(),
    openingQuantity, openingAmount, openingAmountKrw,
    totalBuyQuantity: buyQuantity.toNumber(), totalSellQuantity: sellQuantity.toNumber(),
    totalBuyAmount: buyAmount.toNumber(), totalBuyAmountKrw: buyKrw?.toNumber(),
    realizedProfit: realized.toNumber(), realizedProfitExact: realized.toString(),
    realizedProfitKrw: realizedKrw?.toNumber(), realizedProfitKrwExact: realizedKrw?.toString(),
  }
  return { position, sales }
}

export function calculateSaleResults(transactions: Transaction[]): Map<string, SaleResult> {
  const results = new Map<string, SaleResult>()
  const groups = new Map<string, Transaction[]>()
  transactions.forEach(transaction => groups.set(transactionKey(transaction), [...(groups.get(transactionKey(transaction)) ?? []), transaction]))
  for (const group of groups.values()) {
    for (const [id, sale] of replay(group).sales) results.set(id, sale)
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
    let quantity = exact(0)
    for (const transaction of sorted(group)) {
      if (transaction.openingCostBasis != null && (transaction.type !== 'opening' || !validOpeningCost(transaction.openingCostBasis))) return '초기 보유 총원가가 올바르지 않습니다.'
      if (!Number.isFinite(transaction.quantity) || transaction.quantity <= 0) return '수량은 0보다 커야 합니다.'
      if (!Number.isFinite(transaction.price) || transaction.price <= 0) return '체결가격은 0보다 커야 합니다.'
      if (transaction.type === 'sell' && quantity.sub(transaction.quantity).isNegative) return '보유수량보다 많은 수량을 매도할 수 없습니다.'
      quantity = transaction.type === 'sell' ? quantity.sub(transaction.quantity) : transaction.type === 'opening' ? exact(transaction.quantity) : quantity.add(transaction.quantity)
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
    return [{ ...holding, quantity: position.quantity, averagePrice: position.averagePrice, costBasis: position.costBasis, costBasisExact: position.costBasisExact, transactionPosition: position }]
  })
}

export function realizedProfitSummary(transactions: Transaction[], category?: Transaction['category']) {
  const groups = new Map<string, Transaction[]>()
  transactions.filter(transaction => !category || transaction.category === category).forEach(transaction => groups.set(transactionKey(transaction), [...(groups.get(transactionKey(transaction)) ?? []), transaction]))
  const krw: string[] = [], usd: string[] = []
  let hasIncompleteKrw = false
  for (const group of groups.values()) {
    const position = calculatePositionFromTransactions(group)
    if (group[0].currency === 'USD') {
      usd.push(position.realizedProfitExact!)
      if (position.realizedProfitKrw === undefined) hasIncompleteKrw = true
      else krw.push(position.realizedProfitKrwExact!)
    } else krw.push(position.realizedProfitExact!)
  }
  return { krw: hasIncompleteKrw ? undefined : sumExact(krw).toNumber(), usd: sumExact(usd).toNumber() }
}
