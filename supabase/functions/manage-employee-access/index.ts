import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization = request.headers.get('Authorization') ?? ''
    const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } })
    const admin = createClient(url, service)
    const { data: session } = await caller.auth.getUser()
    if (!session.user) throw new Error('Authentication required')

    const { organizationId, employeeId, email, role = 'member', moduleKeys = [] } = await request.json()
    if (!organizationId || !employeeId || !email) throw new Error('Organization, employee and email are required')
    const { data: membership } = await caller.from('user_organization').select('role').eq('organization_id', organizationId).eq('user_id', session.user.id).eq('is_active', true).maybeSingle()
    const { data: platformAdmin } = await caller.rpc('is_platform_admin')
    if (!platformAdmin && !['owner', 'admin'].includes(membership?.role ?? '')) throw new Error('Organization administrator access required')
    if (!['admin', 'manager', 'member', 'auditor'].includes(role)) throw new Error('Invalid employee role')

    const normalizedEmail = email.trim().toLowerCase()
    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 })
    let target = listed.users.find((item) => item.email?.toLowerCase() === normalizedEmail)
    // outcome: 'invited' = new account created + email sent, 'resent' = pending invite re-sent,
    // 'linked' = existing active account attached to this organization (no email needed)
    let outcome: 'invited' | 'resent' | 'linked' = 'linked'
    const redirectTo = `${request.headers.get('origin') ?? 'http://127.0.0.1:5175'}/auth/accept-invite`
    const inviteData = { organization_id: organizationId, role }
    if (!target) {
      const result = await admin.auth.admin.inviteUserByEmail(normalizedEmail, { redirectTo, data: inviteData })
      if (result.error || !result.data.user) throw result.error ?? new Error('Could not invite employee')
      target = result.data.user
      outcome = 'invited'
    } else if (!target.email_confirmed_at) {
      // Invited before but never finished setup: re-send the invitation so they get a fresh link.
      await admin.auth.admin.updateUserById(target.id, { user_metadata: { ...target.user_metadata, ...inviteData } })
      const result = await admin.auth.admin.inviteUserByEmail(normalizedEmail, { redirectTo, data: inviteData })
      if (!result.error) outcome = 'resent'
    }

    // Never demote an existing owner through the employee flow: the owner assigned at
    // organization creation keeps that role even if they are also listed as an employee.
    const { data: existingMembership } = await admin.from('user_organization').select('role').eq('user_id', target.id).eq('organization_id', organizationId).maybeSingle()
    const effectiveRole = existingMembership?.role === 'owner' ? 'owner' : role
    const { error: memberError } = await admin.from('user_organization').upsert({ user_id: target.id, organization_id: organizationId, role: effectiveRole, is_active: true }, { onConflict: 'user_id,organization_id' })
    if (memberError) throw memberError
    const { error: employeeError } = await admin.from('employee').update({ user_id: target.id, updated_by: session.user.id }).eq('id', employeeId).eq('organization_id', organizationId)
    if (employeeError) throw employeeError
    const { error: accessError } = await caller.rpc('assign_user_module_access', { p_user_id: target.id, p_organization_id: organizationId, p_module_keys: moduleKeys })
    if (accessError) throw accessError

    return new Response(JSON.stringify({ userId: target.id, invited: outcome === 'invited', outcome }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (error) {
    // Supabase/Postgrest errors are plain objects, not Error instances — read their message too.
    const message = error instanceof Error ? error.message
      : (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') ? (error as { message: string }).message
      : 'Unable to manage employee access'
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
