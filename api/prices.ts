import { getUsdKrwRate } from './kis/exchangeRate.js'
import { getDomesticQuote, getOverseasQuote, type ApiHolding } from './kis/quotes.js'

type RequestLike = { method?: string; body?: { holdings?: ApiHolding[] } | string }
type ResponseLike = { status: (code: number) => ResponseLike; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }
const identifier = (holding: ApiHolding) => `${holding.market}:${holding.exchange ?? ''}:${holding.symbol}`
const runtimeEnv = ((globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {})

async function concurrent<T>(jobs: (() => Promise<T>)[], limit = 3) {
  const results: PromiseSettledResult<T>[] = []; let cursor = 0
  const worker = async () => { while (cursor < jobs.length) { const index = cursor++; results[index] = await Promise.resolve(jobs[index]()).then(value => ({ status: 'fulfilled', value }) as PromiseFulfilledResult<T>).catch(reason => ({ status: 'rejected', reason }) as PromiseRejectedResult) } }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker)); return results
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') { res.status(405); return res.json({ error: 'Method not allowed' }) }
  const body: unknown = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const raw = Array.isArray((body as { holdings?: unknown })?.holdings) ? (body as { holdings: unknown[] }).holdings : []
  const isHolding = (value: unknown): value is ApiHolding => typeof value === 'object' && value !== null && ((value as ApiHolding).market === 'KR' || (value as ApiHolding).market === 'US') && typeof (value as ApiHolding).symbol === 'string'
  const holdings = [...new Map(raw.filter(isHolding).map(holding => [identifier(holding), holding])).values()]
  if (!runtimeEnv.KIS_APP_KEY || !runtimeEnv.KIS_APP_SECRET) { res.status(503); return res.json({ error: 'KIS credentials are not configured' }) }
  const jobs = holdings.map(holding => async () => ({ id: identifier(holding), quote: holding.market === 'KR' ? await getDomesticQuote(holding.symbol) : await getOverseasQuote(holding) }))
  const settled = await concurrent(jobs)
  const prices: Record<string, unknown> = {}
  settled.forEach(result => { if (result.status === 'fulfilled') prices[result.value.id] = result.value.quote })
  const rate = await getUsdKrwRate()
  res.status(200)
  return res.json({ prices, exchangeRates: rate ? { USDKRW: rate } : {}, updatedAt: new Date().toISOString(), partial: settled.some(result => result.status === 'rejected') })
}
