import { useEffect, useState } from 'react'
import type { Transaction } from '../types/transaction'
import { validateTransactionSequence } from '../utils/transactionCalculations'

const KEY = 'my-stock-portfolio-transactions-v1'

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem(KEY)
      return saved ? JSON.parse(saved) as Transaction[] : []
    } catch { return [] }
  })
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(transactions)) }, [transactions])
  const save = (transaction: Transaction) => {
    const next = transactions.some(item => item.id === transaction.id) ? transactions.map(item => item.id === transaction.id ? transaction : item) : [...transactions, transaction]
    const error = validateTransactionSequence(next)
    if (!error) setTransactions(next)
    return error
  }
  const remove = (id: string) => {
    const next = transactions.filter(transaction => transaction.id !== id)
    const error = validateTransactionSequence(next)
    if (!error) setTransactions(next)
    return error
  }
  return { transactions, save, remove }
}
