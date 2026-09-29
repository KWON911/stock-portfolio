import { kisGet } from './client.js'

export type ApiHolding = { market: 'KR' | 'US'; symbol: string; exchange?: 'NASDAQ' | 'NYSE' | 'AMEX' }
export type ApiPrice = { currentPrice: number; previousClose: number; currency: 'KRW' | 'USD' }
const numberOf = (output: Record<string, unknown>, fields: string[]) => {
  for (const field of fields) { const value = Number(output[field]); if (Number.isFinite(value) && value > 0) return value }
  throw new Error('KIS response did not include a usable price')
}

export const getKisExchangeCode = (holding: ApiHolding) => ({ NASDAQ: 'NAS', NYSE: 'NYS', AMEX: 'AMS' }[holding.exchange ?? 'NASDAQ'] ?? 'NAS')

export async function getDomesticQuote(symbol: string): Promise<ApiPrice> {
  const output = await kisGet('/uapi/domestic-stock/v1/quotations/inquire-price', 'FHKST01010100', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: symbol })
  return { currentPrice: numberOf(output, ['stck_prpr']), previousClose: numberOf(output, ['stck_sdpr']), currency: 'KRW' }
}

export async function getOverseasQuote(holding: ApiHolding): Promise<ApiPrice> {
  const output = await kisGet('/uapi/overseas-price/v1/quotations/price', 'HHDFS00000300', { AUTH: '', EXCD: getKisExchangeCode(holding), SYMB: holding.symbol })
  // KIS 해외 현재체결가 응답의 last(현재가)와 base(전일 종가)를 사용합니다.
  return { currentPrice: numberOf(output, ['last']), previousClose: numberOf(output, ['base']), currency: 'USD' }
}
