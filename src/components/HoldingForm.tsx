import { useEffect, useState } from 'react'
import type { Holding } from '../types/portfolio'
const empty = (): Holding => ({ id: crypto.randomUUID(), category: 'investment', market: 'KR', currency: 'KRW', symbol: '', name: '', quantity: 0, averagePrice: 0, currentPrice: 0, previousClose: 0 })

export function HoldingForm({ item, onSave, onClose }: { item?: Holding; onSave: (item: Holding) => void; onClose: () => void }) {
  const [form, setForm] = useState<Holding>(item || empty()), [error, setError] = useState('')
  useEffect(() => setForm(item || empty()), [item])
  const change = (key: keyof Holding, value: string) => setForm(current => ({ ...current, [key]: ['quantity', 'averagePrice', 'currentPrice', 'previousClose'].includes(key) ? Math.max(0, Number(value.replace(/[^0-9.]/g, ''))) : value } as Holding))
  const setMarket = (market: 'KR' | 'US') => setForm(current => ({ ...current, market, currency: market === 'US' ? 'USD' : 'KRW', exchange: market === 'US' ? current.exchange ?? 'NASDAQ' : undefined }))
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!form.name.trim() || !form.symbol.trim() || form.quantity <= 0 || form.averagePrice <= 0 || form.currentPrice <= 0 || form.previousClose <= 0) return setError('모든 항목을 올바르게 입력해 주세요.'); onSave({ ...form, name: form.name.trim(), symbol: form.symbol.trim().toUpperCase(), currency: form.currency ?? (form.market === 'US' ? 'USD' : 'KRW') }); onClose() }
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><form className="sheet" onSubmit={submit} onMouseDown={event => event.stopPropagation()}><header><h2>{item ? '종목 수정' : '종목 추가'}</h2><button type="button" className="text-button" onClick={onClose}>닫기</button></header><div className="form-grid">
    <Select label="투자 목적" value={form.category} onChange={value => change('category', value)} values={[['investment', '투자'], ['allowance', '용돈'], ['pension', '연금']]} />
    <Select label="시장" value={form.market} onChange={value => setMarket(value as 'KR' | 'US')} values={[['KR', '국내'], ['US', '미국']]} />
    {form.market === 'US' && <Select label="거래소" value={form.exchange ?? 'NASDAQ'} onChange={value => change('exchange', value)} values={[['NASDAQ', 'NASDAQ'], ['NYSE', 'NYSE'], ['AMEX', 'AMEX']]} />}
    <Field label="종목 코드" value={form.symbol} onChange={value => change('symbol', value)} /><Field label="종목명" value={form.name} onChange={value => change('name', value)} />
    <Field label="보유 수량" type="number" value={form.quantity} onChange={value => change('quantity', value)} /><Field label={`평균 매수가${form.currency === 'USD' ? ' (USD)' : ''}`} type="number" value={form.averagePrice} onChange={value => change('averagePrice', value)} />
    <Field label={`현재가${form.currency === 'USD' ? ' (USD)' : ''}`} type="number" value={form.currentPrice} onChange={value => change('currentPrice', value)} /><Field label={`전일 종가${form.currency === 'USD' ? ' (USD)' : ''}`} type="number" value={form.previousClose} onChange={value => change('previousClose', value)} />
  </div>{error && <p className="form-error">{error}</p>}<button className="save-button">{item ? '변경 저장' : '종목 추가'}</button></form></div>
}
function Field({ label, value, onChange, type = 'text' }: { label: string; value: string | number; onChange: (value: string) => void; type?: string }) { return <label className="field">{label}<input required type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={value} onChange={event => onChange(event.target.value)} /></label> }
function Select({ label, value, onChange, values }: { label: string; value: string; onChange: (value: string) => void; values: [string, string][] }) { return <label className="field">{label}<select value={value} onChange={event => onChange(event.target.value)}>{values.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> }
