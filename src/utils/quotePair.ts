export interface QuotePair { currentPrice: number; previousClose: number; currency: 'KRW' | 'USD' }

/** Prices travel as one complete pair, never as independent field patches. */
export function isCompleteQuote(value: unknown): value is QuotePair {
  if (!value || typeof value !== 'object') return false
  const quote = value as QuotePair
  return Number.isFinite(quote.currentPrice) && quote.currentPrice > 0 &&
    Number.isFinite(quote.previousClose) && quote.previousClose > 0 &&
    (quote.currency === 'KRW' || quote.currency === 'USD')
}
