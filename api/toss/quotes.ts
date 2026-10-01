import { TossApiError, tossGet } from './client.js'

export type ApiHolding = { market: 'KR' | 'US'; symbol: string; exchange?: 'NASDAQ' | 'NYSE' | 'AMEX' }
export type ApiPrice = { currentPrice: number; previousClose: number; currency: 'KRW' | 'USD'; status: 'live'; updatedAt: string }
export type QuoteBatch = { quotes: Map<string, ApiPrice>; failures: Map<string, TossApiError> }

type PriceResult = { symbol?: unknown; lastPrice?: unknown; currency?: unknown; previousClose?: unknown; previousClosePrice?: unknown; closePrice?: unknown; basePrice?: unknown }
const asRecord = (value: unknown): Record<string, unknown> | null => typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
const numberOf = (value: unknown) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : undefined }

function priceResults(body: unknown): PriceResult[] {
  const root = asRecord(body)
  const result = root?.result
  if (Array.isArray(result)) return result as PriceResult[]
  const nested = asRecord(result)?.results ?? asRecord(result)?.items
  if (Array.isArray(nested)) return nested as PriceResult[]
  throw new TossApiError('Toss prices response did not include result[]')
}

function toPrice(result: PriceResult): ApiPrice | null {
  const currentPrice = numberOf(result.lastPrice)
  const currency = result.currency === 'KRW' || result.currency === 'USD' ? result.currency : undefined
  if (!currentPrice || !currency) return null
  // The documented core response exposes lastPrice but not a prior close. Use an
  // available supplementary field when supplied; otherwise preserve calculation
  // safety by treating the first fetched quote as flat for the day.
  const previousClose = numberOf(result.previousClose) ?? numberOf(result.previousClosePrice) ?? numberOf(result.closePrice) ?? numberOf(result.basePrice) ?? currentPrice
  return { currentPrice, previousClose, currency, status: 'live', updatedAt: new Date().toISOString() }
}

async function quoteChunk(symbols: string[]) {
  const body = await tossGet('/api/v1/prices', { symbols: symbols.join(',') }, { stage: 'quote', symbols })
  const quotes = new Map<string, ApiPrice>()
  priceResults(body).forEach(result => {
    if (typeof result.symbol !== 'string') return
    const price = toPrice(result)
    if (price) quotes.set(result.symbol.toUpperCase(), price)
  })
  return quotes
}

export async function getTossQuotes(holdings: ApiHolding[]): Promise<QuoteBatch> {
  const symbols = [...new Set(holdings.map(holding => holding.symbol.trim().toUpperCase()).filter(Boolean))]
  const chunks = Array.from({ length: Math.ceil(symbols.length / 200) }, (_, index) => symbols.slice(index * 200, (index + 1) * 200))
  const settled = await Promise.allSettled(chunks.map(quoteChunk))
  const quotes = new Map<string, ApiPrice>()
  const failures = new Map<string, TossApiError>()
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') result.value.forEach((price, symbol) => quotes.set(symbol, price))
    else {
      const error = result.reason instanceof TossApiError ? result.reason : new TossApiError('Toss prices request failed')
      chunks[index].forEach(symbol => failures.set(symbol, error))
    }
  })
  return { quotes, failures }
}
