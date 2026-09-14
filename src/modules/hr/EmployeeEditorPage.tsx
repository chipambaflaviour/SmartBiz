import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { friendlyDbError } from '@/shared/lib/utils'
import { SMARTBIZ_MODULES } from '@/shared/lib/blueprint'
import { Button } from '@/shared/components/ui/Button'
import { FormField, Input, Select } from '@/shared/components/ui/FormElements'
import { Card, PageHeader } from '@/shared/components/ui/Display'

// Quick-pick module bundles for common job roles. Only purchased modules are applied.
const ACCESS_PRESETS: Array<{ label: string; icon: string; modules: string[] }> = [
  { label: 'Sales person', icon: 'point_of_sale', modules: ['dashboard', 'pos', 'inventory', 'crm', 'leave'] },
  { label: 'Cashier', icon: 'payments', modules: ['dashboard', 'pos', 'leave'] },
  { label: 'Stock controller', icon: 'inventory_2', modules: ['dashboard', 'inventory', 'purchasing', 'suppliers', 'leave'] },
  { label: 'Accountant', icon: 'account_balance', modules: ['dashboard', 'finance', 'expenses', 'accounting', 'reports', 'approvals', 'leave'] },
  { label: 'HR officer', icon: 'badge', modules: ['dashboard', 'hr', 'payroll', 'leave', 'loans', 'approvals'] },
]

const initial = { employee_id: '', first_name: '', last_name: '', email: '', phone: '', position: '', salary: '', employment_type: 'full-time', status: 'active', branch_id: '', department_id: '', role: 'member' }

