import { describe, expect, it } from 'vitest'
import { friendlyDbError } from '@/shared/lib/utils'
import { requiredModuleFor } from '@/shared/components/ModuleGuard'

describe('friendlyDbError — raw Postgres errors must never reach a shop owner', () => {
  it('explains a row-level-security rejection in business terms', () => {
    const message = friendlyDbError({ message: 'new row violates row-level security policy for table "branch"' }, 'branches')
    expect(message).toContain("don't have permission")
    expect(message).toContain('branches')
    expect(message).not.toContain('row-level security policy for table')
  })

  it('names the duplicated column and value when Postgres provides details', () => {
    const message = friendlyDbError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "employee_organization_id_employee_id_key"',
      details: 'Key (organization_id, employee_id)=(11111111-1111-1111-1111-111111111111, AX005) already exists.',
    } as never, 'employees')
    expect(message).toContain('AX005')
    expect(message).toContain('Employee ID')
  })

  it('handles a duplicate SKU the same way', () => {
    const message = friendlyDbError({
      code: '23505',
      message: 'duplicate key value',
      details: 'Key (organization_id, sku)=(abc, COC-500) already exists.',
    } as never, 'products')
    expect(message).toContain('COC-500')
    expect(message.toLowerCase()).toContain('sku')
  })

  it('falls back to a generic duplicate message when details are missing', () => {
    const message = friendlyDbError({ code: '23505', message: 'duplicate key value' } as never)
    expect(message).toContain('already exists')
  })

  it('passes unknown errors through unchanged rather than inventing a cause', () => {
    expect(friendlyDbError({ message: 'connection terminated unexpectedly' })).toBe('connection terminated unexpectedly')
  })

  it('survives null/undefined without throwing', () => {
    expect(friendlyDbError(null)).toBe('Something went wrong')
    expect(friendlyDbError(undefined)).toBe('Something went wrong')
    expect(friendlyDbError({})).toBe('Something went wrong')
  })

  it('does not crash on a single-column unique violation it cannot label', () => {
    const message = friendlyDbError({
      code: '23505', message: 'duplicate key value',
      details: 'Key (organization_id)=(abc) already exists.',
    } as never)
    expect(message).toContain('already exists')
  })

  it('EDGE: a duplicated value containing a comma is reported truncated', () => {
    // "Joy's Style, Ltd" splits on the comma, so only the first fragment is shown.
    // Cosmetic only — the user still sees which field clashed.
    const message = friendlyDbError({
      code: '23505', message: 'duplicate key value',
      details: "Key (organization_id, name)=(abc, Joy's Style, Ltd) already exists.",
    } as never)
    expect(message).toContain("Joy's Style")
  })
})

describe('requiredModuleFor — the URL bar must not bypass module permissions', () => {
  it('maps each module area to its permission key', () => {
    expect(requiredModuleFor('/app/sales/pos')).toBe('pos')
    expect(requiredModuleFor('/app/inventory/products')).toBe('inventory')
    expect(requiredModuleFor('/app/hr/employees')).toBe('hr')
    expect(requiredModuleFor('/app/payroll')).toBe('payroll')
  })

  it('prefers the longest matching prefix so Leave is not treated as HR', () => {
    expect(requiredModuleFor('/app/hr/leave')).toBe('leave')
    expect(requiredModuleFor('/app/hr/leave/requests')).toBe('leave')
  })

  it('does not let a prefix leak across a hyphenated sibling route', () => {
    // '/app/crm-pipeline' must not be matched by the '/app/crm' entry by accident.
    expect(requiredModuleFor('/app/crm')).toBe('crm')
    expect(requiredModuleFor('/app/crm-pipeline')).toBe('crm')
  })

  it('leaves shared pages open to any signed-in member', () => {
    expect(requiredModuleFor('/app/dashboard')).toBeNull()
    expect(requiredModuleFor('/app/settings/organization')).toBeNull()
    expect(requiredModuleFor('/app/control-center')).toBeNull()
  })

  it('guards deep links, not just landing pages', () => {
    expect(requiredModuleFor('/app/inventory/products/abc-123/edit')).toBe('inventory')
    expect(requiredModuleFor('/app/sales/invoices/xyz')).toBe('pos')
  })

  it('returns null for unknown paths instead of throwing', () => {
    expect(requiredModuleFor('')).toBeNull()
    expect(requiredModuleFor('/')).toBeNull()
    expect(requiredModuleFor('/app/not-a-real-module')).toBeNull()
  })
})
