import type { Holding } from '../types/portfolio'

const labels = { investment: '투자', allowance: '용돈', pension: '연금' }

export function OpeningCategoryPicker({ holdings, onSelect, onClose }: { holdings: Holding[]; onSelect: (holding: Holding) => void; onClose: () => void }) {
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="sheet opening-picker" onMouseDown={event => event.stopPropagation()}><header><h2>초기 보유 등록 목적 선택</h2><button className="text-button" onClick={onClose}>닫기</button></header><p>초기 보유를 등록할 투자 목적을 선택해 주세요.</p><div>{holdings.map(holding => <button key={holding.id} onClick={() => onSelect(holding)}><span>{labels[holding.category]}</span><strong>{holding.displayName ?? holding.name}</strong><small>{holding.quantity.toLocaleString()}주 · 평균 {holding.currency === 'USD' ? `$${holding.averagePrice.toLocaleString('en-US')}` : `${holding.averagePrice.toLocaleString('ko-KR')}원`}</small></button>)}</div></section></div>
}
