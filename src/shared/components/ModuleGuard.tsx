import { type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '@/shared/stores/appStore'
import { useOrganizationModules } from '@/shared/hooks/useOrganizationModules'
import { SMARTBIZ_MODULES } from '@/shared/lib/blueprint'
import { Button } from '@/shared/components/ui/Button'
import { Spinner } from '@/shared/components/ui/Display'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

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
  const orgId = useAppStore(s => s.activeOrganizationId)
  const userId = useAppStore(s => s.currentUser?.id)
  const { data: modules, isLoading } = useOrganizationModules()
  const { data: membershipRole, isLoading: roleLoading } = useQuery({
    queryKey: ['route-membership-role', orgId, userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_organization').select('role').eq('organization_id', orgId!).eq('user_id', userId!).eq('is_active', true).maybeSingle()
      if (error) throw error
      return data?.role ?? 'member'
    },
    enabled: !!orgId && !!userId && !isPlatformAdmin,
  })

  const required = requiredModuleFor(pathname)
  const isControlCenter = pathname === '/app/control-center'
  const isOrganizationSettings = pathname.startsWith('/app/settings')
  const canAdministerOrganization = isPlatformAdmin || membershipRole === 'owner' || membershipRole === 'admin'

  if (isControlCenter && !isPlatformAdmin) return <AccessDenied title="Platform administrator access required" onBack={() => navigate('/app/dashboard')} />
  if (isOrganizationSettings) {
    if (roleLoading && !isPlatformAdmin) return <div className="flex h-64 items-center justify-center"><Spinner size={28} /></div>
    if (!canAdministerOrganization) return <AccessDenied title="Organization administrator access required" onBack={() => navigate('/app/dashboard')} />
    return <>{children}</>
  }
  if (!required || isPlatformAdmin) return <>{children}</>

  if (isLoading || !modules) {
    return <div className="flex h-64 items-center justify-center"><Spinner size={28} /></div>
  }

  const enabled = modules.find(m => m.moduleKey === required)?.isEnabled ?? false
  if (enabled) return <>{children}</>

  const label = SMARTBIZ_MODULES.find(m => m.key === required)?.label ?? required
  return <AccessDenied title={`You don't have access to ${label}`} description="This module hasn't been assigned to your account. Ask your organization administrator to grant access from Employees > Edit > Allowed modules." onBack={() => navigate('/app/dashboard')} />
}

function AccessDenied({ title, description, onBack }: { title: string; description?: string; onBack: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#ffdad6] text-[#93000a]">
        <span className="material-symbols-outlined text-[28px]">lock</span>
      </div>
      <h1 className="mt-5 text-2xl font-bold text-[#0b1c30]">{title}</h1>
      <p className="mt-2 text-sm text-[#6b7a79]">
        {description ?? 'Your account does not have permission to open this area.'}
      </p>
      <Button className="mt-6" onClick={onBack}>Back to dashboard</Button>
    </div>
  )
}
