import { LoaderCircle, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CategoryAllocation } from './components/CategoryAllocation'
import { HoldingForm } from './components/HoldingForm'
import { PortfolioDetail } from './components/PortfolioDetail'
import { PortfolioFilter } from './components/PortfolioFilter'
import { PortfolioList } from './components/PortfolioList'
import { PortfolioSummary } from './components/PortfolioSummary'
import { PortfolioTreemap } from './components/PortfolioTreemap'
import { OpeningCategoryPicker } from './components/OpeningCategoryPicker'
import { TransactionForm } from './components/TransactionForm'
import { TransactionLedger, type TransactionScope } from './components/TransactionLedger'
import { useMarketPrices } from './hooks/useMarketPrices'
import { usePortfolio } from './hooks/usePortfolio'
import { useTransactions } from './hooks/useTransactions'
import type { CalculatedHolding, Filter, Holding } from './types/portfolio'
import type { Transaction } from './types/transaction'
import { applyTransactionsToHoldings, hasOpeningTransaction } from './utils/transactionCalculations'
import { calculateHoldings } from './utils/portfolioCalculations'

export default function App() {
  const { holdings, save, remove, reset } = usePortfolio()
  const { transactions, save: saveTransaction, remove: removeTransaction, removeForHoldings, reset: resetTransactions } = useTransactions()
  const [filter, setFilter] = useState<Filter>('all')
  const [view, setView] = useState<'holdings' | 'transactions'>('holdings')
  const [selected, setSelected] = useState<CalculatedHolding | null>(null)
  const [form, setForm] = useState<Holding | null | undefined>(undefined)
  const [transactionForm, setTransactionForm] = useState<Transaction | null | undefined>(undefined)
  const [openingHolding, setOpeningHolding] = useState<Holding | undefined>(undefined)
  const [openingCandidates, setOpeningCandidates] = useState<Holding[] | undefined>(undefined)
  const [transactionScope, setTransactionScope] = useState<TransactionScope | undefined>(undefined)
  const transactionHoldings = useMemo(() => applyTransactionsToHoldings(holdings, transactions), [holdings, transactions])
  const market = useMarketPrices(transactionHoldings)
  const items = useMemo(() => calculateHoldings(market.holdings, filter, market.exchangeRate?.rate), [filter, market.exchangeRate, market.holdings])
  const updatedText = market.updatedAt ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(market.updatedAt)) : null
  const deleteItem = () => {
    if (selected) {
      const originals = filter === 'all' ? holdings.filter(item => item.symbol === selected.symbol && item.market === selected.market) : [selected]
      const hasTransactions = transactions.some(transaction => originals.some(holding => transaction.holdingId === holding.id || (!transaction.holdingId && transaction.market === holding.market && transaction.symbol === holding.symbol && transaction.category === holding.category)))
      const message = hasTransactions ? '이 종목에는 거래내역이 있습니다.\n\n확인: 종목과 거래내역을 모두 삭제\n취소: 삭제하지 않음' : `${selected.name}을(를) 삭제할까요?`
      if (!confirm(message)) return
      if (hasTransactions) removeForHoldings(originals)
      originals.forEach(item => remove(item.id)); setSelected(null)
    }
  }
  const deleteTransaction = (transaction: Transaction) => {
    if (!confirm(`${transaction.name} 거래를 삭제할까요?`)) return
    const error = removeTransaction(transaction.id)
    if (error) alert(error)
  }
  const selectedOriginals = selected ? holdings.filter(item => item.market === selected.market && item.symbol === selected.symbol && (filter === 'all' || item.category === selected.category)) : []
  const openingCandidatesForSelected = selectedOriginals.filter(holding => !hasOpeningTransaction(transactions, holding))
  const openTransactions = () => {
    if (selected) setTransactionScope({ market: selected.market, symbol: selected.symbol, name: selected.displayName ?? selected.name })
    setSelected(null); setView('transactions')
  }
  const openOpening = () => {
    if (openingCandidatesForSelected.length === 1) {
      setOpeningHolding(openingCandidatesForSelected[0]); setTransactionForm(null); return
    }
    if (openingCandidatesForSelected.length > 1) setOpeningCandidates(openingCandidatesForSelected)
  }
  const resetAll = () => {
    if (!confirm('보유 종목과 거래내역을 모두 초기화할까요?')) return
    reset(); resetTransactions(); setSelected(null); setView('holdings')
  }
  return <main>
    <header className="app-header"><div><p>Personal investing</p><h1>나의 포트폴리오</h1></div><div className="header-actions">
      <button className="refresh" onClick={() => void market.refresh()} disabled={market.loading} aria-label="시세 갱신">{market.loading ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}<span>시세 갱신</span></button>
      <button className="reset" onClick={resetAll} title="보유 종목과 거래내역 초기화"><RotateCcw size={17} /><span>초기화</span></button>
      <button className="add" onClick={() => setForm(null)}><Plus size={19} aria-hidden="true" /> 종목 추가</button>
    </div></header>
    <nav className="view-tabs" aria-label="포트폴리오 화면"><button className={view === 'holdings' ? 'active' : ''} onClick={() => setView('holdings')}>보유 종목</button><button className={view === 'transactions' ? 'active' : ''} onClick={() => { setTransactionScope(undefined); setView('transactions') }}>거래내역</button></nav>
    {view === 'holdings' ? <>
      <PortfolioSummary items={items} />
      <div className="market-status" aria-live="polite">{updatedText && <span>시세 기준 {updatedText} · {market.autoRefreshEnabled ? '자동 갱신' : '수동 갱신'}</span>}{!updatedText && <span>자동 갱신 꺼짐 · 수동 갱신</span>}{market.exchangeRate && holdings.some(item => item.market === 'US') && <span>USD/KRW {market.exchangeRate.rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} · {market.exchangeRate.status === 'live' ? '최신 환율' : market.exchangeRate.status === 'cached' ? '이전 환율' : 'Fallback 환율'}</span>}{market.error && <span className="market-error">{market.error}</span>}</div>
      <PortfolioFilter value={filter} onChange={value => { setFilter(value); setSelected(null) }} />
      <div className="workspace"><PortfolioTreemap items={items} onSelect={setSelected} />{filter === 'all' && <CategoryAllocation holdings={market.holdings} />}<PortfolioList items={items} onSelect={setSelected} /></div>
    </> : <TransactionLedger transactions={transactions} filter={filter} scope={transactionScope} onFilter={setFilter} onAdd={() => setTransactionForm(null)} onEdit={transaction => setTransactionForm(transaction)} onDelete={deleteTransaction} onClearScope={() => setTransactionScope(undefined)} />}
    {selected && <><div className="detail-dimmer" onClick={() => setSelected(null)} /><PortfolioDetail item={selected} onClose={() => setSelected(null)} onEdit={() => setForm(selected)} onDelete={deleteItem} onTransactions={openTransactions} onOpening={openOpening} canRegisterOpening={openingCandidatesForSelected.length > 0} /></>}
    {form !== undefined && <HoldingForm item={form || undefined} onSave={save} onClose={() => setForm(undefined)} />}
    {transactionForm !== undefined && <TransactionForm item={transactionForm || undefined} openingHolding={openingHolding} holdings={holdings} defaultFxRate={market.exchangeRate?.rate} onSave={saveTransaction} onClose={() => { setTransactionForm(undefined); setOpeningHolding(undefined) }} />}
    {openingCandidates && <OpeningCategoryPicker holdings={openingCandidates} onSelect={holding => { setOpeningCandidates(undefined); setOpeningHolding(holding); setTransactionForm(null) }} onClose={() => setOpeningCandidates(undefined)} />}
  </main>
}
