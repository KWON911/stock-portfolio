/**
 * KIS의 공개 현재가 API는 계좌 없이 쓸 수 있는 USD/KRW 단일 현재환율 사양을 공식 예제로 확인하지 못했습니다.
 * 따라서 환율 공급자는 분리해 두고, 검증된 KIS 엔드포인트가 확인되면 이 함수만 교체합니다.
 */
import { getOverseasExchangeRate, type ApiHolding } from './quotes.js'

export type ExchangeRateResult = { rate: number; source: 'live' | 'cache' | 'fallback'; updatedAt?: string }
const runtimeEnv = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
let lastSuccessfulUsdKrwRate: number | undefined
let lastSuccessfulUsdKrwUpdatedAt: string | undefined

const fallbackRate = () => {
  const rate = Number(runtimeEnv.KIS_USDKRW_FALLBACK)
  return Number.isFinite(rate) && rate > 0 ? rate : undefined
}

// KIS [해외주식 현재가상세] v1_해외주식-010의 output.t_rate(당일환율)를 사용한다.
// 이미 가격 조회에 성공한 미국 종목을 최대 세 개까지 순차 시도하고, 첫 성공값을 사용한다.
export async function getUsdKrwRate(holdings: ApiHolding[]): Promise<ExchangeRateResult | null> {
  const candidates = holdings.filter(holding => holding.market === 'US').slice(0, 3)
  for (const holding of candidates) {
    try {
      const rate = await getOverseasExchangeRate(holding)
      const updatedAt = new Date().toISOString()
      lastSuccessfulUsdKrwRate = rate; lastSuccessfulUsdKrwUpdatedAt = updatedAt
      console.info('[exchange-rate] live', { symbol: holding.symbol, exchange: holding.exchange })
      return { rate, source: 'live', updatedAt }
    } catch { /* kisGet emits a safe diagnostic; try the next candidate. */ }
  }
  if (candidates.length) console.warn('[exchange-rate] live request failed; using cached or fallback rate')
  if (lastSuccessfulUsdKrwRate) return { rate: lastSuccessfulUsdKrwRate, source: 'cache', updatedAt: lastSuccessfulUsdKrwUpdatedAt }
  const rate = fallbackRate()
  return rate ? { rate, source: 'fallback' } : null
}
