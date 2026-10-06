/// <reference types="node" />

import { getUsdKrwRate } from './kis/exchangeRate.js'
import { getDomesticQuote, getOverseasQuote, type ApiHolding } from './kis/quotes.js'
import { isCompleteQuote } from '../src/utils/quotePair.js'

type RequestLike = { method?: string; body?: { holdings?: ApiHolding[] } | string }
type ResponseLike = { status: (code: number) => ResponseLike; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }
const identifier = (holding: ApiHolding) => `${holding.market}:${holding.exchange ?? ''}:${holding.symbol}`
const lastSuccessfulPrices = new Map<string, { symbol: string; currentPrice: number; previousClose: number; currency: 'KRW' | 'USD'; status: 'cached'; updatedAt?: string }>()

const KIS_REQUEST_INTERVAL_MS = 1_100
const pause = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds))

async function sequential<T>(jobs: (() => Promise<T>)[]) {
  const results: PromiseSettledResult<T>[] = []
  for (let index = 0; index < jobs.length; index += 1) {
    results[index] = await Promise.resolve(jobs[index]())
      .then(value => ({ status: 'fulfilled', value }) as PromiseFulfilledResult<T>)
      .catch(reason => ({ status: 'rejected', reason }) as PromiseRejectedResult)
    if (index < jobs.length - 1) await pause(KIS_REQUEST_INTERVAL_MS)
  }
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

  const jobs = holdings.map(holding => async () => {
    const quote = holding.market === 'KR' ? await getDomesticQuote(holding.symbol) : await getOverseasQuote(holding)
    if (!isCompleteQuote(quote) || quote.currency !== (holding.market === 'KR' ? 'KRW' : 'USD')) throw new Error('Incomplete quotation pair')
    return { id: identifier(holding), holding, quote }
  })
  // KIS can return EGW00201 when different quotation endpoints are hit in the
  // same second. Keep this provider's quote calls spaced without changing the
  // token cache or adding another provider fallback.
  const settled = await sequential(jobs)
  const prices: Record<string, unknown> = {}
  const failures: { key: string; market: ApiHolding['market']; symbol: string; reason: 'quote_request_failed' }[] = []
  const exchangeRateCandidates: ApiHolding[] = []
  let liveKisQuoteCount = 0
  settled.forEach((result, index) => {
    const holding = holdings[index]
    const key = identifier(holding)
    if (result.status === 'fulfilled') {
      prices[key] = result.value.quote
      lastSuccessfulPrices.set(key, { ...result.value.quote, symbol: holding.symbol, status: 'cached' })
      liveKisQuoteCount += 1
      if (holding.market === 'US') exchangeRateCandidates.push(holding)
      console.info('[quote] live', { market: holding.market, symbol: holding.symbol, exchange: holding.exchange })
      return
    }
    const cached = lastSuccessfulPrices.get(key)
    if (cached && cached.symbol === holding.symbol && isCompleteQuote(cached) && cached.currency === (holding.market === 'KR' ? 'KRW' : 'USD')) prices[key] = cached
    else {
      failures.push({ key, market: holding.market, symbol: holding.symbol, reason: 'quote_request_failed' })
    }
    console.warn('[KIS] quote failed', { market: holding.market, symbol: holding.symbol, exchange: holding.exchange })
  })
  // The USD/KRW detail request is also subject to KIS's per-second quota.
  // Space it from the final overseas quote; exchangeRate retains its one-time
  // retry as protection for provider-side transient limits.
  if (exchangeRateCandidates.length) await pause(KIS_REQUEST_INTERVAL_MS)
  const rate = await getUsdKrwRate(exchangeRateCandidates)
  if (liveKisQuoteCount > 0) {
    console.info('[Market Data] provider=kis')
    console.info(`[Market Data] quotes=${liveKisQuoteCount}`)
  }
  if (rate?.source === 'live') console.info('[Market Data] exchangeRate=kis')
  res.status(200)
  return res.json({ provider: liveKisQuoteCount > 0 ? 'kis' : undefined, prices, exchangeRates: rate ? { USDKRW: { rate: rate.rate, status: rate.source === 'cache' ? 'cached' : rate.source, updatedAt: rate.updatedAt } } : {}, updatedAt: new Date().toISOString(), partial: failures.length > 0, failures })
}
