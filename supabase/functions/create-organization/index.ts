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
    const { data: allowed } = await caller.rpc('is_platform_admin')
    if (!allowed) throw new Error('Platform administrator access required')

    const { name, ownerEmail, planCode, moduleKeys, industry } = await request.json()
    if (!name?.trim() || !ownerEmail?.trim()) throw new Error('Business name and owner email are required')
    const { data: organizationId, error: createError } = await caller.rpc('platform_create_organization', {
      p_name: name.trim(), p_plan_code: planCode, p_module_keys: moduleKeys, p_industry: industry ?? null,
    })
    if (createError) throw createError

    const redirectTo = `${request.headers.get('origin') ?? 'http://127.0.0.1:5175'}/auth/accept-invite`
    let { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(ownerEmail.trim(), { redirectTo, data: { organization_id: organizationId, role: 'owner' } })
    let ownerId = invited.user?.id
    if (inviteError) {
      const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
      ownerId = users.users.find(user => user.email?.toLowerCase() === ownerEmail.trim().toLowerCase())?.id
      if (!ownerId) throw inviteError
    }
    const { error: membershipError } = await admin.from('user_organization').upsert({ user_id: ownerId, organization_id: organizationId, role: 'owner', is_active: true }, { onConflict: 'user_id,organization_id' })
    if (membershipError) throw membershipError
    return new Response(JSON.stringify({ organizationId, ownerInvited: !inviteError }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unable to create organization' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
