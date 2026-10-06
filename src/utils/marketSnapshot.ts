import type { Holding } from '../types/portfolio'
import { priceKey, type PriceSnapshot } from '../services/priceService'
import { isCompleteQuote } from './quotePair'

export function mergePriceSnapshot(previous: PriceSnapshot | null, next: PriceSnapshot): PriceSnapshot {
  const prices: PriceSnapshot['prices'] = {}
  for (const [key, quote] of Object.entries(previous?.prices ?? {})) {
    if (isCompleteQuote(quote)) prices[key] = { ...quote, status: 'cached' }
  }
  for (const [key, quote] of Object.entries(next.prices ?? {})) {
    if (isCompleteQuote(quote) && quote.currency === (key.startsWith('KR:') ? 'KRW' : 'USD')) prices[key] = { ...quote }
  }
  return { ...next, prices, exchangeRates: { ...previous?.exchangeRates, ...next.exchangeRates } }
}

export function hydrateMarketHolding(holding: Holding, snapshot: PriceSnapshot | null): Holding {
  const price = snapshot?.prices[priceKey(holding)]
  if (!isCompleteQuote(price) || price.currency !== holding.currency) return { ...holding, priceStatus: 'fallback' }
  return { ...holding, currentPrice: price.currentPrice, previousClose: price.previousClose,
    priceStatus: price.status, priceUpdatedAt: price.updatedAt }
}

export function findSelectedHolding<T extends { id: string }>(items: T[], id: string | null): T | null {
  return items.find(item => item.id === id) ?? null
}
