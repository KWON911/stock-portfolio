/// <reference types="node" />

import { TossApiError, tossGet } from './client.js'

export type ExchangeRateResult = { rate: number; source: 'live' | 'cache' | 'fallback'; updatedAt?: string }
let lastSuccessfulUsdKrwRate: number | undefined
let lastSuccessfulUsdKrwUpdatedAt: string | undefined

const numberOf = (value: unknown) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : undefined }
const asRecord = (value: unknown): Record<string, unknown> | null => typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
const fallbackRate = () => numberOf(process.env.TOSS_USDKRW_FALLBACK)

function findUsdKrwRate(body: unknown): number | undefined {
  const root = asRecord(body)
  const result = root?.result
  const entries = Array.isArray(result) ? result : [result]
  for (const entry of entries) {
    const item = asRecord(entry)
    if (!item) continue
    const pair = String(item.currencyPair ?? item.symbol ?? `${item.baseCurrency ?? ''}${item.quoteCurrency ?? ''}`).replace(/[^A-Za-z]/g, '').toUpperCase()
    if (pair && pair !== 'USDKRW') continue
    const rate = numberOf(item.rate) ?? numberOf(item.exchangeRate) ?? numberOf(item.usdKrwRate) ?? numberOf(item.lastPrice)
    if (rate) return rate
  }
  return undefined
}

export async function getUsdKrwRate(): Promise<ExchangeRateResult | null> {
  try {
    const rate = findUsdKrwRate(await tossGet('/api/v1/exchange-rate', { baseCurrency: 'USD', quoteCurrency: 'KRW' }, { stage: 'exchange_rate' }))
    if (!rate) throw new Error('Toss exchange-rate response did not include USD/KRW')
    const updatedAt = new Date().toISOString()
    lastSuccessfulUsdKrwRate = rate
    lastSuccessfulUsdKrwUpdatedAt = updatedAt
    console.info('[exchange-rate] live')
    return { rate, source: 'live', updatedAt }
  } catch (cause) {
    const error = cause instanceof TossApiError ? cause : undefined
    console.warn('[Toss] exchange-rate failed', { stage: 'exchange_rate', endpoint: '/api/v1/exchange-rate', status: error?.status, apiCode: error?.apiCode, apiMessage: error?.apiMessage, retryAfter: error?.retryAfter })
  }
  if (lastSuccessfulUsdKrwRate) return { rate: lastSuccessfulUsdKrwRate, source: 'cache', updatedAt: lastSuccessfulUsdKrwUpdatedAt }
  const rate = fallbackRate()
  return rate ? { rate, source: 'fallback' } : null
}
