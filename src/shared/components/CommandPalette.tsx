import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '@/shared/stores/appStore'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/shared/lib/utils'
import { useOrganizationModules } from '@/shared/hooks/useOrganizationModules'
import { requiredModuleFor } from '@/shared/components/ModuleGuard'
import { useAppStore } from '@/shared/stores/appStore'

interface SearchResult {
  id: string
  type: 'product' | 'customer' | 'employee' | 'invoice' | 'page'
  title: string
  subtitle?: string
  icon: string
  href: string
}

const QUICK_PAGES: SearchResult[] = [
  { id: 'dashboard', type: 'page', title: 'Dashboard', icon: 'dashboard', href: '/app/dashboard' },
  { id: 'pos', type: 'page', title: 'POS Terminal', icon: 'point_of_sale', href: '/app/sales/pos' },
  { id: 'products', type: 'page', title: 'Product Catalog', icon: 'inventory_2', href: '/app/inventory/products' },
  { id: 'customers', type: 'page', title: 'Customers', icon: 'groups', href: '/app/crm/customers' },
  { id: 'employees', type: 'page', title: 'Employee Directory', icon: 'badge', href: '/app/hr/employees' },
  { id: 'invoices', type: 'page', title: 'Invoices', icon: 'receipt_long', href: '/app/sales/invoices' },
  { id: 'approvals', type: 'page', title: 'Approvals Inbox', icon: 'task_alt', href: '/app/approvals' },
  { id: 'settings', type: 'page', title: 'Settings', icon: 'settings', href: '/app/settings/organization' },
]

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen)
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const queryClient = useQueryClient()
  const isPlatformAdmin = useAppStore((s) => s.isPlatformAdmin)
  const { data: modules } = useOrganizationModules()

  // Only offer pages the current user may actually open (mirrors ModuleGuard).
  const canOpen = useCallback((href: string) => {
    if (isPlatformAdmin) return true
    const required = requiredModuleFor(href)
    if (!required) return true
    return modules?.find((m) => m.moduleKey === required)?.isEnabled ?? false
  }, [modules, isPlatformAdmin])

  // Build search results from cached TanStack Query data
  const buildResults = useCallback((q: string): SearchResult[] => {
    const pages = QUICK_PAGES.filter((p) => canOpen(p.href))
    if (!q.trim()) return pages

    const lower = q.toLowerCase()
    const results: SearchResult[] = []

    // Search pages
    results.push(...pages.filter((p) => p.title.toLowerCase().includes(lower)))

    // Search cached products
    const products: Array<{ id: string; name: string; sku: string }> =
      (queryClient.getQueryData(['products']) as never) ?? []
    products
      .filter((p) => p.name.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower))
      .slice(0, 4)
      .forEach((p) =>
        results.push({
          id: p.id, type: 'product',
          title: p.name, subtitle: `SKU: ${p.sku}`,
          icon: 'inventory_2',
          href: `/app/inventory/products/${p.id}`,
        })
      )

    // Search cached customers
    const customers: Array<{ id: string; name: string; email: string | null }> =
      (queryClient.getQueryData(['customers']) as never) ?? []
    customers
      .filter((c) => c.name.toLowerCase().includes(lower) || c.email?.toLowerCase().includes(lower))
      .slice(0, 4)
      .forEach((c) =>
        results.push({
          id: c.id, type: 'customer',
          title: c.name, subtitle: c.email ?? undefined,
          icon: 'person',
          href: `/app/crm/customers/${c.id}`,
        })
      )

    return results.slice(0, 10)
  }, [queryClient, canOpen])

  const results = buildResults(query)

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && results[activeIdx]) { handleSelect(results[activeIdx]) }
      if (e.key === 'Escape') { setOpen(false) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, results, activeIdx])

  // Global Ctrl+K / ⌘K
  useEffect(() => {
    function handleGlobal(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handleGlobal)
    return () => window.removeEventListener('keydown', handleGlobal)
  }, [])

  // Reset on open
  useEffect(() => {
    if (open) { setQuery(''); setActiveIdx(0) }
  }, [open])

  function handleSelect(result: SearchResult) {
    navigate(result.href)
    setOpen(false)
  }

  if (!open) return null

  const typeLabel: Record<SearchResult['type'], string> = {
    page: 'Page', product: 'Product', customer: 'Customer',
    employee: 'Employee', invoice: 'Invoice',
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-32 px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#213145]/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div className="relative w-full max-w-[600px] bg-white border border-[#bacac8] rounded-xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e5eeff]">
          <span className="material-symbols-outlined text-[#006a67] text-[20px]">search</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
            placeholder="Search pages, products, customers..."
            className="flex-1 text-[14px] text-[#0b1c30] placeholder:text-[#6b7a79] border-none outline-none bg-transparent"
          />
          <kbd className="px-1.5 py-0.5 bg-[#e5eeff] rounded text-[10px] font-mono text-[#6b7a79] border border-[#bacac8]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[380px] overflow-y-auto">
          {results.length === 0 && (
            <div className="py-10 text-center text-[13px] text-[#6b7a79]">
              No results for "{query}"
            </div>
          )}
          {results.map((result, idx) => (
            <button
              key={result.id}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setActiveIdx(idx)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                idx === activeIdx ? 'bg-[#eff4ff]' : 'hover:bg-[#eff4ff]'
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                result.type === 'page' ? 'bg-[#e5eeff]' : 'bg-[#f8f9ff] border border-[#bacac8]'
              )}>
                <span className="material-symbols-outlined text-[#006a67] text-[18px]">{result.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#0b1c30] truncate">{result.title}</p>
                {result.subtitle && (
                  <p className="text-[11px] text-[#6b7a79] truncate">{result.subtitle}</p>
                )}
              </div>
              <span className="text-[11px] text-[#6b7a79] shrink-0">{typeLabel[result.type]}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 bg-[#f8f9ff] border-t border-[#e5eeff]">
          <span className="flex items-center gap-1 text-[11px] text-[#6b7a79]">
            <span className="material-symbols-outlined text-[14px]">keyboard_arrow_up</span>
            <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
            Navigate
          </span>
          <span className="flex items-center gap-1 text-[11px] text-[#6b7a79]">
            <span className="material-symbols-outlined text-[14px]">subdirectory_arrow_left</span>
            Select
          </span>
          <span className="ml-auto text-[11px] font-semibold text-[#006a67]">SmartBiz Search</span>
        </div>
      </div>
    </div>
  )
}
