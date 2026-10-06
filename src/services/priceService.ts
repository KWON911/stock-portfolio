import type { Currency, Holding, MarketDataStatus } from '../types/portfolio'

export interface LivePrice { currentPrice: number; previousClose: number; currency: Currency; status: MarketDataStatus; updatedAt?: string }
export interface ExchangeRateSnapshot { rate: number; status: MarketDataStatus; updatedAt?: string }
export interface PriceSnapshot { prices: Record<string, LivePrice>; exchangeRates: { USDKRW?: ExchangeRateSnapshot }; updatedAt: string; partial?: boolean; failures?: { key: string; market: string; symbol: string; reason: string }[] }
export interface HoldingQuote extends LivePrice { name: string }
const key = (holding: Pick<Holding, 'market' | 'symbol' | 'exchange'>) => `${holding.market}:${holding.exchange ?? ''}:${holding.symbol}`

export async function getPortfolioPrices(holdings: Holding[]): Promise<PriceSnapshot> {
  const unique = [...new Map(holdings.map(holding => [key(holding), { market: holding.market, symbol: holding.symbol, exchange: holding.exchange }])).values()]
  const response = await fetch('/api/prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holdings: unique }) })
  if (!response.ok) throw new Error('시세를 불러오지 못했습니다.')
  return response.json() as Promise<PriceSnapshot>
}

export async function getHoldingQuote(holding: Pick<Holding, 'market' | 'symbol' | 'exchange'>): Promise<HoldingQuote> {
  const response = await fetch('/api/holding-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holding }),
  })
  if (!response.ok) throw new Error(response.status === 422
    ? '종목 정보를 확인할 수 없습니다. 종목 코드를 확인해 주세요.'
    : '종목 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
  const quote = await response.json() as HoldingQuote
  if (!quote.name || !Number.isFinite(quote.currentPrice) || !Number.isFinite(quote.previousClose)) {
    throw new Error('종목 정보를 확인할 수 없습니다. 종목 코드를 확인해 주세요.')
  }
  return quote
}

export const priceKey = key
