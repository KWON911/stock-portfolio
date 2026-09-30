import { ClipboardList, Pencil, Trash2, X } from 'lucide-react'
import type { CalculatedHolding } from '../types/portfolio'

const won = (value: number) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.abs(value))}원`
const signedWon = (value: number) => `${value >= 0 ? '+' : '-'}${won(value)}`
const unitPrice = (value: number, currency: CalculatedHolding['currency']) => currency === 'USD' ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : won(value)
const signedUsd = (value: number) => `${value >= 0 ? '+' : '-'}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const rate = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
const labels = { investment: '투자', allowance: '용돈', pension: '연금' }
type Row = { label: string; value: string; tone?: number }

export function PortfolioDetail({ item, onClose, onEdit, onDelete, onTransactions }: { item: CalculatedHolding; onClose: () => void; onEdit: () => void; onDelete: () => void; onTransactions: () => void }) {
  const position = item.transactionPosition
  const realizedKrw = position?.realizedProfitKrw
  const unrealized = item.profit
  const totalProfit = unrealized + (realizedKrw ?? (item.currency === 'KRW' ? position?.realizedProfit ?? 0 : 0))
  const rows: Row[] = [
    ...(position ? [{ label: '총 매수수량', value: `${position.totalBuyQuantity.toLocaleString()}주` }, { label: '총 매도수량', value: `${position.totalSellQuantity.toLocaleString()}주` }] : []),
    ...(position ? [{ label: item.currency === 'USD' ? '총 매수금액 (USD)' : '총 매수금액', value: item.currency === 'USD' ? unitPrice(position.totalBuyAmount, 'USD') : won(position.totalBuyAmount) }, ...(item.currency === 'USD' && position.totalBuyAmountKrw !== undefined ? [{ label: '총 매수금액 (KRW)', value: won(position.totalBuyAmountKrw) }] : [])] : []),
    { label: '현재 보유수량', value: `${item.quantity.toLocaleString()}주` },
    { label: item.currency === 'USD' ? '현재 평균매수가 (USD)' : '현재 평균매수가', value: unitPrice(item.averagePrice, item.currency) },
    { label: item.currency === 'USD' ? '현재가 (USD)' : '현재가', value: unitPrice(item.currentPrice, item.currency) },
    { label: '투자금액', value: won(item.invested) },
    { label: '평가금액', value: won(item.value) },
    ...(position ? [{ label: item.currency === 'USD' ? '실현손익 (USD)' : '실현손익', value: item.currency === 'USD' ? signedUsd(position.realizedProfit) : signedWon(position.realizedProfit), tone: position.realizedProfit }, ...(item.currency === 'USD' && realizedKrw !== undefined ? [{ label: '실현손익 (KRW)', value: signedWon(realizedKrw), tone: realizedKrw }] : [])] : []),
    { label: '미실현손익', value: signedWon(unrealized), tone: unrealized },
    { label: '총손익', value: signedWon(totalProfit), tone: totalProfit },
    { label: '누적 수익률', value: rate(item.returnRate), tone: item.returnRate },
    { label: '오늘 손익', value: signedWon(item.dailyProfit), tone: item.dailyProfit },
    { label: '오늘 등락률', value: rate(item.dailyRate), tone: item.dailyRate },
    { label: '전체 자산 내 비중', value: `${item.allocation.toFixed(1)}%` },
  ]
  return <aside className="detail"><header><div><span>{item.market === 'KR' ? '국내' : '미국'} · {item.symbol}</span><h2 title={item.name}>{item.displayName ?? item.name}</h2></div><button onClick={onClose} aria-label="상세 닫기"><X /></button></header><div className="detail-meta"><span>{labels[item.category]}</span>{position && <small>거래내역 기반</small>}</div><dl>{rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd className={row.tone === undefined ? '' : row.tone >= 0 ? 'up' : 'down'}>{row.value}</dd></div>)}</dl>{item.currency === 'USD' && position?.realizedProfitKrw === undefined && <p className="detail-note">일부 거래의 당시 환율이 없어 원화 실현손익은 표시하지 않습니다.</p>}{item.categories && <section className="breakdown"><h3>목적별 보유금액</h3>{Object.entries(item.categories).map(([key, value]) => <p key={key}><span>{labels[key as keyof typeof labels]}</span><strong>{won(value)}</strong></p>)}</section>}<footer><button onClick={onTransactions}><ClipboardList size={16} /> 거래내역</button><button onClick={onEdit}><Pencil size={16} /> 수정</button><button className="danger" onClick={onDelete}><Trash2 size={16} /> 삭제</button></footer></aside>
}
