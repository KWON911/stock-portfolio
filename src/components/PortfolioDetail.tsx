import { CirclePlus, ClipboardList, Pencil, Trash2, X } from 'lucide-react'
import type { CalculatedHolding, Category } from '../types/portfolio'
import type { TransactionPosition } from '../types/transaction'

const won = (value: number) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.abs(value))}원`
const signedWon = (value: number) => `${value >= 0 ? '+' : '-'}${won(value)}`
const unitPrice = (value: number, currency: CalculatedHolding['currency']) => currency === 'USD' ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : won(value)
const signedUsd = (value: number) => `${value >= 0 ? '+' : '-'}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const rate = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
const labels: Record<Category, string> = { investment: '투자', allowance: '용돈', pension: '연금' }
type Row = { label: string; value: string; tone?: number }

function positionRows(position: TransactionPosition, currency: CalculatedHolding['currency']): Row[] {
  const opening = position.openingQuantity > 0
    ? [{ label: '초기 보유수량', value: `${position.openingQuantity.toLocaleString()}주` }, { label: currency === 'USD' ? '초기 평균매수가 (USD)' : '초기 평균매수가', value: unitPrice(position.openingAmount / position.openingQuantity, currency) }]
    : []
  return [...opening, { label: opening.length ? '추가 매수수량' : '총 매수수량', value: `${position.totalBuyQuantity.toLocaleString()}주` }, { label: '총 매도수량', value: `${position.totalSellQuantity.toLocaleString()}주` }, { label: currency === 'USD' ? `${opening.length ? '추가 매수금액' : '총 매수금액'} (USD)` : opening.length ? '추가 매수금액' : '총 매수금액', value: currency === 'USD' ? unitPrice(position.totalBuyAmount, 'USD') : won(position.totalBuyAmount) }]
}

function aggregatePositions(positions: Partial<Record<Category, TransactionPosition>>, currency: CalculatedHolding['currency']) {
  const values = Object.values(positions)
  const realized = values.reduce((sum, position) => sum + position.realizedProfit, 0)
  const realizedKrw = currency === 'USD'
    ? values.every(position => position.realizedProfitKrw !== undefined) ? values.reduce((sum, position) => sum + (position.realizedProfitKrw ?? 0), 0) : undefined
    : realized
  return { realized, realizedKrw }
}

export function PortfolioDetail({ item, onClose, onEdit, onDelete, onTransactions, onOpening, canRegisterOpening }: { item: CalculatedHolding; onClose: () => void; onEdit: () => void; onDelete: () => void; onTransactions: () => void; onOpening: () => void; canRegisterOpening: boolean }) {
  const categoryPositions = item.transactionPositions ?? {}
  const hasCategoryPositions = Object.keys(categoryPositions).length > 0
  const position = item.transactionPosition
  const summary = hasCategoryPositions ? aggregatePositions(categoryPositions, item.currency) : { realized: position?.realizedProfit ?? 0, realizedKrw: item.currency === 'USD' ? position?.realizedProfitKrw : position?.realizedProfit ?? 0 }
  const hasTransactionData = hasCategoryPositions || Boolean(position)
  const unrealized = item.profit
  const totalProfit = summary.realizedKrw === undefined ? undefined : unrealized + summary.realizedKrw
  const rows: Row[] = [
    ...(position && !hasCategoryPositions ? positionRows(position, item.currency) : []),
    { label: hasCategoryPositions ? '전체 보유수량' : '현재 보유수량', value: `${item.quantity.toLocaleString()}주` },
    { label: item.currency === 'USD' ? `${hasCategoryPositions ? '전체 가중평균 매수가' : '현재 평균매수가'} (USD)` : hasCategoryPositions ? '전체 가중평균 매수가' : '현재 평균매수가', value: unitPrice(item.averagePrice, item.currency) },
    { label: item.currency === 'USD' ? '현재가 (USD)' : '현재가', value: unitPrice(item.currentPrice, item.currency) },
    { label: '투자금액', value: won(item.invested) },
    { label: '평가금액', value: won(item.value) },
    ...(hasTransactionData ? [{ label: item.currency === 'USD' ? '전체 실현손익 (USD)' : '전체 실현손익', value: item.currency === 'USD' ? signedUsd(summary.realized) : signedWon(summary.realized), tone: summary.realized }, ...(item.currency === 'USD' ? [{ label: '전체 실현손익 (KRW)', value: summary.realizedKrw === undefined ? '일부 거래 환율 정보 필요' : signedWon(summary.realizedKrw), tone: summary.realizedKrw }] : [])] : []),
    { label: '미실현손익', value: signedWon(unrealized), tone: unrealized },
    { label: '총손익', value: totalProfit === undefined ? '일부 거래 환율 정보 필요' : signedWon(totalProfit), tone: totalProfit },
    { label: '누적 수익률', value: rate(item.returnRate), tone: item.returnRate },
    { label: '오늘 손익', value: signedWon(item.dailyProfit), tone: item.dailyProfit },
    { label: '오늘 등락률', value: rate(item.dailyRate), tone: item.dailyRate },
    { label: '전체 자산 내 비중', value: `${item.allocation.toFixed(1)}%` },
  ]
  return <aside className="detail"><header><div><span>{item.market === 'KR' ? '국내' : '미국'} · {item.symbol}</span><h2 title={item.name}>{item.displayName ?? item.name}</h2></div><button onClick={onClose} aria-label="상세 닫기"><X /></button></header><div className="detail-meta"><span>{hasCategoryPositions ? '전체' : labels[item.category]}</span>{hasTransactionData && <small>거래내역 기반</small>}</div><dl>{rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd className={row.tone === undefined ? '' : row.tone >= 0 ? 'up' : 'down'}>{row.value}</dd></div>)}</dl>{hasCategoryPositions && <section className="purpose-positions"><h3>목적별 거래 현황</h3>{(Object.entries(categoryPositions) as [Category, TransactionPosition][]).map(([category, categoryPosition]) => <div key={category}><strong>{labels[category]}</strong><span>보유 {categoryPosition.quantity.toLocaleString()}주 · 평균 {unitPrice(categoryPosition.averagePrice, item.currency)}</span>{categoryPosition.openingQuantity > 0 && <small>초기 보유 {categoryPosition.openingQuantity.toLocaleString()}주 · 평균 {unitPrice(categoryPosition.openingAmount / categoryPosition.openingQuantity, item.currency)}</small>}<small>추가 매수 {categoryPosition.totalBuyQuantity.toLocaleString()}주 · 매도 {categoryPosition.totalSellQuantity.toLocaleString()}주</small><b className={categoryPosition.realizedProfit >= 0 ? 'up' : 'down'}>실현손익 {item.currency === 'USD' ? signedUsd(categoryPosition.realizedProfit) : signedWon(categoryPosition.realizedProfit)}</b></div>)}</section>}{item.categories && <section className="breakdown"><h3>목적별 보유금액</h3>{Object.entries(item.categories).map(([key, value]) => <p key={key}><span>{labels[key as Category]}</span><strong>{won(value)}</strong></p>)}</section>}<footer>{canRegisterOpening && <button onClick={onOpening}><CirclePlus size={16} /> 초기 보유</button>}<button onClick={onTransactions}><ClipboardList size={16} /> 거래내역</button><button onClick={onEdit}><Pencil size={16} /> 수정</button><button className="danger" onClick={onDelete}><Trash2 size={16} /> 삭제</button></footer></aside>
}
