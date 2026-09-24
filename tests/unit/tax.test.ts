import { describe, expect, it } from 'vitest'
import { calculateVat, parseSettings, type TaxSettings } from '@/shared/hooks/useTaxSettings'

const inclusive: TaxSettings = { vatEnabled: true, vatRate: 16, pricesIncludeVat: true, taxNumber: '' }
const exclusive: TaxSettings = { ...inclusive, pricesIncludeVat: false }
const off: TaxSettings = { ...inclusive, vatEnabled: false }

describe('calculateVat — VAT is money, so every branch matters', () => {
  it('charges nothing when VAT is disabled', () => {
    expect(calculateVat(100, off)).toEqual({ vat: 0, net: 100, gross: 100 })
  })

  it('charges nothing at a 0% rate', () => {
    expect(calculateVat(100, { ...inclusive, vatRate: 0 })).toEqual({ vat: 0, net: 100, gross: 100 })
  })

  it('extracts VAT from a tax-inclusive price without changing what the customer pays', () => {
    const { vat, net, gross } = calculateVat(116, inclusive)
    expect(gross).toBe(116) // customer still pays the shelf price
    expect(vat).toBeCloseTo(16, 10)
    expect(net).toBeCloseTo(100, 10)
  })

  it('adds VAT on top of a tax-exclusive price', () => {
    const { vat, net, gross } = calculateVat(100, exclusive)
    expect(net).toBe(100)
    expect(vat).toBeCloseTo(16, 10)
    expect(gross).toBeCloseTo(116, 10)
  })

  it('keeps net + vat === gross for awkward amounts (no money invented or lost)', () => {
    for (const amount of [0.01, 3.33, 19.99, 255, 1234.56, 99999.99]) {
      const { vat, net, gross } = calculateVat(amount, inclusive)
      expect(net + vat).toBeCloseTo(gross, 8)
    }
  })

  it('splits a 100% inclusive rate down the middle', () => {
    const { vat, net } = calculateVat(200, { ...inclusive, vatRate: 100 })
    expect(vat).toBeCloseTo(100, 10)
    expect(net).toBeCloseTo(100, 10)
  })

  it('handles a zero-value cart', () => {
    expect(calculateVat(0, inclusive)).toEqual({ vat: 0, net: 0, gross: 0 })
  })

  it('carries the sign through a refund (negative amount)', () => {
    const { vat, gross } = calculateVat(-116, inclusive)
    expect(gross).toBe(-116)
    expect(vat).toBeCloseTo(-16, 10)
  })
})

describe('parseSettings — organization.settings is free-form JSON, so it must be defended', () => {
  it('falls back to safe defaults for null/garbage input', () => {
    for (const input of [null, undefined, 'nonsense', 42, []]) {
      expect(parseSettings(input)).toEqual({ vatEnabled: false, vatRate: 16, pricesIncludeVat: true, taxNumber: '' })
    }
  })

  it('only enables VAT for a real boolean true, never a truthy string', () => {
    expect(parseSettings({ vat_enabled: true }).vatEnabled).toBe(true)
    expect(parseSettings({ vat_enabled: 'true' }).vatEnabled).toBe(false)
    expect(parseSettings({ vat_enabled: 1 }).vatEnabled).toBe(false)
  })

  it('rejects out-of-range and non-numeric rates', () => {
    expect(parseSettings({ vat_rate: 150 }).vatRate).toBe(16)
    expect(parseSettings({ vat_rate: -5 }).vatRate).toBe(16)
    expect(parseSettings({ vat_rate: 'abc' }).vatRate).toBe(16)
    expect(parseSettings({ vat_rate: null }).vatRate).toBe(16)
  })

  it('accepts valid rates including the boundaries', () => {
    expect(parseSettings({ vat_rate: 0 }).vatRate).toBe(0)
    expect(parseSettings({ vat_rate: 100 }).vatRate).toBe(100)
    expect(parseSettings({ vat_rate: '16' }).vatRate).toBe(16)
  })

  it('treats prices as VAT-inclusive unless explicitly told otherwise', () => {
    expect(parseSettings({}).pricesIncludeVat).toBe(true)
    expect(parseSettings({ vat_prices_include_tax: false }).pricesIncludeVat).toBe(false)
  })

  it('EDGE: an empty vat_rate string silently becomes 0% rather than the 16% default', () => {
    // Documents current behaviour: Number('') === 0, which passes the >= 0 guard.
    // If a settings form ever saves a cleared field as '', VAT quietly stops being charged.
    expect(parseSettings({ vat_rate: '' }).vatRate).toBe(0)
  })
})
