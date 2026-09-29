import { LoaderCircle, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CategoryAllocation } from './components/CategoryAllocation'
import { HoldingForm } from './components/HoldingForm'
import { PortfolioDetail } from './components/PortfolioDetail'
import { PortfolioFilter } from './components/PortfolioFilter'
import { PortfolioList } from './components/PortfolioList'
import { PortfolioSummary } from './components/PortfolioSummary'
import { PortfolioTreemap } from './components/PortfolioTreemap'
import { useMarketPrices } from './hooks/useMarketPrices'
import { usePortfolio } from './hooks/usePortfolio'
import type { CalculatedHolding, Filter, Holding } from './types/portfolio'
import { calculateHoldings } from './utils/portfolioCalculations'

export default function App() {
  const { holdings, save, remove, reset } = usePortfolio()
  const market = useMarketPrices(holdings)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<CalculatedHolding | null>(null)
  const [form, setForm] = useState<Holding | null | undefined>(undefined)
  const items = useMemo(() => calculateHoldings(market.holdings, filter, market.exchangeRate?.rate), [filter, market.exchangeRate, market.holdings])
  const updatedText = market.updatedAt ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(market.updatedAt)) : null
  const deleteItem = () => {
    if (selected && confirm(`${selected.name}을(를) 삭제할까요?`)) {
      const originals = filter === 'all' ? holdings.filter(item => item.symbol === selected.symbol && item.market === selected.market) : [selected]
      originals.forEach(item => remove(item.id)); setSelected(null)
    }
  }
  return <main>
    <header className="app-header"><div><p>Personal investing</p><h1>나의 포트폴리오</h1></div><div className="header-actions">
      <button className="refresh" onClick={() => void market.refresh()} disabled={market.loading} aria-label="시세 갱신">{market.loading ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}<span>시세 갱신</span></button>
      <button className="reset" onClick={() => { if (confirm('샘플 데이터로 초기화할까요?')) reset() }} title="샘플 데이터 초기화"><RotateCcw size={17} /><span>초기화</span></button>
      <button className="add" onClick={() => setForm(null)}><Plus size={19} /> 종목 추가</button>
    </div></header>
    <PortfolioSummary items={items} />
    <div className="market-status" aria-live="polite">{updatedText && <span>시세 기준 {updatedText} · {market.autoRefreshEnabled ? '자동 갱신' : '수동 갱신'}</span>}{!updatedText && <span>자동 갱신 꺼짐 · 수동 갱신</span>}{market.exchangeRate && holdings.some(item => item.market === 'US') && <span>USD/KRW {market.exchangeRate.rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} · {market.exchangeRate.status === 'live' ? '최신 환율' : market.exchangeRate.status === 'cached' ? '이전 환율' : 'Fallback 환율'}</span>}{market.error && <span className="market-error">{market.error}</span>}</div>
    <PortfolioFilter value={filter} onChange={value => { setFilter(value); setSelected(null) }} />
    <div className="workspace"><PortfolioTreemap items={items} onSelect={setSelected} />{filter === 'all' && <CategoryAllocation holdings={market.holdings} />}<PortfolioList items={items} onSelect={setSelected} /></div>
    {selected && <><div className="detail-dimmer" onClick={() => setSelected(null)} /><PortfolioDetail item={selected} onClose={() => setSelected(null)} onEdit={() => setForm(selected)} onDelete={deleteItem} /></>}
    {form !== undefined && <HoldingForm item={form || undefined} onSave={save} onClose={() => setForm(undefined)} />}
  </main>
}
