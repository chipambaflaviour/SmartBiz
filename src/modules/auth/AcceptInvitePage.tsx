import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { Logo } from '@/shared/components/Logo'

export default function AcceptInvitePage() {
  const navigate = useNavigate()
  const resetApp = useAppStore((state) => state.reset)
  const setCurrentUser = useAppStore((state) => state.setCurrentUser)
  const [user, setUser] = useState<User | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadInvitation() {
      resetApp()
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError && !exchangeError.message.toLowerCase().includes('code verifier')) {
          if (active) { setError(exchangeError.message); setLoading(false) }
          return
        }
      }

      const { data, error: sessionError } = await supabase.auth.getSession()
      if (!active) return
      if (sessionError || !data.session?.user) {
        setError('This invitation link is invalid or has expired. Ask the platform administrator to resend it.')
      } else {
        const invitedUser = data.session.user
        const role = invitedUser.user_metadata?.role
        const organizationId = invitedUser.user_metadata?.organization_id
        if (!role || !organizationId) {
          setError('This browser is signed in with a different account. Sign out, then open the newest organization invitation email again.')
        } else {
          setUser(invitedUser)
          setCurrentUser(invitedUser)
        }
      }
      setLoading(false)
    }

    void loadInvitation()
    return () => { active = false }
  }, [resetApp, setCurrentUser])

  async function finish(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }

    setSaving(true)
    const { data, error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError || !data.user) {
      setError(updateError?.message ?? 'Could not finish account setup.')
      setSaving(false)
      return
    }

    resetApp()
    setCurrentUser(data.user)
    setSaving(false)
    navigate('/auth/org-select', { replace: true })
  }

  async function useDifferentAccount() {
    await supabase.auth.signOut()
    resetApp()
    navigate('/auth/login', { replace: true })
  }

  return (
    <main className="min-h-screen bg-[#f0f9f8] flex items-center justify-center p-5">
      <section className="w-full max-w-md rounded-2xl border border-[#d8e7e5] bg-white p-7 shadow-[0_18px_60px_rgba(0,75,72,0.12)]">
        <div className="mb-6 flex items-center gap-3">
          <Logo size="md" tagline="Organization invitation" />
        </div>

        {loading ? <p className="text-sm text-slate-600">Verifying your invitation…</p> : user ? (
          <form onSubmit={finish}>
            <h1 className="text-2xl font-bold text-slate-900">Welcome to your workspace</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Create a password for <strong>{user.email}</strong>. You will then enter the organization and see only the modules assigned to your role.</p>
            <label className="mt-6 block text-sm font-semibold text-slate-700">Create password</label>
            <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-[#00a9a3] focus:ring-2 focus:ring-[#00cec8]/20" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
            <label className="mt-4 block text-sm font-semibold text-slate-700">Confirm password</label>
            <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-[#00a9a3] focus:ring-2 focus:ring-[#00cec8]/20" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
            {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button disabled={saving} className="mt-6 w-full rounded-lg bg-[#007f7a] px-4 py-3 font-semibold text-white hover:bg-[#006a67] disabled:opacity-60">{saving ? 'Setting up account…' : 'Finish account setup'}</button>
          </form>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Invitation could not be opened</h1>
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-700">{error}</p>
            <button onClick={useDifferentAccount} className="mt-5 w-full rounded-lg bg-[#007f7a] px-4 py-3 font-semibold text-white">Sign out and use invited account</button>
            <Link className="mt-4 block text-center text-sm text-[#006a67]" to="/auth/login">Back to login</Link>
          </div>
        )}
      </section>
    </main>
  )
}
