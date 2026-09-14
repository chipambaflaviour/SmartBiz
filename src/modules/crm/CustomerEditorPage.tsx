import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { friendlyDbError } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/Button'
import { FormField, Input, Textarea } from '@/shared/components/ui/FormElements'
import { Card, PageHeader } from '@/shared/components/ui/Display'

type Segment = 'retail' | 'wholesale' | 'corporate' | 'vip'

interface CustomerForm {
  name: string
  email: string
  phone: string
  segment: Segment
  credit_limit: string
  notes: string
}

type FieldErrors = Partial<Record<keyof CustomerForm, string>>

const initial: CustomerForm = {
  name: '', email: '', phone: '', segment: 'retail', credit_limit: '0', notes: '',
}

const SEGMENTS: Array<{ value: Segment; label: string; hint: string }> = [
  { value: 'retail', label: 'Retail', hint: 'Walk-in / individual' },
  { value: 'wholesale', label: 'Wholesale', hint: 'Bulk buyer' },
  { value: 'corporate', label: 'Corporate', hint: 'Business account' },
  { value: 'vip', label: 'VIP', hint: 'Priority customer' },
]

function validate(form: CustomerForm): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.name.trim()) errors.name = 'Customer name is required'
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address'
  const limit = Number(form.credit_limit)
  if (form.credit_limit !== '' && (Number.isNaN(limit) || limit < 0)) errors.credit_limit = 'Enter a valid amount'
  if (!form.email.trim() && !form.phone.trim()) errors.phone = 'Add a phone number or email so the customer can be contacted'
  return errors
}

export default function CustomerEditorPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const orgId = useAppStore(s => s.activeOrganizationId)
  const currentUser = useAppStore(s => s.currentUser)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CustomerForm>(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState('')

  const set = <K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) => {
    setForm(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer-profile', orgId, id],
    queryFn: async () => {
      const { data, error } = await supabase.from('customer').select('*').eq('organization_id', orgId!).eq('id', id!).single()
      if (error) throw error
      return data
    },
    enabled: editing && !!orgId,
  })

  useEffect(() => {
    if (!customer) return
    setForm({
      name: customer.name ?? '', email: customer.email ?? '', phone: customer.phone ?? '',
      segment: (customer.segment as Segment) ?? 'retail',
      credit_limit: customer.credit_limit == null ? '0' : String(customer.credit_limit), notes: customer.notes ?? '',
    })
  }, [customer])

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No organization selected')
      const payload = {
        organization_id: orgId,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase() || null,
        phone: form.phone.trim() || null,
        segment: form.segment,
        credit_limit: form.credit_limit === '' ? 0 : Number(form.credit_limit),
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const result = editing
        ? await supabase.from('customer').update(payload).eq('id', id!).eq('organization_id', orgId).select('id').single()
        : await supabase.from('customer').insert({ ...payload, created_by: currentUser?.id ?? null }).select('id').single()
      if (result.error) throw result.error
      return result.data.id
    },
    onSuccess: (customerId) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['pos-customers', orgId] })
      queryClient.invalidateQueries({ queryKey: ['customer-profile', orgId, customerId] })
      navigate(`/app/crm/customers/${customerId}`)
    },
    onError: (cause: Error) => setSubmitError(friendlyDbError(cause, 'customers')),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitError('')
    const next = validate(form)
    setErrors(next)
    if (Object.keys(next).length === 0) save.mutate()
  }

  const backHref = editing ? `/app/crm/customers/${id}` : '/app/crm/customers'
  if (editing && isLoading) return <div className="p-6 text-sm text-[#6b7a79]">Loading customer…</div>

  return (
    <div>
      <PageHeader
        title={editing ? 'Edit Customer' : 'Add Customer'}
        subtitle={editing ? 'Update contact details, segment and credit terms.' : 'Create a customer record for sales, invoices and credit accounts.'}
        breadcrumb={[{ label: 'CRM' }, { label: 'Customers' }, { label: editing ? 'Edit' : 'New' }]}
      />

      <form onSubmit={submit} noValidate className="mx-auto max-w-5xl px-4 sm:px-6 pb-10">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <h2 className="font-bold">Customer details</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <FormField label="Customer / business name" required error={errors.name} className="sm:col-span-2">
                  <Input autoFocus placeholder="e.g. Kabwe Trading Co. or Sarah Bwalya" value={form.name} error={!!errors.name} onChange={e => set('name', e.target.value)} />
                </FormField>
                <FormField label="Phone" error={errors.phone}>
                  <Input type="tel" inputMode="tel" placeholder="+260 97 000 0000" value={form.phone} error={!!errors.phone} onChange={e => set('phone', e.target.value)} />
                </FormField>
                <FormField label="Email" error={errors.email}>
                  <Input type="email" inputMode="email" placeholder="name@company.com" value={form.email} error={!!errors.email} onChange={e => set('email', e.target.value)} />
                </FormField>
                <FormField label="Notes" className="sm:col-span-2">
                  <Textarea placeholder="Delivery instructions, preferred contact times, etc." value={form.notes} onChange={e => set('notes', e.target.value)} />
                </FormField>
              </div>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <h2 className="font-bold">Segment</h2>
              <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Customer segment">
                {SEGMENTS.map(s => {
                  const active = form.segment === s.value
                  return (
                    <button key={s.value} type="button" role="radio" aria-checked={active} onClick={() => set('segment', s.value)}
                      className={active ? 'rounded-xl border border-[#00cec8] bg-[#00cec8]/10 p-3 text-left ring-1 ring-[#00cec8]' : 'rounded-xl border border-slate-200 p-3 text-left hover:border-slate-300'}>
                      <span className="block text-sm font-semibold text-[#0b1c30]">{s.label}</span>
                      <span className="block text-[11px] text-[#6b7a79]">{s.hint}</span>
                    </button>
                  )
                })}
              </div>
            </Card>

            <Card>
              <h2 className="font-bold">Credit terms</h2>
              <div className="mt-4">
                <FormField label="Credit limit (ZMW)" error={errors.credit_limit} hint="Maximum the customer may owe on credit sales. 0 = cash only.">
                  <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.credit_limit} error={!!errors.credit_limit} onChange={e => set('credit_limit', e.target.value)} />
                </FormField>
              </div>
              {editing && customer && (
                <div className="mt-4 rounded-lg bg-[#f8f9ff] px-3 py-2 text-sm">
                  <div className="flex justify-between"><span className="text-[#6b7a79]">Outstanding balance</span><span className="font-semibold">{Number(customer.outstanding_balance ?? 0).toLocaleString('en-ZM', { style: 'currency', currency: 'ZMW' })}</span></div>
                  <div className="mt-1 flex justify-between"><span className="text-[#6b7a79]">Lifetime spend</span><span className="font-semibold">{Number(customer.total_spend ?? 0).toLocaleString('en-ZM', { style: 'currency', currency: 'ZMW' })}</span></div>
                </div>
              )}
            </Card>
          </div>
        </div>

        {submitError && (
          <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>{submitError}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(backHref)}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Create customer'}</Button>
        </div>
      </form>
    </div>
  )
}
