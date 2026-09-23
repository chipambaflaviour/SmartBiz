import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { DEMO_CUSTOMERS } from '@/shared/lib/demo'
import { isDemoMode, supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import { Badge, Card, EmptyState, Skeleton, Table, Td, Th, Thead, Tr } from '@/shared/components/ui/Display'
import { Button } from '@/shared/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/shared/components/ui/FormElements'

type Transaction = { id: string; ref: string; date: string; amount: number; status: string; details: string; method: string; href: string | null }
type CreditEntry = { id: string; type: 'credit_sale' | 'payment' | 'adjustment' | 'credit_note'; amount: number; payment_method: string | null; reference: string | null; notes: string | null; occurred_at: string }
type PaymentMethod = 'cash' | 'mobile_money' | 'card' | 'bank_transfer'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info'> = { paid: 'success', credit: 'warning', pending: 'warning', partial: 'info', overdue: 'danger', cancelled: 'danger' }
const METHOD_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', mobile: 'Mobile money', mobile_money: 'Mobile money', bank_transfer: 'Bank transfer', credit: 'On credit', split: 'Split', invoice: 'Invoice' }

export default function CustomerProfilePage() {
  const { id } = useParams()
  const orgId = useAppStore((state) => state.activeOrganizationId)
  const activeBranchId = useAppStore((state) => state.activeBranchId)
  const currentUser = useAppStore((state) => state.currentUser)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showPayment, setShowPayment] = useState(false)
  const [demoPaid, setDemoPaid] = useState(0)
  const [demoPayments, setDemoPayments] = useState<CreditEntry[]>([])
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['customer-profile', orgId, activeBranchId, id],
    queryFn: async () => {
      if (!id) return null
      if (isDemoMode) {
        const demo = DEMO_CUSTOMERS.find((customer) => customer.id === id) ?? DEMO_CUSTOMERS[0]
        return {
          customer: { ...demo, credit_limit: Math.max(Number(demo.outstanding_balance) * 3, 25_000), notes: 'Regular customer account.' },
          transactions: [] as Transaction[],
          creditEntries: Number(demo.outstanding_balance) > 0 ? [{ id: 'demo-credit', type: 'credit_sale' as const, amount: Number(demo.outstanding_balance), payment_method: 'credit', reference: 'DEMO-CREDIT-001', notes: 'Opening credit balance', occurred_at: demo.created_at }] : [],
        }
      }
      if (!orgId) return null
      let invoiceQuery = supabase.from('invoice').select('id,invoice_number,issue_date,total_amount,status,notes').eq('organization_id', orgId).eq('customer_id', id).is('deleted_at', null).order('issue_date', { ascending: false })
      let saleQuery = supabase.from('sale').select('id,reference_number,sale_date,total_amount,payment_method,payment_status,sale_item(quantity,product(name))').eq('organization_id', orgId).eq('customer_id', id).is('deleted_at', null).order('sale_date', { ascending: false })
      if (activeBranchId) {
        invoiceQuery = invoiceQuery.eq('branch_id', activeBranchId)
        saleQuery = saleQuery.eq('branch_id', activeBranchId)
      }
      const [customerResult, invoiceResult, saleResult, creditResult] = await Promise.all([
        supabase.from('customer').select('*').eq('organization_id', orgId).eq('id', id).single(),
        invoiceQuery,
        saleQuery,
        supabase.from('customer_credit_transaction').select('id,type,amount,payment_method,reference,notes,occurred_at').eq('organization_id', orgId).eq('customer_id', id).order('occurred_at', { ascending: false }).limit(100),
      ])
      if (customerResult.error) throw customerResult.error
      if (invoiceResult.error) throw invoiceResult.error
      if (saleResult.error) throw saleResult.error
      if (creditResult.error) throw creditResult.error

      type SaleRow = { id: string; reference_number: string; sale_date: string; total_amount: number; payment_method: string | null; payment_status: string; sale_item: Array<{ quantity: number; product: { name: string } | null }> | null }
      const transactions: Transaction[] = [
        ...((saleResult.data ?? []) as unknown as SaleRow[]).map((sale) => ({ id: sale.id, ref: sale.reference_number, date: sale.sale_date, amount: Number(sale.total_amount), status: sale.payment_status === 'pending' ? 'credit' : sale.payment_status, details: (sale.sale_item ?? []).map((line) => `${line.quantity} × ${line.product?.name ?? 'item'}`).join(', ') || 'POS sale', method: sale.payment_method ?? '', href: null })),
        ...(invoiceResult.data ?? []).map((invoice) => ({ id: invoice.id, ref: invoice.invoice_number, date: invoice.issue_date, amount: Number(invoice.total_amount), status: invoice.status, details: invoice.notes?.split('\n')[1]?.replace('Items: ', '') ?? 'Sales invoice', method: 'invoice', href: `/app/sales/invoices/${invoice.id}` })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      return { customer: customerResult.data, transactions, creditEntries: (creditResult.data ?? []) as CreditEntry[] }
    },
    enabled: isDemoMode || (!!orgId && !!id),
  })

  const displayedBalance = Math.max(0, Number(data?.customer.outstanding_balance ?? 0) - demoPaid)
  const paymentAmount = Number(amount)
  const paymentError = useMemo(() => {
    if (!amount) return ''
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return 'Enter an amount greater than zero.'
    if (paymentAmount > displayedBalance) return 'Payment cannot exceed the outstanding balance.'
    return ''
  }, [amount, displayedBalance, paymentAmount])

  const recordPayment = useMutation({
    mutationFn: async () => {
      if (!id || paymentError || paymentAmount <= 0) throw new Error(paymentError || 'Enter a valid payment amount.')
      if (isDemoMode) return
      const { error: rpcError } = await supabase.rpc('record_customer_credit_payment', { p_customer_id: id, p_amount: paymentAmount, p_payment_method: method, p_reference: reference.trim() || null, p_notes: notes.trim() || null })
      if (rpcError) throw rpcError
    },
    onSuccess: async () => {
      if (isDemoMode) {
        setDemoPaid((paid) => paid + paymentAmount)
        setDemoPayments((entries) => [{ id: crypto.randomUUID(), type: 'payment', amount: paymentAmount, payment_method: method, reference: reference.trim() || null, notes: notes.trim() || null, occurred_at: new Date().toISOString() }, ...entries])
      }
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['customer-profile', orgId, activeBranchId, id] }), queryClient.invalidateQueries({ queryKey: ['customers'] }), queryClient.invalidateQueries({ queryKey: ['pos-customers', orgId] })])
      setShowPayment(false); setAmount(''); setReference(''); setNotes('')
    },
  })

  if (isLoading) return <div className="space-y-4 p-6"><Skeleton className="h-12 w-72"/><Skeleton className="h-24 w-full"/><Skeleton className="h-96 w-full"/></div>
  if (error) return <EmptyState icon="error" title="Could not load customer" description={(error as Error).message} action={<Button onClick={() => navigate('/app/crm/customers')}>Back to customers</Button>}/>
  if (!data) return <EmptyState title="Customer not found" action={<Button onClick={() => navigate('/app/crm/customers')}>Back to customers</Button>}/>

  const { customer, transactions, creditEntries } = data
  const creditUse = customer.credit_limit ? Math.min(100, displayedBalance / customer.credit_limit * 100) : 0
  const ledger = [...demoPayments, ...creditEntries]

  return <div className="pb-10">
    <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-5 sm:px-6">
      <div className="flex items-start gap-3"><Button variant="outline" size="icon" aria-label="Go back to customers" onClick={() => navigate('/app/crm/customers')}><span className="material-symbols-outlined">arrow_back</span></Button><div><p className="text-[13px] text-[#64748b]">Customers / <span className="text-[#009b96]">{customer.name}</span></p><div className="flex flex-wrap items-center gap-3"><h1 className="text-[28px] font-bold">{customer.name}</h1>{customer.segment&&<Badge variant="warning">{customer.segment.toUpperCase()}</Badge>}<Badge variant="success">ACTIVE</Badge></div></div></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">{displayedBalance > 0 && <Button className="flex-1 sm:flex-none" onClick={() => { setAmount(displayedBalance.toFixed(2)); setShowPayment(true) }}><span className="material-symbols-outlined text-[18px]">payments</span>Record payment</Button>}<Button className="flex-1 sm:flex-none" variant="outline" onClick={() => navigate('/app/sales/pos')}><span className="material-symbols-outlined text-[18px]">point_of_sale</span>New sale</Button><Button className="flex-1 sm:flex-none" variant="outline" onClick={() => navigate(`/app/crm/customers/${id}/edit`)}><span className="material-symbols-outlined text-[18px]">edit</span>Edit profile</Button></div>
    </div>

    <div className="mb-5 grid gap-4 px-4 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">{[['Total Purchases',formatCurrency(customer.total_spend)],['Outstanding Balance',formatCurrency(displayedBalance)],['Credit Limit',formatCurrency(customer.credit_limit)],['Customer Since',formatDate(customer.created_at)]].map(([label,value],index)=><Card key={label}><p className="text-[11px] font-semibold uppercase text-[#64748b]">{label}</p><p className={`mt-3 text-[24px] font-bold ${index===1&&displayedBalance>0?'text-[#9a3e0c]':index===1?'text-[#166534]':''}`}>{value}</p>{index===1&&displayedBalance===0&&<p className="mt-1 text-xs font-semibold text-[#166534]">Account settled</p>}</Card>)}</div>

    <div className="grid grid-cols-12 gap-5 px-4 sm:px-6"><div className="col-span-12 space-y-5 xl:col-span-8">
      <Card noPadding className="overflow-hidden"><div className="border-b border-[#d7e0ed] px-5 py-4"><h3 className="font-bold">Transactions</h3><p className="text-[12px] text-[#64748b]">POS sales and invoices for this customer</p></div><Table><Thead><tr><Th>Reference</Th><Th>Items / details</Th><Th>Paid via</Th><Th>Amount</Th><Th>Status</Th><Th>Date</Th></tr></Thead><tbody>{transactions.map((transaction)=><Tr key={transaction.id} onClick={transaction.href?()=>navigate(transaction.href!):undefined}><Td className="font-mono text-[12px] font-semibold text-[#009b96]">{transaction.ref}</Td><Td className="max-w-[280px] truncate text-[#64748b]">{transaction.details}</Td><Td>{METHOD_LABEL[transaction.method] ?? transaction.method}</Td><Td className="font-bold">{formatCurrency(transaction.amount)}</Td><Td><Badge variant={STATUS_VARIANT[transaction.status] ?? 'info'}>{transaction.status === 'credit' ? 'ON CREDIT' : transaction.status.toUpperCase()}</Badge></Td><Td>{formatDate(transaction.date)}</Td></Tr>)}</tbody></Table>{transactions.length===0&&<EmptyState icon="receipt_long" title="No sales yet" description="Sales made at the POS or invoices raised for this customer will appear here."/>}</Card>
      <Card noPadding className="overflow-hidden"><div className="border-b border-[#d7e0ed] px-5 py-4"><h3 className="font-bold">Credit account history</h3><p className="text-[12px] text-[#64748b]">Every credit charge and repayment is retained for accountability.</p></div>{ledger.length?<Table><Thead><tr><Th>Date</Th><Th>Entry</Th><Th>Method</Th><Th>Reference</Th><Th>Amount</Th></tr></Thead><tbody>{ledger.map((entry)=><Tr key={entry.id}><Td>{formatDate(entry.occurred_at)}</Td><Td><Badge variant={entry.type==='payment'||entry.type==='credit_note'?'success':'warning'}>{entry.type.replace('_',' ').toUpperCase()}</Badge></Td><Td>{entry.payment_method?METHOD_LABEL[entry.payment_method]??entry.payment_method:'—'}</Td><Td>{entry.reference??'—'}</Td><Td className={`font-bold ${entry.type==='payment'||entry.type==='credit_note'?'text-[#166534]':'text-[#9a3e0c]'}`}>{entry.type==='payment'||entry.type==='credit_note'?'−':'+'}{formatCurrency(Number(entry.amount))}</Td></Tr>)}</tbody></Table>:<EmptyState icon="account_balance_wallet" title="No credit activity" description="Credit sales and repayments will appear here."/>}</Card>
    </div><div className="col-span-12 space-y-5 xl:col-span-4"><Card><h3 className="mb-4 font-bold">Contact details</h3><div className="space-y-3 text-[13px]"><div><p className="text-[11px] uppercase text-[#8492ad]">Email address</p><strong>{customer.email??'—'}</strong></div><div><p className="text-[11px] uppercase text-[#8492ad]">Phone number</p><strong>{customer.phone??'—'}</strong></div>{customer.notes&&<div><p className="text-[11px] uppercase text-[#8492ad]">Notes</p><span>{customer.notes}</span></div>}</div></Card><Card><h3 className="mb-4 font-bold">Credit status & limit</h3><div className="flex justify-between gap-3 text-[12px]"><span>Used ({Math.round(creditUse)}%)</span><strong>{formatCurrency(displayedBalance)} / {formatCurrency(customer.credit_limit)}</strong></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#edf1f7]"><div className={`h-full rounded-full ${creditUse>=90?'bg-[#ba1a1a]':'bg-[#f59e0b]'}`} style={{width:`${creditUse}%`}}/></div>{displayedBalance>0&&<Button className="mt-4 w-full" onClick={() => { setAmount(displayedBalance.toFixed(2)); setShowPayment(true) }}>Record customer payment</Button>}</Card></div></div>

    {showPayment&&<div className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={()=>setShowPayment(false)}><Card className="my-auto w-full max-w-lg" onClick={(event)=>event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-[#008f88]">Credit repayment</p><h2 className="mt-1 text-xl font-bold">Record payment from {customer.name}</h2><p className="mt-1 text-sm text-[#64748b]">Outstanding: {formatCurrency(displayedBalance)}</p></div><Button variant="ghost" size="icon" aria-label="Close payment dialog" onClick={()=>setShowPayment(false)}><span className="material-symbols-outlined">close</span></Button></div><div className="mt-5 space-y-4"><FormField label="Amount received (ZMW)" required error={paymentError}><Input autoFocus type="number" inputMode="decimal" min="0.01" max={displayedBalance} step="0.01" value={amount} onChange={(event)=>setAmount(event.target.value)}/></FormField><Button type="button" size="sm" variant="secondary" onClick={()=>setAmount(displayedBalance.toFixed(2))}>Pay full balance · {formatCurrency(displayedBalance)}</Button><FormField label="Payment method" required><Select value={method} onChange={(event)=>setMethod(event.target.value as PaymentMethod)}><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option></Select></FormField><FormField label="Reference" hint="Use the mobile money, bank or receipt reference when available."><Input value={reference} onChange={(event)=>setReference(event.target.value)} placeholder="Optional reference"/></FormField><FormField label="Notes"><Textarea value={notes} onChange={(event)=>setNotes(event.target.value)} placeholder="Optional payment note"/></FormField>{recordPayment.error&&<div role="alert" className="rounded-lg bg-[#fee2e2] p-3 text-sm text-[#991b1b]">{recordPayment.error.message}</div>}</div><div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button variant="outline" onClick={()=>setShowPayment(false)}>Cancel</Button><Button loading={recordPayment.isPending} disabled={!!paymentError||!amount} onClick={()=>recordPayment.mutate()}>Confirm payment · {amount&&paymentAmount>0?formatCurrency(paymentAmount):formatCurrency(0)}</Button></div><p className="mt-3 text-xs text-[#64748b]">Recorded by {currentUser?.email ?? 'the signed-in user'}. This creates a permanent credit ledger entry.</p></Card></div>}
  </div>
}
