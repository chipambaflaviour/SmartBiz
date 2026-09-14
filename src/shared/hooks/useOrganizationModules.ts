import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { isDemoMode } from '@/shared/lib/supabase'
import { DEMO_MODULES } from '@/shared/lib/demo'
import { useAppStore, type ModuleKey } from '@/shared/stores/appStore'

export interface OrgModule {
  moduleKey: ModuleKey
  isEnabled: boolean
}

export function useOrganizationModules() {
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const userId = useAppStore((s) => s.currentUser?.id)
  const isPlatformAdmin = useAppStore((s) => s.isPlatformAdmin)

  return useQuery({
    // Keyed by user too: switching accounts in the same browser must never reuse another user's access list
    queryKey: ['org-modules', orgId, userId],
    queryFn: async () => {
      if (isDemoMode) return DEMO_MODULES
      if (!orgId) return []
      const [{ data, error }, { data: membership }, { data: userAccess }] = await Promise.all([
        supabase.from('organization_module').select('module_key, is_enabled').eq('organization_id', orgId),
        supabase.from('user_organization').select('role').eq('organization_id', orgId).eq('user_id', userId!).eq('is_active', true).maybeSingle(),
        supabase.from('user_module_access').select('module_key, can_view').eq('organization_id', orgId).eq('user_id', userId!),
      ])

      if (error) throw error
      // Owners/admins and platform super-admins see every module the organization has enabled
      const unrestricted = isPlatformAdmin || membership?.role === 'owner' || membership?.role === 'admin'
      const allowed = new Set((userAccess ?? []).filter((row: { can_view: boolean }) => row.can_view).map((row: { module_key: string }) => row.module_key))
      return (data ?? []).map((r: { module_key: string; is_enabled: boolean }) => ({
        moduleKey: r.module_key as ModuleKey,
        isEnabled: r.is_enabled && (unrestricted || allowed.has(r.module_key)),
      }))
    },
    enabled: !!orgId && !!userId,
    staleTime: 1000 * 60 * 10,
  })
}

export function useIsModuleEnabled(key: ModuleKey): boolean {
  const { data } = useOrganizationModules()
  if (!data) return false
  const mod = data.find((m) => m.moduleKey === key)
  return mod?.isEnabled ?? false
}
