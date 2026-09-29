import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPortfolioPrices, priceKey, type PriceSnapshot } from '../services/priceService'
import type { Holding } from '../types/portfolio'

const CACHE_KEY = 'my-stock-portfolio-price-cache-v1'
const FALLBACK_USDKRW = 1380

function cachedSnapshot(): PriceSnapshot | null { try { const raw = sessionStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) as PriceSnapshot : null } catch { return null } }

export function useMarketPrices(holdings: Holding[]) {
  const [snapshot, setSnapshot] = useState<PriceSnapshot | null>(cachedSnapshot)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)
  const refresh = useCallback(async () => {
    if (running.current || holdings.length === 0) return
    running.current = true; setLoading(true); setError(null)
    try { const next = await getPortfolioPrices(holdings); setSnapshot(next); sessionStorage.setItem(CACHE_KEY, JSON.stringify(next)) }
    catch { setError('일부 시세를 업데이트하지 못했습니다.') }
    finally { running.current = false; setLoading(false) }
  }, [holdings])
  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [refresh])
  const hydrated = useMemo(() => holdings.map(holding => {
    const price = snapshot?.prices[priceKey(holding)]
    return price ? { ...holding, ...price } : holding
  }), [holdings, snapshot])
  return { holdings: hydrated, exchangeRate: snapshot?.exchangeRates.USDKRW ?? FALLBACK_USDKRW, updatedAt: snapshot?.updatedAt, loading, error, refresh }
}
