import type { Filter } from '../types/portfolio'
const filters: [Filter, string][] = [['all','전체'], ['investment','투자'], ['allowance','용돈'], ['pension','연금']]
export function PortfolioFilter({ value, onChange }: { value: Filter; onChange: (value: Filter) => void }) { return <nav className="filter" aria-label="투자 목적 필터">{filters.map(([key,label]) => <button className={value === key ? 'active' : ''} onClick={() => onChange(key)} key={key}>{label}</button>)}</nav> }
