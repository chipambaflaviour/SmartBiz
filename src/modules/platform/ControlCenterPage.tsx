import { useMemo, useState } from 'react'
import { Badge, Card, Table, Td, Th, Thead, Tr } from '@/shared/components/ui/Display'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/FormElements'
import { SMARTBIZ_MODULES } from '@/shared/lib/blueprint'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isDemoMode, supabase } from '@/shared/lib/supabase'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/shared/stores/appStore'

type OrgStatus = 'Active' | 'Trial' | 'Suspended' | 'Expired'
type Org = { id: string; name: string; type: string; plan: string; status: OrgStatus; branches: number; users: number; renewal: string; modules: string[] }

const initialOrganizations: Org[] = [
  { id: 'ORG-001', name: 'Lusaka Fresh Market', type: 'Main organization', plan: 'Professional', status: 'Active', branches: 4, users: 38, renewal: '01 Oct 2026', modules: ['dashboard','pos','inventory','purchasing','suppliers','crm','finance','reports','approvals'] },
  { id: 'ORG-002', name: 'Choma Agro Holdings', type: 'Organization workspace', plan: 'Enterprise', status: 'Active', branches: 7, users: 84, renewal: '15 Oct 2026', modules: ['dashboard','inventory','purchasing','suppliers','crm','hr','payroll','finance','expenses','accounting','assets','reports','approvals','workflow'] },
  { id: 'ORG-003', name: 'Copperbelt Bakers', type: 'Main organization', plan: 'Starter', status: 'Trial', branches: 1, users: 6, renewal: '18 Sep 2026', modules: ['dashboard','pos','inventory','crm'] },
  { id: 'ORG-004', name: 'Kabwe Trading Co.', type: 'Main organization', plan: 'Professional', status: 'Expired', branches: 2, users: 14, renewal: '31 Aug 2026', modules: ['dashboard','pos','inventory','purchasing','crm','finance'] },
]

