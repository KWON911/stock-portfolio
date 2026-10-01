/// <reference types="node" />

import { getUsdKrwRate } from './kis/exchangeRate.js'
import { getDomesticQuote, getOverseasQuote, type ApiHolding } from './kis/quotes.js'

type RequestLike = { method?: string; body?: { holdings?: ApiHolding[] } | string }
type ResponseLike = { status: (code: number) => ResponseLike; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }
const identifier = (holding: ApiHolding) => `${holding.market}:${holding.exchange ?? ''}:${holding.symbol}`
const lastSuccessfulPrices = new Map<string, { currentPrice: number; previousClose: number; currency: 'KRW' | 'USD'; status: 'cached'; updatedAt?: string }>()

async function concurrent<T>(jobs: (() => Promise<T>)[], limit = 3) {
  const results: PromiseSettledResult<T>[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < jobs.length) {
      const index = cursor++
      results[index] = await Promise.resolve(jobs[index]())
        .then(value => ({ status: 'fulfilled', value }) as PromiseFulfilledResult<T>)
        .catch(reason => ({ status: 'rejected', reason }) as PromiseRejectedResult)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker))
  return results
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') { res.status(405); return res.json({ error: 'Method not allowed' }) }
  const body: unknown = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const raw = Array.isArray((body as { holdings?: unknown })?.holdings) ? (body as { holdings: unknown[] }).holdings : []
  const isHolding = (value: unknown): value is ApiHolding => typeof value === 'object' && value !== null && ((value as ApiHolding).market === 'KR' || (value as ApiHolding).market === 'US') && typeof (value as ApiHolding).symbol === 'string'
  const holdings = [...new Map(raw.filter(isHolding).map(holding => [identifier(holding), holding])).values()]
  const hasAppKey = Boolean(process.env.KIS_APP_KEY)
  const hasAppSecret = Boolean(process.env.KIS_APP_SECRET)
  if (!hasAppKey || !hasAppSecret) {
    res.status(503)
    return res.json({ error: 'KIS credentials are not configured', reason: 'credentials_not_configured' })
  }

  const jobs = holdings.map(holding => async () => ({
    id: identifier(holding),
    holding,
    quote: holding.market === 'KR' ? await getDomesticQuote(holding.symbol) : await getOverseasQuote(holding),
  }))
  const settled = await concurrent(jobs)
  const prices: Record<string, unknown> = {}
  const failures: { key: string; market: ApiHolding['market']; symbol: string; reason: 'quote_request_failed' }[] = []
  const exchangeRateCandidates: ApiHolding[] = []
  let liveKisQuoteCount = 0
  settled.forEach((result, index) => {
    const holding = holdings[index]
    const key = identifier(holding)
    if (result.status === 'fulfilled') {
      prices[key] = result.value.quote
      lastSuccessfulPrices.set(key, { ...result.value.quote, status: 'cached' })
      liveKisQuoteCount += 1
      if (holding.market === 'US') exchangeRateCandidates.push(holding)
      console.info('[quote] live', { market: holding.market, symbol: holding.symbol, exchange: holding.exchange })
      return
    }
    const cached = lastSuccessfulPrices.get(key)
    if (cached) prices[key] = cached
    else {
      failures.push({ key, market: holding.market, symbol: holding.symbol, reason: 'quote_request_failed' })
    }
    console.warn('[KIS] quote failed', { market: holding.market, symbol: holding.symbol, exchange: holding.exchange })
  })
  const rate = await getUsdKrwRate(exchangeRateCandidates)
  if (liveKisQuoteCount > 0) {
    console.info('[Market Data] provider=kis')
    console.info(`[Market Data] quotes=${liveKisQuoteCount}`)
  }
  if (rate?.source === 'live') console.info('[Market Data] exchangeRate=kis')
  res.status(200)
  return res.json({ provider: liveKisQuoteCount > 0 ? 'kis' : undefined, prices, exchangeRates: rate ? { USDKRW: { rate: rate.rate, status: rate.source === 'cache' ? 'cached' : rate.source, updatedAt: rate.updatedAt } } : {}, updatedAt: new Date().toISOString(), partial: failures.length > 0, failures })
}
