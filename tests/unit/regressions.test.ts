import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SMARTBIZ_MODULES } from '@/shared/lib/blueprint'

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

/**
 * Guards for defects that have already shipped once in this project. Each test
 * names the symptom so a future change that reintroduces it fails loudly.
 */
describe('layout regressions', () => {
  const css = read('../../src/index.css')

  it('does not define --spacing-xs…xl as theme tokens', () => {
    // Symptom: Tailwind v4 resolves max-w-lg from the spacing scale, so defining
    // --spacing-lg: 24px made every max-w-lg container 24px wide — the payment
    // dialog collapsed into a sliver.
    const theme = css.slice(css.indexOf('@theme'), css.indexOf('}', css.indexOf('@theme')))
    for (const step of ['xs', 'sm', 'md', 'lg', 'xl']) {
      expect(theme, `--spacing-${step} must not be a @theme token`).not.toMatch(new RegExp(`--spacing-${step}\\s*:`))
    }
  })

  it('does not leave a transform on the page wrapper after its entry animation', () => {
    // Symptom: animation-fill-mode 'both' keeps a transform on <main>, which makes
    // it the containing block for position:fixed — every modal was trapped inside
    // the content area instead of covering the screen.
    const rule = css.match(/\.page-content-enter\s*\{[^}]*\}/)?.[0] ?? ''
    expect(rule, '.page-content-enter rule not found').toBeTruthy()
    expect(rule).not.toMatch(/\bboth\b/)
  })

  it('renders the payment dialog through a portal', () => {
    // Belt-and-braces for the same bug: even with a transformed ancestor, a
    // portal to document.body cannot be trapped.
    expect(read('../../src/modules/sales/PaymentDialog.tsx')).toContain('createPortal')
  })
})

describe('cache-key regressions', () => {
  it('the Modules settings page does not reuse the sidebar module cache key', () => {
    // Symptom: both used ['org-modules', orgId] with different row shapes, so
    // opening Settings → Modules wiped the sidebar down to Dashboard alone.
    const modulesPage = read('../../src/modules/settings/ModulesPage.tsx')
    const queryKeys = [...modulesPage.matchAll(/queryKey:\s*\[\s*'([^']+)'/g)].map((m) => m[1])
    expect(queryKeys.length).toBeGreaterThan(0)
    expect(queryKeys).not.toContain('org-modules')
  })

  it('module access is cached per user, not per organization alone', () => {
    // Symptom: signing in as a second account in the same browser reused the
    // previous user's module list for the whole stale time.
    const hook = read('../../src/shared/hooks/useOrganizationModules.ts')
    const key = hook.match(/queryKey:\s*\[([^\]]+)\]/)?.[1] ?? ''
    expect(key).toContain('orgId')
    expect(key, 'module cache key must include the user id').toContain('userId')
  })
})

describe('module catalogue stays in step with the database', () => {
  it('every module offered in the UI exists in module_catalog', () => {
    // Symptom: assigning an employee a module the catalogue does not know about
    // fails with "One or more modules are not purchased by this organization".
    const sql = read('../../supabase/blueprint_alignment.sql')
    const insert = sql.slice(sql.indexOf('INSERT INTO module_catalog'))
    const catalogue = new Set([...insert.slice(0, insert.indexOf(';')).matchAll(/\('([a-z_]+)',/g)].map((m) => m[1]))
    expect(catalogue.size).toBeGreaterThan(0)

    const missing = SMARTBIZ_MODULES.map((m) => m.key).filter((key) => !catalogue.has(key))
    expect(missing, `modules missing from module_catalog: ${missing.join(', ')}`).toEqual([])
  })

  it('core modules are marked core in the database too', () => {
    // Core modules must always be enabled; if the DB does not agree, employee
    // access assignment rejects them.
    const sql = read('../../supabase/blueprint_alignment.sql')
    const insert = sql.slice(sql.indexOf('INSERT INTO module_catalog'))
    const rows = [...insert.slice(0, insert.indexOf(';')).matchAll(/\('([a-z_]+)','[^']*','[^']*',(TRUE|FALSE)\)/g)]
    const coreInDb = new Set(rows.filter((r) => r[2] === 'TRUE').map((r) => r[1]))

    const coreInApp = SMARTBIZ_MODULES.filter((m) => m.core).map((m) => m.key)
    expect(coreInApp.length).toBeGreaterThan(0)
    for (const key of coreInApp) {
      expect(coreInDb, `'${key}' is core in the app but not in module_catalog`).toContain(key)
    }
  })
})

describe('branch-scoped inventory', () => {
  it('POS does not use the org-wide decrement_stock helper', () => {
    // decrement_stock in schema.sql subtracts from EVERY warehouse holding the
    // product, which silently drains other branches. POS must deduct from the
    // active branch's warehouses only.
    const pos = read('../../src/modules/sales/POSPage.tsx')
    expect(pos).not.toContain('decrement_stock')
    expect(pos, 'stock updates must be filtered to the active branch').toContain('activeBranchId')
  })

  it('stock updates are guarded against a concurrent change', () => {
    // The update matches on the quantity it read, so a second till selling the
    // same unit fails loudly instead of overwriting the other sale.
    const pos = read('../../src/modules/sales/POSPage.tsx')
    expect(pos).toMatch(/\.eq\('quantity', level\.quantity\)/)
  })
})
