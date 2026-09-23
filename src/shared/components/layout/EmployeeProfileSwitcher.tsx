import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { SMARTBIZ_MODULES } from '@/shared/lib/blueprint'
import { useAppStore, type PreviewModuleAccess } from '@/shared/stores/appStore'

type Employee = { id: string; user_id: string; first_name: string; last_name: string; email: string; position: string | null }
type Access = { user_id: string; module_key: string; can_view: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }
type Membership = { user_id: string; role: string; branch_id: string | null }

export function EmployeeProfileSwitcher({ compact, closeMobile }: { compact: boolean; closeMobile: () => void }) {
  const [open, setOpen] = useState(false)
  const orgId = useAppStore(state => state.activeOrganizationId)
  const startPreview = useAppStore(state => state.startAccessPreview)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data = [] } = useQuery({
    queryKey: ['sidebar-employee-profiles', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const [employeesResult, accessResult, membershipsResult, branchesResult, purchasedResult] = await Promise.all([
        supabase.from('employee').select('id,user_id,first_name,last_name,email,position').eq('organization_id', orgId).not('user_id', 'is', null).is('deleted_at', null).order('first_name'),
        supabase.from('user_module_access').select('user_id,module_key,can_view,can_create,can_update,can_delete').eq('organization_id', orgId),
        supabase.from('user_organization').select('user_id,role,branch_id').eq('organization_id', orgId).eq('is_active', true),
        supabase.from('user_branch_access').select('user_id,branch_id').eq('organization_id', orgId).eq('is_active', true),
        supabase.from('organization_module').select('module_key').eq('organization_id', orgId).eq('is_enabled', true),
      ])
      const error = employeesResult.error || accessResult.error || membershipsResult.error || branchesResult.error || purchasedResult.error
      if (error) throw error
      const access = (accessResult.data ?? []) as Access[]
      const memberships = (membershipsResult.data ?? []) as Membership[]
      const purchased = (purchasedResult.data ?? []).map(row => row.module_key as string)
      return ((employeesResult.data ?? []) as Employee[]).map(employee => {
        const membership = memberships.find(item => item.user_id === employee.user_id)
        const unrestricted = membership?.role === 'owner' || membership?.role === 'admin'
        const modules: PreviewModuleAccess[] = unrestricted
          ? SMARTBIZ_MODULES.filter(module => module.key === 'dashboard' || purchased.includes(module.key)).map(module => ({ moduleKey: module.key, canView: true, canCreate: true, canUpdate: true, canDelete: true }))
          : access.filter(item => item.user_id === employee.user_id && item.can_view).map(item => ({ moduleKey: item.module_key, canView: item.can_view, canCreate: item.can_create, canUpdate: item.can_update, canDelete: item.can_delete }))
        const branchIds = (branchesResult.data ?? []).filter(item => item.user_id === employee.user_id).map(item => item.branch_id as string)
        if (membership?.branch_id && !branchIds.includes(membership.branch_id)) branchIds.push(membership.branch_id)
        return { employee, membership, modules, branchIds }
      }).filter(profile => profile.modules.length > 0)
    },
    enabled: Boolean(orgId),
  })

  function choose(profile: (typeof data)[number]) {
    const { employee, membership, branchIds } = profile
    const modules = profile.modules.some(module => module.moduleKey === 'dashboard') ? [...profile.modules] : [{ moduleKey: 'dashboard', canView: true, canCreate: false, canUpdate: false, canDelete: false }, ...profile.modules]
    startPreview({ employeeId: employee.id, userId: employee.user_id, name: `${employee.first_name} ${employee.last_name}`, email: employee.email, position: employee.position, role: membership?.role ?? 'member', branchIds, modules })
    queryClient.invalidateQueries({ queryKey: ['org-modules'] })
    queryClient.invalidateQueries({ queryKey: ['workspace-branches'] })
    setOpen(false)
    closeMobile()
    navigate('/app/dashboard')
  }

  return <div className="relative">
    <button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[14px] text-slate-400 transition-colors hover:bg-white/[.06] hover:text-white" aria-expanded={open}>
      <span className="material-symbols-outlined text-[20px]">person_play</span>{!compact && <><span className="flex-1 text-left">Preview as employee</span><span className="material-symbols-outlined text-[18px]">{open ? 'expand_more' : 'chevron_right'}</span></>}
    </button>
    {open && <div className="absolute bottom-full left-0 z-[80] mb-2 max-h-80 w-72 overflow-y-auto rounded-xl border border-slate-700 bg-[#182131] p-2 shadow-2xl">
      <div className="px-2 pb-2"><p className="text-xs font-bold text-white">Sample profiles</p><p className="mt-0.5 text-[11px] text-slate-400">Only employees with module access</p></div>
      {data.length === 0 ? <p className="rounded-lg bg-white/5 p-3 text-xs text-slate-400">No employees have module access yet.</p> : data.map(profile => <button type="button" key={profile.employee.id} onClick={() => choose(profile)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white/[.07]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#00CEC8]/15 text-xs font-bold text-[#6df4ed]">{profile.employee.first_name[0]}{profile.employee.last_name[0]}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{profile.employee.first_name} {profile.employee.last_name}</span><span className="block truncate text-[11px] text-slate-400">{profile.employee.position ?? profile.membership?.role ?? 'Employee'} · {profile.modules.length} modules</span></span><span className="material-symbols-outlined text-[17px] text-slate-500">login</span>
      </button>)}
    </div>}
  </div>
}
