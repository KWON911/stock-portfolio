import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPortfolioPrices, type PriceSnapshot } from '../services/priceService'
import type { Holding } from '../types/portfolio'
import { hydrateMarketHolding, mergePriceSnapshot } from '../utils/marketSnapshot'
import { isCompleteQuote } from '../utils/quotePair'

const CACHE_KEY = 'my-stock-portfolio-price-cache-v2'
const LEGACY_CACHE_KEY = 'my-stock-portfolio-price-cache-v1'
const MANUAL_REFRESH_KEY = 'my-stock-portfolio-last-manual-refresh'
const AUTO_REFRESH_ENABLED = true
const AUTO_REFRESH_INTERVAL_MS = 5 * 60_000
const MANUAL_REFRESH_COOLDOWN_MS = 5 * 60_000
type RefreshSource = 'auto' | 'manual'

function normalizeSnapshot(value: unknown): PriceSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const snapshot = value as PriceSnapshot & { exchangeRates?: { USDKRW?: number | PriceSnapshot['exchangeRates']['USDKRW'] } }
  if (!snapshot.prices || !snapshot.updatedAt) return null
  const prices = Object.fromEntries(Object.entries(snapshot.prices).filter(([, price]) => isCompleteQuote(price)).map(([key, price]) => [key, { ...price, status: 'cached' as const }]))
  const legacyRate = typeof snapshot.exchangeRates?.USDKRW === 'number' ? snapshot.exchangeRates.USDKRW : undefined
  const rate = legacyRate ? { rate: legacyRate, status: 'cached' as const, updatedAt: snapshot.updatedAt } : snapshot.exchangeRates?.USDKRW
  return { ...snapshot, prices, exchangeRates: rate ? { USDKRW: rate } : {} }
}
function cachedSnapshot(): PriceSnapshot | null { try { const raw = sessionStorage.getItem(CACHE_KEY) ?? sessionStorage.getItem(LEGACY_CACHE_KEY); return raw ? normalizeSnapshot(JSON.parse(raw)) : null } catch { return null } }

export function useMarketPrices(holdings: Holding[]) {
  const [snapshot, setSnapshot] = useState<PriceSnapshot | null>(cachedSnapshot)
  const snapshotRef = useRef(snapshot)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)
  const cachedUpdatedAt = snapshot?.updatedAt ? Date.parse(snapshot.updatedAt) : 0
  const lastSuccessfulRefreshAt = useRef(Number.isFinite(cachedUpdatedAt) ? cachedUpdatedAt : 0)
  const refresh = useCallback(async (source: RefreshSource = 'manual') => {
    if (running.current || holdings.length === 0) return false
    if (source === 'auto' && document.visibilityState !== 'visible') return false
    if (source === 'manual') {
      const lastManual = Number(localStorage.getItem(MANUAL_REFRESH_KEY) ?? 0)
      if (lastManual && Date.now() - lastManual < MANUAL_REFRESH_COOLDOWN_MS) { setError('잠시 후 다시 갱신할 수 있습니다.'); return false }
      localStorage.setItem(MANUAL_REFRESH_KEY, String(Date.now()))
    }
    running.current = true; setLoading(true); setError(null)
    try {
      const next = await getPortfolioPrices(holdings)
      const merged = mergePriceSnapshot(snapshotRef.current, next)
      snapshotRef.current = merged
      setSnapshot(merged)
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(merged))
      if (!next.partial) lastSuccessfulRefreshAt.current = Date.now()
      return true
    } catch {
      setError('일부 시세를 업데이트하지 못했습니다.')
      return false
    } finally { running.current = false; setLoading(false) }
  }, [holdings])
  useEffect(() => {
    if (!AUTO_REFRESH_ENABLED || holdings.length === 0) return
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void refresh('auto') }
    refreshWhenVisible()
    const interval = window.setInterval(refreshWhenVisible, AUTO_REFRESH_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastSuccessfulRefreshAt.current >= AUTO_REFRESH_INTERVAL_MS) refreshWhenVisible()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [holdings.length, refresh])
  const hydrated = useMemo(() => holdings.map(holding => hydrateMarketHolding(holding, snapshot)), [holdings, snapshot])
  return { holdings: hydrated, exchangeRate: snapshot?.exchangeRates.USDKRW, updatedAt: snapshot?.updatedAt, loading, error, refresh, failures: snapshot?.failures ?? [], autoRefreshEnabled: AUTO_REFRESH_ENABLED }
}
