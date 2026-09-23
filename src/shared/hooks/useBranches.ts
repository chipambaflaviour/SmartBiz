import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isDemoMode, supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'

export type WorkspaceBranch = {
  id: string
  organization_id: string
  name: string
  code: string
  address: string | null
  city: string | null
  country: string | null
  is_headquarters: boolean
}

const demoBranches: WorkspaceBranch[] = [
  { id: 'demo-main-branch', organization_id: 'demo-lusaka-fresh-market', name: 'Lusaka Main Branch', code: 'HQ', address: null, city: 'Lusaka', country: 'Zambia', is_headquarters: true },
]

type BranchWorkspace = {
  branches: WorkspaceBranch[]
  canUseAllBranches: boolean
}

export function useBranches() {
  const organizationId = useAppStore((state) => state.activeOrganizationId)
  const activeBranchId = useAppStore((state) => state.activeBranchId)
  const setActiveBranchId = useAppStore((state) => state.setActiveBranchId)
  const userId = useAppStore((state) => state.currentUser?.id)
  const isPlatformAdmin = useAppStore((state) => state.isPlatformAdmin)
  const accessPreview = useAppStore((state) => state.accessPreview)

  const query = useQuery({
    queryKey: ['workspace-branches', organizationId, userId, isPlatformAdmin, accessPreview?.userId],
    queryFn: async (): Promise<BranchWorkspace> => {
      if (!organizationId || !userId) return { branches: [], canUseAllBranches: false }
      if (isDemoMode) return { branches: demoBranches, canUseAllBranches: true }

      if (accessPreview) {
        const { data, error } = await supabase.from('branch').select('id,organization_id,name,code,address,city,country,is_headquarters').eq('organization_id', organizationId).is('deleted_at', null).order('is_headquarters', { ascending: false }).order('name')
        if (error) throw error
        const allBranches = (data ?? []) as WorkspaceBranch[]
        const unrestricted = accessPreview.role === 'owner' || accessPreview.role === 'admin'
        return { branches: unrestricted ? allBranches : allBranches.filter(branch => accessPreview.branchIds.includes(branch.id)), canUseAllBranches: unrestricted }
      }

      const [{ data: membership, error: membershipError }, { data: branches, error: branchError }, { data: assignments, error: assignmentError }] = await Promise.all([
        supabase
          .from('user_organization')
          .select('role, branch_id')
          .eq('organization_id', organizationId)
          .eq('user_id', userId)
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('branch')
          .select('id,organization_id,name,code,address,city,country,is_headquarters')
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .order('is_headquarters', { ascending: false })
          .order('name'),
        supabase
          .from('user_branch_access')
          .select('branch_id')
          .eq('organization_id', organizationId)
          .eq('user_id', userId)
          .eq('is_active', true),
      ])

      if (branchError) throw branchError
      if (membershipError && !isPlatformAdmin) throw membershipError
      if (assignmentError && !isPlatformAdmin) throw assignmentError

      const allBranches = (branches ?? []) as WorkspaceBranch[]
      const canUseEveryBranch = isPlatformAdmin || membership?.role === 'owner' || membership?.role === 'admin'
      if (canUseEveryBranch) return { branches: allBranches, canUseAllBranches: true }
      const allowedBranchIds = new Set((assignments ?? []).map((assignment) => assignment.branch_id))
      if (membership?.branch_id) allowedBranchIds.add(membership.branch_id)
      return {
        branches: allBranches.filter((branch) => allowedBranchIds.has(branch.id)),
        canUseAllBranches: false,
      }
    },
    enabled: Boolean(organizationId && userId),
    staleTime: 60_000,
  })

  const branches = query.data?.branches ?? []
  const canUseAllBranches = query.data?.canUseAllBranches ?? false
  const activeBranch = useMemo(
    () => branches.find((branch) => branch.id === activeBranchId) ?? null,
    [activeBranchId, branches]
  )

  useEffect(() => {
    if (!organizationId || query.isLoading || query.isError) return
    if (!branches.length) {
      if (activeBranchId) setActiveBranchId(null)
      return
    }
    if (!activeBranch && (activeBranchId !== null || !canUseAllBranches)) {
      const preferred = branches.find((branch) => branch.is_headquarters) ?? branches[0]
      setActiveBranchId(preferred.id)
    }
  }, [activeBranch, activeBranchId, branches, canUseAllBranches, organizationId, query.isError, query.isLoading, setActiveBranchId])

  return { ...query, branches, activeBranch, canUseAllBranches }
}
