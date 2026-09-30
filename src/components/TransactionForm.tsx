import { useEffect, useMemo, useState } from 'react'
import type { Holding } from '../types/portfolio'
import type { Transaction } from '../types/transaction'

const today = () => new Date().toISOString().slice(0, 10)
const empty = (holding: Holding, fxRate?: number): Transaction => ({
  id: crypto.randomUUID(), holdingId: holding.id, market: holding.market, exchange: holding.exchange,
  symbol: holding.symbol, name: holding.displayName ?? holding.name, category: holding.category,
  type: 'buy', date: today(), quantity: 0, price: holding.averagePrice, fee: 0, tax: 0,
  currency: holding.currency ?? (holding.market === 'US' ? 'USD' : 'KRW'), fxRate: holding.market === 'US' ? fxRate : undefined, memo: '', createdAt: new Date().toISOString(),
})

export function TransactionForm({ item, holdings, defaultFxRate, onSave, onClose }: { item?: Transaction; holdings: Holding[]; defaultFxRate?: number; onSave: (transaction: Transaction) => string | null; onClose: () => void }) {
  const initialHolding = useMemo(() => holdings.find(holding => holding.id === item?.holdingId) ?? holdings[0], [holdings, item])
  const [form, setForm] = useState<Transaction | null>(() => item ?? (initialHolding ? empty(initialHolding, defaultFxRate) : null))
  const [error, setError] = useState('')
  useEffect(() => setForm(item ?? (initialHolding ? empty(initialHolding, defaultFxRate) : null)), [item, initialHolding, defaultFxRate])
  if (!form || !initialHolding) return null
  const change = (key: keyof Transaction, value: string) => setForm(current => current && ({ ...current, [key]: ['quantity', 'price', 'fee', 'tax', 'fxRate'].includes(key) ? Math.max(0, Number(value.replace(/[^0-9.]/g, ''))) : value }))
  const chooseHolding = (id: string) => {
    const holding = holdings.find(item => item.id === id)
    if (!holding) return
    setForm(current => current && ({ ...current, holdingId: holding.id, market: holding.market, exchange: holding.exchange, symbol: holding.symbol, name: holding.displayName ?? holding.name, category: holding.category, currency: holding.currency ?? (holding.market === 'US' ? 'USD' : 'KRW'), price: holding.averagePrice, fxRate: holding.market === 'US' ? current.fxRate || defaultFxRate : undefined }))
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.quantity || !form.price || !form.date) return setError('거래일, 수량, 체결가격을 올바르게 입력해 주세요.')
    if (form.currency === 'USD' && form.fxRate !== undefined && form.fxRate <= 0) return setError('환율은 0보다 커야 합니다.')
    const result = onSave({ ...form, memo: form.memo?.trim() || undefined })
    if (result) return setError(result)
    onClose()
  }
  const isUsd = form.currency === 'USD'
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><form className="sheet transaction-sheet" onSubmit={submit} onMouseDown={event => event.stopPropagation()}><header><h2>{item ? '거래 수정' : '거래 추가'}</h2><button type="button" className="text-button" onClick={onClose}>닫기</button></header><div className="form-grid">
    <Select label="등록 종목" value={form.holdingId ?? ''} onChange={chooseHolding} values={holdings.map(holding => [holding.id, `${holding.displayName ?? holding.name} · ${holding.symbol}`])} />
    <Select label="매수 / 매도" value={form.type} onChange={value => change('type', value)} values={[['buy', '매수'], ['sell', '매도']]} />
    <Field label="거래일" type="date" value={form.date} onChange={value => change('date', value)} />
    <Field label="수량" type="number" value={form.quantity} onChange={value => change('quantity', value)} />
    <Field label={`체결가격${isUsd ? ' (USD)' : ' (KRW)'}`} type="number" value={form.price} onChange={value => change('price', value)} />
    <Field label={`수수료${isUsd ? ' (USD)' : ' (KRW)'}`} type="number" value={form.fee ?? 0} onChange={value => change('fee', value)} />
    <Field label={`세금${isUsd ? ' (USD)' : ' (KRW)'}`} type="number" value={form.tax ?? 0} onChange={value => change('tax', value)} />
    {isUsd && <Field label="거래 당시 환율 (USD/KRW)" type="number" value={form.fxRate ?? ''} onChange={value => change('fxRate', value)} />}
    <Field label="메모" value={form.memo ?? ''} onChange={value => change('memo', value)} />
  </div>{isUsd && <p className="form-hint">환율은 현재 환율을 기본값으로 제안하며, 과거 거래는 당시 환율로 수정할 수 있습니다.</p>}{error && <p className="form-error">{error}</p>}<button className="save-button">{item ? '변경 저장' : '거래 저장'}</button></form></div>
}
function Field({ label, value, onChange, type = 'text' }: { label: string; value: string | number; onChange: (value: string) => void; type?: string }) { return <label className="field">{label}<input required={type !== 'text'} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={value} onChange={event => onChange(event.target.value)} /></label> }
function Select({ label, value, onChange, values }: { label: string; value: string; onChange: (value: string) => void; values: [string, string][] }) { return <label className="field">{label}<select value={value} onChange={event => onChange(event.target.value)}>{values.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label> }
