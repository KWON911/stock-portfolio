import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPortfolioPrices, priceKey, type PriceSnapshot } from '../services/priceService'
import type { Holding } from '../types/portfolio'

const CACHE_KEY = 'my-stock-portfolio-price-cache-v2'
const LEGACY_CACHE_KEY = 'my-stock-portfolio-price-cache-v1'
const MANUAL_REFRESH_KEY = 'my-stock-portfolio-last-manual-refresh'
const AUTO_REFRESH_ENABLED = false
const MANUAL_REFRESH_COOLDOWN_MS = 5 * 60_000

function normalizeSnapshot(value: unknown): PriceSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const snapshot = value as PriceSnapshot & { exchangeRates?: { USDKRW?: number | PriceSnapshot['exchangeRates']['USDKRW'] } }
  if (!snapshot.prices || !snapshot.updatedAt) return null
  const prices = Object.fromEntries(Object.entries(snapshot.prices).map(([key, price]) => [key, { ...price, status: price.status ?? 'cached' }]))
  const legacyRate = typeof snapshot.exchangeRates?.USDKRW === 'number' ? snapshot.exchangeRates.USDKRW : undefined
  const rate = legacyRate ? { rate: legacyRate, status: 'cached' as const, updatedAt: snapshot.updatedAt } : snapshot.exchangeRates?.USDKRW
  return { ...snapshot, prices, exchangeRates: rate ? { USDKRW: rate } : {} }
}
function cachedSnapshot(): PriceSnapshot | null { try { const raw = sessionStorage.getItem(CACHE_KEY) ?? sessionStorage.getItem(LEGACY_CACHE_KEY); return raw ? normalizeSnapshot(JSON.parse(raw)) : null } catch { return null } }

export function useMarketPrices(holdings: Holding[]) {
  const [snapshot, setSnapshot] = useState<PriceSnapshot | null>(cachedSnapshot)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)
  const refresh = useCallback(async () => {
    if (running.current || holdings.length === 0) return
    const lastManual = Number(localStorage.getItem(MANUAL_REFRESH_KEY) ?? 0)
    if (lastManual && Date.now() - lastManual < MANUAL_REFRESH_COOLDOWN_MS) { setError('잠시 후 다시 갱신할 수 있습니다.'); return }
    localStorage.setItem(MANUAL_REFRESH_KEY, String(Date.now()))
    running.current = true; setLoading(true); setError(null)
    try { const next = await getPortfolioPrices(holdings); setSnapshot(next); sessionStorage.setItem(CACHE_KEY, JSON.stringify(next)) }
    catch { setError('일부 시세를 업데이트하지 못했습니다.') }
    finally { running.current = false; setLoading(false) }
  }, [holdings])
  useEffect(() => {
    if (!AUTO_REFRESH_ENABLED) return
    void refresh()
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [refresh])
  const hydrated = useMemo(() => holdings.map(holding => {
    const price = snapshot?.prices[priceKey(holding)]
    return price ? { ...holding, ...price, priceStatus: price.status, priceUpdatedAt: price.updatedAt } : { ...holding, priceStatus: 'fallback' as const }
  }), [holdings, snapshot])
  return { holdings: hydrated, exchangeRate: snapshot?.exchangeRates.USDKRW, updatedAt: snapshot?.updatedAt, loading, error, refresh, failures: snapshot?.failures ?? [], autoRefreshEnabled: AUTO_REFRESH_ENABLED }
}
