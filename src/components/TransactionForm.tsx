import { useEffect, useMemo, useState } from 'react'
import type { Category, Filter, Holding } from '../types/portfolio'
import type { Transaction } from '../types/transaction'
import { preserveOpeningCost } from '../utils/openingCostPolicy'

const today = () => new Date().toISOString().slice(0, 10)
const categoryLabel: Record<Category, string> = { investment: '투자', allowance: '용돈', pension: '연금' }
const makeTransaction = (holding: Holding, type: Transaction['type'], fxRate?: number): Transaction => ({
  id: crypto.randomUUID(), holdingId: holding.id, market: holding.market, exchange: holding.exchange,
  symbol: holding.symbol, name: holding.displayName ?? holding.name, category: holding.category, type,
  date: today(), quantity: type === 'opening' ? holding.quantity : 0, price: holding.averagePrice, fee: 0, tax: 0,
  currency: holding.currency ?? (holding.market === 'US' ? 'USD' : 'KRW'), fxRate: holding.market === 'US' ? fxRate : undefined, memo: '', createdAt: new Date().toISOString(),
})

export function TransactionForm({ item, holdings, filter = 'all', openingHolding, defaultFxRate, onSave, onClose }: { item?: Transaction; holdings: Holding[]; filter?: Filter; openingHolding?: Holding; defaultFxRate?: number; onSave: (transaction: Transaction) => Promise<string | null>; onClose: () => void }) {
  // Editing and opening registration retain their original holding context.
  const availableHoldings = useMemo(() => item || openingHolding || filter === 'all' ? holdings : holdings.filter(holding => holding.category === filter), [holdings, filter, item, openingHolding])
  const initialHolding = useMemo(() => openingHolding ?? holdings.find(holding => holding.id === item?.holdingId) ?? availableHoldings[0], [holdings, item, openingHolding, availableHoldings])
  const initialForm = () => item ?? (initialHolding ? makeTransaction(initialHolding, openingHolding ? 'opening' : 'buy', defaultFxRate) : null)
  const [form, setForm] = useState<Transaction | null>(initialForm)
  const [error, setError] = useState('')
  useEffect(() => setForm(initialForm()), [item, initialHolding, openingHolding, defaultFxRate])
  if (!form || !initialHolding) return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="sheet transaction-sheet" onMouseDown={event => event.stopPropagation()}><header><h2>거래 추가</h2><button type="button" className="text-button" onClick={onClose}>닫기</button></header><p className="form-hint" role="status">{filter === 'all' ? '등록된 보유종목이 없습니다.' : `${categoryLabel[filter]} 목적의 보유종목이 없습니다.`} 종목 관리에서 해당 목적의 종목을 먼저 등록해 주세요.</p></section></div>
  const isOpening = form.type === 'opening'
  const openingRegistration = Boolean(openingHolding && !item)
  const change = (key: keyof Transaction, value: string) => setForm(current => current && ({ ...current, [key]: ['quantity', 'price', 'fee', 'tax', 'fxRate'].includes(key) ? Math.max(0, Number(value.replace(/[^0-9.]/g, ''))) : value }))
  const chooseHolding = (id: string) => {
    const holding = availableHoldings.find(candidate => candidate.id === id)
    if (!holding) return
    setForm(current => current && ({ ...current, holdingId: holding.id, market: holding.market, exchange: holding.exchange, symbol: holding.symbol, name: holding.displayName ?? holding.name, category: holding.category, currency: holding.currency ?? (holding.market === 'US' ? 'USD' : 'KRW'), price: holding.averagePrice, fxRate: holding.market === 'US' ? current.fxRate || defaultFxRate : undefined }))
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const selectedHolding = availableHoldings.find(holding => holding.id === form.holdingId)
    if (!selectedHolding || selectedHolding.category !== form.category) return setError('거래를 기록할 보유종목과 투자 목적을 다시 확인해 주세요.')
    if (!form.quantity || !form.price || !form.date) return setError('거래일, 수량, 체결가격을 올바르게 입력해 주세요.')
    if (form.currency === 'USD' && form.fxRate !== undefined && form.fxRate <= 0) return setError('환율은 0보다 커야 합니다.')
    const result = await onSave(preserveOpeningCost(item, {
  ...form,
  memo: form.memo?.trim() || undefined,
}))
    if (result) return setError(result)
    onClose()
  }
  const isUsd = form.currency === 'USD'
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><form className="sheet transaction-sheet" onSubmit={submit} onMouseDown={event => event.stopPropagation()}><header><h2>{isOpening ? '초기 보유 등록' : item ? '거래 수정' : '거래 추가'}</h2><button type="button" className="text-button" onClick={onClose}>닫기</button></header>{openingRegistration && <p className="opening-holding">{initialHolding.displayName ?? initialHolding.name} · 기존 보유수량과 평균매수가를 기준으로 시작합니다.</p>}<div className="form-grid">
    {!openingRegistration && <Select label="등록 종목" value={form.holdingId ?? ''} onChange={chooseHolding} values={availableHoldings.map(holding => [holding.id, `${holding.displayName ?? holding.name} · ${holding.symbol} · ${categoryLabel[holding.category]}`])} />}
    <label className="field">투자 목적<input readOnly value={categoryLabel[form.category]} /></label>
    {!isOpening && <Select label="매수 / 매도" value={form.type} onChange={value => change('type', value)} values={[['buy', '매수'], ['sell', '매도']]} />}
    <Field label={isOpening ? '초기 보유 기준일' : '거래일'} type="date" value={form.date} onChange={value => change('date', value)} />
    <Field label={isOpening ? '초기 보유수량' : '수량'} type="number" value={form.quantity} readOnly={openingRegistration} onChange={value => change('quantity', value)} />
    <Field label={isOpening ? `초기 평균매수가${isUsd ? ' (USD)' : ' (KRW)'}` : `체결가격${isUsd ? ' (USD)' : ' (KRW)'}`} type="number" value={form.price} readOnly={openingRegistration} onChange={value => change('price', value)} />
    {!isOpening && <><Field label={`수수료${isUsd ? ' (USD)' : ' (KRW)'}`} type="number" value={form.fee ?? 0} onChange={value => change('fee', value)} /><Field label={`세금${isUsd ? ' (USD)' : ' (KRW)'}`} type="number" value={form.tax ?? 0} onChange={value => change('tax', value)} /></>}
    {isUsd && <Field label={isOpening ? '초기 보유 당시 환율 (선택)' : '거래 당시 환율 (USD/KRW)'} type="number" value={form.fxRate ?? ''} onChange={value => change('fxRate', value)} />}
    {!isOpening && <Field label="메모" value={form.memo ?? ''} onChange={value => change('memo', value)} />}
  </div>{isUsd && <p className="form-hint">환율은 현재 환율을 기본값으로 제안하며, 과거 거래는 당시 환율로 수정할 수 있습니다.</p>}{error && <p className="form-error">{error}</p>}<button className="save-button">{isOpening ? '초기 보유 저장' : item ? '변경 저장' : '거래 저장'}</button></form></div>
}
function Field({ label, value, onChange, type = 'text', readOnly = false }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; readOnly?: boolean }) { return <label className="field">{label}<input required={type !== 'text'} readOnly={readOnly} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={value} onChange={event => onChange(event.target.value)} /></label> }
function Select({ label, value, onChange, values }: { label: string; value: string; onChange: (value: string) => void; values: [string, string][] }) { return <label className="field">{label}<select value={value} onChange={event => onChange(event.target.value)}>{values.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label> }