export default function ControlCenterPage() {
  const navigate = useNavigate()
  const setActiveOrgId = useAppStore((state) => state.setActiveOrganizationId)
  /** Enter an organization with full super-admin access (all modules, owner-level CRUD). */
  function openOrganization(org: Org) {
    setActiveOrgId(org.id)
    queryClient.invalidateQueries()
    navigate('/app/dashboard')
  }
  const [localOrganizations, setLocalOrganizations] = useState<Org[]>(() => {
    const saved = localStorage.getItem('smartbiz-control-organizations')
    return saved ? JSON.parse(saved) : initialOrganizations
  })
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Org | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [createOwnerEmail, setCreateOwnerEmail] = useState('')
  const [plan, setPlan] = useState('Starter')
  const [draftModules, setDraftModules] = useState<string[]>(['dashboard','pos','inventory','crm'])
  const [createError, setCreateError] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerMessage, setOwnerMessage] = useState('')
  const queryClient = useQueryClient()

  const { data: liveOrganizations = [] } = useQuery<Org[]>({
    queryKey: ['platform-organizations'], enabled: !isDemoMode,
    queryFn: async () => {
      const { data, error } = await supabase.from('organization').select('id,name,plan,status,subscription_expires_at,organization_module(module_key,is_enabled),branch(count),user_organization(count)').is('deleted_at',null).order('created_at',{ascending:false})
      if (error) throw error
      return (data ?? []).map((row: any) => ({ id: row.id, name: row.name, type: 'Organization workspace', plan: row.plan === 'pro' ? 'Professional' : `${row.plan.charAt(0).toUpperCase()}${row.plan.slice(1)}`, status: `${row.status.charAt(0).toUpperCase()}${row.status.slice(1)}` as OrgStatus, branches: Number(row.branch?.[0]?.count ?? 0), users: Number(row.user_organization?.[0]?.count ?? 0), renewal: row.subscription_expires_at ? new Date(row.subscription_expires_at).toLocaleDateString('en-ZM') : 'Not set', modules: (row.organization_module ?? []).filter((m:any)=>m.is_enabled).map((m:any)=>m.module_key) }))
    },
  })
  const organizations = isDemoMode ? localOrganizations : liveOrganizations

  const persist = (next: Org[]) => { setLocalOrganizations(next); localStorage.setItem('smartbiz-control-organizations', JSON.stringify(next)) }
  const filtered = useMemo(() => organizations.filter(o => `${o.name} ${o.id} ${o.status}`.toLowerCase().includes(query.toLowerCase())), [organizations, query])
  const active = organizations.filter(o => o.status === 'Active').length

  const createOrg = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-organization', { body: { name: name.trim(), ownerEmail: createOwnerEmail.trim(), planCode: plan.toLowerCase(), moduleKeys: draftModules, industry: null } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => { queryClient.invalidateQueries({queryKey:['platform-organizations']}); setShowCreate(false); setName(''); setCreateOwnerEmail(''); setCreateError('') },
    onError: (error: Error) => setCreateError(error.message),
  })

  const assignOwner = useMutation({
    mutationFn: async () => {
      if (!selected || !ownerEmail.trim()) throw new Error('Enter the owner email address.')
      const { error } = await supabase.rpc('platform_assign_organization_user', { p_organization_id: selected.id, p_email: ownerEmail.trim(), p_role: 'owner' })
      if (error) throw error
    },
    onSuccess: () => { setOwnerMessage('Owner associated successfully. They can now sign in and access this organization.') },
    onError: (error: Error) => setOwnerMessage(error.message),
  })

  function createOrganization() {
    if (!name.trim() || !createOwnerEmail.trim()) { setCreateError('Business name and owner email are required.'); return }
    if (!isDemoMode) { createOrg.mutate(); return }
    const next: Org = { id: `ORG-${String(organizations.length + 1).padStart(3,'0')}`, name: name.trim(), type: 'Main organization', plan, status: 'Active', branches: 1, users: 1, renewal: '10 Oct 2026', modules: draftModules }
    persist([next, ...organizations]); setShowCreate(false); setName(''); setSelected(next)
  }

  async function updateSelected(patch: Partial<Org>) {
    if (!selected) return
    const updated = { ...selected, ...patch }
    if (isDemoMode) persist(organizations.map(o => o.id === updated.id ? updated : o))
    else {
      if (patch.status) await supabase.from('organization').update({status: patch.status.toLowerCase()}).eq('id',selected.id)
      if (patch.modules) {
        // Core modules (dashboard, approvals, subscription) must always stay enabled — removing them
        // breaks employee access assignment for the whole organization.
        const coreKeys = SMARTBIZ_MODULES.filter(m => m.core).map(m => m.key)
        const keys = Array.from(new Set([...coreKeys, ...patch.modules]))
        const { error: delError } = await supabase.from('organization_module').delete().eq('organization_id',selected.id)
        if (delError) throw delError
        const { error: insError } = await supabase.from('organization_module').insert(keys.map(module_key=>({organization_id:selected.id,module_key,is_enabled:true})))
        if (insError) throw insError
        patch = { ...patch, modules: keys }
      }
      queryClient.invalidateQueries({queryKey:['platform-organizations']})
    }
    setSelected({ ...updated, ...patch })
  }

  return <div className="px-4 sm:px-6 py-6 pb-14">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#009b96]">Platform administration</p><h1 className="text-3xl font-bold tracking-tight text-slate-950 mt-2">Control Center</h1><p className="text-slate-500 mt-1">Create tenants, assign paid modules and control access from one place.</p></div>
      <Button onClick={() => setShowCreate(true)}><span className="material-symbols-outlined">add_business</span>New organization</Button>
    </div>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-7">
      {[['Organizations', organizations.length, 'domain'],['Active', active, 'verified'],['Attention needed', organizations.length-active, 'warning'],['Enabled modules', SMARTBIZ_MODULES.length, 'extension']].map(([l,v,i]) => <Card key={String(l)} className="metric-glow"><span className="material-symbols-outlined text-[#009b96]">{i}</span><p className="text-2xl font-bold mt-3">{v}</p><p className="text-xs text-slate-500 mt-1">{l}</p></Card>)}
    </div>
    <Card noPadding className="mt-5 overflow-hidden">
      <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200"><div><h2 className="font-bold text-lg">Organizations</h2><p className="text-xs text-slate-500">Data access follows subscription and module entitlement.</p></div><Input className="w-full sm:w-64" placeholder="Search organizations…" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <Table><Thead><tr><Th>Organization</Th><Th>Plan</Th><Th>Branches</Th><Th>Users</Th><Th>Renewal</Th><Th>Status</Th><Th></Th></tr></Thead><tbody>{filtered.map(org => <Tr key={org.id}><Td><p className="font-semibold text-slate-900">{org.name}</p><p className="text-[11px] text-slate-500">{org.id} · {org.type}</p></Td><Td>{org.plan}</Td><Td>{org.branches}</Td><Td>{org.users}</Td><Td>{org.renewal}</Td><Td><Badge variant={org.status==='Active'?'success':org.status==='Trial'?'info':org.status==='Expired'?'danger':'warning'}>{org.status}</Badge></Td><Td><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => setSelected(org)}>Manage</Button>{!isDemoMode && <Button variant="outline" size="sm" onClick={() => openOrganization(org)} title="Enter this organization with full access"><span className="material-symbols-outlined text-[16px]">login</span>Open</Button>}</div></Td></Tr>)}</tbody></Table>
    </Card>

    {(selected || showCreate) && createPortal(<div className="fixed inset-0 z-[9999] bg-slate-950/50 backdrop-blur-sm flex justify-end overflow-hidden" onClick={() => {setSelected(null);setShowCreate(false)}}><div className="h-[100dvh] w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="shrink-0 flex justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7"><div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-widest text-[#009b96]">{showCreate?'Tenant onboarding':'Organization access'}</p><h2 className="text-xl sm:text-2xl font-bold mt-1 truncate">{showCreate?'Create organization':selected?.name}</h2>{selected && <p className="text-xs text-slate-500 mt-1">{selected.id}</p>}</div><button className="w-9 h-9 shrink-0 rounded-lg hover:bg-slate-100" onClick={() => {setSelected(null);setShowCreate(false)}}><span className="material-symbols-outlined">close</span></button></div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 pb-16">
      {showCreate ? <div className="mt-7 space-y-5"><label className="block text-xs font-semibold text-slate-600">Business name<Input className="mt-2" placeholder="e.g. Mosi Retail Limited" value={name} onChange={e=>setName(e.target.value)} /></label><label className="block text-xs font-semibold text-slate-600">Organization owner email<Input className="mt-2" type="email" placeholder="owner@company.com" value={createOwnerEmail} onChange={e=>setCreateOwnerEmail(e.target.value)} /></label><label className="block text-xs font-semibold text-slate-600">Subscription plan<select className="mt-2 w-full h-10 border border-slate-300 rounded-lg px-3 bg-white" value={plan} onChange={e=>setPlan(e.target.value)}><option>Starter</option><option>Professional</option><option>Enterprise</option><option>Custom</option></select></label><ModulePicker value={draftModules} onChange={setDraftModules}/>{createError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{createError}</div>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setShowCreate(false)}>Cancel</Button><Button loading={createOrg.isPending} onClick={createOrganization}>Create & activate</Button></div></div>
      : selected && <div className="mt-7 space-y-6"><div className="grid grid-cols-2 gap-3"><Card><p className="text-xs text-slate-500">Plan</p><p className="font-bold mt-1">{selected.plan}</p></Card><Card><p className="text-xs text-slate-500">Access status</p><p className="font-bold mt-1">{selected.status}</p></Card></div><div><p className="text-sm font-bold mb-2">Access control</p><div className="flex flex-wrap gap-2">{(['Active','Suspended','Expired'] as OrgStatus[]).map(s=><Button key={s} size="sm" variant={selected.status===s?'primary':'outline'} onClick={()=>updateSelected({status:s})}>{s}</Button>)}</div><p className="text-xs text-slate-500 mt-2">Suspending or expiring blocks transactions while preserving all tenant data.</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-bold">Organization owner</p><p className="text-xs text-slate-500 mt-1">Associate a registered SmartBiz user with this organization.</p><div className="flex flex-col sm:flex-row gap-2 mt-3"><Input className="flex-1" type="email" placeholder="owner.com" value={ownerEmail} onChange={e=>{setOwnerEmail(e.target.value);setOwnerMessage('')}}/><Button loading={assignOwner.isPending} onClick={()=>assignOwner.mutate()}>Assign owner</Button></div>{ownerMessage && <p className="text-xs mt-2 text-slate-600">{ownerMessage}</p>}</div><ModulePicker value={selected.modules} onChange={modules=>updateSelected({modules})}/></div>}
      </div>
    </div></div>, document.body)}
  </div>
}

function ModulePicker({value,onChange}:{value:string[];onChange:(v:string[])=>void}) {
  return <div><div className="flex justify-between mb-3"><div><p className="text-sm font-bold">Purchased modules</p><p className="text-xs text-slate-500">Only assigned modules appear for this organization.</p></div><Badge variant="info">{value.length} enabled</Badge></div><div className="grid sm:grid-cols-2 gap-2">{SMARTBIZ_MODULES.filter(m=>!m.core).map(m=>{const on=value.includes(m.key);return <button key={m.key} onClick={()=>onChange(on?value.filter(k=>k!==m.key):[...value,m.key])} className={`p-3 rounded-xl border text-left flex gap-3 ${on?'border-[#00cec8] bg-[#00cec8]/5':'border-slate-200'}`}><span className="material-symbols-outlined text-[#009b96]">{m.icon}</span><span className="min-w-0"><span className="block text-sm font-semibold">{m.label}</span><span className="block text-[11px] text-slate-500 truncate">{m.description}</span></span><span className="material-symbols-outlined ml-auto text-[18px]">{on?'check_circle':'circle'}</span></button>})}</div></div>
}
