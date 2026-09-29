import type { Holding } from '../types/portfolio'

// 최초 실행 시에만 사용되는 예시 데이터입니다.
export const samplePortfolio: Holding[] = [
  { id: '1', symbol: '005930', name: '삼성전자', market: 'KR', category: 'investment', quantity: 100, averagePrice: 72000, currentPrice: 76000, previousClose: 74500 },
  { id: '2', symbol: 'VOO', name: 'Vanguard S&P 500 ETF', displayName: 'S&P 500', market: 'US', exchange: 'NYSE', currency: 'USD', category: 'investment', quantity: 40, averagePrice: 480, currentPrice: 522, previousClose: 519.5 },
  { id: '3', symbol: 'VOO', name: 'Vanguard S&P 500 ETF', displayName: 'S&P 500', market: 'US', exchange: 'NYSE', currency: 'USD', category: 'allowance', quantity: 12, averagePrice: 490, currentPrice: 522, previousClose: 519.5 },
  { id: '4', symbol: 'TIGER200', name: 'TIGER 200', market: 'KR', category: 'pension', quantity: 200, averagePrice: 34000, currentPrice: 36500, previousClose: 36200 },
  { id: '5', symbol: 'NVDA', name: 'NVIDIA', market: 'US', exchange: 'NASDAQ', currency: 'USD', category: 'pension', quantity: 30, averagePrice: 140, currentPrice: 172, previousClose: 176 },
  { id: '6', symbol: '035420', name: 'NAVER', market: 'KR', category: 'allowance', quantity: 25, averagePrice: 198000, currentPrice: 184000, previousClose: 186500 },
  { id: '7', symbol: 'AAPL', name: 'Apple', market: 'US', exchange: 'NASDAQ', currency: 'USD', category: 'investment', quantity: 20, averagePrice: 215, currentPrice: 230, previousClose: 229 }
]
