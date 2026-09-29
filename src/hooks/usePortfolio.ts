import { useEffect, useState } from 'react'
import { samplePortfolio } from '../data/samplePortfolio'
import type { Holding } from '../types/portfolio'
const KEY = 'my-stock-portfolio-v1'

export function usePortfolio() {
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (!saved) return samplePortfolio
      return (JSON.parse(saved) as Holding[]).map(holding => ({
        ...holding,
        // V1에서 미국 가격은 KRW 금액으로 입력되었으므로, 기존 큰 숫자는 그대로 KRW로 보존합니다.
        currency: holding.currency ?? (holding.market === 'US' && holding.currentPrice > 10000 ? 'KRW' : holding.market === 'US' ? 'USD' : 'KRW'),
      }))
    } catch { return samplePortfolio }
  })
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(holdings)) }, [holdings])
  const save = (holding: Holding) => setHoldings(items => items.some(x => x.id === holding.id) ? items.map(x => x.id === holding.id ? holding : x) : [...items, holding])
  return { holdings, save, remove: (id: string) => setHoldings(items => items.filter(x => x.id !== id)), reset: () => setHoldings(samplePortfolio) }
}
