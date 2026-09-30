import type { Category, Currency, Market } from './portfolio'

export type TransactionType = 'opening' | 'buy' | 'sell'

export interface Transaction {
  id: string
  holdingId?: string
  market: Market
  exchange?: 'NASDAQ' | 'NYSE' | 'AMEX'
  symbol: string
  name: string
  category: Category
  type: TransactionType
  date: string
  quantity: number
  price: number
  fee?: number
  tax?: number
  currency: Currency
  fxRate?: number
  memo?: string
  createdAt: string
}

export interface TransactionPosition {
  quantity: number
  averagePrice: number
  averageCostKrw?: number
  openingQuantity: number
  openingAmount: number
  openingAmountKrw?: number
  totalBuyQuantity: number
  totalSellQuantity: number
  totalBuyAmount: number
  totalBuyAmountKrw?: number
  realizedProfit: number
  realizedProfitKrw?: number
}

export interface SaleResult { profit: number; profitKrw?: number }
