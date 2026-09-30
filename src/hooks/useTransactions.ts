import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Holding } from '../types/portfolio'
import type { Transaction } from '../types/transaction'
import { validateTransactionSequence } from '../utils/transactionCalculations'

type TransactionRow = {
  id: string
  user_id: string
  holding_id: string | null
  market: 'KR' | 'US'
  exchange: 'NASDAQ' | 'NYSE' | 'AMEX' | null
  symbol: string
  name: string
  category: 'investment' | 'allowance' | 'pension'
  transaction_type: 'opening' | 'buy' | 'sell'
  transaction_date: string
  quantity: number
  price: number
  fee: number | null
  tax: number | null
  currency: 'KRW' | 'USD'
  fx_rate: number | null
  memo: string | null
  created_at: string
}

function fromRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    holdingId: row.holding_id ?? undefined,
    market: row.market,
    exchange: row.exchange ?? undefined,
    symbol: row.symbol,
    name: row.name,
    category: row.category,
    type: row.transaction_type,
    date: row.transaction_date,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee ?? undefined,
    tax: row.tax ?? undefined,
    currency: row.currency,
    fxRate: row.fx_rate ?? undefined,
    memo: row.memo ?? undefined,
    createdAt: row.created_at,
  }
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('portfolio_transactions')
        .select('*')
        .order('transaction_date', { ascending: true })
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (error) {
        console.error('거래내역 불러오기 실패:', error)
        return
      }

      setTransactions(
        (data ?? []).map(row => fromRow(row as TransactionRow)),
      )
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const save = async (transaction: Transaction): Promise<string | null> => {
    const next = transactions.some(item => item.id === transaction.id)
      ? transactions.map(item =>
          item.id === transaction.id ? transaction : item,
        )
      : [...transactions, transaction]

    const validationError = validateTransactionSequence(next)

    if (validationError) {
      return validationError
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return '로그인 정보를 확인할 수 없습니다.'
    }

    const row = {
      id: transaction.id,
      user_id: user.id,
      holding_id: transaction.holdingId ?? null,
      market: transaction.market,
      exchange: transaction.exchange ?? null,
      symbol: transaction.symbol,
      name: transaction.name,
      category: transaction.category,
      transaction_type: transaction.type,
      transaction_date: transaction.date,
      quantity: transaction.quantity,
      price: transaction.price,
      fee: transaction.fee ?? null,
      tax: transaction.tax ?? null,
      currency: transaction.currency,
      fx_rate: transaction.fxRate ?? null,
      memo: transaction.memo ?? null,
      created_at: transaction.createdAt,
    }

    const { error } = await supabase
      .from('portfolio_transactions')
      .upsert(row, { onConflict: 'id' })

    if (error) {
      console.error('거래내역 저장 실패:', error)
      return '거래내역을 저장하지 못했습니다.'
    }

    setTransactions(next)

    return null
  }

  const remove = async (id: string): Promise<string | null> => {
    const next = transactions.filter(transaction => transaction.id !== id)

    const validationError = validateTransactionSequence(next)

    if (validationError) {
      return validationError
    }

    const { error } = await supabase
      .from('portfolio_transactions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('거래내역 삭제 실패:', error)
      return '거래내역을 삭제하지 못했습니다.'
    }

    setTransactions(next)

    return null
  }

  const removeForHoldings = async (targets: Holding[]) => {
    const targetTransactions = transactions.filter(transaction =>
      targets.some(holding =>
        transaction.holdingId === holding.id ||
        (
          !transaction.holdingId &&
          transaction.market === holding.market &&
          transaction.symbol === holding.symbol &&
          transaction.category === holding.category
        ),
      ),
    )

    const ids = targetTransactions.map(transaction => transaction.id)

    if (ids.length === 0) return

    const { error } = await supabase
      .from('portfolio_transactions')
      .delete()
      .in('id', ids)

    if (error) {
      console.error('연결된 거래내역 삭제 실패:', error)
      alert('연결된 거래내역을 삭제하지 못했습니다.')
      return
    }

    setTransactions(items =>
      items.filter(transaction => !ids.includes(transaction.id)),
    )
  }

  const reset = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { error } = await supabase
      .from('portfolio_transactions')
      .delete()
      .eq('user_id', user.id)

    if (error) {
      console.error('거래내역 초기화 실패:', error)
      alert('거래내역을 초기화하지 못했습니다.')
      return
    }

    setTransactions([])
  }

  return {
    transactions,
    save,
    remove,
    removeForHoldings,
    reset,
  }
}