import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { friendlyDbError } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/Button'
import { FormField, Input, Select } from '@/shared/components/ui/FormElements'
import { Card, EmptyState } from '@/shared/components/ui/Display'

type Department = { id: string; name: string; code: string | null; branch_id: string | null; branch: { name: string } | null; employee: { count: number }[] }
const empty = { name: '', code: '', branch_id: '' }

/** Departments live under the organization (optionally scoped to a branch) and are assigned to employees. */
export function DepartmentsSection() {
  const orgId = useAppStore(s => s.activeOrganizationId)
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Department | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')

  const { data: branches = [] } = useQuery({ queryKey: ['branches', orgId], queryFn: async () => (await supabase.from('branch').select('id,name').eq('organization_id', orgId!).is('deleted_at', null)).data ?? [], enabled: !!orgId })
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments-admin', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('department').select('id,name,code,branch_id,branch(name),employee(count)').eq('organization_id', orgId!).is('deleted_at', null).order('name')
      if (error) throw error
      return (data ?? []) as unknown as Department[]
    },
    enabled: !!orgId,
  })

  function closeForm() { setShowForm(false); setEditing(null); setForm(empty); setError('') }
  function openEdit(dept: Department) { setEditing(dept); setForm({ name: dept.name, code: dept.code ?? '', branch_id: dept.branch_id ?? '' }); setShowForm(true) }

  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['departments-admin', orgId] }); queryClient.invalidateQueries({ queryKey: ['departments', orgId] }) }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Department name is required')
      const payload = { organization_id: orgId, name: form.name.trim(), code: form.code.trim() || null, branch_id: form.branch_id || null, updated_at: new Date().toISOString() }
      const result = editing ? await supabase.from('department').update(payload).eq('id', editing.id).eq('organization_id', orgId!) : await supabase.from('department').insert(payload)
      if (result.error) throw result.error
    },
    onSuccess: () => { invalidate(); closeForm() },
    onError: (cause: Error) => setError(friendlyDbError(cause, 'departments')),
  })

  const deactivate = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('department').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('organization_id', orgId!); if (error) throw error },
    onSuccess: invalidate,
  })

  function submit(event: FormEvent) { event.preventDefault(); setError(''); save.mutate() }

  return <>
    <div className="flex items-end justify-between gap-3">
      <div><h2 className="text-lg font-bold">Departments</h2><p className="text-sm text-slate-500">Group employees by function (Sales, Finance, Operations…). Assigned when adding an employee.</p></div>
      <Button variant="outline" onClick={() => setShowForm(true)}><span className="material-symbols-outlined text-lg">add</span>Add department</Button>
    </div>
    {!isLoading && !departments.length ? (
      <Card><EmptyState icon="account_tree" title="No departments yet" description="Create departments such as Sales, Finance or Operations so employees can be organised." action={<Button variant="outline" onClick={() => setShowForm(true)}>Add department</Button>} /></Card>
    ) : (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {departments.map(dept => {
          const headcount = dept.employee?.[0]?.count ?? 0
          return <Card key={dept.id}>
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#dae2fd]/60 text-[#3f465c]"><span className="material-symbols-outlined">account_tree</span></div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{dept.name}</p>
                <p className="text-xs text-slate-500">{[dept.code, dept.branch?.name ?? 'All branches'].filter(Boolean).join(' · ')}</p>
                <p className="mt-1 text-xs text-slate-500">{headcount} {headcount === 1 ? 'employee' : 'employees'}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openEdit(dept)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => deactivate.mutate(dept.id)} disabled={headcount > 0} title={headcount > 0 ? 'Reassign employees before removing this department' : undefined}>Remove</Button>
            </div>
          </Card>
        })}
      </div>
    )}

    {showForm && <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={closeForm}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex justify-between">
          <div><p className="text-xs font-bold uppercase tracking-wider text-[#008f88]">Organization structure</p><h2 className="mt-1 text-2xl font-bold">{editing ? 'Edit department' : 'Create department'}</h2></div>
          <button type="button" onClick={closeForm} aria-label="Close"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <FormField label="Department name" required className="sm:col-span-2"><Input autoFocus placeholder="e.g. Sales" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="Code" hint="Optional short code"><Input placeholder="SAL" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></FormField>
          <FormField label="Branch"><Select value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}><option value="">All branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></FormField>
        </div>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={closeForm}>Cancel</Button><Button type="submit" loading={save.isPending}>Save department</Button></div>
      </form>
    </div>}
  </>
}
