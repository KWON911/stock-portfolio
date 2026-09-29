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
// API 호출은 포트폴리오 요청당 미국 보유 종목 하나에 대해서만 발생한다.
export async function getUsdKrwRate(holding?: ApiHolding): Promise<ExchangeRateResult | null> {
  if (holding) {
    try {
      const rate = await getOverseasExchangeRate(holding)
      const updatedAt = new Date().toISOString()
      lastSuccessfulUsdKrwRate = rate; lastSuccessfulUsdKrwUpdatedAt = updatedAt
      console.info('[exchange-rate] live', { market: holding.market, symbol: holding.symbol, exchange: holding.exchange })
      return { rate, source: 'live', updatedAt }
    } catch {
      console.warn('[exchange-rate] live request failed; using cached or fallback rate')
    }
  }
  if (lastSuccessfulUsdKrwRate) return { rate: lastSuccessfulUsdKrwRate, source: 'cache', updatedAt: lastSuccessfulUsdKrwUpdatedAt }
  const rate = fallbackRate()
  return rate ? { rate, source: 'fallback' } : null
}
