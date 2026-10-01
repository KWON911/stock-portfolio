import { getOverseasExchangeRate, type ApiHolding } from './quotes.js'

export type ExchangeRateResult = { rate: number; source: 'live' | 'cache'; updatedAt?: string }

let lastSuccessfulUsdKrwRate: number | undefined
let lastSuccessfulUsdKrwUpdatedAt: string | undefined
const RATE_LIMIT_RETRY_DELAY_MS = 1_100
const pause = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds))

// KIS's proven historical integration obtained t_rate from overseas price detail.
// Try a small number of held US symbols without introducing an obsolete fallback
// environment variable into the current configuration.
export async function getUsdKrwRate(holdings: ApiHolding[]): Promise<ExchangeRateResult | null> {
  const candidates = holdings.filter(holding => holding.market === 'US').slice(0, 3)
  for (const holding of candidates) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const rate = await getOverseasExchangeRate(holding)
        const updatedAt = new Date().toISOString()
        lastSuccessfulUsdKrwRate = rate
        lastSuccessfulUsdKrwUpdatedAt = updatedAt
        console.info('[KIS exchange-rate] source=live', { symbol: holding.symbol, exchange: holding.exchange })
        return { rate, source: 'live', updatedAt }
      } catch {
        // The overseas detail endpoint can reject an immediately following
        // quote request due to its per-second limit. Retry once without
        // touching token issuance or falling back to another provider.
        if (attempt === 0) await pause(RATE_LIMIT_RETRY_DELAY_MS)
      }
    }
  }

  if (lastSuccessfulUsdKrwRate) {
    console.info('[KIS exchange-rate] source=cache')
    return { rate: lastSuccessfulUsdKrwRate, source: 'cache', updatedAt: lastSuccessfulUsdKrwUpdatedAt }
  }
  return null
}
