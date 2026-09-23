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
  const branchId = useAppStore((s) => s.activeBranchId)
  const accessPreview = useAppStore((s) => s.accessPreview)

  return useQuery({
    // Keyed by user too: switching accounts in the same browser must never reuse another user's access list
    queryKey: ['org-modules', orgId, userId, branchId, accessPreview?.userId],
    queryFn: async () => {
      if (isDemoMode && !accessPreview) return DEMO_MODULES
      if (!orgId) return []
      if (accessPreview) {
        const allowed = new Set(accessPreview.modules.filter(module => module.canView).map(module => module.moduleKey))
        const { data, error } = await supabase.from('organization_module').select('module_key, is_enabled').eq('organization_id', orgId)
        if (error) throw error
        return (data ?? []).map((row: { module_key: string; is_enabled: boolean }) => ({
          moduleKey: row.module_key as ModuleKey,
          isEnabled: row.is_enabled && (row.module_key === 'dashboard' || allowed.has(row.module_key)),
        }))
      }
      const [{ data, error }, { data: membership }, { data: userAccess }, { data: branchAccess, error: branchAccessError }] = await Promise.all([
        supabase.from('organization_module').select('module_key, is_enabled').eq('organization_id', orgId),
        supabase.from('user_organization').select('role').eq('organization_id', orgId).eq('user_id', userId!).eq('is_active', true).maybeSingle(),
        supabase.from('user_module_access').select('module_key, can_view').eq('organization_id', orgId).eq('user_id', userId!),
        branchId
          ? supabase.from('branch_module_access').select('module_key, is_enabled').eq('organization_id', orgId).eq('branch_id', branchId)
          : Promise.resolve({ data: null, error: null }),
      ])

      if (error) throw error
      if (branchAccessError) throw branchAccessError
      // Owners/admins and platform super-admins see every module the organization has enabled
      const unrestricted = isPlatformAdmin || membership?.role === 'owner' || membership?.role === 'admin'
      const allowed = new Set((userAccess ?? []).filter((row: { can_view: boolean }) => row.can_view).map((row: { module_key: string }) => row.module_key))
      const branchEnabled = branchId
        ? new Set((branchAccess ?? []).filter((row: { is_enabled: boolean }) => row.is_enabled).map((row: { module_key: string }) => row.module_key))
        : null
      return (data ?? []).map((r: { module_key: string; is_enabled: boolean }) => ({
        moduleKey: r.module_key as ModuleKey,
        isEnabled: r.is_enabled && (!branchEnabled || branchEnabled.has(r.module_key)) && (unrestricted || allowed.has(r.module_key)),
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
