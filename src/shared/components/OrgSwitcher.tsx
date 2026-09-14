import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore, useUIStore } from '@/shared/stores/appStore'
import { cn } from '@/shared/lib/utils'
import { isDemoMode } from '@/shared/lib/supabase'; import { DEMO_MEMBERSHIPS } from '@/shared/lib/demo'

export function OrgSwitcher() {
  const open = useUIStore((s) => s.orgSwitcherOpen)
  const setOpen = useUIStore((s) => s.setOrgSwitcherOpen)
  const activeOrgId = useAppStore((s) => s.activeOrganizationId)
  const setActiveOrgId = useAppStore((s) => s.setActiveOrganizationId)
  const currentUser = useAppStore((s) => s.currentUser)
  const isPlatformAdmin = useAppStore((s) => s.isPlatformAdmin)
  const queryClient = useQueryClient()

  const { data: memberships = [] } = useQuery({
    queryKey: ['user-orgs', currentUser?.id, isPlatformAdmin],
    queryFn: async () => {
      if (isDemoMode) return DEMO_MEMBERSHIPS
      if (!currentUser?.id) return []
      if (isPlatformAdmin) {
        // Super admins can enter any organization on the platform
        const { data } = await supabase.from('organization').select('id, name, plan, logo_url').is('deleted_at', null).order('name')
        return (data ?? []).map((org) => ({ organization_id: org.id, role: 'platform admin', organization: org }))
      }
      const { data } = await supabase
        .from('user_organization')
        .select('organization_id, role, organization(id, name, plan, logo_url)')
        .eq('user_id', currentUser.id)
        .eq('is_active', true)
      return data ?? []
    },
    enabled: !!currentUser?.id,
  })

  const switchOrg = useMutation({
    mutationFn: async (orgId: string) => orgId,
    onSuccess: (orgId) => {
      setActiveOrgId(orgId)
      queryClient.invalidateQueries()
      setOpen(false)
    },
  })

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  const planColors: Record<string, string> = {
    starter: 'bg-[#e5eeff] text-[#006a67]',
    pro: 'bg-[#dbeafe] text-[#1e40af]',
    enterprise: 'bg-[#dcfce7] text-[#166534]',
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#213145]/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      <div className="relative w-full max-w-md bg-white rounded-xl border border-[#bacac8] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5eeff]">
          <h2 className="text-[18px] font-semibold text-[#0b1c30]">Switch Organization</h2>
          <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#e5eeff] text-[#6b7a79]">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Org list */}
        <div className="py-2 max-h-80 overflow-y-auto">
          {memberships.length === 0 && (
            <div className="py-8 text-center text-[13px] text-[#6b7a79]">No organizations found</div>
          )}
          {memberships.map((m) => {
            const org = m.organization as unknown as { id: string; name: string; plan: string; logo_url: string | null } | null
            if (!org) return null
            const isActive = org.id === activeOrgId
            return (
              <button
                key={org.id}
                onClick={() => switchOrg.mutate(org.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[#eff4ff] transition-colors',
                  isActive && 'bg-[#eff4ff]'
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-[#00CEC8] flex items-center justify-center text-white font-bold text-[13px] shrink-0">
                  {org.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold text-[#0b1c30] truncate">{org.name}</p>
                    <span className={cn('text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded', planColors[org.plan] ?? planColors.starter)}>
                      {org.plan}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#6b7a79]">{m.role}</p>
                </div>
                {isActive && <span className="material-symbols-outlined text-[#006a67] text-[20px]">check_circle</span>}
              </button>
            )
          })}
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 px-5 py-3 border-t border-[#e5eeff]">
          <button className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border border-[#bacac8] text-[13px] font-medium text-[#3b4948] hover:bg-[#eff4ff] transition-colors">
            <span className="material-symbols-outlined text-[16px]">add_circle</span>
            Create New
          </button>
          <button className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border border-[#bacac8] text-[13px] font-medium text-[#3b4948] hover:bg-[#eff4ff] transition-colors">
            <span className="material-symbols-outlined text-[16px]">key</span>
            Join via Code
          </button>
        </div>
      </div>
    </div>
  )
}
