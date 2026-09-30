import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AppNavigation, type AppView } from './components/AppNavigation'
import { CategoryAllocation } from './components/CategoryAllocation'
import { HoldingForm } from './components/HoldingForm'
import { HoldingsManagementView } from './components/HoldingsManagementView'
import { OpeningCategoryPicker } from './components/OpeningCategoryPicker'
import { PortfolioDetail } from './components/PortfolioDetail'
import { PortfolioFilter } from './components/PortfolioFilter'
import { PortfolioList } from './components/PortfolioList'
import { PortfolioSummary } from './components/PortfolioSummary'
import { PortfolioTreemap } from './components/PortfolioTreemap'
import { SettingsView } from './components/SettingsView'
import { TransactionForm } from './components/TransactionForm'
import { TransactionLedger, type TransactionScope } from './components/TransactionLedger'
import { useMarketPrices } from './hooks/useMarketPrices'
import { usePortfolio } from './hooks/usePortfolio'
import { useTheme } from './hooks/useTheme'
import { useTransactions } from './hooks/useTransactions'
import type { CalculatedHolding, Filter, Holding } from './types/portfolio'
import type { Transaction } from './types/transaction'
import { applyTransactionsToHoldings, hasOpeningTransaction } from './utils/transactionCalculations'
import { calculateHoldings } from './utils/portfolioCalculations'

export default function App() {
  const { holdings, save, remove, reset } = usePortfolio()
  const { transactions, save: saveTransaction, remove: removeTransaction, removeForHoldings, reset: resetTransactions } = useTransactions()
  const { theme, setTheme } = useTheme()
  const [filter, setFilter] = useState<Filter>('all')
  const [view, setView] = useState<AppView>('dashboard')
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
  const changeView = (next: AppView) => { if (next === 'transactions' && view !== 'transactions') setTransactionScope(undefined); setSelected(null); setView(next) }
  const originalsFor = (holding: Holding) => filter === 'all' ? holdings.filter(item => item.symbol === holding.symbol && item.market === holding.market) : holdings.filter(item => item.id === holding.id)
  const deleteHolding = (holding: Holding) => {
    const originals = originalsFor(holding)
    const hasTransactions = transactions.some(transaction => originals.some(item => transaction.holdingId === item.id || (!transaction.holdingId && transaction.market === item.market && transaction.symbol === item.symbol && transaction.category === item.category)))
    if (!confirm(hasTransactions ? '이 종목에는 거래내역이 있습니다.\n\n확인: 종목과 거래내역을 모두 삭제\n취소: 삭제하지 않음' : `${holding.name}을(를) 삭제할까요?`)) return
    if (hasTransactions) removeForHoldings(originals)
    originals.forEach(item => remove(item.id)); setSelected(null)
  }
  const deleteTransaction = async (transaction: Transaction) => {
  if (!confirm(`${transaction.name} 거래를 삭제할까요?`)) return

  const error = await removeTransaction(transaction.id)

  if (error) {
    alert(error)
  }
}
  const selectedOriginals = selected ? holdings.filter(item => item.market === selected.market && item.symbol === selected.symbol && (filter === 'all' || item.category === selected.category)) : []
  const openingCandidatesForSelected = selectedOriginals.filter(holding => !hasOpeningTransaction(transactions, holding))
  const openTransactions = () => { if (selected) setTransactionScope({ market: selected.market, symbol: selected.symbol, name: selected.displayName ?? selected.name }); setSelected(null); setView('transactions') }
  const openOpening = (holding?: Holding) => { if (holding) { setOpeningHolding(holding); setTransactionForm(null) } else if (openingCandidatesForSelected.length === 1) { setOpeningHolding(openingCandidatesForSelected[0]); setTransactionForm(null) } else if (openingCandidatesForSelected.length > 1) setOpeningCandidates(openingCandidatesForSelected) }
  const resetAll = () => { if (!confirm('보유 종목과 거래내역을 모두 초기화할까요?')) return; reset(); resetTransactions(); setSelected(null); setView('dashboard') }
  return <main>
    <header className="app-header"><h1>나의 포트폴리오</h1>{view === 'dashboard' && <button className="refresh" onClick={() => void market.refresh()} disabled={market.loading} aria-label="시세 갱신">{market.loading ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}<span>시세 갱신</span></button>}</header>
    <AppNavigation view={view} onChange={changeView} />
    {view === 'dashboard' && <><PortfolioSummary items={items} /><div className="market-status" aria-live="polite">{updatedText ? <span>시세 기준 {updatedText} · {market.autoRefreshEnabled ? '자동 갱신' : '수동 갱신'}</span> : <span>자동 갱신 꺼짐 · 수동 갱신</span>}{market.exchangeRate && holdings.some(item => item.market === 'US') && <span>USD/KRW {market.exchangeRate.rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} · {market.exchangeRate.status === 'live' ? '최신 환율' : market.exchangeRate.status === 'cached' ? '이전 환율' : 'Fallback 환율'}</span>}{market.error && <span className="market-error">{market.error}</span>}</div><PortfolioFilter value={filter} onChange={value => { setFilter(value); setSelected(null) }} /><div className="workspace"><PortfolioTreemap items={items} onSelect={setSelected} />{filter === 'all' && <CategoryAllocation holdings={market.holdings} />}<PortfolioList items={items} onSelect={setSelected} /></div></>}
    {view === 'transactions' && <TransactionLedger transactions={transactions} filter={filter} scope={transactionScope} onFilter={setFilter} onAdd={() => setTransactionForm(null)} onEdit={transaction => setTransactionForm(transaction)} onDelete={deleteTransaction} onClearScope={() => setTransactionScope(undefined)} />}
    {view === 'holdings' && <HoldingsManagementView holdings={market.holdings} transactions={transactions} filter={filter} onFilter={setFilter} onAdd={() => setForm(null)} onEdit={holding => setForm(holding)} onDelete={deleteHolding} onOpening={openOpening} />}
    {view === 'settings' && <SettingsView theme={theme} onTheme={setTheme} onReset={resetAll} updatedAt={market.updatedAt} exchangeRate={market.exchangeRate} />}
    {selected && <><div className="detail-dimmer" onClick={() => setSelected(null)} /><PortfolioDetail item={selected} onClose={() => setSelected(null)} onEdit={() => setForm(selected)} onDelete={() => deleteHolding(selected)} onTransactions={openTransactions} onOpening={() => openOpening()} canRegisterOpening={openingCandidatesForSelected.length > 0} /></>}
    {form !== undefined && <HoldingForm item={form || undefined} lockPosition={Boolean(form?.transactionPosition || form?.transactionPositions)} onSave={save} onClose={() => setForm(undefined)} />}
    {transactionForm !== undefined && <TransactionForm item={transactionForm || undefined} openingHolding={openingHolding} holdings={holdings} defaultFxRate={market.exchangeRate?.rate} onSave={saveTransaction} onClose={() => { setTransactionForm(undefined); setOpeningHolding(undefined) }} />}
    {openingCandidates && <OpeningCategoryPicker holdings={openingCandidates} onSelect={holding => { setOpeningCandidates(undefined); setOpeningHolding(holding); setTransactionForm(null) }} onClose={() => setOpeningCandidates(undefined)} />}
  </main>
}
