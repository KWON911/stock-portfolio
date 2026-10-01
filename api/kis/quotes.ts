import { kisGet } from './client.js'

export type ApiHolding = { market: 'KR' | 'US'; symbol: string; exchange?: 'NASDAQ' | 'NYSE' | 'AMEX' }
export type ApiPrice = { currentPrice: number; previousClose: number; currency: 'KRW' | 'USD'; status: 'live'; updatedAt: string }

const numberOf = (output: Record<string, unknown>, fields: string[]) => {
  for (const field of fields) {
    const value = Number(output[field])
    if (Number.isFinite(value) && value > 0) return value
  }
  throw new Error('KIS response did not include a usable price')
}

// KIS overseas quotation exchange codes used by the prior working provider.
const EXCHANGE_CODES = { NASDAQ: 'NAS', NYSE: 'NYS', AMEX: 'AMS' } as const

export const getKisExchangeCode = (holding: ApiHolding) => EXCHANGE_CODES[holding.exchange ?? 'NASDAQ'] ?? 'NAS'

export async function getDomesticQuote(symbol: string): Promise<ApiPrice> {
  const output = await kisGet(
    '/uapi/domestic-stock/v1/quotations/inquire-price',
    'FHKST01010100',
    { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: symbol },
  )
  return {
    currentPrice: numberOf(output, ['stck_prpr']),
    previousClose: numberOf(output, ['stck_sdpr']),
    currency: 'KRW',
    status: 'live',
    updatedAt: new Date().toISOString(),
  }
}

export async function getOverseasQuote(holding: ApiHolding): Promise<ApiPrice> {
  const output = await kisGet(
    '/uapi/overseas-price/v1/quotations/price',
    'HHDFS00000300',
    { AUTH: '', EXCD: getKisExchangeCode(holding), SYMB: holding.symbol },
  )
  return {
    // KIS overseas quotation: last = current price, base = prior close.
    currentPrice: numberOf(output, ['last']),
    previousClose: numberOf(output, ['base']),
    currency: 'USD',
    status: 'live',
    updatedAt: new Date().toISOString(),
  }
}

/** KIS overseas price detail output.t_rate is the day's USD/KRW rate. */
export async function getOverseasExchangeRate(holding: ApiHolding): Promise<number> {
  const output = await kisGet(
    '/uapi/overseas-price/v1/quotations/price-detail',
    'HHDFS76200200',
    { AUTH: '', EXCD: getKisExchangeCode(holding), SYMB: holding.symbol },
  )
  return numberOf(output, ['t_rate'])
}
