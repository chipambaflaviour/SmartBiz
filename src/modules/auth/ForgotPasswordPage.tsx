import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/shared/lib/supabase'
import { Logo } from '@/shared/components/Logo'

const schema = z.object({ email: z.string().email('Enter a valid email address') })

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<{ email: string }>({
    resolver: zodResolver(schema),
  })

  async function onSubmit({ email }: { email: string }) {
    setServerError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (error) { setServerError(error.message); return }
    setSent(true)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8f9ff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: '#fff',
        border: '1px solid #e5eeff',
        borderRadius: 16,
        padding: '40px 40px 36px',
        boxShadow: '0 4px 24px rgba(0,106,103,0.06)',
      }}>
        {/* Back link */}
        <Link to="/auth/login" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 13, color: '#6b7a79', textDecoration: 'none',
          marginBottom: 28, fontWeight: 500,
        }}
          onMouseEnter={e => (e.currentTarget.style.color = '#006a67')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6b7a79')}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          Back to Sign In
        </Link>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <Logo size="md" tagline={false} />
        </div>

        {sent ? (
          /* ── Success state ── */
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64,
              background: 'rgba(0,206,200,0.12)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#006a67', fontVariationSettings: "'FILL' 1" }}>
                mark_email_read
              </span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: '#0b1c30', marginBottom: 10 }}>Check your inbox</h2>
            <p style={{ fontSize: 14, color: '#6b7a79', lineHeight: 1.6, marginBottom: 24 }}>
              We sent a password reset link to <strong style={{ color: '#0b1c30' }}>{getValues('email')}</strong>.
              It expires in 1 hour.
            </p>
            <Link to="/auth/login" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', padding: '12px 24px',
              background: '#00CEC8', color: '#00201f',
              borderRadius: 8, fontSize: 14, fontWeight: 600,
              textDecoration: 'none',
            }}>
              Return to Sign In
            </Link>
          </div>
        ) : (
          /* ── Form state ── */
          <>
            <h2 style={{ fontSize: 28, fontWeight: 600, color: '#0b1c30', letterSpacing: '-0.02em', marginBottom: 8 }}>
              Reset your password
            </h2>
            <p style={{ fontSize: 14, color: '#6b7a79', marginBottom: 28, lineHeight: 1.5 }}>
              Enter your work email and we'll send you a secure reset link.
            </p>

            <form onSubmit={handleSubmit(onSubmit)}>
              <div style={{ marginBottom: 20 }}>
                <label htmlFor="reset-email" style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#3b4948', marginBottom: 6 }}>
                  Email Address
                </label>
                <input
                  {...register('email')}
                  id="reset-email"
                  type="email"
                  placeholder="name@company.com"
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

              {serverError && (
                <div style={{
                  display: 'flex', gap: 10, padding: '12px 14px',
                  background: '#ffdad6', border: '1px solid #ffb4ab', borderRadius: 8,
                  marginBottom: 16,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ba1a1a', flexShrink: 0 }}>error</span>
                  <p style={{ fontSize: 13, color: '#93000a' }}>{serverError}</p>
                </div>
              )}

              <button type="submit" disabled={isSubmitting} style={{
                width: '100%', padding: '12px 24px',
                background: '#00CEC8', color: '#00201f',
                border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
                fontFamily: 'Inter, sans-serif',
              }}>
                {isSubmitting ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
