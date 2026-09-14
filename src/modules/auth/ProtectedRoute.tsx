import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/shared/stores/appStore'
import { supabase } from '@/shared/lib/supabase'
import { isDemoMode } from '@/shared/lib/supabase'
import { Spinner } from '@/shared/components/ui/Display'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const currentUser = useAppStore((s) => s.currentUser)
  const setCurrentUser = useAppStore((s) => s.setCurrentUser)
  const activeOrgId = useAppStore((s) => s.activeOrganizationId)
  const setActiveOrgId = useAppStore((s) => s.setActiveOrganizationId)
  const isPlatformAdmin = useAppStore((s) => s.isPlatformAdmin)
  const location = useLocation()

  // The selected organization is persisted in the browser. Verify it is still one this
  // user may enter (member, or platform admin) — a stale id would otherwise render an
  // empty workspace with no modules and no data.
  const { data: orgAccess, isLoading: checkingOrg } = useQuery({
    queryKey: ['org-access-check', activeOrgId, currentUser?.id, isPlatformAdmin],
    queryFn: async () => {
      if (!activeOrgId || !currentUser?.id) return 'none' as const
      // The organization SELECT policy already encodes "member or platform admin"
      const { data, error } = await supabase.from('organization').select('id').eq('id', activeOrgId).is('deleted_at', null).maybeSingle()
      if (error) throw error
      return data ? ('ok' as const) : ('invalid' as const)
    },
    enabled: !isDemoMode && !!activeOrgId && !!currentUser?.id,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })

  useEffect(() => {
    if (orgAccess === 'invalid') setActiveOrgId(null)
  }, [orgAccess, setActiveOrgId])

  // Platform-admin status is a server fact, never trusted from the persisted store.
  const setIsPlatformAdmin = useAppStore((s) => s.setIsPlatformAdmin)
  const { data: adminCheck } = useQuery({
    queryKey: ['is-platform-admin', currentUser?.id],
    queryFn: async () => (await supabase.rpc('is_platform_admin')).data === true,
    enabled: !isDemoMode && !!currentUser?.id,
    staleTime: 1000 * 60 * 5,
  })
  useEffect(() => {
    if (adminCheck !== undefined && adminCheck !== isPlatformAdmin) setIsPlatformAdmin(adminCheck)
  }, [adminCheck, isPlatformAdmin, setIsPlatformAdmin])

  // If the Supabase session belongs to a different user than the one in the store
  // (e.g. a second account signed in from the same browser), drop the stale state.
  useEffect(() => {
    if (isDemoMode) return
    supabase.auth.getUser().then(({ data }) => {
      const sessionUser = data.user
      if (sessionUser && currentUser && sessionUser.id !== currentUser.id) {
        setActiveOrgId(null)
        setIsPlatformAdmin(false)
        setCurrentUser(sessionUser)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id])

  useEffect(() => {
    if (isDemoMode) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (!currentUser) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />
  }

  if (!activeOrgId && !isPlatformAdmin) {
    return <Navigate to="/auth/org-select" replace />
  }

  if (activeOrgId && !isDemoMode && checkingOrg) {
    return <div className="flex h-screen items-center justify-center"><Spinner size={28} /></div>
  }

  return <>{children}</>
}
