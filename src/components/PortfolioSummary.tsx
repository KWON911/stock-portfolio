import type { CalculatedHolding } from '../types/portfolio'
import { totals } from '../utils/portfolioCalculations'
const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 })
const money = (n: number) => `${won.format(Math.round(n))}원`
const signed = (n: number) => `${n >= 0 ? '+' : '-'}${money(Math.abs(n))}`
const rate = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
export function PortfolioSummary({ items }: { items: CalculatedHolding[] }) {
  const t = totals(items)
  return <section className="summary" aria-label="포트폴리오 요약"><div className="primary-stats"><Stat label="총 평가금액" value={money(t.value)} /><Stat label="오늘 손익" value={signed(t.dailyProfit)} tone={t.dailyProfit} /><Stat label="오늘 등락률" value={rate(t.dailyRate)} tone={t.dailyRate} /></div><div className="secondary-stats"><Stat label="총 투자금액" value={money(t.invested)} /><Stat label="평가손익" value={signed(t.profit)} tone={t.profit} /><Stat label="누적 수익률" value={rate(t.returnRate)} tone={t.returnRate} /></div></section>
}
function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) { return <div className="stat"><span>{label}</span><strong className={tone === undefined ? '' : tone >= 0 ? 'up' : 'down'}>{value}</strong></div> }
