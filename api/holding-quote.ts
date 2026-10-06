/// <reference types="node" />

import { getDomesticQuote, getDomesticStockInfo, getOverseasProductName, getOverseasQuote, type ApiHolding } from './kis/quotes.js'

type RequestLike = { method?: string; body?: { holding?: ApiHolding } | string }
type ResponseLike = { status: (code: number) => ResponseLike; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }

function parseHolding(body: unknown): ApiHolding | null {
  const holding = (body as { holding?: unknown } | null)?.holding
  if (!holding || typeof holding !== 'object') return null
  const value = holding as ApiHolding
  if ((value.market !== 'KR' && value.market !== 'US') || typeof value.symbol !== 'string' || !value.symbol.trim()) return null
  if (value.market === 'KR' && !/^\d{6}$/.test(value.symbol.trim())) return null
  if (value.market === 'US' && value.exchange && !['NASDAQ', 'NYSE', 'AMEX'].includes(value.exchange)) return null
  return { market: value.market, symbol: value.symbol.trim().toUpperCase(), exchange: value.market === 'US' ? value.exchange ?? 'NASDAQ' : undefined }
}

/** Validates one holding only while it is being registered; it never stores market data. */
export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') { res.status(405); return res.json({ error: 'Method not allowed' }) }

  let body: unknown
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body } catch { body = null }
  const holding = parseHolding(body)
  if (!holding) { res.status(422); return res.json({ error: 'Invalid holding', stage: 'invalid_symbol' }) }
  if (!process.env.KIS_APP_KEY || !process.env.KIS_APP_SECRET) {
    console.warn('[Holding Quote] failed', { stage: 'credentials_not_configured', symbol: holding.symbol })
    res.status(503)
    return res.json({ error: 'Stock information is temporarily unavailable', stage: 'credentials_not_configured' })
  }

  let stage: 'quote_failed' | 'stock_info_failed' = 'quote_failed'
  try {
    const quote = holding.market === 'KR'
      ? await getDomesticQuote(holding.symbol)
      : await getOverseasQuote(holding)
    stage = 'stock_info_failed'
    // Match the existing KIS per-second spacing policy between domestic
    // quote and stock-info calls; ordinary /api/prices stays unchanged.
    if (holding.market === 'KR') await new Promise(resolve => setTimeout(resolve, 1_100))
    const name = holding.market === 'KR'
      ? (await getDomesticStockInfo(holding.symbol)).name
      : await getOverseasProductName(holding)
    console.info('[Holding Quote] verified', { market: holding.market, symbol: holding.symbol, exchange: holding.exchange })
    res.status(200)
    return res.json({ symbol: holding.symbol, name, ...quote })
  } catch (error) {
    // The KIS client keeps provider diagnostics in server logs without exposing
    // tokens, credentials, or provider internals to the browser.
    const failure = error as { upstreamStatus?: number; apiCode?: string; message?: string }
    const rateLimited = failure.upstreamStatus === 429 || failure.apiCode === 'EGW00201'
    const emptyResult = failure.message === 'KIS response did not include a usable price' || failure.message === 'KIS response did not include a usable stock name'
    const status = rateLimited ? 429 : emptyResult ? 422 : failure.upstreamStatus === 503 ? 503 : 502
    const reason = rateLimited ? 'rate_limited' : emptyResult ? 'lookup_empty' : 'upstream_error'
    console.warn('[Holding Quote] failed', { stage, reason, status, upstreamStatus: failure.upstreamStatus, apiCode: failure.apiCode, symbol: holding.symbol })
    res.status(status)
    return res.json({ error: 'Stock information could not be verified', stage, reason })
  }
}
