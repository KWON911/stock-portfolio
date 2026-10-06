import { useEffect, useState } from 'react'
import { getHoldingQuote } from '../services/priceService'
import type { Holding } from '../types/portfolio'

const empty = (): Holding => ({ id: crypto.randomUUID(), category: 'investment', market: 'KR', currency: 'KRW', symbol: '', name: '', quantity: 0, averagePrice: 0, currentPrice: 0, previousClose: 0 })

export function HoldingForm({ item, lockPosition = false, onSave, onClose }: { item?: Holding; lockPosition?: boolean; onSave: (item: Holding, mode: 'add' | 'edit') => Promise<boolean>; onClose: () => void }) {
  const [form, setForm] = useState<Holding>(item || empty())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = Boolean(item)

  useEffect(() => { setForm(item || empty()); setError(''); setSaving(false) }, [item])

  const change = (key: keyof Holding, value: string) => setForm(current => ({ ...current, [key]: ['quantity', 'averagePrice'].includes(key) ? Math.max(0, Number(value.replace(/[^0-9.]/g, ''))) : value } as Holding))
  const setMarket = (market: 'KR' | 'US') => setForm(current => ({ ...current, market, currency: market === 'US' ? 'USD' : 'KRW', exchange: market === 'US' ? current.exchange ?? 'NASDAQ' : undefined }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.symbol.trim() || form.quantity <= 0 || form.averagePrice <= 0) return setError('종목 코드, 보유 수량, 평균 매수가를 확인해 주세요.')
    setSaving(true); setError('')
    try {
      const normalized = { ...form, symbol: form.symbol.trim().toUpperCase(), currency: form.currency ?? (form.market === 'US' ? 'USD' : 'KRW') }
      const quote = editing ? undefined : await getHoldingQuote(normalized)
      const next = quote
        ? { ...normalized, name: quote.name, currentPrice: quote.currentPrice, previousClose: quote.previousClose, currency: quote.currency }
        : normalized
      if (await onSave(next, editing ? 'edit' : 'add')) onClose()
    } catch (failure) {
      const messages = ['종목 정보를 확인할 수 없습니다. 종목 코드를 확인해 주세요.', '종목 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.']
      setError(failure instanceof Error && messages.includes(failure.message) ? failure.message : messages[1])
    } finally { setSaving(false) }
  }

  return <div className="sheet-backdrop" role="presentation" onMouseDown={saving ? undefined : onClose}><form className="sheet" onSubmit={event => void submit(event)} onMouseDown={event => event.stopPropagation()}><header><h2>{editing ? '종목 수정' : '종목 추가'}</h2><button type="button" className="text-button" onClick={onClose} disabled={saving}>닫기</button></header><div className="form-grid">
    <Select label="투자 목적" value={form.category} onChange={value => change('category', value)} values={[['investment', '투자'], ['allowance', '용돈'], ['pension', '연금']]} disabled={saving} />
    {editing ? <ReadOnly label="시장" value={form.market === 'KR' ? '국내' : '미국'} /> : <Select label="시장" value={form.market} onChange={value => setMarket(value as 'KR' | 'US')} values={[['KR', '국내'], ['US', '미국']]} disabled={saving} />}
    {form.market === 'US' && (editing ? <ReadOnly label="거래소" value={form.exchange ?? 'NASDAQ'} /> : <Select label="거래소" value={form.exchange ?? 'NASDAQ'} onChange={value => change('exchange', value)} values={[['NASDAQ', 'NASDAQ'], ['NYSE', 'NYSE'], ['AMEX', 'AMEX']]} disabled={saving} />)}
    {editing ? <ReadOnly label="종목 코드" value={form.symbol} /> : <Field label="종목 코드" value={form.symbol} onChange={value => change('symbol', value)} disabled={saving} />}
    {editing && <ReadOnly label="종목명" value={form.displayName ?? form.name} />}
    <Field label="보유 수량" type="number" value={form.quantity} onChange={value => change('quantity', value)} disabled={lockPosition || saving} /><Field label={`평균 매수가${form.currency === 'USD' ? ' (USD)' : ''}`} type="number" value={form.averagePrice} onChange={value => change('averagePrice', value)} disabled={lockPosition || saving} />
  </div>{!editing && <p className="form-hint">종목명, 현재가, 전일 종가는 저장 시 한국투자증권 시세로 자동 확인합니다.</p>}{editing && <div className="quote-preview"><span>현재가 {formatPrice(form.currentPrice, form.currency)}</span><span>전일 종가 {formatPrice(form.previousClose, form.currency)}</span></div>}{lockPosition && <p className="form-hint">거래내역 기반으로 보유수량과 평균매수가는 자동 계산됩니다.</p>}{error && <p className="form-error">{error}</p>}<button className="save-button" disabled={saving}>{saving ? '종목 확인 중...' : editing ? '변경 저장' : '종목 추가'}</button></form></div>
}

function formatPrice(value: number, currency: Holding['currency']) { return currency === 'USD' ? `$${value.toLocaleString('en-US')}` : `${value.toLocaleString('ko-KR')}원` }
function Field({ label, value, onChange, type = 'text', disabled = false }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; disabled?: boolean }) { return <label className="field">{label}<input required disabled={disabled} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={value} onChange={event => onChange(event.target.value)} /></label> }
function Select({ label, value, onChange, values, disabled = false }: { label: string; value: string; onChange: (value: string) => void; values: [string, string][]; disabled?: boolean }) { return <label className="field">{label}<select disabled={disabled} value={value} onChange={event => onChange(event.target.value)}>{values.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label> }
function ReadOnly({ label, value }: { label: string; value: string }) { return <div className="field field-readonly"><span>{label}</span><strong>{value}</strong></div> }
