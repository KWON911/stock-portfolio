import { LayoutDashboard, List, Settings, WalletCards } from 'lucide-react'

export type AppView = 'dashboard' | 'transactions' | 'holdings' | 'settings'
const items: { view: AppView; label: string; icon: typeof LayoutDashboard }[] = [
  { view: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { view: 'transactions', label: '거래내역', icon: List },
  { view: 'holdings', label: '종목 관리', icon: WalletCards },
  { view: 'settings', label: '설정', icon: Settings },
]

export function AppNavigation({ view, onChange }: { view: AppView; onChange: (view: AppView) => void }) {
  return <nav className="app-navigation" aria-label="주요 화면">{items.map(({ view: target, label, icon: Icon }) => <button key={target} className={view === target ? 'active' : ''} aria-current={view === target ? 'page' : undefined} onClick={() => onChange(target)}><Icon size={18} aria-hidden="true" /><span>{label}</span></button>)}</nav>
}
