/// <reference types="node" />

import { getUsdKrwRate } from './toss/exchangeRate.js'
import { TossApiError } from './toss/client.js'
import { getTossQuotes, type ApiHolding } from './toss/quotes.js'
import { loadLocalTossEnv } from './loadLocalTossEnv.js'

type RequestLike = { method?: string; body?: { holdings?: ApiHolding[] } | string }
type ResponseLike = { status: (code: number) => ResponseLike; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }
const identifier = (holding: ApiHolding) => `${holding.market}:${holding.exchange ?? ''}:${holding.symbol}`
const lastSuccessfulPrices = new Map<string, { currentPrice: number; previousClose: number; currency: 'KRW' | 'USD'; status: 'cached'; updatedAt?: string }>()

const failureReason = (error?: TossApiError) => error?.status === 401 ? 'quote_unauthorized' : error?.status === 403 ? 'quote_forbidden' : error?.status === 429 ? 'quote_rate_limited' : error?.status && error.status >= 500 ? 'quote_provider_unavailable' : 'quote_request_failed'

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Cache-Control', 'no-store')
  loadLocalTossEnv()
  if (req.method !== 'POST') { res.status(405); return res.json({ error: 'Method not allowed' }) }
  const body: unknown = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const raw = Array.isArray((body as { holdings?: unknown })?.holdings) ? (body as { holdings: unknown[] }).holdings : []
  const isHolding = (value: unknown): value is ApiHolding => typeof value === 'object' && value !== null && ((value as ApiHolding).market === 'KR' || (value as ApiHolding).market === 'US') && typeof (value as ApiHolding).symbol === 'string'
  const holdings = [...new Map(raw.filter(isHolding).map(holding => [identifier(holding), holding])).values()]
  const hasClientId = Boolean(process.env.TOSS_CLIENT_ID)
  const hasClientSecret = Boolean(process.env.TOSS_CLIENT_SECRET)
  console.info('[Toss] credential configuration', { 'TOSS_CLIENT_ID configured': hasClientId, 'TOSS_CLIENT_SECRET configured': hasClientSecret })
  if (!hasClientId || !hasClientSecret) {
    console.warn('[Toss] request blocked', { stage: 'oauth_token', endpoint: '/oauth2/token', status: 503, apiCode: 'credentials_not_configured' })
    res.status(503)
    return res.json({ error: 'Toss credentials are not configured', reason: 'credentials_not_configured' })
  }
  const batch = await getTossQuotes(holdings)
  const prices: Record<string, unknown> = {}
  const failures: { key: string; market: ApiHolding['market']; symbol: string; reason: string; retryAfter?: string | null; apiCode?: string; apiMessage?: string }[] = []
  let liveTossQuoteCount = 0
  holdings.forEach(holding => {
    const key = identifier(holding)
    const quote = batch.quotes.get(holding.symbol.toUpperCase())
    if (quote) {
      prices[key] = quote
      lastSuccessfulPrices.set(key, { ...quote, status: 'cached' })
      liveTossQuoteCount += 1
      console.info('[quote] live', { market: holding.market, symbol: holding.symbol, exchange: holding.exchange })
      return
    }
    const cached = lastSuccessfulPrices.get(key)
    if (cached) prices[key] = cached
    else {
      const error = batch.failures.get(holding.symbol.toUpperCase())
      failures.push({ key, market: holding.market, symbol: holding.symbol, reason: failureReason(error), retryAfter: error?.retryAfter, apiCode: error?.apiCode, apiMessage: error?.apiMessage })
      console.warn('[Toss] quote failed', { stage: 'quote', endpoint: '/api/v1/prices', market: holding.market, symbol: holding.symbol, exchange: holding.exchange, status: error?.status, apiCode: error?.apiCode, apiMessage: error?.apiMessage, retryAfter: error?.retryAfter })
    }
  })
  const rate = holdings.some(holding => holding.market === 'US') ? await getUsdKrwRate() : null
  if (liveTossQuoteCount > 0) {
    console.info('[Market Data] provider=toss')
    console.info(`[Market Data] quotes=${liveTossQuoteCount}`)
  }
  if (rate?.source === 'live') console.info('[Market Data] exchangeRate=toss')
  res.status(200)
  return res.json({ provider: liveTossQuoteCount > 0 ? 'toss' : undefined, prices, exchangeRates: rate ? { USDKRW: { rate: rate.rate, status: rate.source === 'cache' ? 'cached' : rate.source, updatedAt: rate.updatedAt } } : {}, updatedAt: new Date().toISOString(), partial: failures.length > 0, failures })
}
