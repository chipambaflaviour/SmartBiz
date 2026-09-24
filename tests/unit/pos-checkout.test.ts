import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PAYMENT_METHOD_DB, clampDiscount, isNetworkError, packPriceFor } from '@/modules/sales/POSPage'
import { quickAmounts } from '@/modules/sales/PaymentDialog'

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

/** Pull the allowed values out of a `CHECK (col IN ('a','b'))` constraint in the migration SQL. */
function allowedValues(sql: string, constraint: string): string[] {
  const match = sql.match(new RegExp(`${constraint}[\\s\\S]*?IN \\(([^)]+)\\)`))
  if (!match) throw new Error(`constraint ${constraint} not found in SQL`)
  return match[1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''))
}

describe('checkout writes values the database will actually accept', () => {
  const sql = read('../../supabase/blueprint_alignment.sql')
  const pos = read('../../src/modules/sales/POSPage.tsx')

  it('every POS payment method is allowed by sale_payment_method_check', () => {
    // Regression: the UI once sent 'mobile' while the constraint only allows
    // 'mobile_money', so every mobile-money sale was silently rejected.
    const allowed = allowedValues(sql, 'sale_payment_method_check')
    for (const value of Object.values(PAYMENT_METHOD_DB)) {
      expect(allowed, `payment_method '${value}'`).toContain(value)
    }
  })

  it('every POS payment status is allowed by sale_payment_status_check', () => {
    // Regression: credit sales were once written as 'pending' before that value existed.
    const allowed = allowedValues(sql, 'sale_payment_status_check')
    const declared = pos.match(/dbPaymentStatus:\s*([^=]+)=/)?.[1] ?? ''
    const statuses = [...declared.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(statuses.length, 'could not read dbPaymentStatus union from POSPage').toBeGreaterThan(0)
    for (const value of statuses) {
      expect(allowed, `payment_status '${value}'`).toContain(value)
    }
  })

  it('maps each UI payment choice to a distinct database value', () => {
    const values = Object.values(PAYMENT_METHOD_DB)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('isNetworkError — only real connectivity loss may be queued offline', () => {
  it('treats fetch failures as offline', () => {
    expect(isNetworkError({ message: 'TypeError: Failed to fetch' })).toBe(true)
    expect(isNetworkError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true)
    expect(isNetworkError({ message: 'Network request failed' })).toBe(true)
  })

  it('does NOT swallow database rejections as offline', () => {
    // Regression: everything was treated as offline, so constraint and permission
    // failures showed "Sale recorded!" while nothing was saved.
    expect(isNetworkError({ message: 'new row violates row-level security policy' })).toBe(false)
    expect(isNetworkError({ message: 'duplicate key value violates unique constraint' })).toBe(false)
    expect(isNetworkError({ message: 'value too long for type character varying(20)' })).toBe(false)
    expect(isNetworkError({})).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})

describe('quickAmounts — cash buttons offered to the cashier', () => {
  it('always offers the exact amount first', () => {
    expect(quickAmounts(255)[0]).toBe(255)
    expect(quickAmounts(19.99)[0]).toBe(19.99)
  })

  it('offers round notes above the total', () => {
    const amounts = quickAmounts(255)
    expect(amounts).toContain(260)
    expect(amounts.every((a) => a >= 255)).toBe(true)
  })

  it('never offers more than four buttons', () => {
    for (const total of [1, 7.5, 255, 999.99, 12345]) {
      expect(quickAmounts(total).length).toBeLessThanOrEqual(4)
    }
  })

  it('never offers an amount below the total (which would short the till)', () => {
    for (const total of [0.01, 3.33, 19.99, 255, 1234.56]) {
      expect(quickAmounts(total).every((a) => a >= total), `total ${total}`).toBe(true)
    }
  })

  it('handles a zero total without crashing', () => {
    expect(quickAmounts(0)).toEqual([0])
  })

  it('EDGE: a perfectly round total offers only the exact button', () => {
    // 1000 is already a multiple of every step, so no "next note up" is generated.
    expect(quickAmounts(1000)).toEqual([1000])
  })
})

describe('clampDiscount — a typo must never create a negative sale', () => {
  it('keeps ordinary discounts untouched', () => {
    expect(clampDiscount(0)).toBe(0)
    expect(clampDiscount(12.5)).toBe(12.5)
    expect(clampDiscount(100)).toBe(100)
  })

  it('caps a discount above 100% (which would pay the customer to shop)', () => {
    expect(clampDiscount(150)).toBe(100)
    expect(clampDiscount(1e6)).toBe(100)
  })

  it('floors a negative discount (which would inflate the bill)', () => {
    expect(clampDiscount(-10)).toBe(0)
  })

  it('treats unparseable input as no discount', () => {
    expect(clampDiscount(Number('abc'))).toBe(0)
    // Non-finite input is treated as "no discount" rather than a full write-off.
    expect(clampDiscount(Number.POSITIVE_INFINITY)).toBe(0)
    expect(clampDiscount(Number.NEGATIVE_INFINITY)).toBe(0)
  })
})

describe('packPriceFor — a carton must never ring up free', () => {
  const base = { unit_price: 45, units_per_pack: 24 }

  it('uses the stored pack price when one was set', () => {
    expect(packPriceFor({ ...base, pack_price: 1000 })).toBe(1000)
  })

  it('falls back to unit price x pack size when no pack price was set', () => {
    expect(packPriceFor({ ...base, pack_price: null })).toBe(1080)
    expect(packPriceFor({ ...base, pack_price: undefined })).toBe(1080)
  })

  it('treats a stored 0 as unpriced rather than free', () => {
    // Rows saved before the validator rejected a blank pack price hold 0.
    // `??` does not catch 0, which sold a full carton for K0.00.
    expect(packPriceFor({ ...base, pack_price: 0 })).toBe(1080)
  })

  it('ignores a corrupt stored value', () => {
    expect(packPriceFor({ ...base, pack_price: Number.NaN })).toBe(1080)
    expect(packPriceFor({ ...base, pack_price: -5 })).toBe(1080)
  })

  it('coerces loosely typed source data', () => {
    expect(packPriceFor({ unit_price: '45', units_per_pack: '24', pack_price: '' })).toBe(1080)
  })
})
