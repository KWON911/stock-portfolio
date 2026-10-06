import type { Transaction } from '../types/transaction'

/** Date/memo/FX edits keep authoritative native cost. Explicit position edits
 * clear it to the documented legacy quantity * price fallback (not a fee fix).
 */
export function preserveOpeningCost(original: Transaction | undefined, edited: Transaction): Transaction {
  const unchanged = original?.type === 'opening' && edited.type === 'opening'
    && original.quantity === edited.quantity && original.price === edited.price
    && original.holdingId === edited.holdingId && original.market === edited.market
    && original.symbol === edited.symbol && original.currency === edited.currency
    && original.category === edited.category && original.exchange === edited.exchange
  return { ...edited, openingCostBasis: unchanged ? original.openingCostBasis : undefined }
}
