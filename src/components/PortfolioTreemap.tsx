import type { CalculatedHolding } from '../types/portfolio'
const rate = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
export function PortfolioTreemap({ items, onSelect }: { items: CalculatedHolding[]; onSelect: (item: CalculatedHolding) => void }) {
  const total = Math.max(items.reduce((s,x) => s+x.value, 0), 1)
  return <section className="treemap-section"><div className="section-title"><div><h2>보유 비중</h2><p>오늘 등락률 기준</p></div><span>{items.length}개 종목</span></div><div className="treemap">{items.map(item => <button key={`${item.market}-${item.symbol}`} className={`tile ${item.dailyRate > 0.12 ? 'tile-up' : item.dailyRate < -0.12 ? 'tile-down' : 'tile-flat'}`} style={{ flexGrow: Math.max(item.value / total * 10, .7), flexBasis: `${Math.max(item.value / total * 100, 22)}%` }} onClick={() => onSelect(item)} aria-label={`${item.displayName ?? item.name} 상세 보기`}><b title={item.name}>{item.displayName ?? item.name}</b><span>{rate(item.dailyRate)}</span><small>{item.allocation.toFixed(1)}%</small></button>)}</div></section>
}
