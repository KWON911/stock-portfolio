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
// KIS overseas product information uses a different market-code set than its
// quotation endpoint. These values are from the official search-info spec.
const OVERSEAS_PRODUCT_TYPES = { NASDAQ: '512', NYSE: '513', AMEX: '529' } as const

export const getKisExchangeCode = (holding: ApiHolding) => EXCHANGE_CODES[holding.exchange ?? 'NASDAQ'] ?? 'NAS'
export const getOverseasProductType = (holding: ApiHolding) => OVERSEAS_PRODUCT_TYPES[holding.exchange ?? 'NASDAQ'] ?? '512'
export const getDomesticQuoteParams = (symbol: string) => ({ FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: symbol })
export const getDomesticStockInfoParams = (symbol: string) => ({ PRDT_TYPE_CD: '300', PDNO: symbol })

function requiredText(output: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = output[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  throw new Error('KIS response did not include a usable stock name')
}

async function domesticQuoteOutput(symbol: string) {
  return kisGet(
    '/uapi/domestic-stock/v1/quotations/inquire-price',
    'FHKST01010100',
    getDomesticQuoteParams(symbol),
  )
}

function domesticPrice(output: Record<string, unknown>): ApiPrice {
  return {
    currentPrice: numberOf(output, ['stck_prpr']),
    previousClose: numberOf(output, ['stck_sdpr']),
    currency: 'KRW',
    status: 'live',
    updatedAt: new Date().toISOString(),
  }
}

export async function getDomesticQuote(symbol: string): Promise<ApiPrice> { return domesticPrice(await domesticQuoteOutput(symbol)) }

/** Registration-only lookup; inquire-price does not provide the stock name. */
export async function getDomesticStockInfo(symbol: string) {
  const output = await kisGet(
    '/uapi/domestic-stock/v1/quotations/search-stock-info',
    'CTPF1002R',
    getDomesticStockInfoParams(symbol),
  )
  return { name: requiredText(output, ['prdt_abrv_name', 'prdt_name', 'prdt_name120']) }
}

/**
 * CTPF1702R returns the stable display name for a US listing. This is used
 * only while registering a holding; routine price refreshes keep using the
 * lighter HHDFS00000300 quote endpoint.
 */
export async function getOverseasProductName(holding: ApiHolding) {
  const output = await kisGet(
    '/uapi/overseas-price/v1/quotations/search-info',
    'CTPF1702R',
    { PRDT_TYPE_CD: getOverseasProductType(holding), PDNO: holding.symbol },
  )
  // KIS exposes both English and local display names; prefer the English
  // product name used by the product-information response.
  return requiredText(output, ['prdt_eng_name', 'ovrs_item_name', 'prdt_name'])
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
