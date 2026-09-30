import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CalculatedHolding } from '../types/portfolio'
import { createTreemapLayout } from '../utils/treemapLayout'

const rate = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
const money = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const tone = (value: number) => value >= 3 ? 'up-strong' : value >= 2 ? 'up-medium' : value > 0.12 ? 'up-light' : value <= -3 ? 'down-strong' : value <= -2 ? 'down-medium' : value < -0.12 ? 'down-light' : 'flat'

export function PortfolioTreemap({ items, onSelect }: { items: CalculatedHolding[]; onSelect: (item: CalculatedHolding) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; setSize(previous => previous.width === width && previous.height === height ? previous : { width, height }) })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const tiles = useMemo(() => createTreemapLayout(items, size.width, size.height), [items, size])
  const total = useMemo(() => tiles.reduce((sum, tile) => sum + tile.value, 0), [tiles])
  return <section className="treemap-section"><div className="section-title"><div><h2>보유 비중</h2><p>면적은 평가금액 비중 · 색상은 오늘 등락률</p></div><span>{items.length}개 종목</span></div><div className="treemap" ref={ref}>{tiles.map(tile => {
    const { item, width, height } = tile
    const showFull = width >= 120 && height >= 70
    const showRate = width >= 70 && height >= 45
    const showName = width >= 45 && height >= 28
    const label = item.displayName ?? item.name
    const allocation = total ? tile.value / total * 100 : 0
    return <button key={`${item.market}-${item.symbol}-${item.category}`} className={`tile tile-${tone(item.dailyRate)}`} style={{ left: tile.x, top: tile.y, width, height }} onClick={() => onSelect(item)} aria-label={`${label}, 자산 비중 ${allocation.toFixed(1)}%, 오늘 ${rate(item.dailyRate)}, 상세 보기`} title={`${label}\n평가금액 ${money(item.value)}\n비중 ${allocation.toFixed(1)}%\n오늘 ${rate(item.dailyRate)}`}>{showName && <b>{showFull || showRate ? label : item.displayName ?? item.symbol}</b>}{showRate && <span>{rate(item.dailyRate)}</span>}{showFull && <small>{allocation.toFixed(1)}%</small>}</button>
  })}</div></section>
}
