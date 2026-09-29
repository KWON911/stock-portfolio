import type { Currency, Holding, MarketDataStatus } from '../types/portfolio'

export interface LivePrice { currentPrice: number; previousClose: number; currency: Currency; status: MarketDataStatus; updatedAt?: string }
export interface ExchangeRateSnapshot { rate: number; status: MarketDataStatus; updatedAt?: string }
export interface PriceSnapshot { prices: Record<string, LivePrice>; exchangeRates: { USDKRW?: ExchangeRateSnapshot }; updatedAt: string; partial?: boolean; failures?: { key: string; market: string; symbol: string; reason: string }[] }
const key = (holding: Pick<Holding, 'market' | 'symbol' | 'exchange'>) => `${holding.market}:${holding.exchange ?? ''}:${holding.symbol}`

export async function getPortfolioPrices(holdings: Holding[]): Promise<PriceSnapshot> {
  const unique = [...new Map(holdings.map(holding => [key(holding), { market: holding.market, symbol: holding.symbol, exchange: holding.exchange }])).values()]
  const response = await fetch('/api/prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holdings: unique }) })
  if (!response.ok) throw new Error('시세를 불러오지 못했습니다.')
  return response.json() as Promise<PriceSnapshot>
}

export const priceKey = key
