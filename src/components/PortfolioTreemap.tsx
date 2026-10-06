import { Maximize2, X } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CalculatedHolding } from '../types/portfolio'
import { createTreemapLayout } from '../utils/treemapLayout'

const rate = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
const money = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const tone = (value: number) => value >= 3 ? 'up-strong' : value >= 1 ? 'up-medium' : value > 0 ? 'up-light' : value <= -3 ? 'down-strong' : value <= -1 ? 'down-medium' : value < 0 ? 'down-light' : 'flat'

export function PortfolioTreemap({ items, onSelect }: { items: CalculatedHolding[]; onSelect: (item: CalculatedHolding) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  const entering = useRef(false)
  const titleId = useId()
  const [mode, setMode] = useState<'inline' | 'native' | 'fallback'>('inline')
  const expanded = mode !== 'inline'
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const onFullscreenChange = () => {
      if (document.fullscreenElement === sectionRef.current) setMode('native')
      else setMode(previous => previous === 'native' ? 'inline' : previous)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])
  useEffect(() => {
    if (!expanded) return
    const section = sectionRef.current
    const action = actionRef.current
    const previousOverflow = document.body.style.overflow
    const siblings: { element: HTMLElement; inert: boolean }[] = []
    // Isolate the visualization and restore original inert flags on exit.
    for (let node: HTMLElement | null = section; node?.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && sibling instanceof HTMLElement) {
          siblings.push({ element: sibling, inert: sibling.inert })
          sibling.inert = true
        }
      }
      if (node.parentElement === document.body) break
    }
    document.body.style.overflow = 'hidden'
    action?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (document.fullscreenElement === section) void document.exitFullscreen().then(() => setMode('inline')).catch(() => undefined)
        else setMode('inline')
      }
      if (event.key !== 'Tab' || !section) return
      const controls = [...section.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      siblings.forEach(({ element, inert }) => { element.inert = inert })
      document.removeEventListener('keydown', onKeyDown)
      if (action?.isConnected) action.focus({ preventScroll: true })
    }
  }, [expanded])
  const closeExpanded = async () => {
    if (document.fullscreenElement === sectionRef.current) {
      try { await document.exitFullscreen() } catch { return false }
    }
    setMode('inline')
    return true
  }
  const toggleExpanded = async () => {
    if (entering.current) return
    if (expanded) { await closeExpanded(); return }
    entering.current = true
    try {
      if (!sectionRef.current?.requestFullscreen || !document.fullscreenEnabled) setMode('fallback')
      else { await sectionRef.current.requestFullscreen(); setMode('native') }
    } catch { setMode('fallback') }
    finally { entering.current = false }
  }
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; setSize(previous => previous.width === width && previous.height === height ? previous : { width, height }) })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const tiles = useMemo(() => createTreemapLayout(items, size.width, size.height), [items, size])
  const total = useMemo(() => tiles.reduce((sum, tile) => sum + tile.value, 0), [tiles])
  return <section ref={sectionRef} className={`treemap-section${expanded ? ' treemap-expanded' : ''}${mode === 'fallback' ? ' treemap-fallback' : ''}`} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} aria-labelledby={titleId}>
    <div className="treemap-toolbar"><div><h2 id={titleId}>보유 비중</h2><p>면적은 평가금액 비중 · 색상은 오늘 등락률</p></div><button type="button" ref={actionRef} className="treemap-expand" onClick={() => void toggleExpanded()} aria-expanded={expanded}>{expanded ? <X size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}<span>{expanded ? '닫기' : '전체화면'}</span></button></div>
    <div className="treemap-meta"><span>{tiles.length}개 종목</span><div className="treemap-legend" aria-label="오늘 등락률 색상 범례"><span>하락</span><i className="legend-down-strong" /><i className="legend-down-medium" /><i className="legend-down-light" /><span className="legend-zero">0</span><i className="legend-up-light" /><i className="legend-up-medium" /><i className="legend-up-strong" /><span>상승</span></div></div>
    <div className="treemap" ref={ref}>{tiles.length === 0 && <div className="treemap-empty">표시할 보유 자산이 없습니다.</div>}{tiles.map(tile => {
    const { item, width, height } = tile
    const density = width >= 200 && height >= 180 ? 'large' : width >= 130 && height >= 115 ? 'medium' : width >= 82 && height >= 54 ? 'compact' : 'micro'
    const showFull = density === 'large' || density === 'medium'
    const showRate = density !== 'micro'
    const showName = width >= 42 && height >= 28
    const label = item.displayName ?? item.name
    const allocation = total ? tile.value / total * 100 : 0
    const shortLabel = item.displayName ?? (density === 'compact' && item.market === 'KR' ? item.name : item.symbol)
    return <button type="button" key={`${item.market}-${item.symbol}-${item.category}`} className={`tile tile-${tone(item.dailyRate)} tile--${density}`} style={{ left: tile.x, top: tile.y, width, height }} onClick={() => { void (async () => { if (!expanded || await closeExpanded()) onSelect(item) })() }} aria-label={`${label}, 자산 비중 ${allocation.toFixed(1)}%, 오늘 ${rate(item.dailyRate)}, 상세 보기`} title={`${label}\n평가금액 ${money(item.value)}\n비중 ${allocation.toFixed(1)}%\n오늘 ${rate(item.dailyRate)}`}>{showName && <b>{showFull ? label : shortLabel}</b>}{density === 'large' && <em>{item.symbol}</em>}{showRate && <span>{rate(item.dailyRate)}</span>}{showFull && <small>비중 {allocation.toFixed(1)}%</small>}</button>
  })}</div></section>
}
