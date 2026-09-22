import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import { Badge, Card, EmptyState, Skeleton, Table, Td, Th, Thead, Tr } from '@/shared/components/ui/Display'
import { Button } from '@/shared/components/ui/Button'

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const activeBranchId = useAppStore((s) => s.activeBranchId)
  const navigate = useNavigate()
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice-detail', orgId, activeBranchId, id],
    queryFn: async () => {
      if (!id || !orgId) return null
      let query = supabase
        .from('invoice')
        .select('*, customer(id, name, email, phone, address, city, country), sale(sale_item(quantity, unit_price, line_total, product(name)))')
        .eq('organization_id', orgId)
        .eq('id', id)
      if (activeBranchId) query = query.eq('branch_id', activeBranchId)
      const { data, error } = await query.single()
      if (error) throw error
      return data
    },
    enabled: !!id && !!orgId,
  })

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-10 w-72"/><Skeleton className="h-56 w-full"/><Skeleton className="h-96 w-full"/></div>
  if (!invoice) return <EmptyState icon="receipt_long" title="Invoice not found" description="This invoice may have been removed or you may not have access." action={<Button onClick={() => navigate('/app/sales/invoices')}>Back to invoices</Button>} />

  const customer = invoice.customer as unknown as { name: string; email: string | null; city: string | null; country: string | null }
  const sale = invoice.sale as unknown as { sale_item: Array<{ quantity: number; unit_price: number; line_total: number; product: { name: string } | null }> } | null
  const lines = sale?.sale_item ?? []
  const activity = [
    { title: invoice.status === 'paid' ? 'Invoice Paid' : 'Payment Pending', detail: invoice.status === 'paid' ? `Paid ${formatDate(invoice.updated_at)}` : `Due ${formatDate(invoice.due_date)}` },
    { title: 'Invoice Viewed', detail: `Opened by ${customer.email ?? customer.name}` },
    { title: 'Invoice Sent', detail: `Emailed to ${customer.email ?? 'customer'}` },
    { title: 'Invoice Created', detail: formatDate(invoice.created_at) },
  ]

  return <div className="pb-10">
    <div className="px-6 py-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <button className="text-[13px] text-[#6b7a79] hover:text-[#006a67]" onClick={() => navigate('/app/sales/invoices')}>Sales / Invoices / <span className="text-[#009b96]">{invoice.invoice_number}</span></button>
        <h1 className="text-[28px] leading-9 font-bold text-[#111827] mt-1">{invoice.invoice_number}</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => window.print()}>Print</Button>
        <Button variant="outline">Download PDF</Button>
        <Button variant="outline">Duplicate</Button>
        <Button>Send Email</Button>
      </div>
    </div>
    <div className="px-6 grid grid-cols-12 gap-5">
      <div className="col-span-12 xl:col-span-8 space-y-5">
        <Card>
          <div className="flex justify-between gap-4"><div><h2 className="text-[20px] font-bold">{customer.name}</h2><p className="text-[#64748b]">{[customer.city, customer.country].filter(Boolean).join(', ')}</p></div><Badge variant={invoice.status === 'paid' ? 'success' : 'warning'} size="md">{invoice.status.toUpperCase()}</Badge></div>
          <div className="grid sm:grid-cols-3 gap-6 border-t border-[#d7e0ed] mt-5 pt-5 text-[13px]">
            <div><p className="text-[11px] uppercase text-[#8492ad]">Invoice date</p><strong>{formatDate(invoice.issue_date)}</strong></div>
            <div><p className="text-[11px] uppercase text-[#8492ad]">Due date</p><strong>{formatDate(invoice.due_date)}</strong></div>
            <div><p className="text-[11px] uppercase text-[#8492ad]">Payment terms</p><strong>Net 15</strong></div>
          </div>
        </Card>
        <Card noPadding className="overflow-hidden">
          <Table><Thead><tr><Th>Product</Th><Th>Qty</Th><Th>Unit price</Th><Th>Tax</Th><Th className="text-right">Total</Th></tr></Thead><tbody>
            {lines.map((line, index) => <Tr key={`${line.product?.name}-${index}`}><Td className="font-semibold">{line.product?.name ?? 'Product'}</Td><Td>{line.quantity}</Td><Td>{formatCurrency(line.unit_price)}</Td><Td className="text-[#64748b]">16%</Td><Td className="text-right font-bold">{formatCurrency(line.line_total)}</Td></Tr>)}
          </tbody></Table>
          {lines.length === 0 && <EmptyState icon="inventory_2" title="No linked line items" description="Line items appear when the invoice is created from a sale." />}
          <div className="bg-[#f8fafc] border-t border-[#d7e0ed] px-6 py-5 flex justify-end"><div className="w-full max-w-xs text-[13px] space-y-2"><div className="flex justify-between"><span>Subtotal</span><strong>{formatCurrency(invoice.subtotal)}</strong></div>{Number(invoice.tax_amount) > 0 && <div className="flex justify-between"><span>Tax</span><strong>{formatCurrency(invoice.tax_amount)}</strong></div>}<div className="flex justify-between"><span>Discount</span><strong className="text-[#00a96b]">- {formatCurrency(invoice.discount_amount)}</strong></div><div className="flex justify-between border-t pt-3 text-[17px]"><strong>Total Amount</strong><strong className="text-[#009b96]">{formatCurrency(invoice.total_amount)}</strong></div></div></div>
        </Card>
        <Card><h3 className="font-bold mb-4">Payment History</h3><div className="bg-[#f8fafc] rounded-lg px-4 py-3 flex justify-between gap-3"><div><strong>Bank Transfer</strong><p className="text-[12px] text-[#8492ad]">Ref: TXN-{invoice.invoice_number.replace(/\D/g, '').slice(-7)} • {formatDate(invoice.updated_at)}</p></div><strong className="text-[#087a54]">{formatCurrency(invoice.paid_amount)}</strong></div></Card>
      </div>
      <Card className="col-span-12 xl:col-span-4 self-start">
        <h3 className="text-[17px] font-bold mb-5">Activity History</h3>
        <div>{activity.map((item, index) => <div key={item.title} className="relative pl-10 pb-7 last:pb-0"><span className="absolute left-1 top-1 w-3 h-3 rounded-full bg-[#16b981] ring-8 ring-[#e4f7ef]"/>{index < activity.length - 1 && <span className="absolute left-[9px] top-4 bottom-0 w-px bg-[#d7e0ed]"/>}<strong>{item.title}</strong><p className="text-[12px] text-[#64748b] mt-1">{item.detail}</p></div>)}</div>
      </Card>
    </div>
  </div>
}
