import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/shared/lib/supabase'
import { Logo } from '@/shared/components/Logo'

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Minimum 8 characters'),
  agree: z.literal(true, { message: 'You must agree to the terms' }),
})
type FormValues = z.infer<typeof schema>

const inputStyle = (hasError: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '10px 14px',
  border: `1px solid ${hasError ? '#ba1a1a' : '#bacac8'}`,
  borderRadius: 8,
  fontSize: 14,
  color: '#0b1c30',
  background: hasError ? '#fff8f8' : '#fff',
  outline: 'none',
  boxSizing: 'border-box' as const,
  fontFamily: 'Inter, sans-serif',
})

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: '#3b4948',
  marginBottom: 6,
}

export default function SignupPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  function focusStyle(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = '#00CEC8'
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,206,200,0.15)'
  }
  function blurStyle(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>, hasError: boolean) {
    e.currentTarget.style.borderColor = hasError ? '#ba1a1a' : '#bacac8'
    e.currentTarget.style.boxShadow = 'none'
  }

  async function onSubmit(values: FormValues) {
    setServerError(null)
    const fullName = `${values.firstName} ${values.lastName}`
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: values.email.trim().toLowerCase(),
      password: values.password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/login`,
      },
    })
    if (authError || !authData.user) { setServerError(authError?.message ?? 'Signup failed'); return }

    navigate('/auth/login')
  }

  async function handleSocialSignup(provider: 'google' | 'azure') {
    setServerError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/org-select` },
    })
    if (error) setServerError(error.message)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', overflow: 'hidden' }}>

      {/* ══════════════════════════════════════════
          LEFT PANEL — blue gradient (matches Stitch)
         ══════════════════════════════════════════ */}
      <div
        className="hidden lg:flex"
        style={{
          width: '50%',
          minHeight: '100vh',
          background: 'linear-gradient(145deg, #008f88 0%, #006a67 48%, #003c3a 100%)',
          position: 'relative',
          flexDirection: 'column',
          padding: '48px',
          overflow: 'hidden',
        }}
      >
        {/* Logo top-left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'auto' }}>
          <Logo size="md" variant="dark" tagline={false} />
        </div>

        {/* Center content */}
        <div style={{ paddingTop: 120, maxWidth: 440 }}>
          <h1 style={{
            fontSize: 44, fontWeight: 700, color: '#fff',
            lineHeight: 1.1, letterSpacing: '-0.025em', marginBottom: 20,
          }}>
            Manage your entire business with AI.
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.72)', lineHeight: 1.65, marginBottom: 40 }}>
            SmartBiz unifies ERP, CRM, and POS into a single, intelligent platform designed for high-performance enterprise growth.
          </p>

          {/* Feature cards */}
          {[
            { icon: 'bar_chart', label: 'Predictive Analytics', desc: 'Forecast demand and automate supply chain logistics.' },
            { icon: 'groups', label: 'Smart CRM', desc: 'AI-driven lead scoring and customer lifecycle automation.' },
          ].map(({ icon, label, desc }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14,
              padding: '16px 20px', marginBottom: 12,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 8,
                background: 'rgba(0,206,200,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#00CEC8' }}>{icon}</span>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 3 }}>{label}</p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom footer */}
        <div style={{ marginTop: 'auto', paddingTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex' }}>
              {['#f59e0b', '#9ca3af', '#d1d5db'].map((c, i) => (
                <div key={i} style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: c, border: '2px solid rgba(255,255,255,0.4)',
                  marginLeft: i > 0 ? -8 : 0,
                }} />
              ))}
            </div>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
              Joined by 12,000+ businesses globally
            </span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          RIGHT PANEL — white, form
         ══════════════════════════════════════════ */}
      <div style={{
        flex: 1,
        minHeight: '100vh',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '48px 64px',
        overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 480 }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: '#0b1c30', letterSpacing: '-0.02em', marginBottom: 6 }}>
              Create your account
            </h2>
            <p style={{ fontSize: 14, color: '#6b7a79' }}>
              Create your identity to accept a SmartBiz organization invitation.
            </p>
          </div>

          {/* SSO */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {[
              {
                label: 'Google',
                icon: <svg width="16" height="16" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>,
              },
              {
                label: 'Microsoft',
                icon: <svg width="16" height="16" viewBox="0 0 24 24">
                  <path d="M1 1h10v10H1z" fill="#F25022"/><path d="M13 1h10v10H13z" fill="#7FBA00"/>
                  <path d="M1 13h10v10H1z" fill="#00A4EF"/><path d="M13 13h10v10H13z" fill="#FFB900"/>
                </svg>,
              },
            ].map(({ label, icon }) => (
              <button key={label} type="button" onClick={() => handleSocialSignup(label === 'Google' ? 'google' : 'azure')} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: '10px 16px',
                border: '1px solid #bacac8', borderRadius: 8,
                background: '#fff', cursor: 'pointer',
                fontSize: 13, fontWeight: 500, color: '#3b4948',
                fontFamily: 'Inter, sans-serif',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f0f9f8')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: '#bacac8' }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: '#6b7a79', letterSpacing: '0.08em' }}>OR SIGN UP WITH EMAIL</span>
            <div style={{ flex: 1, height: 1, background: '#bacac8' }} />
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Name row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>First Name</label>
                <input {...register('firstName')} placeholder="Samuel"
                  style={inputStyle(!!errors.firstName)}
                  onFocus={focusStyle}
                  onBlur={e => blurStyle(e, !!errors.firstName)} />
                {errors.firstName && <p style={{ fontSize: 12, color: '#ba1a1a', marginTop: 4 }}>{errors.firstName.message}</p>}
              </div>
              <div>
                <label style={labelStyle}>Last Name</label>
                <input {...register('lastName')} placeholder="Tembo"
                  style={inputStyle(!!errors.lastName)}
                  onFocus={focusStyle}
                  onBlur={e => blurStyle(e, !!errors.lastName)} />
                {errors.lastName && <p style={{ fontSize: 12, color: '#ba1a1a', marginTop: 4 }}>{errors.lastName.message}</p>}
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Email Address</label>
              <input {...register('email')} type="email" placeholder="samuel.tembo@smartbiz.co.zm"
                style={inputStyle(!!errors.email)}
                onFocus={focusStyle}
                onBlur={e => blurStyle(e, !!errors.email)} />
              {errors.email && <p style={{ fontSize: 12, color: '#ba1a1a', marginTop: 4 }}>{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <input {...register('password')} type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  style={{ ...inputStyle(!!errors.password), paddingRight: 44 }}
                  onFocus={focusStyle}
                  onBlur={e => blurStyle(e, !!errors.password)} />
                <button type="button" onClick={() => setShowPassword(v => !v)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#bacac8', display: 'flex', padding: 0,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    {showPassword ? 'visibility' : 'visibility_off'}
                  </span>
                </button>
              </div>
              <p style={{ fontSize: 12, color: '#6b7a79', marginTop: 4 }}>
                {errors.password ? <span style={{ color: '#ba1a1a' }}>{errors.password.message}</span> : 'Security: Enter password'}
              </p>
            </div>
            <div style={{ marginBottom: 16, padding: '11px 12px', background: '#effafa', border: '1px solid #b8ebe8', borderRadius: 8, fontSize: 12, color: '#365f5d' }}>Organizations and subscriptions are created by SmartBiz Platform Administration. Your organization owner will invite you and assign your access.</div>

            {/* Terms checkbox */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20 }}>
              <input {...register('agree')} id="agree" type="checkbox"
                style={{ width: 16, height: 16, marginTop: 2, accentColor: '#006a67', cursor: 'pointer', flexShrink: 0 }} />
              <label htmlFor="agree" style={{ fontSize: 13, color: '#3b4948', lineHeight: 1.5, cursor: 'pointer' }}>
                I agree to the{' '}
                <a href="#" style={{ color: '#006a67', fontWeight: 600, textDecoration: 'none' }}>Terms of Service</a>
                {' '}and{' '}
                <a href="#" style={{ color: '#006a67', fontWeight: 600, textDecoration: 'none' }}>Privacy Policy</a>.
              </label>
            </div>

            {/* Server error */}
            {serverError && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
                background: '#ffdad6', border: '1px solid #ffb4ab', borderRadius: 8, marginBottom: 16,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ba1a1a', flexShrink: 0, marginTop: 1 }}>error</span>
                <p style={{ fontSize: 13, color: '#93000a' }}>{serverError}</p>
              </div>
            )}

            {/* CTA */}
            <button type="submit" disabled={isSubmitting} style={{
              width: '100%', padding: '13px 24px',
              background: '#00CEC8', color: '#00201f',
              border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 700, letterSpacing: '0.05em',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
              fontFamily: 'Inter, sans-serif',
              marginBottom: 16,
              textTransform: 'uppercase' as const,
            }}
              onMouseEnter={e => !isSubmitting && (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => !isSubmitting && (e.currentTarget.style.opacity = '1')}
            >
              {isSubmitting ? 'Creating account…' : 'Create User Account'}
            </button>

            {/* Sign-in link */}
            <p style={{ textAlign: 'center', fontSize: 14, color: '#6b7a79', borderTop: '1px solid #e5eeff', paddingTop: 16 }}>
              Already have an account?{' '}
              <Link to="/auth/login" style={{ color: '#006a67', fontWeight: 700, textDecoration: 'none' }}>Sign In</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
