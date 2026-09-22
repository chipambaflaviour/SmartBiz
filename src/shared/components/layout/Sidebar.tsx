import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '@/shared/lib/utils'
import { useAppStore, useUIStore } from '@/shared/stores/appStore'
import { useOrganizationModules } from '@/shared/hooks/useOrganizationModules'
import { supabase, isDemoMode } from '@/shared/lib/supabase'
import { SMARTBIZ_MODULES } from '@/shared/lib/blueprint'
import { Logo, LogoMark } from '@/shared/components/Logo'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface NavItem {
  key: string
  label: string
  icon: string
  href: string
  comingSoon?: boolean
  requiresModule?: string
}

const GROUPS = ['Operate', 'People', 'Finance', 'Intelligence', 'Platform'] as const

// Organization administration (owners / admins / platform admins only)
const BOTTOM_NAV: NavItem[] = [
  { key: 'branches', label: 'Branches & Departments', icon: 'store', href: '/app/settings/organization' },
  { key: 'modules', label: 'Modules', icon: 'extension', href: '/app/settings/modules' },
]

const PLATFORM_NAV: NavItem[] = [
  { key: 'control-center', label: 'Organizations', icon: 'domain', href: '/app/control-center' },
  { key: 'platform-subscriptions', label: 'Subscriptions', icon: 'workspace_premium', href: '/app/subscription' },
  { key: 'platform-audit', label: 'Platform Audit', icon: 'manage_search', href: '/app/audit' },
  { key: 'platform-security', label: 'Security & Access', icon: 'shield_lock', href: '/app/security' },
]

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const mobileOpen = useUIStore((s) => s.mobileSidebarOpen)
  const setMobileOpen = useUIStore((s) => s.setMobileSidebarOpen)
  const compact = collapsed && !mobileOpen
  const { data: modules, isError: modulesError, error: modulesErr } = useOrganizationModules()
  const enabledCount = modules?.filter((m) => m.isEnabled && m.moduleKey !== 'dashboard').length ?? 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const resetApp = useAppStore((s) => s.reset)
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const userId = useAppStore((s) => s.currentUser?.id)
  const isPlatformAdmin = useAppStore((s) => s.isPlatformAdmin)
  const { data: membershipRole } = useQuery({ queryKey: ['current-membership-role', orgId, userId], queryFn: async () => { if (isDemoMode) return 'owner'; const { data } = await supabase.from('user_organization').select('role').eq('organization_id', orgId!).eq('user_id', userId!).eq('is_active', true).maybeSingle(); return data?.role ?? 'member' }, enabled: !!orgId && !!userId })
  const canAdministerOrg = isPlatformAdmin || membershipRole === 'owner' || membershipRole === 'admin'
  const platformBackoffice = isPlatformAdmin && !orgId

  const isModuleEnabled = (key: string) => {
    if (!key) return true
    const mod = modules?.find((m) => m.moduleKey === key)
    return mod?.isEnabled ?? false
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    resetApp()
    navigate('/auth/login')
  }

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 h-full z-50 flex flex-col transition-transform',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        'bg-[#111722] text-white border-r border-white/5 transition-all duration-300 shadow-[12px_0_35px_rgba(15,23,42,.08)]',
        compact ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-[72px] flex items-center px-4 border-b border-white/10 shrink-0">
        {compact ? <LogoMark size={36} glow /> : <Logo variant="dark" size="sm" tagline="Enterprise OS" />}
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {platformBackoffice && !compact && <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Platform backoffice</p>}
        {platformBackoffice && PLATFORM_NAV.map(item => <NavLink key={item.key} to={item.href} onClick={() => setMobileOpen(false)} className={({isActive})=>cn('flex items-center gap-2.5 px-2 py-2 rounded-lg text-[14px]',isActive?'bg-[#00CEC8]/15 text-[#6df4ed] font-semibold':'text-slate-400 hover:bg-white/[.06] hover:text-white')}><span className="material-symbols-outlined text-[20px]">{item.icon}</span>{!compact&&<span>{item.label}</span>}</NavLink>)}
        {!platformBackoffice && GROUPS.map(group => {
          const items = SMARTBIZ_MODULES.filter(item => item.group === group && (item.key === 'dashboard' || isModuleEnabled(item.key)))
          if (!items.length) return null
          return <div key={group}>
            {!compact && <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">{group}</p>}
            {items.map(item => (
            <NavLink
              key={item.key}
              to={item.href}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-2 py-2 rounded-lg text-[14px] transition-colors duration-150',
                  isActive
                    ? 'bg-[#00CEC8]/15 text-[#6df4ed] font-semibold ring-1 ring-[#00CEC8]/20 shadow-inner'
                    : 'text-slate-400 hover:bg-white/[.06] hover:text-white'
                )
              }
            >
              <span className="material-symbols-outlined text-[20px] shrink-0">{item.icon}</span>
              {!compact && <span>{item.label}</span>}
            </NavLink>))}
            {group === 'Finance' && isModuleEnabled('finance') && <NavLink to="/app/finance/vat-summary" onClick={() => setMobileOpen(false)} className={({isActive})=>cn('flex items-center gap-2.5 px-2 py-2 rounded-lg text-[14px] transition-colors duration-150',isActive?'bg-[#00CEC8]/15 text-[#6df4ed] font-semibold ring-1 ring-[#00CEC8]/20':'text-slate-400 hover:bg-white/[.06] hover:text-white')}><span className="material-symbols-outlined text-[20px]">receipt_long</span>{!compact&&<span>VAT Summary</span>}</NavLink>}
          </div>
        })}
        {!compact && modules && enabledCount === 0 && (
          <div className="mx-1 mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-[12px] leading-relaxed text-amber-100">
            <p className="font-semibold text-amber-200">No modules enabled</p>
            {modulesError ? (
              <p className="mt-1 text-amber-100/80">Could not load modules: {(modulesErr as Error)?.message}</p>
            ) : modules.length === 0 ? (
              <p className="mt-1 text-amber-100/80">This organization has no modules assigned yet.{canAdministerOrg ? ' Enable them under Settings → Modules.' : ' Ask your administrator.'}</p>
            ) : canAdministerOrg ? (
              <p className="mt-1 text-amber-100/80">All modules are switched off. Turn them on under <NavLink to="/app/settings/modules" className="underline">Settings → Modules</NavLink>.</p>
            ) : (
              <p className="mt-1 text-amber-100/80">Your account has no modules assigned. Ask your administrator to grant access under Employees.</p>
            )}
          </div>
        )}
        {isPlatformAdmin && orgId && <button
          onClick={() => { useAppStore.getState().setActiveOrganizationId(null); useAppStore.getState().setActiveBranchId(null); queryClient.clear(); navigate('/app/control-center'); setMobileOpen(false) }}
          className="mt-3 w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[14px] text-slate-400 hover:bg-white/[.06] hover:text-white"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          {!compact && <span>Back to Platform</span>}
        </button>}
        {isPlatformAdmin && orgId && <NavLink
          to="/app/control-center"
          onClick={() => setMobileOpen(false)}
          className={({isActive})=>cn('mt-3 flex items-center gap-2.5 px-2 py-2 rounded-lg text-[14px]',isActive?'bg-[#00CEC8]/15 text-[#6df4ed] font-semibold':'text-slate-400 hover:bg-white/[.06] hover:text-white')}
        >
          <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
          {!compact && <span>Platform Control Center</span>}
        </NavLink>}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/10 px-2 py-3 space-y-0.5 bg-black/10">
        {!platformBackoffice && canAdministerOrg && !compact && <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Organization setup</p>}
        {!platformBackoffice && canAdministerOrg && BOTTOM_NAV.map((item) => (
          <NavLink
            key={item.key}
            to={item.href}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-2 py-2 rounded-lg text-[14px] transition-colors',
                isActive
                  ? 'bg-[#00CEC8]/15 text-[#6df4ed] font-semibold'
                  : 'text-slate-400 hover:bg-white/[.06] hover:text-white'
              )
            }
          >
            <span className="material-symbols-outlined text-[20px] shrink-0">{item.icon}</span>
            {!compact && <span>{item.label}</span>}
          </NavLink>
        ))}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[14px] text-slate-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
        >
          <span className="material-symbols-outlined text-[20px] shrink-0">logout</span>
          {!compact && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}
