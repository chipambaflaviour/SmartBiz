import { FormEvent, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { friendlyDbError } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/Button'
import { Input, FormField } from '@/shared/components/ui/FormElements'
import { Badge, Card, EmptyState, PageHeader } from '@/shared/components/ui/Display'
import { DepartmentsSection } from './DepartmentsSection'
import { SMARTBIZ_MODULES } from '@/shared/lib/blueprint'

type Branch = { id: string; name: string; code: string; address: string | null; city: string | null; country: string | null; is_headquarters: boolean }
const empty = { name: '', code: '', address: '', city: '', country: 'Zambia', modules: [] as string[] }

export default function OrganizationSettingsPage() {
  const orgId = useAppStore((state) => state.activeOrganizationId)
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Branch | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [taxForm, setTaxForm] = useState({ vat_enabled: false, vat_rate: 16, vat_prices_include_tax: true, tax_number: '' })

  const { data: organization } = useQuery({ queryKey: ['organization-settings', orgId], queryFn: async () => { const { data, error } = await supabase.from('organization').select('id,name,industry,currency,timezone,plan,status,settings').eq('id', orgId!).single(); if (error) throw error; return data }, enabled: !!orgId })
  const { data: branches = [], isLoading } = useQuery({ queryKey: ['branches', orgId], queryFn: async () => { const { data, error } = await supabase.from('branch').select('id,name,code,address,city,country,is_headquarters').eq('organization_id', orgId!).is('deleted_at', null).order('is_headquarters', { ascending: false }); if (error) throw error; return data as Branch[] }, enabled: !!orgId })
  const { data: purchasedModules = [] } = useQuery({ queryKey: ['organization-entitlements', orgId], queryFn: async () => { const { data, error } = await supabase.from('organization_module').select('module_key').eq('organization_id', orgId!).eq('is_enabled', true); if (error) throw error; return (data ?? []).map(row => row.module_key) }, enabled: !!orgId })
  const { data: branchModuleRows = [] } = useQuery({ queryKey: ['branch-module-access', orgId], queryFn: async () => { const { data, error } = await supabase.from('branch_module_access').select('branch_id,module_key').eq('organization_id', orgId!).eq('is_enabled', true); if (error) throw error; return data ?? [] }, enabled: !!orgId })

  useEffect(() => {
    const settings = (organization?.settings && typeof organization.settings === 'object' ? organization.settings : {}) as Record<string, unknown>
    setTaxForm({ vat_enabled: settings.vat_enabled === true, vat_rate: Number(settings.vat_rate ?? 16), vat_prices_include_tax: settings.vat_prices_include_tax !== false, tax_number: typeof settings.tax_number === 'string' ? settings.tax_number : '' })
  }, [organization])

  const saveTax = useMutation({ mutationFn: async () => {
    if (!orgId) throw new Error('No organization selected')
    if (taxForm.vat_enabled && (!Number.isFinite(taxForm.vat_rate) || taxForm.vat_rate <= 0 || taxForm.vat_rate > 100)) throw new Error('Enter a VAT rate between 0 and 100.')
    const current = (organization?.settings && typeof organization.settings === 'object' ? organization.settings : {}) as Record<string, unknown>
    const { error } = await supabase.from('organization').update({ settings: { ...current, ...taxForm }, updated_at: new Date().toISOString() }).eq('id', orgId)
    if (error) throw error
  }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['organization-settings', orgId] }); queryClient.invalidateQueries({ queryKey: ['tax-settings', orgId] }) }, onError: (cause: Error) => setError(cause.message) })

  const save = useMutation({ mutationFn: async () => {
    if (!orgId) throw new Error('No organization selected')
    if (!form.name.trim() || !form.code.trim()) throw new Error('Branch name and code are required')
    const payload = { organization_id: orgId, name: form.name.trim(), code: form.code.trim().toUpperCase(), address: form.address || null, city: form.city || null, country: form.country || null, updated_at: new Date().toISOString() }
    const result = editing ? await supabase.from('branch').update(payload).eq('id', editing.id).eq('organization_id', orgId).select('id').single() : await supabase.from('branch').insert(payload).select('id').single()
    if (result.error) throw result.error
    const branchId = result.data.id
    const selectedModules = form.modules.filter(moduleKey => purchasedModules.includes(moduleKey))
    const { error: moduleError } = await supabase.rpc('set_branch_modules', { p_organization_id: orgId, p_branch_id: branchId, p_module_keys: selectedModules })
    if (moduleError) throw moduleError
  }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches', orgId] }); queryClient.invalidateQueries({ queryKey: ['workspace-branches', orgId] }); queryClient.invalidateQueries({ queryKey: ['branch-module-access', orgId] }); closeForm() }, onError: (cause: Error) => setError(friendlyDbError(cause, 'branches')) })

  const deactivate = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from('branch').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('organization_id', orgId!); if (error) throw error }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branches', orgId] }) })

  function closeForm() { setShowForm(false); setEditing(null); setForm(empty); setError('') }
  function openCreate() { setEditing(null); setForm({ ...empty, modules: [...purchasedModules] }); setShowForm(true) }
  function openEdit(branch: Branch) { setEditing(branch); setForm({ name: branch.name, code: branch.code, address: branch.address ?? '', city: branch.city ?? '', country: branch.country ?? 'Zambia', modules: branchModuleRows.filter(row => row.branch_id === branch.id).map(row => row.module_key) }); setShowForm(true) }
  function submit(event: FormEvent) { event.preventDefault(); setError(''); save.mutate() }

  return <div>
    <PageHeader title="Organization, Branches & Departments" subtitle="Manage your main organization, operating locations and departments." breadcrumb={[{ label: 'Settings' }, { label: 'Organization' }]} actions={<Button onClick={openCreate}><span className="material-symbols-outlined text-lg">add_business</span>Add branch</Button>} />
    <div className="px-4 sm:px-6 pb-8 space-y-5">
      <Card className="grid gap-4 sm:grid-cols-4"><div className="sm:col-span-2"><p className="text-xs text-slate-500">Main organization</p><p className="mt-1 text-xl font-bold">{organization?.name ?? 'Loading…'}</p></div><div><p className="text-xs text-slate-500">Plan</p><p className="mt-1 font-semibold capitalize">{organization?.plan ?? '—'}</p></div><div><p className="text-xs text-slate-500">Status</p><Badge variant="success">{organization?.status ?? 'active'}</Badge></div></Card>
      <Card><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-bold">VAT & tax treatment</h2><p className="mt-1 text-sm text-slate-500">Optional. Enable only when the organization is VAT registered. SmartBiz does not submit returns to ZRA.</p></div><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-[#007f7a]" checked={taxForm.vat_enabled} onChange={(event)=>setTaxForm(current=>({...current,vat_enabled:event.target.checked}))}/>VAT registered</label></div>{taxForm.vat_enabled&&<div className="mt-5 grid gap-4 sm:grid-cols-3"><FormField label="VAT rate (%)"><Input type="number" min="0.01" max="100" step="0.01" value={taxForm.vat_rate} onChange={(event)=>setTaxForm(current=>({...current,vat_rate:Number(event.target.value)}))}/></FormField><FormField label="TPIN / tax number"><Input value={taxForm.tax_number} onChange={(event)=>setTaxForm(current=>({...current,tax_number:event.target.value}))} placeholder="Optional"/></FormField><FormField label="Product prices"><select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={taxForm.vat_prices_include_tax?'inclusive':'exclusive'} onChange={(event)=>setTaxForm(current=>({...current,vat_prices_include_tax:event.target.value==='inclusive'}))}><option value="inclusive">Include VAT in displayed price</option><option value="exclusive">Add VAT at checkout</option></select></FormField></div>}<div className="mt-5 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">VAT collected is shown separately from net revenue on the dashboard and VAT Summary.</p><Button size="sm" onClick={()=>saveTax.mutate()} loading={saveTax.isPending}>Save tax settings</Button></div></Card>
      <div><h2 className="text-lg font-bold">Branches</h2><p className="text-sm text-slate-500">Branches share the organization’s subscription and can only use purchased modules.</p></div>
      {!isLoading && !branches.length ? <Card><EmptyState icon="store" title="No branches yet" description="Create the first operating branch for this organization." /></Card> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{branches.map(branch => <Card key={branch.id} className="relative"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#00cec8]/10 text-[#007f7a]"><span className="material-symbols-outlined">store</span></div><div className="min-w-0"><p className="truncate font-bold">{branch.name}</p><p className="text-xs text-slate-500">{branch.code} · {[branch.city, branch.country].filter(Boolean).join(', ') || 'Location not set'}</p></div></div>{branch.is_headquarters && <Badge variant="info">HQ</Badge>}</div><div className="mt-5 flex gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(branch)}>Edit</Button>{!branch.is_headquarters && <Button size="sm" variant="ghost" onClick={() => deactivate.mutate(branch.id)}>Deactivate</Button>}</div></Card>)}</div>}
      <div className="pt-4 border-t border-slate-200" />
      <DepartmentsSection />
    </div>
    {showForm && <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={closeForm}><form onSubmit={submit} onClick={event => event.stopPropagation()} className="my-auto max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#008f88]">Operating location</p><h2 className="mt-1 text-2xl font-bold">{editing ? 'Edit branch' : 'Create branch'}</h2></div><button type="button" aria-label="Close branch form" onClick={closeForm}><span className="material-symbols-outlined">close</span></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><FormField label="Branch name" required><Input value={form.name} onChange={e => setForm({...form,name:e.target.value})} /></FormField><FormField label="Branch code" required><Input value={form.code} onChange={e => setForm({...form,code:e.target.value})} /></FormField><FormField label="City"><Input value={form.city} onChange={e => setForm({...form,city:e.target.value})} /></FormField><FormField label="Country"><Input value={form.country} onChange={e => setForm({...form,country:e.target.value})} /></FormField><FormField label="Address" className="sm:col-span-2"><Input value={form.address} onChange={e => setForm({...form,address:e.target.value})} /></FormField></div><div className="mt-6 border-t border-slate-200 pt-5"><div className="flex items-center justify-between"><div><p className="font-bold">Branch modules</p><p className="text-xs text-slate-500">Choose a subset of modules purchased for the organization.</p></div><Badge variant="info">{form.modules.length} assigned</Badge></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{SMARTBIZ_MODULES.filter(module => purchasedModules.includes(module.key)).map(module => { const selected = form.modules.includes(module.key); return <button type="button" key={module.key} onClick={() => setForm(current => ({ ...current, modules: selected ? current.modules.filter(key => key !== module.key) : [...current.modules, module.key] }))} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${selected ? 'border-[#00a9a3] bg-[#00cec8]/5' : 'border-slate-200'}`}><span className="material-symbols-outlined text-[#008f88]">{module.icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{module.label}</span><span className="block truncate text-xs text-slate-500">{module.description}</span></span><span className="material-symbols-outlined text-lg">{selected ? 'check_circle' : 'circle'}</span></button> })}</div></div>{error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={closeForm}>Cancel</Button><Button type="submit" loading={save.isPending}>Save branch</Button></div></form></div>}
  </div>
}
