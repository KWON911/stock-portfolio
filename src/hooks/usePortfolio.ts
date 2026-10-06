import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Holding } from '../types/portfolio'
import { mergeHoldingPosition } from '../utils/holdingMerge'

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
  const saveInFlight = useRef(false)

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

  const save = async (holding: Holding, mode: 'add' | 'edit') => {
    if (saveInFlight.current) return false
    saveInFlight.current = true
    try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      alert('로그인 정보를 확인할 수 없습니다.')
      return false
    }

    let savedHolding = holding
    let existing: HoldingRow | undefined
    if (mode === 'add') {
      let query = supabase.from('portfolio_holdings').select('*')
        .eq('user_id', user.id).eq('category', holding.category)
        .eq('market', holding.market).eq('symbol', holding.symbol)
      if (holding.market === 'US') {
        const exchange = holding.exchange ?? 'NASDAQ'
        // Legacy US rows without exchange use NASDAQ throughout the existing app.
        query = exchange === 'NASDAQ'
          ? query.or('exchange.eq.NASDAQ,exchange.is.null')
          : query.eq('exchange', exchange)
      }
      const { data: matches, error: lookupError } = await query
      if (lookupError) {
        alert('기존 보유종목을 확인하지 못했습니다. 저장을 중단합니다.')
        return false
      }
      if ((matches?.length ?? 0) > 1) {
        alert('같은 목적의 중복 보유종목이 이미 있습니다. 기존 중복을 정리한 후 추가해 주세요.')
        return false
      }
      existing = matches?.[0] as HoldingRow | undefined
      if (existing) {
        // Replay owns positions with a ledger. Do not silently overwrite it or mutate history.
        const { data: history, error: historyError } = await supabase.from('portfolio_transactions')
          .select('holding_id,market,symbol,category').eq('user_id', user.id)
        if (historyError) {
          alert('거래내역을 확인하지 못했습니다. 저장을 중단합니다.')
          return false
        }
        if (history?.some(transaction => transaction.holding_id === existing!.id ||
          (!transaction.holding_id && transaction.market === existing!.market && transaction.symbol === existing!.symbol && transaction.category === existing!.category))) {
          alert('거래내역이 있는 종목입니다. 보유량 추가는 거래 추가에서 기록해 주세요.')
          return false
        }
        savedHolding = { ...fromRow(existing), name: holding.name,
          ...mergeHoldingPosition(fromRow(existing), holding),
          currentPrice: holding.currentPrice, previousClose: holding.previousClose }
      }
    }

    const row = {
      id: savedHolding.id,
      user_id: user.id,
      symbol: holding.symbol,
      name: holding.name,
      display_name: savedHolding.displayName ?? null,
      market: holding.market,
      exchange: savedHolding.exchange ?? null,
      currency:
        holding.currency ?? (holding.market === 'US' ? 'USD' : 'KRW'),
      category: holding.category,
      quantity: savedHolding.quantity,
      average_price: savedHolding.averagePrice,
      current_price: holding.currentPrice,
      previous_close: holding.previousClose,
      updated_at: new Date().toISOString(),
    }

    let write = existing || mode === 'edit'
      ? supabase.from('portfolio_holdings').update(row).eq('id', savedHolding.id).eq('user_id', user.id)
      : supabase.from('portfolio_holdings').insert(row)
    // Avoid lost updates between two existing-row additions. Never retry as INSERT.
    if (existing) write = write.eq('quantity', existing.quantity).eq('average_price', existing.average_price)
    const { data: persisted, error } = await write.select('*').single()

    // Another request may INSERT this identity after our lookup. The unique
    // index is authoritative: never retry as INSERT, upsert or blindly merge.
    if (error?.code === '23505') {
      alert(mode === 'add' && !existing
        ? '다른 요청에서 같은 종목이 먼저 등록되었습니다. 목록을 새로고침한 뒤 확인해 주세요. 이번 추가는 저장되지 않았습니다.'
        : '같은 투자 목적과 시장에 해당 종목이 이미 등록되어 있습니다. 저장을 중단합니다.')
      return false
    }

    if (error || !persisted) {
      console.error('보유종목 저장 실패:', error)
      alert('보유종목을 저장하지 못했습니다.')
      return false
    }

    setHoldings(items =>
      items.some(item => item.id === savedHolding.id)
        ? items.map(item => item.id === savedHolding.id ? fromRow(persisted as HoldingRow) : item)
        : [...items, fromRow(persisted as HoldingRow)],
    )
    return true
    } catch {
      alert('보유종목을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return false
    } finally {
      saveInFlight.current = false
    }
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
