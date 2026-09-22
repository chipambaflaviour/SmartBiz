import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import { Badge, Card, EmptyState, Skeleton, Table, Td, Th, Thead, Tr } from '@/shared/components/ui/Display'
import { Button } from '@/shared/components/ui/Button'

type Transaction = { id: string; kind: 'sale' | 'invoice'; ref: string; date: string; amount: number; status: string; details: string; method: string; href: string | null }
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info'> = { paid: 'success', credit: 'warning', pending: 'warning', partial: 'info', overdue: 'danger', cancelled: 'danger' }
const METHOD_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', mobile: 'Mobile money', mobile_money: 'Mobile money', bank_transfer: 'Bank transfer', credit: 'On credit', split: 'Split', invoice: 'Invoice' }

export default function CustomerProfilePage() {
  const { id } = useParams(); const orgId = useAppStore((s) => s.activeOrganizationId); const activeBranchId = useAppStore((s) => s.activeBranchId); const navigate = useNavigate()
  const { data, isLoading } = useQuery({ queryKey: ['customer-profile', orgId, activeBranchId, id], queryFn: async () => {
    if (!orgId || !id) return null
    let invoiceQuery = supabase.from('invoice').select('id,invoice_number,issue_date,total_amount,status,notes').eq('organization_id', orgId).eq('customer_id', id).is('deleted_at', null).order('issue_date', { ascending: false })
    let saleQuery = supabase.from('sale').select('id,reference_number,sale_date,total_amount,payment_method,payment_status,sale_item(quantity,product(name))').eq('organization_id', orgId).eq('customer_id', id).is('deleted_at', null).order('sale_date', { ascending: false })
    if (activeBranchId) { invoiceQuery = invoiceQuery.eq('branch_id', activeBranchId); saleQuery = saleQuery.eq('branch_id', activeBranchId) }
    const [customerResult, invoiceResult, saleResult] = await Promise.all([
      supabase.from('customer').select('*').eq('organization_id', orgId).eq('id', id).single(),
      invoiceQuery,
      saleQuery,
    ])
    if (customerResult.error) throw customerResult.error
    type SaleRow = { id: string; reference_number: string; sale_date: string; total_amount: number; payment_method: string | null; payment_status: string; sale_item: Array<{ quantity: number; product: { name: string } | null }> | null }
    // One unified transaction list: POS sales (cash, card, mobile, credit) + invoices
    const transactions: Transaction[] = [
      ...((saleResult.data ?? []) as unknown as SaleRow[]).map((sale) => ({
        id: sale.id, kind: 'sale' as const, ref: sale.reference_number, date: sale.sale_date, amount: Number(sale.total_amount),
        status: sale.payment_status === 'pending' ? 'credit' : sale.payment_status,
        details: (sale.sale_item ?? []).map((line) => `${line.quantity} × ${line.product?.name ?? 'item'}`).join(', ') || 'POS sale',
        method: sale.payment_method ?? '',
        href: null,
      })),
      ...(invoiceResult.data ?? []).map((inv) => ({
        id: inv.id, kind: 'invoice' as const, ref: inv.invoice_number, date: inv.issue_date, amount: Number(inv.total_amount),
        status: inv.status, details: inv.notes?.split('\n')[1]?.replace('Items: ', '') ?? 'Sales invoice', method: 'invoice', href: `/app/sales/invoices/${inv.id}`,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return { customer: customerResult.data, transactions }
  }, enabled: !!orgId && !!id })
  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-12 w-72"/><Skeleton className="h-24 w-full"/><Skeleton className="h-96 w-full"/></div>
  if (!data) return <EmptyState title="Customer not found" action={<Button onClick={()=>navigate('/app/crm/customers')}>Back to customers</Button>}/>
  const { customer, transactions } = data; const creditSales = transactions.filter((t) => t.status === 'credit'); const creditUse = customer.credit_limit ? Math.min(100, customer.outstanding_balance/customer.credit_limit*100) : 0
  return <div className="pb-10"><div className="px-6 py-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[13px] text-[#64748b]">Customers / <span className="text-[#009b96]">{customer.name}</span></p><div className="flex items-center gap-3"><h1 className="text-[28px] font-bold">{customer.name}</h1>{customer.segment&&<Badge variant="warning">{customer.segment.toUpperCase()}</Badge>}<Badge variant="success">ACTIVE</Badge></div></div><div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/app/sales/pos')}><span className="material-symbols-outlined text-[18px]">point_of_sale</span>New sale</Button><Button onClick={() => navigate(`/app/crm/customers/${id}/edit`)}><span className="material-symbols-outlined text-[18px]">edit</span>Edit Profile</Button></div></div>
    <div className="px-6 grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">{[['Total Purchases',formatCurrency(customer.total_spend)],['Outstanding Balance',formatCurrency(customer.outstanding_balance)],['Credit Limit',formatCurrency(customer.credit_limit)],['Customer Since',formatDate(customer.created_at)]].map(([label,value],i)=><Card key={label}><p className="text-[11px] uppercase font-semibold text-[#64748b]">{label}</p><p className={`text-[24px] font-bold mt-3 ${i===1?'text-[#9a3e0c]':''}`}>{value}</p></Card>)}</div>
    <div className="px-6 grid grid-cols-12 gap-5"><Card noPadding className="col-span-12 xl:col-span-8 overflow-hidden"><div className="px-5 py-4 border-b border-[#d7e0ed] flex items-center justify-between gap-4"><div><h3 className="font-bold">Transactions</h3><p className="text-[12px] text-[#64748b]">POS sales and invoices for this customer</p></div>{creditSales.length>0&&<Badge variant="warning">{creditSales.length} on credit · {formatCurrency(creditSales.reduce((s,t)=>s+t.amount,0))}</Badge>}</div><Table><Thead><tr><Th>Reference</Th><Th>Items / details</Th><Th>Paid via</Th><Th>Amount (ZMW)</Th><Th>Status</Th><Th>Date</Th></tr></Thead><tbody>{transactions.map((t)=><Tr key={t.id} onClick={t.href?()=>navigate(t.href!):undefined}><Td className="font-semibold text-[#009b96] font-mono text-[12px]">{t.ref}</Td><Td className="text-[#64748b] max-w-[280px] truncate" title={t.details}>{t.details}</Td><Td className="text-[#64748b]">{METHOD_LABEL[t.method] ?? t.method}</Td><Td className="font-bold">{formatCurrency(t.amount)}</Td><Td><Badge variant={STATUS_VARIANT[t.status] ?? 'info'}>{t.status === 'credit' ? 'ON CREDIT' : t.status.toUpperCase()}</Badge></Td><Td className="text-[#64748b]">{formatDate(t.date)}</Td></Tr>)}</tbody></Table>{transactions.length===0&&<EmptyState icon="receipt_long" title="No transactions yet" description="Sales made at the POS or invoices raised for this customer will appear here."/>}</Card>
      <div className="col-span-12 xl:col-span-4 space-y-5"><Card><h3 className="font-bold mb-4">Contact Details</h3><div className="space-y-3 text-[13px]"><div><p className="text-[11px] uppercase text-[#8492ad]">Email address</p><strong>{customer.email??'—'}</strong></div><div><p className="text-[11px] uppercase text-[#8492ad]">Phone number</p><strong>{customer.phone??'—'}</strong></div>{customer.notes&&<div><p className="text-[11px] uppercase text-[#8492ad]">Notes</p><span>{customer.notes}</span></div>}</div></Card><Card><h3 className="font-bold mb-4">Credit Status & Limit</h3><div className="flex justify-between text-[12px]"><span>Used ({Math.round(creditUse)}%)</span><strong>{formatCurrency(customer.outstanding_balance)} / {formatCurrency(customer.credit_limit)}</strong></div><div className="h-2 rounded-full bg-[#edf1f7] mt-3 overflow-hidden"><div className="h-full bg-[#f59e0b] rounded-full" style={{width:`${creditUse}%`}}/></div></Card><Card><h3 className="font-bold mb-3">Loyalty Points</h3><div className="flex justify-between items-center"><strong className="text-[28px] text-[#009b96]">{Math.round(customer.total_spend/100).toLocaleString()} pts</strong><Badge>Gold Tier</Badge></div></Card></div>
    </div></div>
}
