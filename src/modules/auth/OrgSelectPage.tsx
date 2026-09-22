import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { isDemoMode } from '@/shared/lib/supabase'
import { DEMO_MEMBERSHIPS } from '@/shared/lib/demo'
import { Logo } from '@/shared/components/Logo'

const planColors: Record<string, { bg: string; color: string }> = {
  starter:    { bg: '#e5eeff', color: '#1e40af' },
  pro:        { bg: '#dbeafe', color: '#1d4ed8' },
  enterprise: { bg: '#d1fae5', color: '#065f46' },
}

export default function OrgSelectPage() {
  const navigate = useNavigate()
  const currentUser  = useAppStore((s) => s.currentUser)
  const activeOrgId  = useAppStore((s) => s.activeOrganizationId)
  const setActiveOrgId = useAppStore((s) => s.setActiveOrganizationId)
  const setIsPlatformAdmin = useAppStore((s) => s.setIsPlatformAdmin)

  useEffect(() => {
    if (!currentUser?.id || isDemoMode) return
    supabase.rpc('is_platform_admin').then(({ data }) => {
      if (data === true) {
        setIsPlatformAdmin(true)
        navigate('/app/control-center', { replace: true })
      }
    })
  }, [currentUser?.id, navigate, setIsPlatformAdmin])

  const { data: memberships = [], isLoading } = useQuery({
    queryKey: ['user-orgs', currentUser?.id],
    queryFn: async () => {
      if (isDemoMode) return DEMO_MEMBERSHIPS
      if (!currentUser?.id) return []
      const { data } = await supabase
        .from('user_organization')
        .select('organization_id, role, organization(id, name, plan, logo_url)')
        .eq('user_id', currentUser.id)
        .eq('is_active', true)
      return data ?? []
    },
    enabled: !!currentUser?.id,
  })

  // Auto-select if only one org
  useEffect(() => {
    if (!isLoading && memberships.length === 1) {
      const m = memberships[0]
      const org = m.organization as unknown as { id: string } | null
      if (org?.id) { setActiveOrgId(org.id); navigate('/app/dashboard', { replace: true }) }
    }
  }, [isLoading, memberships])

  const select = useMutation({
    mutationFn: async (orgId: string) => orgId,
    onSuccess: (orgId) => { setActiveOrgId(orgId); navigate('/app/dashboard') },
  })

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f0f9f8',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 520,
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #e5eeff',
        boxShadow: '0 8px 32px rgba(0,106,103,0.08)',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '28px 28px 20px', borderBottom: '1px solid #f0f0f5' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <Logo size="sm" tagline={false} />
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 600, color: '#0b1c30', marginBottom: 4 }}>
            Choose a workspace
          </h2>
          <p style={{ fontSize: 14, color: '#6b7a79' }}>
            Select an organization to continue
          </p>
        </div>

        {/* Search bar */}
        <div style={{ padding: '14px 28px', borderBottom: '1px solid #f0f0f5' }}>
          <div style={{ position: 'relative' }}>
            <span className="material-symbols-outlined" style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              fontSize: 18, color: '#bacac8',
            }}>search</span>
            <input
              placeholder="Search organizations or roles…"
              style={{
                width: '100%', padding: '9px 14px 9px 38px',
                border: '1px solid #e5eeff',
                borderRadius: 8, fontSize: 14, color: '#0b1c30',
                background: '#f8f9ff', outline: 'none',
                boxSizing: 'border-box', fontFamily: 'Inter, sans-serif',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#00CEC8'; e.currentTarget.style.background = '#fff' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e5eeff'; e.currentTarget.style.background = '#f8f9ff' }}
            />
          </div>
        </div>

        {/* Org list */}
        <div style={{ padding: '8px 12px', maxHeight: 400, overflowY: 'auto' }}>

          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, padding: '32px 0', color: '#6b7a79', fontSize: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, animation: 'spin 1s linear infinite', color: '#006a67' }}>refresh</span>
              Loading workspaces…
            </div>
          )}

          {!isLoading && memberships.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#bacac8', display: 'block', marginBottom: 12 }}>
                business
              </span>
              <p style={{ fontSize: 14, color: '#6b7a79', marginBottom: 12 }}>No organizations found.</p>
              <p style={{ fontSize: 13, color: '#6b7a79' }}>Ask your organization owner or SmartBiz Platform Administration to assign your account.</p>
            </div>
          )}

          {/* Section label */}
          {!isLoading && memberships.length > 0 && (
            <p style={{ fontSize: 11, fontWeight: 600, color: '#bacac8', letterSpacing: '0.08em', padding: '8px 16px 6px', textTransform: 'uppercase' }}>
              Your Organizations
            </p>
          )}

          {memberships.map((m) => {
            const org = m.organization as unknown as { id: string; name: string; plan: string; logo_url: string | null } | null
            if (!org) return null
            const isActive = org.id === activeOrgId
            const plan = planColors[org.plan] ?? planColors.starter
            const initials = org.name.slice(0, 2).toUpperCase()

            return (
              <button
                key={org.id}
                onClick={() => select.mutate(org.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: `1px solid ${isActive ? '#00CEC8' : 'transparent'}`,
                  background: isActive ? 'rgba(0,206,200,0.06)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginBottom: 2,
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = '#f8f9ff'
                    e.currentTarget.style.borderColor = '#e5eeff'
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.borderColor = 'transparent'
                  }
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: isActive ? '#00CEC8' : '#e5eeff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: isActive ? '#00201f' : '#006a67',
                  flexShrink: 0,
                }}>
                  {initials}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#0b1c30' }}>{org.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      padding: '2px 6px', borderRadius: 4,
                      background: plan.bg, color: plan.color,
                      textTransform: 'uppercase',
                    }}>
                      {org.plan}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#6b7a79' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>shield_person</span>
                      <span style={{ textTransform: 'capitalize' }}>{m.role}</span>
                    </span>
                  </div>
                </div>

                {/* Active check / chevron */}
                {isActive ? (
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#006a67', fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#bacac8' }}>
                    chevron_right
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div style={{ padding: '16px 28px', borderTop: '1px solid #f0f0f5', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: '#6b7a79' }}>
            Missing a workspace? Ask your organization owner or the SmartBiz platform administrator to invite you.
          </p>
        </div>
      </div>

      {/* Spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
