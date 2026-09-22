import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { isDemoMode } from '@/shared/lib/supabase'
import { DEMO_ORG_ID, DEMO_USER } from '@/shared/lib/demo'
import { Logo } from '@/shared/components/Logo'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  remember: z.boolean().optional(),
})
type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const setCurrentUser = useAppStore((s) => s.setCurrentUser)
  const setActiveOrgId = useAppStore((s) => s.setActiveOrganizationId)
  const setIsPlatformAdmin = useAppStore((s) => s.setIsPlatformAdmin)
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: isDemoMode ? { email: 'admin@smartbiz.co.zm', password: 'smartbiz', remember: true } : undefined,
  })

  useEffect(() => {
    if (isDemoMode) return
    const query = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const isAuthReturn = query.has('code') || query.has('token_hash') || hash.has('access_token') || hash.has('type')
    if (!isAuthReturn) return

    let active = true
    async function finishAuthReturn() {
      setServerError(null)
      const code = query.get('code')
      if (code) await supabase.auth.exchangeCodeForSession(code)
      const { data, error } = await supabase.auth.getSession()
      if (!active) return
      if (error || !data.session?.user) {
        setServerError(error?.message ?? 'The confirmation link is invalid or expired. Ask for a new email.')
        return
      }

      const confirmedUser = data.session.user
      useAppStore.getState().reset()
      setCurrentUser(confirmedUser)
      const { data: admin } = await supabase.rpc('is_platform_admin')
      if (!active) return
      setIsPlatformAdmin(admin === true)
      setActiveOrgId(null)
      navigate(admin === true ? '/app/control-center' : '/auth/org-select', { replace: true })
    }

    void finishAuthReturn()
    return () => { active = false }
  }, [navigate, setActiveOrgId, setCurrentUser, setIsPlatformAdmin])

  async function onSubmit(values: FormValues) {
    setServerError(null)
    setIsSubmitting(true)
    if (isDemoMode) {
      await new Promise((resolve) => setTimeout(resolve, 450))
      setCurrentUser(DEMO_USER)
      setActiveOrgId(DEMO_ORG_ID)
      setIsSubmitting(false)
      navigate('/app/dashboard')
      return
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: values.email.trim().toLowerCase(),
      password: values.password,
    })
    setIsSubmitting(false)
    if (error) { setServerError(error.message); return }
    if (data.user) {
      setCurrentUser(data.user)
      const { data: admin } = await supabase.rpc('is_platform_admin')
      setIsPlatformAdmin(admin === true)
      if (admin === true) setActiveOrgId(null)
      navigate(admin === true ? '/app/control-center' : '/auth/org-select')
    }
  }

  async function handleSocialLogin(provider: 'google' | 'azure') {
    setServerError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/org-select` },
    })
    if (error) setServerError(error.message)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', overflow: 'hidden' }}>

      {/* ══════════════════════════════════════════════════════
          LEFT PANEL — teal gradient, content bottom-anchored
          Exactly matches Stitch smartbiz_login_teal screenshot
         ══════════════════════════════════════════════════════ */}
      <div
        className="hidden lg:flex"
        style={{
          width: '50%',
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #006a67 0%, #00201f 100%)',
          position: 'relative',
          flexDirection: 'column',
          justifyContent: 'flex-end',   /* content sits in the lower half */
          padding: '48px',
          overflow: 'hidden',
        }}
      >
        {/* Subtle radial glow behind content */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 60% 50% at 30% 60%, rgba(0,206,200,0.15) 0%, transparent 70%)',
        }} />

        {/* ── Content ── */}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 480 }}>

          {/* Trusted pill */}
          <div style={{ marginBottom: 28 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.20)',
              color: '#fff', fontSize: 12, fontWeight: 500,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#00CEC8' }}>verified</span>
              Trusted by 10k+ Enterprises
            </span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 52, fontWeight: 700, lineHeight: 1.05,
            letterSpacing: '-0.025em', color: '#fff',
            marginBottom: 20,
          }}>
            One Platform.<br />Every Business.
          </h1>

          {/* Subtext */}
          <p style={{
            fontSize: 16, lineHeight: 1.65, color: 'rgba(255,255,255,0.72)',
            marginBottom: 32, maxWidth: 440,
          }}>
            The SmartBiz Enterprise Suite orchestrates your entire operation—from deep ERP insights to real-time POS agility. Manage complexity with clinical precision.
          </p>

          {/* Mockup card — exact proportions from screenshot */}
          <div style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12, padding: '20px 20px 16px',
            maxWidth: 440,
          }}>
            {/* Traffic lights */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f87171' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fbbf24' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#00CEC8' }} />
            </div>
            <div style={{ marginBottom: 8, height: 12, width: '72%', background: 'rgba(255,255,255,0.22)', borderRadius: 4 }} />
            <div style={{ marginBottom: 16, height: 12, width: '48%', background: 'rgba(255,255,255,0.12)', borderRadius: 4 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 72, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8 }} />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: 'absolute', bottom: 24, left: 48, right: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
          <span>© 2024 SmartBiz Systems Inc.</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="#" style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>Privacy</a>
            <a href="#" style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>Terms</a>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          RIGHT PANEL — form
         ══════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, minHeight: '100vh', background: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', padding: '48px 64px' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <Logo size="lg" tagline={false} />
          </div>

          {/* ── Header ── */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 32, fontWeight: 600, color: '#0b1c30', letterSpacing: '-0.02em', marginBottom: 6, lineHeight: 1.2 }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 14, color: '#3b4948', lineHeight: 1.5 }}>
              Access your unified enterprise workspace
            </p>
          </div>

          {/* ── Form ── */}
          <form onSubmit={handleSubmit(onSubmit)}>
            {isDemoMode && <div style={{background:'#e8fbfa',border:'1px solid #9ce8e4',borderRadius:8,padding:'10px 12px',fontSize:12,color:'#006a67',marginBottom:16}}><strong>Prototype mode</strong> — demo credentials are prefilled. Changes are saved in this browser.</div>}

            {/* SSO buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                {
                  label: 'Google',
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  ),
                },
                {
                  label: 'Microsoft',
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24">
                      <path d="M1 1h10v10H1z" fill="#F25022"/>
                      <path d="M13 1h10v10H13z" fill="#7FBA00"/>
                      <path d="M1 13h10v10H1z" fill="#00A4EF"/>
                      <path d="M13 13h10v10H13z" fill="#FFB900"/>
                    </svg>
                  ),
                },
              ].map(({ label, icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleSocialLogin(label === 'Google' ? 'google' : 'azure')}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: '10px 16px',
                    border: '1px solid #bacac8', borderRadius: 8,
                    background: '#fff', cursor: 'pointer',
                    fontSize: 13, fontWeight: 500, color: '#3b4948',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0f9f8')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 1, background: '#bacac8' }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: '#6b7a79', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                OR CONTINUE WITH
              </span>
              <div style={{ flex: 1, height: 1, background: '#bacac8' }} />
            </div>

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="email" style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#3b4948', marginBottom: 6 }}>
                Email Address
              </label>
              <input
                {...register('email')}
                id="email"
                type="email"
                placeholder="name@company.com"
                autoComplete="email"
                style={{
                  width: '100%', padding: '10px 14px',
                  border: `1px solid ${errors.email ? '#ba1a1a' : '#bacac8'}`,
                  borderRadius: 8, fontSize: 14, color: '#0b1c30',
                  background: errors.email ? '#fff8f8' : '#fff',
                  outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'Inter, sans-serif',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = '#00CEC8'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,206,200,0.15)'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = errors.email ? '#ba1a1a' : '#bacac8'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
              {errors.email && (
                <p style={{ marginTop: 4, fontSize: 12, color: '#ba1a1a', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label htmlFor="password" style={{ fontSize: 12, fontWeight: 500, color: '#3b4948' }}>
                  Password
                </label>
                <Link to="/auth/forgot-password" style={{ fontSize: 12, color: '#006a67', fontWeight: 500, textDecoration: 'none' }}>
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  {...register('password')}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{
                    width: '100%', padding: '10px 44px 10px 14px',
                    border: `1px solid ${errors.password ? '#ba1a1a' : '#bacac8'}`,
                    borderRadius: 8, fontSize: 14, color: '#0b1c30',
                    background: errors.password ? '#fff8f8' : '#fff',
                    outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'Inter, sans-serif',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = '#00CEC8'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,206,200,0.15)'
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = errors.password ? '#ba1a1a' : '#bacac8'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#bacac8', display: 'flex', alignItems: 'center', padding: 0,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    {showPassword ? 'visibility' : 'visibility_off'}
                  </span>
                </button>
              </div>
              {errors.password && (
                <p style={{ marginTop: 4, fontSize: 12, color: '#ba1a1a', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember me */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <input
                {...register('remember')}
                id="remember"
                type="checkbox"
                style={{ width: 16, height: 16, accentColor: '#006a67', cursor: 'pointer', flexShrink: 0 }}
              />
              <label htmlFor="remember" style={{ fontSize: 13, color: '#6b7a79', cursor: 'pointer', userSelect: 'none' }}>
                Remember this device for 30 days
              </label>
            </div>

            {/* Server error */}
            {serverError && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
                background: '#ffdad6', border: '1px solid #ffb4ab', borderRadius: 8,
                marginBottom: 16,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ba1a1a', flexShrink: 0, marginTop: 1 }}>error</span>
                <p style={{ fontSize: 13, color: '#93000a', lineHeight: 1.4 }}>{serverError}</p>
              </div>
            )}

            {/* Sign In CTA — #00CEC8 background matching Stitch */}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%', padding: '13px 24px',
                background: '#00CEC8', color: '#00201f',
                border: 'none', borderRadius: 8,
                fontSize: 15, fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
                transition: 'opacity 0.15s, transform 0.1s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: 'Inter, sans-serif',
                marginBottom: 16,
              }}
              onMouseEnter={e => !isSubmitting && (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => !isSubmitting && (e.currentTarget.style.opacity = '1')}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {isSubmitting ? (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>refresh</span>
                  Signing in…
                </>
              ) : 'Sign In'}
            </button>

            <p style={{ textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: '#6b7a79' }}>
              Access is invitation-only. Organization owners and employees receive an email invitation from SmartBiz.
            </p>
          </form>

          {/* ── Trust section ── */}
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(186,202,200,0.35)', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: '#6b7a79', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#006a67' }}>lock</span>
              Enterprise-grade security by default.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, opacity: 0.35 }}>
              <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.03em', color: '#0b1c30' }}>SAMSUNG</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#bacac8', display: 'inline-block' }} />
              <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.03em', color: '#0b1c30' }}>AIRBNB</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#bacac8', display: 'inline-block' }} />
              <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.03em', color: '#0b1c30' }}>STRIPE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Spin animation for loading state */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
