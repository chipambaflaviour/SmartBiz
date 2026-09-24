import { describe, expect, it } from 'vitest'
import { validate as validateProduct, suggestSku } from '@/modules/inventory/ProductEditorPage'
import { validate as validateCustomer } from '@/modules/crm/CustomerEditorPage'

const product = {
  name: 'Cooking Oil 5L', sku: 'COO-5L-01', barcode: '', category_id: '', description: '',
  unit_price: '185', cost_price: '150', reorder_level: '10', image_url: '', is_active: true,
  base_unit: 'piece', pack_unit: '', units_per_pack: '', pack_price: '',
}

describe('product form validation', () => {
  it('accepts a complete, ordinary product', () => {
    expect(validateProduct(product, {})).toEqual({})
  })

  it('requires a name and SKU, ignoring whitespace-only input', () => {
    const errors = validateProduct({ ...product, name: '   ', sku: '  ' }, {})
    expect(errors.name).toBeTruthy()
    expect(errors.sku).toBeTruthy()
  })

  it('rejects a missing or negative selling price but allows a free item', () => {
    expect(validateProduct({ ...product, unit_price: '' }, {}).unit_price).toBeTruthy()
    expect(validateProduct({ ...product, unit_price: '-1' }, {}).unit_price).toBeTruthy()
    expect(validateProduct({ ...product, unit_price: '0' }, {}).unit_price).toBeUndefined()
  })

  it('allows a blank cost price but not a negative one', () => {
    expect(validateProduct({ ...product, cost_price: '' }, {}).cost_price).toBeUndefined()
    expect(validateProduct({ ...product, cost_price: '-0.01' }, {}).cost_price).toBeTruthy()
  })

  it('requires a whole, non-negative reorder level', () => {
    expect(validateProduct({ ...product, reorder_level: '1.5' }, {}).reorder_level).toBeTruthy()
    expect(validateProduct({ ...product, reorder_level: '-1' }, {}).reorder_level).toBeTruthy()
    expect(validateProduct({ ...product, reorder_level: '' }, {}).reorder_level).toBeTruthy()
    expect(validateProduct({ ...product, reorder_level: '0' }, {}).reorder_level).toBeUndefined()
  })

  it('only enforces pack fields once a pack unit is chosen', () => {
    // No pack configured: pack fields are irrelevant even if empty.
    expect(validateProduct({ ...product, units_per_pack: '', pack_price: '' }, {}).units_per_pack).toBeUndefined()

    const withPack = { ...product, pack_unit: 'carton' }
    expect(validateProduct(withPack, {}).units_per_pack).toBeTruthy()
    expect(validateProduct({ ...withPack, units_per_pack: '1', pack_price: '100' }, {}).units_per_pack).toBeTruthy()
    // A blank pack price used to save as 0, so a carton of 24 sold for nothing.
    expect(validateProduct({ ...withPack, units_per_pack: '24', pack_price: '' }, {}).pack_price).toBeTruthy()
    expect(validateProduct({ ...withPack, units_per_pack: '24', pack_price: '  ' }, {}).pack_price).toBeTruthy()
    expect(validateProduct({ ...withPack, units_per_pack: '24', pack_price: '-1' }, {}).pack_price).toBeTruthy()
    // An explicit 0 is not a price either: the till cannot tell it from "unpriced".
    expect(validateProduct({ ...withPack, units_per_pack: '24', pack_price: '0' }, {}).pack_price).toBeTruthy()
    expect(validateProduct({ ...withPack, units_per_pack: '24', pack_price: '4000' }, {})).toEqual({})
  })

  it('rejects negative or non-numeric stock quantities, allowing blanks', () => {
    expect(validateProduct(product, { w1: '' }).stock).toBeUndefined()
    expect(validateProduct(product, { w1: '0' }).stock).toBeUndefined()
    expect(validateProduct(product, { w1: '-5' }).stock).toBeTruthy()
    expect(validateProduct(product, { w1: 'abc' }).stock).toBeTruthy()
    expect(validateProduct(product, { w1: '10', w2: '-1' }).stock).toBeTruthy()
  })

  it('EDGE: a whitespace-only price is accepted as zero', () => {
    // Number('   ') === 0, so the field is not caught as empty. Low impact
    // (the product saves at price 0) but it is not what the cashier typed.
    expect(validateProduct({ ...product, unit_price: '   ' }, {}).unit_price).toBeUndefined()
  })
})

describe('suggestSku', () => {
  it('builds a code from the first two words of the product name', () => {
    expect(suggestSku('Coca-Cola 500ml')).toMatch(/^COC-COL-[0-9A-F]{4}$/)
    expect(suggestSku('Sugar')).toMatch(/^SUG-[0-9A-F]{4}$/)
  })

  it('falls back to a generic prefix when there is nothing usable', () => {
    expect(suggestSku('')).toMatch(/^PRD-[0-9A-F]{4}$/)
    expect(suggestSku('!!! ??? ***')).toMatch(/^PRD-[0-9A-F]{4}$/)
  })

  it('strips accents and punctuation so the SKU stays barcode-safe', () => {
    expect(suggestSku('Café Crème')).toMatch(/^[A-Z0-9-]+$/)
    expect(suggestSku("Joy's Style")).toMatch(/^[A-Z0-9-]+$/)
  })

  it('does not repeat itself between products', () => {
    const codes = new Set(Array.from({ length: 50 }, () => suggestSku('Sugar 2kg')))
    expect(codes.size).toBeGreaterThan(40)
  })
})

const customer = { name: 'Kabwe Trading Co.', email: 'buyer@kabwe.co.zm', phone: '', segment: 'retail' as const, credit_limit: '0', notes: '' }

describe('customer form validation', () => {
  it('accepts a customer reachable by email alone', () => {
    expect(validateCustomer(customer)).toEqual({})
  })

  it('accepts a customer reachable by phone alone', () => {
    expect(validateCustomer({ ...customer, email: '', phone: '+260970000000' })).toEqual({})
  })

  it('requires at least one way to contact the customer', () => {
    expect(validateCustomer({ ...customer, email: '', phone: '' }).phone).toBeTruthy()
  })

  it('requires a name', () => {
    expect(validateCustomer({ ...customer, name: '  ' }).name).toBeTruthy()
  })

  it('rejects malformed email addresses', () => {
    for (const email of ['not-an-email', 'a@b', 'a b@c.com', '@nowhere.com']) {
      expect(validateCustomer({ ...customer, email }).email, email).toBeTruthy()
    }
  })

  it('tolerates surrounding whitespace on a valid email', () => {
    expect(validateCustomer({ ...customer, email: '  buyer@kabwe.co.zm  ' }).email).toBeUndefined()
  })

  it('rejects a negative credit limit but allows blank or zero', () => {
    expect(validateCustomer({ ...customer, credit_limit: '-1' }).credit_limit).toBeTruthy()
    expect(validateCustomer({ ...customer, credit_limit: '' }).credit_limit).toBeUndefined()
    expect(validateCustomer({ ...customer, credit_limit: '0' }).credit_limit).toBeUndefined()
    expect(validateCustomer({ ...customer, credit_limit: '50000.50' }).credit_limit).toBeUndefined()
  })
})
