import type { Holding } from '../types/portfolio'

// Decimal input arithmetic stays exact until conversion back to the existing Number model.
function decimal(value: number): [bigint, bigint] {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid holding amount')
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  const scale = fraction.length - Number(exponent)
  return scale >= 0
    ? [BigInt(whole + fraction), 10n ** BigInt(scale)]
    : [BigInt(whole + fraction) * 10n ** BigInt(-scale), 1n]
}

export function mergeHoldingPosition(old: Pick<Holding, 'quantity' | 'averagePrice'>, added: Pick<Holding, 'quantity' | 'averagePrice'>) {
  const [oq, os] = decimal(old.quantity)
  const [nq, ns] = decimal(added.quantity)
  const [oa, oas] = decimal(old.averagePrice)
  const [na, nas] = decimal(added.averagePrice)
  const quantityNumerator = oq * ns + nq * os
  if (quantityNumerator <= 0n) throw new Error('Invalid holding quantity')
  const costNumerator = oq * oa * ns * nas + nq * na * os * oas
  const averageDenominator = oas * nas * quantityNumerator
  // Retain fractional unit costs; do not round to currency display precision.
  const precision = 10n ** 12n
  const rounded = (costNumerator * precision + averageDenominator / 2n) / averageDenominator
  const quantity = Number(quantityNumerator) / Number(os * ns)
  const averagePrice = Number(rounded) / Number(precision)
  if (!Number.isFinite(quantity) || !Number.isFinite(averagePrice)) throw new Error('Invalid holding amount')
  return { quantity, averagePrice }
}
