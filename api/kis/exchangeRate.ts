import { getOverseasExchangeRate, type ApiHolding } from './quotes.js'

export type ExchangeRateResult = { rate: number; source: 'live' | 'cache'; updatedAt?: string }

let lastSuccessfulUsdKrwRate: number | undefined
let lastSuccessfulUsdKrwUpdatedAt: string | undefined

// KIS's proven historical integration obtained t_rate from overseas price detail.
// Try a small number of held US symbols without introducing an obsolete fallback
// environment variable into the current configuration.
export async function getUsdKrwRate(holdings: ApiHolding[]): Promise<ExchangeRateResult | null> {
  const candidates = holdings.filter(holding => holding.market === 'US').slice(0, 3)
  for (const holding of candidates) {
    try {
      const rate = await getOverseasExchangeRate(holding)
      const updatedAt = new Date().toISOString()
      lastSuccessfulUsdKrwRate = rate
      lastSuccessfulUsdKrwUpdatedAt = updatedAt
      console.info('[KIS exchange-rate] source=live', { symbol: holding.symbol, exchange: holding.exchange })
      return { rate, source: 'live', updatedAt }
    } catch {
      // kisGet records only safe endpoint/status/KIS error diagnostics.
    }
  }

  if (lastSuccessfulUsdKrwRate) {
    console.info('[KIS exchange-rate] source=cache')
    return { rate: lastSuccessfulUsdKrwRate, source: 'cache', updatedAt: lastSuccessfulUsdKrwUpdatedAt }
  }
  return null
}
