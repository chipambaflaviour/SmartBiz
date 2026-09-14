import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { friendlyDbError } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/Button'
import { Input, FormField } from '@/shared/components/ui/FormElements'
import { Badge, Card, EmptyState, PageHeader } from '@/shared/components/ui/Display'
import { DepartmentsSection } from './DepartmentsSection'

type Branch = { id: string; name: string; code: string; address: string | null; city: string | null; country: string | null; is_headquarters: boolean }
const empty = { name: '', code: '', address: '', city: '', country: 'Zambia' }

export default function OrganizationSettingsPage() {
  const orgId = useAppStore((state) => state.activeOrganizationId)
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Branch | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')

  const { data: organization } = useQuery({ queryKey: ['organization-settings', orgId], queryFn: async () => { const { data, error } = await supabase.from('organization').select('id,name,industry,currency,timezone,plan,status').eq('id', orgId!).single(); if (error) throw error; return data }, enabled: !!orgId })
  const { data: branches = [], isLoading } = useQuery({ queryKey: ['branches', orgId], queryFn: async () => { const { data, error } = await supabase.from('branch').select('id,name,code,address,city,country,is_headquarters').eq('organization_id', orgId!).is('deleted_at', null).order('is_headquarters', { ascending: false }); if (error) throw error; return data as Branch[] }, enabled: !!orgId })

  const save = useMutation({ mutationFn: async () => {
    if (!orgId) throw new Error('No organization selected')
    if (!form.name.trim() || !form.code.trim()) throw new Error('Branch name and code are required')
    const payload = { organization_id: orgId, name: form.name.trim(), code: form.code.trim().toUpperCase(), address: form.address || null, city: form.city || null, country: form.country || null, updated_at: new Date().toISOString() }
    const result = editing ? await supabase.from('branch').update(payload).eq('id', editing.id).eq('organization_id', orgId) : await supabase.from('branch').insert(payload)
    if (result.error) throw result.error
  }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches', orgId] }); closeForm() }, onError: (cause: Error) => setError(friendlyDbError(cause, 'branches')) })

  const deactivate = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from('branch').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('organization_id', orgId!); if (error) throw error }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branches', orgId] }) })

  function closeForm() { setShowForm(false); setEditing(null); setForm(empty); setError('') }
  function openEdit(branch: Branch) { setEditing(branch); setForm({ name: branch.name, code: branch.code, address: branch.address ?? '', city: branch.city ?? '', country: branch.country ?? 'Zambia' }); setShowForm(true) }
  function submit(event: FormEvent) { event.preventDefault(); setError(''); save.mutate() }

  return <div>
    <PageHeader title="Organization, Branches & Departments" subtitle="Manage your main organization, operating locations and departments." breadcrumb={[{ label: 'Settings' }, { label: 'Organization' }]} actions={<Button onClick={() => setShowForm(true)}><span className="material-symbols-outlined text-lg">add_business</span>Add branch</Button>} />
    <div className="px-4 sm:px-6 pb-8 space-y-5">
      <Card className="grid gap-4 sm:grid-cols-4"><div className="sm:col-span-2"><p className="text-xs text-slate-500">Main organization</p><p className="mt-1 text-xl font-bold">{organization?.name ?? 'Loading…'}</p></div><div><p className="text-xs text-slate-500">Plan</p><p className="mt-1 font-semibold capitalize">{organization?.plan ?? '—'}</p></div><div><p className="text-xs text-slate-500">Status</p><Badge variant="success">{organization?.status ?? 'active'}</Badge></div></Card>
      <div><h2 className="text-lg font-bold">Branches</h2><p className="text-sm text-slate-500">Branches share the organization’s subscription and can only use purchased modules.</p></div>
      {!isLoading && !branches.length ? <Card><EmptyState icon="store" title="No branches yet" description="Create the first operating branch for this organization." /></Card> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{branches.map(branch => <Card key={branch.id} className="relative"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#00cec8]/10 text-[#007f7a]"><span className="material-symbols-outlined">store</span></div><div className="min-w-0"><p className="truncate font-bold">{branch.name}</p><p className="text-xs text-slate-500">{branch.code} · {[branch.city, branch.country].filter(Boolean).join(', ') || 'Location not set'}</p></div></div>{branch.is_headquarters && <Badge variant="info">HQ</Badge>}</div><div className="mt-5 flex gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(branch)}>Edit</Button>{!branch.is_headquarters && <Button size="sm" variant="ghost" onClick={() => deactivate.mutate(branch.id)}>Deactivate</Button>}</div></Card>)}</div>}
      <div className="pt-4 border-t border-slate-200" />
      <DepartmentsSection />
    </div>
    {showForm && <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={closeForm}><form onSubmit={submit} onClick={event => event.stopPropagation()} className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#008f88]">Operating location</p><h2 className="mt-1 text-2xl font-bold">{editing ? 'Edit branch' : 'Create branch'}</h2></div><button type="button" onClick={closeForm}><span className="material-symbols-outlined">close</span></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><FormField label="Branch name" required><Input value={form.name} onChange={e => setForm({...form,name:e.target.value})} /></FormField><FormField label="Branch code" required><Input value={form.code} onChange={e => setForm({...form,code:e.target.value})} /></FormField><FormField label="City"><Input value={form.city} onChange={e => setForm({...form,city:e.target.value})} /></FormField><FormField label="Country"><Input value={form.country} onChange={e => setForm({...form,country:e.target.value})} /></FormField><FormField label="Address" className="sm:col-span-2"><Input value={form.address} onChange={e => setForm({...form,address:e.target.value})} /></FormField></div>{error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={closeForm}>Cancel</Button><Button type="submit" loading={save.isPending}>Save branch</Button></div></form></div>}
  </div>
}
