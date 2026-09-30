import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Holding } from '../types/portfolio'

type HoldingRow = {
  id: string
  user_id: string
  symbol: string
  name: string
  display_name: string | null
  market: 'KR' | 'US'
  exchange: 'NASDAQ' | 'NYSE' | 'AMEX' | null
  currency: 'KRW' | 'USD'
  category: 'investment' | 'allowance' | 'pension'
  quantity: number
  average_price: number
  current_price: number
  previous_close: number
}

function fromRow(row: HoldingRow): Holding {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    displayName: row.display_name ?? undefined,
    market: row.market,
    exchange: row.exchange ?? undefined,
    currency: row.currency,
    category: row.category,
    quantity: row.quantity,
    averagePrice: row.average_price,
    currentPrice: row.current_price,
    previousClose: row.previous_close,
  }
}

export function usePortfolio() {
  const [holdings, setHoldings] = useState<Holding[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('portfolio_holdings')
        .select('*')
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (error) {
        console.error('보유종목 불러오기 실패:', error)
        return
      }

      setHoldings((data ?? []).map(row => fromRow(row as HoldingRow)))
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const save = async (holding: Holding) => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      alert('로그인 정보를 확인할 수 없습니다.')
      return
    }

    const row = {
      id: holding.id,
      user_id: user.id,
      symbol: holding.symbol,
      name: holding.name,
      display_name: holding.displayName ?? null,
      market: holding.market,
      exchange: holding.exchange ?? null,
      currency:
        holding.currency ?? (holding.market === 'US' ? 'USD' : 'KRW'),
      category: holding.category,
      quantity: holding.quantity,
      average_price: holding.averagePrice,
      current_price: holding.currentPrice,
      previous_close: holding.previousClose,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('portfolio_holdings')
      .upsert(row, { onConflict: 'id' })

    if (error) {
      console.error('보유종목 저장 실패:', error)
      alert('보유종목을 저장하지 못했습니다.')
      return
    }

    setHoldings(items =>
      items.some(item => item.id === holding.id)
        ? items.map(item => item.id === holding.id ? holding : item)
        : [...items, holding],
    )
  }

  const remove = async (id: string) => {
    const { error } = await supabase
      .from('portfolio_holdings')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('보유종목 삭제 실패:', error)
      alert('보유종목을 삭제하지 못했습니다.')
      return
    }

    setHoldings(items => items.filter(item => item.id !== id))
  }

  const reset = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { error } = await supabase
      .from('portfolio_holdings')
      .delete()
      .eq('user_id', user.id)

    if (error) {
      console.error('보유종목 초기화 실패:', error)
      alert('보유종목을 초기화하지 못했습니다.')
      return
    }

    setHoldings([])
  }

  return {
    holdings,
    save,
    remove,
    reset,
  }
}