export default function EmployeeEditorPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const orgId = useAppStore(state => state.activeOrganizationId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(initial)
  const [modules, setModules] = useState<string[]>([])
  const [giveAccess, setGiveAccess] = useState(false)
  const [error, setError] = useState('')

  const { data: branches = [] } = useQuery({ queryKey: ['branches', orgId], queryFn: async () => (await supabase.from('branch').select('id,name').eq('organization_id', orgId!).is('deleted_at', null)).data ?? [], enabled: !!orgId })
  const { data: departments = [] } = useQuery({ queryKey: ['departments', orgId], queryFn: async () => (await supabase.from('department').select('id,name').eq('organization_id', orgId!).is('deleted_at', null)).data ?? [], enabled: !!orgId })
  const { data: purchased = [] } = useQuery({ queryKey: ['purchased-module-options', orgId], queryFn: async () => (await supabase.from('organization_module').select('module_key').eq('organization_id', orgId!).eq('is_enabled', true)).data?.map(row => row.module_key) ?? [], enabled: !!orgId })
  const { data: employee } = useQuery({ queryKey: ['employee', id], queryFn: async () => { const { data, error } = await supabase.from('employee').select('*').eq('id', id!).eq('organization_id', orgId!).single(); if (error) throw error; return data }, enabled: editing && !!orgId })

  useEffect(() => { if (!employee) return; setForm({ employee_id: employee.employee_id, first_name: employee.first_name, last_name: employee.last_name, email: employee.email, phone: employee.phone ?? '', position: employee.position ?? '', salary: employee.salary == null ? '' : String(employee.salary), employment_type: employee.employment_type, status: employee.status, branch_id: employee.branch_id ?? '', department_id: employee.department_id ?? '', role: 'member' }); setGiveAccess(Boolean(employee.user_id)); if (employee.user_id) supabase.from('user_module_access').select('module_key').eq('user_id', employee.user_id).eq('organization_id', orgId!).then(({data}) => setModules(data?.map(row => row.module_key) ?? [])) }, [employee, orgId])

  const save = useMutation({ mutationFn: async () => {
    if (!orgId) throw new Error('No organization selected')
    if (!form.employee_id || !form.first_name || !form.last_name || !form.email) throw new Error('Employee ID, name and email are required')
    if (giveAccess && form.role !== 'admin' && modules.filter(key => purchased.includes(key)).length === 0) throw new Error('Select at least one module this employee may access, or choose the Organization administrator role')
    const payload = { organization_id: orgId, employee_id: form.employee_id.trim(), first_name: form.first_name.trim(), last_name: form.last_name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone || null, position: form.position || null, salary: form.salary ? Number(form.salary) : null, employment_type: form.employment_type, status: form.status, branch_id: form.branch_id || null, department_id: form.department_id || null, updated_at: new Date().toISOString() }
    const result = editing ? await supabase.from('employee').update(payload).eq('id', id!).eq('organization_id', orgId).select('id').single() : await supabase.from('employee').insert(payload).select('id').single()
    if (result.error) throw result.error
    let notice = editing ? `${payload.first_name} ${payload.last_name} updated.` : `${payload.first_name} ${payload.last_name} added to the directory.`
    if (giveAccess) {
      // The database rejects modules the organization hasn't purchased; core modules
      // (dashboard etc.) are always shown in the app, so sending them adds nothing.
      const moduleKeys = modules.filter(key => purchased.includes(key))
      const { data: access, error: accessError } = await supabase.functions.invoke<{ outcome?: 'invited' | 'resent' | 'linked' }>('manage-employee-access', { body: { organizationId: orgId, employeeId: result.data.id, email: payload.email, role: form.role, moduleKeys } })
      if (accessError) {
        // Edge functions return the real reason in the JSON body; surface it instead of the generic HTTP error.
        const body = await (accessError as { context?: Response }).context?.json?.().catch(() => null)
        throw new Error(body?.error ?? accessError.message)
      }
      if (access?.outcome === 'invited') notice += ` An invitation email was sent to ${payload.email} — they will set a password and then see only the ${modules.length} module${modules.length === 1 ? '' : 's'} you selected.`
      else if (access?.outcome === 'resent') notice += ` Their pending invitation was re-sent to ${payload.email}.`
      else notice += ` ${payload.email} already had a SmartBiz account; their access to this organization has been updated.`
    }
    return notice
  }, onSuccess: (notice) => { queryClient.invalidateQueries({ queryKey: ['employees', orgId] }); navigate('/app/hr/employees', { state: { notice } }) }, onError: (cause: Error) => setError(friendlyDbError(cause, 'employees')) })

  function submit(event: FormEvent) { event.preventDefault(); setError(''); save.mutate() }
  return <div><PageHeader title={editing ? 'Edit Employee' : 'Add Employee'} subtitle="Maintain employment, salary and system access from one place." breadcrumb={[{label:'HR'},{label:'Employees'},{label:editing?'Edit':'New'}]} />
    <form onSubmit={submit} className="mx-auto max-w-5xl space-y-5 px-4 sm:px-6 pb-10"><Card><h2 className="font-bold">Personal & employment details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><FormField label="Employee ID" required><Input value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})}/></FormField><FormField label="First name" required><Input value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})}/></FormField><FormField label="Last name" required><Input value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})}/></FormField><FormField label="Email" required><Input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></FormField><FormField label="Phone"><Input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></FormField><FormField label="Position"><Input value={form.position} onChange={e=>setForm({...form,position:e.target.value})}/></FormField><FormField label="Monthly salary (ZMW)"><Input type="number" min="0" step="0.01" value={form.salary} onChange={e=>setForm({...form,salary:e.target.value})}/></FormField><FormField label="Employment type"><Select value={form.employment_type} onChange={e=>setForm({...form,employment_type:e.target.value})}><option value="full-time">Full time</option><option value="part-time">Part time</option><option value="contract">Contract</option><option value="intern">Intern</option></Select></FormField><FormField label="Status"><Select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Active</option><option value="on-leave">On leave</option><option value="inactive">Inactive</option><option value="terminated">Terminated</option></Select></FormField><FormField label="Branch"><Select value={form.branch_id} onChange={e=>setForm({...form,branch_id:e.target.value})}><option value="">All / unassigned</option>{branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></FormField><FormField label="Department"><Select value={form.department_id} onChange={e=>setForm({...form,department_id:e.target.value})}><option value="">Unassigned</option>{departments.map(dept=><option key={dept.id} value={dept.id}>{dept.name}</option>)}</Select></FormField></div></Card>
      <Card><label className="flex cursor-pointer items-start gap-3"><input className="mt-1 h-4 w-4 accent-[#007f7a]" type="checkbox" checked={giveAccess} onChange={e=>setGiveAccess(e.target.checked)}/><span><span className="block font-bold">Give this employee system access</span><span className="text-sm text-slate-500">An invitation is emailed to the employee. Their menu contains only selected modules.</span></span></label>{giveAccess && <div className="mt-5 border-t pt-5"><FormField label="Access role" className="max-w-xs"><Select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="member">Employee</option><option value="manager">Manager</option><option value="auditor">Auditor / read only</option><option value="admin">Organization administrator</option></Select></FormField><p className="mt-5 text-sm font-bold">Allowed modules</p><p className="text-xs text-slate-500">Only modules purchased by this organization are available. Pick a preset or choose modules individually.</p><div className="mt-3 flex flex-wrap gap-2">{ACCESS_PRESETS.map(preset=>{const available=preset.modules.filter(key=>purchased.includes(key)||SMARTBIZ_MODULES.find(m=>m.key===key)?.core);return <button type="button" key={preset.label} onClick={()=>setModules(available)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#00a9a3] hover:bg-[#00cec8]/5 hover:text-[#006a67]"><span className="material-symbols-outlined text-[16px]">{preset.icon}</span>{preset.label}</button>})}{modules.length>0&&<button type="button" onClick={()=>setModules([])} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-red-600">Clear</button>}</div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{SMARTBIZ_MODULES.filter(item=>purchased.includes(item.key) || item.core).map(item=>{const selected=modules.includes(item.key); return <button type="button" key={item.key} onClick={()=>setModules(selected?modules.filter(key=>key!==item.key):[...modules,item.key])} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${selected?'border-[#00a9a3] bg-[#00cec8]/5':'border-slate-200'}`}><span className="material-symbols-outlined text-[#008f88]">{item.icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="block truncate text-xs text-slate-500">{item.description}</span></span><span className="material-symbols-outlined text-lg">{selected?'check_circle':'circle'}</span></button>})}</div></div>}</Card>
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={()=>navigate('/app/hr/employees')}>Cancel</Button><Button type="submit" loading={save.isPending}>{editing?'Save changes':'Create employee'}</Button></div></form></div>
}
