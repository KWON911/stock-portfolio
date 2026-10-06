/** Exact rational arithmetic for cost allocation. Number is only a display projection.
 * Decimal inputs are interpreted by their decimal spelling, not their binary bits.
 * Fraction strings (n/d) are internal JSON-safe values, never DB numeric inputs.
 */
export type ExactInput = number | string | ExactAmount
const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  while (b) { const remainder = a % b; a = b; b = remainder }
  return a || 1n
}
export class ExactAmount {
  readonly numerator: bigint
  readonly denominator: bigint
  constructor(numerator: bigint, denominator = 1n) {
    if (!denominator) throw new Error('Division by zero')
    const sign = denominator < 0n ? -1n : 1n
    const divisor = gcd(numerator, denominator)
    this.numerator = numerator / divisor * sign
    this.denominator = denominator / divisor * sign
  }
  static from(value: ExactInput): ExactAmount {
    if (value instanceof ExactAmount) return value
    const text = String(value)
    if (/^-?\d+\/\d+$/.test(text)) {
      const [n, d] = text.split('/')
      return new ExactAmount(BigInt(n), BigInt(d))
    }
    const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text)
    if (!match) throw new Error('Invalid finite amount')
    const fraction = match[3] ?? ''
    const exponent = Number(match[4] ?? 0) - fraction.length
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) throw new Error('Amount exponent out of range')
    const n = BigInt(match[2] + fraction) * (match[1] === '-' ? -1n : 1n)
    return exponent >= 0 ? new ExactAmount(n * 10n ** BigInt(exponent)) : new ExactAmount(n, 10n ** BigInt(-exponent))
  }
  add(value: ExactInput): ExactAmount {
    const other = ExactAmount.from(value)
    return new ExactAmount(this.numerator * other.denominator + other.numerator * this.denominator, this.denominator * other.denominator)
  }
  sub(value: ExactInput): ExactAmount { return this.add(ExactAmount.from(value).mul(-1)) }
  mul(value: ExactInput): ExactAmount {
    const other = ExactAmount.from(value)
    return new ExactAmount(this.numerator * other.numerator, this.denominator * other.denominator)
  }
  div(value: ExactInput): ExactAmount {
    const other = ExactAmount.from(value)
    return new ExactAmount(this.numerator * other.denominator, this.denominator * other.numerator)
  }
  get isZero() { return this.numerator === 0n }
  get isNegative() { return this.numerator < 0n }
  toString(): string { return this.denominator === 1n ? String(this.numerator) : `${this.numerator}/${this.denominator}` }
  toNumber(): number {
    const nNumber = Number(this.numerator), dNumber = Number(this.denominator)
    if (Number.isFinite(nNumber) && Number.isFinite(dNumber)) return nNumber / dNumber
    // Avoid Infinity/Infinity for long exact fractions. Only this boundary rounds.
    const negative = this.isNegative
    const n = negative ? -this.numerator : this.numerator
    const whole = n / this.denominator
    const remainder = n % this.denominator
    const fraction = remainder * 10n ** 20n / this.denominator
    return Number(`${negative ? '-' : ''}${whole}.${String(fraction).padStart(20, '0')}`)
  }
}
export const exact = (value: ExactInput) => ExactAmount.from(value)
export const sumExact = (values: ExactInput[]) => values.reduce<ExactAmount>((sum, value) => sum.add(value), exact(0))

/** Only finite nonnegative DECIMAL values may be stored in opening_cost_basis. */
export function validOpeningCost(value: number | string): boolean {
  try {
    return !String(value).includes('/') && !exact(value).isNegative && Number.isFinite(exact(value).toNumber())
  } catch { return false }
}
