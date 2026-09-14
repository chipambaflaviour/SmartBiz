import { type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '@/shared/stores/appStore'
import { useOrganizationModules } from '@/shared/hooks/useOrganizationModules'
import { SMARTBIZ_MODULES } from '@/shared/lib/blueprint'
import { Button } from '@/shared/components/ui/Button'
import { Spinner } from '@/shared/components/ui/Display'

/**
 * Maps a URL prefix under /app to the module that must be enabled for the
 * current user. Longest prefix wins. Paths not listed here (dashboard, settings,
 * control-center, portals) are open to any signed-in member.
 */
const ROUTE_MODULES: Array<[prefix: string, moduleKey: string]> = [
  ['/app/sales', 'pos'],
  ['/app/inventory', 'inventory'],
  ['/app/purchasing', 'purchasing'],
  ['/app/suppliers', 'suppliers'],
  ['/app/crm', 'crm'],
  ['/app/crm-pipeline', 'crm'],
  ['/app/hr/leave', 'leave'],
  ['/app/hr', 'hr'],
  ['/app/payroll', 'payroll'],
  ['/app/loans', 'loans'],
  ['/app/finance', 'finance'],
  ['/app/expenses', 'expenses'],
  ['/app/accounting', 'accounting'],
  ['/app/assets', 'assets'],
  ['/app/reports', 'reports'],
  ['/app/approvals', 'approvals'],
  ['/app/workflow', 'workflow'],
  ['/app/ai', 'ai'],
  ['/app/marketplace', 'marketplace'],
  ['/app/security', 'security'],
  ['/app/audit', 'audit'],
  ['/app/subscription', 'subscription'],
  ['/app/developer', 'developer'],
]

export function requiredModuleFor(pathname: string): string | null {
  const match = ROUTE_MODULES
    .filter(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0]
  return match?.[1] ?? null
}

export function ModuleGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isPlatformAdmin = useAppStore(s => s.isPlatformAdmin)
  const { data: modules, isLoading } = useOrganizationModules()

  const required = requiredModuleFor(pathname)
  if (!required || isPlatformAdmin) return <>{children}</>

  if (isLoading || !modules) {
    return <div className="flex h-64 items-center justify-center"><Spinner size={28} /></div>
  }

  const enabled = modules.find(m => m.moduleKey === required)?.isEnabled ?? false
  if (enabled) return <>{children}</>

  const label = SMARTBIZ_MODULES.find(m => m.key === required)?.label ?? required
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#ffdad6] text-[#93000a]">
        <span className="material-symbols-outlined text-[28px]">lock</span>
      </div>
      <h1 className="mt-5 text-2xl font-bold text-[#0b1c30]">You don't have access to {label}</h1>
      <p className="mt-2 text-sm text-[#6b7a79]">
        This module hasn't been assigned to your account. Ask your organization administrator to grant access from <strong>Employees &gt; Edit &gt; Allowed modules</strong>.
      </p>
      <Button className="mt-6" onClick={() => navigate('/app/dashboard')}>Back to dashboard</Button>
    </div>
  )
}
