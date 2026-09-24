import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn, formatCurrency } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/Button'
import { Input, Select } from '@/shared/components/ui/FormElements'
import { LogoMark } from '@/shared/components/Logo'

export type PaymentMethodKey = 'cash' | 'mobile_money' | 'card' | 'credit'

export interface PaymentDetails {
  method: PaymentMethodKey
  customerId: string
  /** cash: amount handed over by the customer */
  tendered: number | null
  /** mobile money provider / card type — stored in sale notes */
  provider: string
  /** transaction / receipt reference from the terminal or wallet */
  reference: string
}

export interface ReceiptLine {
  name: string
  sku: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface CompletedSale {
  ref: string
  date: string
  orgName: string
  cashier: string
  customerName: string | null
  items: ReceiptLine[]
  subtotal: number
  discountAmt: number
  taxAmt: number
  total: number
  method: PaymentMethodKey
  tendered: number | null
  change: number
  reference: string
  offline: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  total: number
  subtotal: number
  discountAmt: number
  itemCount: number
  customers: Array<{ id: string; name: string; outstanding_balance: number }>
  isPending: boolean
  error: string | null
  completed: CompletedSale | null
  onConfirm: (details: PaymentDetails) => void
  onNewSale: () => void
}

const METHODS: Array<{ key: PaymentMethodKey; icon: string; label: string; hint: string }> = [
  { key: 'cash', icon: 'payments', label: 'Cash', hint: 'Enter amount tendered' },
  { key: 'mobile_money', icon: 'phone_iphone', label: 'Mobile money', hint: 'MTN, Airtel, Zamtel' },
  { key: 'card', icon: 'credit_card', label: 'Card / bank', hint: 'POS terminal or transfer' },
  { key: 'credit', icon: 'schedule', label: 'Customer credit', hint: 'Bill to a CRM account' },
]

const MOBILE_PROVIDERS = ['MTN MoMo', 'Airtel Money', 'Zamtel Kwacha']

/** Sensible "quick cash" buttons: exact, then the next round notes above the total. */
export function quickAmounts(total: number): number[] {
  const steps = [10, 20, 50, 100, 200, 500, 1000]
  const out = new Set<number>([Math.ceil(total * 100) / 100])
  for (const step of steps) {
    const up = Math.ceil(total / step) * step
    if (up > total) out.add(up)
    if (out.size >= 4) break
  }
  return [...out].slice(0, 4)
}

export function PaymentDialog({ open, onClose, total, subtotal, discountAmt, itemCount, customers, isPending, error, completed, onConfirm, onNewSale }: Props) {
  const [method, setMethod] = useState<PaymentMethodKey>('cash')
  const [customerId, setCustomerId] = useState('')
  const [tendered, setTendered] = useState('')
  const [provider, setProvider] = useState(MOBILE_PROVIDERS[0])
  const [reference, setReference] = useState('')

  // Reset transient fields each time the dialog opens
  useEffect(() => {
    if (!open) return
    setTendered('')
    setReference('')
  }, [open])

  // Close on Escape (not while a sale is being posted)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isPending) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isPending, onClose])

  const tenderedNum = Number(tendered)
  const change = method === 'cash' && tendered !== '' ? tenderedNum - total : 0
  const quick = useMemo(() => quickAmounts(total), [total])

  const canConfirm = !isPending && itemCount > 0 && (
    method === 'cash' ? (tendered === '' || tenderedNum >= total) :
    method === 'credit' ? Boolean(customerId) :
    true
  )

  if (!open) return null

  const selectedCustomer = customers.find(c => c.id === customerId)

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-end justify-center bg-slate-950/60 backdrop-blur-[2px] p-0 sm:items-center sm:p-6"
      onClick={() => !isPending && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-dialog-title"
        onClick={e => e.stopPropagation()}
        className="flex w-full max-h-[calc(100vh-1rem)] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:w-[min(100%,34rem)] sm:max-h-[calc(100vh-3rem)] sm:rounded-2xl"
      >
        {completed ? (
          /* ── Success state ─────────────────────────────────────────── */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-6 pt-8 text-center sm:px-10">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#dcfce7] text-[#166534]">
                <span className="material-symbols-outlined text-[32px]">check</span>
              </div>
              <h2 id="payment-dialog-title" className="mt-4 text-2xl font-bold text-[#0b1c30]">Sale complete</h2>
              {completed.method === 'cash' && completed.change > 0 && (
                <p className="mt-1 text-sm text-[#6b7a79]">Change to give: <span className="text-lg font-bold text-[#006a67]">{formatCurrency(completed.change)}</span></p>
              )}
              {completed.offline && <span className="mt-2 inline-block rounded-full bg-[#fef3c7] px-2 py-0.5 text-[11px] font-semibold text-[#92400e]">Saved offline — will sync</span>}
            </div>

            {/* Receipt — this block is what gets printed */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-10">
              <Receipt sale={completed} />
            </div>

            <div className="flex flex-col gap-2 border-t border-[#e5eeff] px-6 py-4 sm:flex-row sm:justify-center">
              <Button variant="outline" size="lg" onClick={() => window.print()}>
                <span className="material-symbols-outlined text-[18px]">print</span>Print receipt
              </Button>
              <Button size="lg" autoFocus onClick={onNewSale}>
                <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>New sale
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Header ───────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 border-b border-[#e5eeff] px-6 py-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#009b96]">Complete sale</p>
                <h2 id="payment-dialog-title" className="mt-1 text-xl font-bold text-[#0b1c30]">Take payment</h2>
                <p className="mt-0.5 text-xs text-[#6b7a79]">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'} · Subtotal {formatCurrency(subtotal)}
                  {discountAmt > 0 && <> · Discount −{formatCurrency(discountAmt)}</>}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6b7a79]">Amount due</p>
                <p className="text-2xl font-bold leading-tight text-[#006a67]">{formatCurrency(total)}</p>
              </div>
            </div>

            {/* ── Body ─────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className="mb-2 text-xs font-semibold text-[#3b4948]">Payment method</p>
              <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Payment method">
                {METHODS.map(m => {
                  const active = method === m.key
                  return (
                    <button
                      key={m.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setMethod(m.key)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                        active
                          ? 'border-[#00cec8] bg-[#00cec8]/10 ring-2 ring-[#00cec8]/40'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      )}
                    >
                      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', active ? 'bg-[#006a67] text-white' : 'bg-[#eff4ff] text-[#006a67]')}>
                        <span className="material-symbols-outlined text-[20px]">{m.icon}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[#0b1c30]">{m.label}</span>
                        <span className="block truncate text-[11px] text-[#6b7a79]">{m.hint}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Method-specific fields */}
              <div className="mt-5 rounded-xl border border-[#e5eeff] bg-[#f8f9ff] p-4">
                {method === 'cash' && (
                  <>
                    <label className="block text-xs font-semibold text-[#3b4948]">Amount tendered <span className="font-normal text-[#6b7a79]">(optional)</span></label>
                    <Input
                      type="number" inputMode="decimal" min={0} step="0.01"
                      autoFocus
                      placeholder={formatCurrency(total)}
                      value={tendered}
                      onChange={e => setTendered(e.target.value)}
                      className="mt-2 h-11 text-lg font-semibold"
                    />
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {quick.map(q => (
                        <button key={q} type="button" onClick={() => setTendered(String(q))} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', Number(tendered) === q ? 'border-[#006a67] bg-[#006a67] text-white' : 'border-slate-200 bg-white text-[#3b4948] hover:border-[#00a9a3]')}>
                          {q === Math.ceil(total * 100) / 100 ? 'Exact' : formatCurrency(q)}
                        </button>
                      ))}
                    </div>
                    {tendered !== '' && (
                      <div className={cn('mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm', change < 0 ? 'bg-[#fee2e2] text-[#991b1b]' : 'bg-[#dcfce7] text-[#166534]')}>
                        <span className="font-medium">{change < 0 ? 'Short by' : 'Change to give'}</span>
                        <span className="text-lg font-bold">{formatCurrency(Math.abs(change))}</span>
                      </div>
                    )}
                  </>
                )}

                {method === 'mobile_money' && (
                  <>
                    <p className="text-xs font-semibold text-[#3b4948]">Provider</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {MOBILE_PROVIDERS.map(p => (
                        <button key={p} type="button" onClick={() => setProvider(p)} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', provider === p ? 'border-[#006a67] bg-[#006a67] text-white' : 'border-slate-200 bg-white text-[#3b4948] hover:border-[#00a9a3]')}>{p}</button>
                      ))}
                    </div>
                    <label className="mt-4 block text-xs font-semibold text-[#3b4948]">Transaction reference <span className="font-normal text-[#6b7a79]">(optional)</span></label>
                    <Input autoFocus placeholder="e.g. MP240911.1432.A12345" value={reference} onChange={e => setReference(e.target.value)} className="mt-2 font-mono" />
                  </>
                )}

                {method === 'card' && (
                  <>
                    <label className="block text-xs font-semibold text-[#3b4948]">Terminal / transfer reference <span className="font-normal text-[#6b7a79]">(optional)</span></label>
                    <Input autoFocus placeholder="Approval code or bank reference" value={reference} onChange={e => setReference(e.target.value)} className="mt-2 font-mono" />
                    <p className="mt-2 text-[11px] text-[#6b7a79]">Complete the payment on the card terminal first, then confirm here.</p>
                  </>
                )}

                {method === 'credit' && (
                  <>
                    <label className="block text-xs font-semibold text-[#3b4948]">Bill to customer account <span className="text-[#ba1a1a]">*</span></label>
                    <Select autoFocus value={customerId} onChange={e => setCustomerId(e.target.value)} className="mt-2 h-11" error={!customerId}>
                      <option value="">Select a customer…</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                    {customers.length === 0 ? (
                      <p className="mt-2 text-[11px] text-[#92400e]">No customers yet — add one under <strong>Customers &amp; CRM</strong> first.</p>
                    ) : selectedCustomer ? (
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-[#e5eeff]">
                        <span className="text-[#6b7a79]">Current balance</span>
                        <span className={cn('font-semibold', selectedCustomer.outstanding_balance > 0 ? 'text-[#92400e]' : 'text-[#166534]')}>{formatCurrency(selectedCustomer.outstanding_balance)}</span>
                        <span className="text-[#6b7a79]">→ after sale</span>
                        <span className="font-bold text-[#0b1c30]">{formatCurrency(selectedCustomer.outstanding_balance + total)}</span>
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-[#6b7a79]">The sale is posted to the customer's account and tracked as a receivable.</p>
                    )}
                  </>
                )}
              </div>

              {error && (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-[#fee2e2] p-3 text-sm text-[#991b1b]">
                  <span className="material-symbols-outlined text-[18px] shrink-0">error</span>{error}
                </p>
              )}
            </div>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <div className="flex gap-2 border-t border-[#e5eeff] bg-white px-6 py-4">
              <Button variant="outline" size="lg" className="w-28" disabled={isPending} onClick={onClose}>Cancel</Button>
              <Button
                size="lg"
                className="flex-1"
                loading={isPending}
                disabled={!canConfirm}
                onClick={() => onConfirm({ method, customerId, tendered: method === 'cash' && tendered !== '' ? tenderedNum : null, provider: method === 'mobile_money' ? provider : '', reference })}
              >
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
                {method === 'credit' ? 'Post to account' : 'Confirm payment'}<span className="hidden sm:inline"> · {formatCurrency(total)}</span>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

const METHOD_LABEL: Record<PaymentMethodKey, string> = { cash: 'Cash', mobile_money: 'Mobile money', card: 'Card / bank', credit: 'Customer credit' }

/** Itemised receipt. Rendered in the success dialog and, via `print-receipt`, as the only thing on the printed page. */
function Receipt({ sale }: { sale: CompletedSale }) {
  const when = new Date(sale.date)
  return (
    <div className="print-receipt mx-auto w-full max-w-sm rounded-xl border border-[#e5eeff] bg-[#f8f9ff] px-5 py-4 font-mono text-[12px] text-[#0b1c30] print:max-w-none print:rounded-none print:border-0 print:bg-white print:px-0">
      <div className="text-center">
        <LogoMark size={28} className="mx-auto mb-1.5" />
        <p className="text-[14px] font-bold uppercase tracking-wide">{sale.orgName}</p>
        <p className="mt-1 text-[11px] text-[#6b7a79]">Receipt {sale.ref}</p>
        <p className="text-[11px] text-[#6b7a79]">{when.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} {when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
      </div>

      <div className="my-3 border-t border-dashed border-[#bacac8]" />

      <table className="w-full">
        <thead>
          <tr className="text-[10px] uppercase text-[#6b7a79]">
            <th className="pb-1 text-left font-semibold">Item</th>
            <th className="pb-1 text-right font-semibold">Qty</th>
            <th className="pb-1 text-right font-semibold">Price</th>
            <th className="pb-1 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((line, i) => (
            <tr key={`${line.sku}-${i}`} className="align-top">
              <td className="py-1 pr-2">
                <span className="block font-semibold leading-tight">{line.name}</span>
                <span className="block text-[10px] text-[#6b7a79]">{line.sku}</span>
              </td>
              <td className="py-1 text-right tabular-nums">{line.quantity}</td>
              <td className="py-1 text-right tabular-nums">{line.unitPrice.toFixed(2)}</td>
              <td className="py-1 text-right font-semibold tabular-nums">{line.lineTotal.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-3 border-t border-dashed border-[#bacac8]" />

      <div className="space-y-1 tabular-nums">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(sale.subtotal)}</span></div>
        {sale.discountAmt > 0 && <div className="flex justify-between"><span>Discount</span><span>−{formatCurrency(sale.discountAmt)}</span></div>}
        {sale.taxAmt > 0 && <div className="flex justify-between"><span>VAT included</span><span>{formatCurrency(sale.taxAmt)}</span></div>}
        <div className="flex justify-between text-[14px] font-bold"><span>TOTAL</span><span>{formatCurrency(sale.total)}</span></div>
      </div>

      <div className="my-3 border-t border-dashed border-[#bacac8]" />

      <div className="space-y-1 tabular-nums">
        <div className="flex justify-between"><span>Paid via</span><span>{METHOD_LABEL[sale.method]}</span></div>
        {sale.tendered != null && <div className="flex justify-between"><span>Tendered</span><span>{formatCurrency(sale.tendered)}</span></div>}
        {sale.method === 'cash' && sale.change > 0 && <div className="flex justify-between font-bold"><span>Change</span><span>{formatCurrency(sale.change)}</span></div>}
        {sale.reference && <div className="flex justify-between"><span>Ref</span><span className="truncate pl-2">{sale.reference}</span></div>}
        {sale.customerName && <div className="flex justify-between"><span>Customer</span><span className="truncate pl-2">{sale.customerName}</span></div>}
        <div className="flex justify-between"><span>Served by</span><span className="truncate pl-2">{sale.cashier}</span></div>
      </div>

      <p className="mt-4 text-center text-[11px] text-[#6b7a79]">Thank you for your business</p>
    </div>
  )
}
