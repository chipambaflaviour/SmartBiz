import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { formatCurrency } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/Button'
import { BackButton, Card } from '@/shared/components/ui/Display'
import { FormField, Input, Select, Textarea } from '@/shared/components/ui/FormElements'
import { calculateVat, useTaxSettings } from '@/shared/hooks/useTaxSettings'

type Line = { id: number; productId: string; name: string; quantity: number; unitPrice: number; taxRate: number }

export default function CreateInvoicePage() {
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const activeBranchId = useAppStore((s) => s.activeBranchId)
  const navigate = useNavigate()
  const today = new Date().toISOString().slice(0, 10)
  const due = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
  const [customerId, setCustomerId] = useState('')
  const [issueDate, setIssueDate] = useState(today)
  const [dueDate, setDueDate] = useState(due)
  const [discount, setDiscount] = useState(0)
  const [notes, setNotes] = useState('Please remit payments to Standard Chartered Bank, Lusaka Corporate Branch. Quote invoice number.')
  const [lines, setLines] = useState<Line[]>([{ id: 1, productId: '', name: '', quantity: 1, unitPrice: 0, taxRate: 0 }])
  const { data: taxSettings = { vatEnabled: false, vatRate: 16, pricesIncludeVat: true, taxNumber: '' } } = useTaxSettings()
  const { data: customers = [] } = useQuery({ queryKey: ['invoice-customers', orgId], queryFn: async () => { const { data } = await supabase.from('customer').select('id,name').eq('organization_id', orgId!).is('deleted_at', null).order('name'); return data ?? [] }, enabled: !!orgId })
  const { data: products = [] } = useQuery({ queryKey: ['invoice-products', orgId], queryFn: async () => { const { data } = await supabase.from('product').select('id,name,unit_price').eq('organization_id', orgId!).eq('is_active', true).is('deleted_at', null).order('name'); return data ?? [] }, enabled: !!orgId })
  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0), [lines])
  const taxCalculation = useMemo(() => calculateVat(Math.max(0, subtotal - discount), taxSettings), [discount, subtotal, taxSettings])
  const tax = taxCalculation.vat
  const total = taxCalculation.gross
  const updateLine = (id: number, patch: Partial<Line>) => setLines((current) => current.map((l) => l.id === id ? { ...l, ...patch } : l))
  const save = useMutation({ mutationFn: async (status: 'draft' | 'pending') => {
    if (!orgId || !activeBranchId) throw new Error('Select a branch before creating an invoice.')
    if (!customerId || lines.some((l) => !l.productId)) throw new Error('Select a customer and product for every line.')
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    const lineSummary = lines.map((l) => `${l.name} x${l.quantity} @ ${l.unitPrice}`).join('; ')
    const { data, error } = await supabase.from('invoice').insert({ organization_id: orgId, invoice_number: invoiceNumber, customer_id: customerId, sale_id: null, branch_id: activeBranchId, issue_date: issueDate, due_date: dueDate, subtotal, tax_amount: tax, discount_amount: discount, total_amount: total, paid_amount: 0, status, notes: `${notes}\nItems: ${lineSummary}`, deleted_at: null, created_by: null, updated_by: null }).select('id').single()
    if (error) throw error
    return data
  }, onSuccess: (data) => navigate(`/app/sales/invoices/${data.id}`) })

  return <div className="pb-10">
    <div className="px-6 py-5 flex flex-wrap items-end justify-between gap-4"><div className="flex items-start gap-3"><BackButton href="/app/sales/invoices" label="Back to invoices"/><div><p className="text-[13px] text-[#64748b]">Sales / Invoices / <span className="text-[#009b96]">New Invoice</span></p><h1 className="text-[28px] font-bold">Create New Invoice</h1></div></div><div className="flex gap-2"><Button variant="outline" loading={save.isPending} onClick={() => save.mutate('draft')}>Save as Draft</Button><Button loading={save.isPending} onClick={() => save.mutate('pending')}>Send Invoice</Button></div></div>
    {!activeBranchId && <div role="alert" className="mx-6 mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Select a branch before creating an invoice. Invoices cannot be posted to the all-branches view.</div>}
    <div className="px-6 grid grid-cols-12 gap-5">
      <div className="col-span-12 xl:col-span-8 space-y-5">
        <Card className="grid md:grid-cols-2 gap-5"><FormField label="Customer"><Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">Select customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField><FormField label="Payment Terms"><Select defaultValue="15"><option value="15">Net 15 Days</option><option value="30">Net 30 Days</option></Select></FormField><FormField label="Invoice Date"><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}/></FormField><FormField label="Due Date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}/></FormField></Card>
        <Card noPadding className="overflow-hidden"><div className="grid grid-cols-[minmax(220px,1fr)_80px_120px_80px_120px_44px] gap-0 px-5 py-3 bg-[#f8fafc] text-[11px] uppercase font-semibold text-[#64748b]"><span>Item details</span><span>Qty</span><span>Unit price</span><span>Tax</span><span>Total</span><span/></div>{lines.map((line) => <div key={line.id} className="grid grid-cols-[minmax(220px,1fr)_80px_120px_80px_120px_44px] items-end gap-0 px-5 py-3 border-t border-[#d7e0ed]"><Select value={line.productId} onChange={(e) => { const p=products.find((x)=>x.id===e.target.value); updateLine(line.id,{productId:e.target.value,name:p?.name??'',unitPrice:p?.unit_price??0}) }}><option value="">Select product</option>{products.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</Select><Input type="number" min="1" value={line.quantity} onChange={(e)=>updateLine(line.id,{quantity:Number(e.target.value)})}/><Input type="number" min="0" value={line.unitPrice} onChange={(e)=>updateLine(line.id,{unitPrice:Number(e.target.value)})}/><Input value={taxSettings.vatEnabled ? `${taxSettings.vatRate}%` : '—'} readOnly title={taxSettings.vatEnabled ? `${taxSettings.pricesIncludeVat?'Included in':'Added to'} price` : 'VAT is disabled'}/><strong className="h-10 flex items-center px-3 text-[13px]">{formatCurrency(line.quantity*line.unitPrice)}</strong><button className="h-10 text-[#ef4444]" aria-label="Remove item" onClick={()=>setLines((v)=>v.filter((x)=>x.id!==line.id))}><span className="material-symbols-outlined">delete</span></button></div>)}<div className="p-5 border-t border-[#d7e0ed]"><Button variant="outline" size="sm" onClick={()=>setLines((v)=>[...v,{id:Date.now(),productId:'',name:'',quantity:1,unitPrice:0,taxRate:taxSettings.vatEnabled?taxSettings.vatRate:0}])}>Add Item</Button></div></Card>
        <Card><FormField label="Notes / Payment Instructions"><Textarea rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)}/></FormField></Card>
        {save.error && <p className="text-[#b91c1c] text-[13px]">{save.error.message}</p>}
      </div>
      <Card className="col-span-12 xl:col-span-4 self-start"><h2 className="text-[18px] font-bold mb-5">Invoice Summary</h2><div className="space-y-4 text-[13px]"><div className="flex justify-between"><span>Items total</span><strong>{formatCurrency(subtotal)}</strong></div><FormField label="Discount Amount (ZMW)"><Input type="number" min="0" value={discount} onChange={(e)=>setDiscount(Number(e.target.value))}/></FormField>{taxSettings.vatEnabled && <div className="flex justify-between"><span>VAT {taxSettings.pricesIncludeVat?'included':'added'} ({taxSettings.vatRate}%)</span><strong>{formatCurrency(tax)}</strong></div>}<div className="flex justify-between border-t pt-4 text-[18px]"><strong>Payable Total</strong><strong className="text-[#009b96]">{formatCurrency(total)}</strong></div></div></Card>
    </div>
  </div>
}
