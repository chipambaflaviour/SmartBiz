import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, isDemoMode } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { useTaxSettings } from '@/shared/hooks/useTaxSettings'
import { formatCurrency } from '@/shared/lib/utils'
import { Badge, Card, EmptyState, PageHeader, Skeleton, Table, Td, Th, Thead, Tr } from '@/shared/components/ui/Display'
import { Input } from '@/shared/components/ui/FormElements'

type SaleTaxRow = { id: string; reference_number: string; sale_date: string; total_amount: number; tax_amount: number; branch: { name: string } | null }

export default function VatSummaryPage() {
  const organizationId = useAppStore((state) => state.activeOrganizationId)
  const branchId = useAppStore((state) => state.activeBranchId)
  const { data: taxSettings } = useTaxSettings()
  const now = new Date()
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
  const [to, setTo] = useState(now.toISOString().slice(0, 10))
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['vat-summary', organizationId, branchId, from, to],
    queryFn: async (): Promise<SaleTaxRow[]> => {
      if (isDemoMode) return [
        { id: 'vat-1', reference_number: 'SALE-0847', sale_date: new Date().toISOString(), total_amount: 12450, tax_amount: 1717.24, branch: { name: 'Lusaka Main Branch' } },
        { id: 'vat-2', reference_number: 'SALE-0846', sale_date: new Date(Date.now() - 86400000).toISOString(), total_amount: 3120, tax_amount: 430.34, branch: { name: 'Lusaka Main Branch' } },
      ]
      if (!organizationId) return []
      let query = supabase.from('sale').select('id,reference_number,sale_date,total_amount,tax_amount,branch(name)').eq('organization_id', organizationId).gte('sale_date', `${from}T00:00:00`).lte('sale_date', `${to}T23:59:59.999`).neq('payment_status', 'cancelled').is('deleted_at', null).order('sale_date', { ascending: false })
      if (branchId) query = query.eq('branch_id', branchId)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as SaleTaxRow[]
    },
    enabled: Boolean(organizationId),
  })
  const summary = useMemo(() => sales.reduce((result, sale) => ({ gross: result.gross + Number(sale.total_amount), vat: result.vat + Number(sale.tax_amount) }), { gross: 0, vat: 0 }), [sales])
  const net = summary.gross - summary.vat
  return <div className="pb-10"><PageHeader title="VAT Summary" subtitle="Separate VAT collected from actual business revenue before filing with ZRA." breadcrumb={[{label:'Finance'},{label:'VAT Summary'}]} />
    <div className="space-y-5 px-4 sm:px-6">
      {!taxSettings?.vatEnabled && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><strong>VAT is disabled.</strong> Enable it under Settings → Organization if this business is VAT registered.</div>}
      <Card className="flex flex-wrap items-end gap-4"><label className="text-xs font-semibold text-slate-600">From<Input className="mt-2" type="date" value={from} onChange={(event)=>setFrom(event.target.value)} /></label><label className="text-xs font-semibold text-slate-600">To<Input className="mt-2" type="date" value={to} onChange={(event)=>setTo(event.target.value)} /></label><div className="ml-auto"><Badge variant={taxSettings?.vatEnabled?'success':'warning'}>{taxSettings?.vatEnabled ? `${taxSettings.vatRate}% VAT · ${taxSettings.pricesIncludeVat?'inclusive':'exclusive'}` : 'Not VAT registered'}</Badge></div></Card>
      <div className="grid gap-4 sm:grid-cols-3">{isLoading ? [1,2,3].map(value=><Card key={value}><Skeleton className="h-16" /></Card>) : <><Card><p className="text-xs uppercase tracking-wider text-slate-500">Gross sales collected</p><p className="mt-2 text-2xl font-bold">{formatCurrency(summary.gross)}</p><p className="mt-1 text-xs text-slate-500">Includes VAT where applicable</p></Card><Card><p className="text-xs uppercase tracking-wider text-slate-500">VAT collected</p><p className="mt-2 text-2xl font-bold text-amber-700">{formatCurrency(summary.vat)}</p><p className="mt-1 text-xs text-slate-500">Set aside for the tax liability</p></Card><Card><p className="text-xs uppercase tracking-wider text-slate-500">Net sales revenue</p><p className="mt-2 text-2xl font-bold text-[#006a67]">{formatCurrency(net)}</p><p className="mt-1 text-xs text-slate-500">Business revenue excluding VAT</p></Card></>}</div>
      <Card noPadding className="overflow-hidden"><div className="border-b border-slate-200 p-5"><h2 className="font-bold">Sales VAT breakdown</h2><p className="text-xs text-slate-500">This is an internal summary and is not submitted automatically to ZRA.</p></div>{!isLoading&&!sales.length?<EmptyState icon="receipt_long" title="No sales in this period" description="VAT-bearing sales will appear here."/>:<Table><Thead><tr><Th>Date</Th><Th>Reference</Th><Th>Branch</Th><Th>Gross</Th><Th>VAT</Th><Th>Net revenue</Th></tr></Thead><tbody>{sales.map(sale=><Tr key={sale.id}><Td>{new Date(sale.sale_date).toLocaleDateString('en-ZM')}</Td><Td className="font-semibold">{sale.reference_number}</Td><Td>{sale.branch?.name??'—'}</Td><Td>{formatCurrency(Number(sale.total_amount))}</Td><Td className="text-amber-700">{formatCurrency(Number(sale.tax_amount))}</Td><Td className="font-semibold">{formatCurrency(Number(sale.total_amount)-Number(sale.tax_amount))}</Td></Tr>)}</tbody></Table>}</Card>
    </div></div>
}
