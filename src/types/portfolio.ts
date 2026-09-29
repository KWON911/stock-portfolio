export type Category = 'investment' | 'allowance' | 'pension'
export type Market = 'KR' | 'US'
export type Currency = 'KRW' | 'USD'
export type Filter = 'all' | Category

export interface Holding {
  id: string; symbol: string; name: string; displayName?: string; market: Market; exchange?: 'NASDAQ' | 'NYSE' | 'AMEX'; currency?: Currency; category: Category
  quantity: number; averagePrice: number; currentPrice: number; previousClose: number
}

export interface CalculatedHolding extends Holding {
  invested: number; value: number; profit: number; returnRate: number; dailyProfit: number; dailyRate: number; allocation: number; categories?: Partial<Record<Category, number>>
}
