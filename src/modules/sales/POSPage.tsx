import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore, usePOSStore } from '@/shared/stores/appStore'
import { formatCurrency, generateRef } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/FormElements'
import { Badge, Spinner } from '@/shared/components/ui/Display'
import { enqueueTransaction } from '@/shared/lib/offlineQueue'
import { cn } from '@/shared/lib/utils'
import { isDemoMode } from '@/shared/lib/supabase'; import { DEMO_CUSTOMERS, DEMO_PRODUCTS } from '@/shared/lib/demo'
import { PaymentDialog, type CompletedSale, type PaymentDetails } from './PaymentDialog'

// VAT is currently disabled. Set to e.g. 0.16 to re-enable a 16% tax line.
const TAX_RATE = 0

// UI keys -> values allowed by the sale.payment_method CHECK constraint
// (blueprint_alignment.sql: 'cash','card','bank_transfer','mobile_money','credit','split')
const PAYMENT_METHOD_DB: Record<string, 'cash' | 'card' | 'mobile_money' | 'credit'> = { cash: 'cash', card: 'card', mobile_money: 'mobile_money', credit: 'credit' }

function isNetworkError(error: { message?: string } | null | undefined) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = (error?.message ?? '').toLowerCase()
  return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed')
}

export default function POSPage() {
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const currentUser = useAppStore((s) => s.currentUser)
  const { items, addItem, removeItem, updateQty, clearCart, discount, setDiscount } = usePOSStore()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const { data: customers = [] } = useQuery({
    queryKey: ['pos-customers', orgId],
    queryFn: async () => {
      if (isDemoMode) return DEMO_CUSTOMERS.map((c) => ({ id: String(c.id), name: String(c.name), outstanding_balance: Number(c.outstanding_balance) }))
      if (!orgId) return []
      const { data } = await supabase.from('customer').select('id, name, outstanding_balance').eq('organization_id', orgId).is('deleted_at', null).order('name')
      return (data ?? []) as Array<{ id: string; name: string; outstanding_balance: number }>
    },
    enabled: !!orgId,
  })
  const queryClient = useQueryClient()

  // Organization name for the receipt header (same cache key the top bar uses)
  const { data: org } = useQuery({
    queryKey: ['org-info', orgId],
    queryFn: async () => {
      if (isDemoMode) return { name: 'Lusaka Fresh Market', logo_url: null }
      if (!orgId) return null
      const { data } = await supabase.from('organization').select('name, logo_url').eq('id', orgId).single()
      return data
    },
    enabled: !!orgId,
  })

  // Products
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', orgId],
    queryFn: async () => {
      if (isDemoMode) return DEMO_PRODUCTS
      if (!orgId) return []
      const { data } = await supabase
        .from('product')
        .select('id, sku, name, unit_price, image_url, category_id, product_category(name), stock_level(quantity)')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .is('deleted_at', null)
      return data ?? []
    },
    enabled: !!orgId,
  })

  // Categories
  const { data: categories = [] } = useQuery({
    queryKey: ['product-categories', orgId],
    queryFn: async () => {
      if (isDemoMode) return [{id:'dry-goods',name:'Dry Goods'},{id:'beverages',name:'Beverages'},{id:'fresh-produce',name:'Fresh Produce'}]
      if (!orgId) return []
      const { data } = await supabase.from('product_category').select('id, name').eq('organization_id', orgId).is('deleted_at', null)
      return data ?? []
    },
    enabled: !!orgId,
  })

  // Filtered products
  const filteredProducts = products.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
    const matchesCat = activeCategory === 'all' || p.category_id === activeCategory
    return matchesSearch && matchesCat
  })

  // Cart totals
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const discountAmt = subtotal * (discount / 100)
  const taxAmt = (subtotal - discountAmt) * TAX_RATE
  const total = subtotal - discountAmt + taxAmt

  // Checkout mutation
  const checkout = useMutation({
    mutationFn: async (details: PaymentDetails) => {
      if (!orgId || items.length === 0) throw new Error('Cart is empty')
      const { method: paymentMethod, customerId } = details
      if (paymentMethod === 'credit' && !customerId) throw new Error('Choose a customer for a credit sale')
      if (paymentMethod === 'cash' && details.tendered != null && details.tendered < total) throw new Error('Amount tendered is less than the total due')
      const change = paymentMethod === 'cash' && details.tendered != null ? details.tendered - total : 0
      const noteParts = [details.provider, details.reference && `Ref: ${details.reference}`, details.tendered != null && `Tendered: ${details.tendered.toFixed(2)} Change: ${change.toFixed(2)}`].filter(Boolean)
      const notes = noteParts.length ? noteParts.join(' · ') : null

      const ref = generateRef('SALE')
      const dbPaymentMethod = PAYMENT_METHOD_DB[paymentMethod] ?? 'cash'
      // sale.payment_status allows 'paid','pending','partial','credit','cancelled','refunded'
      const dbPaymentStatus: 'paid' | 'credit' = paymentMethod === 'credit' ? 'credit' : 'paid'
      const payload = {
        organizationId: orgId,
        branchId: null,
        referenceNumber: ref,
        customerId: customerId || null,
        cashierId: currentUser?.id ?? null,
        subtotal,
        taxAmount: taxAmt,
        discountAmount: discountAmt,
        totalAmount: total,
        paymentMethod: dbPaymentMethod,
        paymentStatus: dbPaymentStatus,
        notes,
        saleDate: new Date().toISOString(),
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: 0,
          lineTotal: i.unitPrice * i.quantity,
        })),
      }
      if (isDemoMode) {
        const sales = JSON.parse(localStorage.getItem('smartbiz-demo-sales') ?? '[]')
        localStorage.setItem('smartbiz-demo-sales', JSON.stringify([{ ...payload, ref, createdAt: new Date().toISOString() }, ...sales]))
        await new Promise((resolve) => setTimeout(resolve, 500))
        return { ref, offline: false, method: paymentMethod, change, details }
      }

      // Try online first, fall back to offline queue
      const { data: sale, error } = await supabase
        .from('sale')
        .insert({
          organization_id: orgId,
          branch_id: null,
          reference_number: ref,
          customer_id: customerId || null,
          cashier_id: currentUser?.id ?? null,
          subtotal,
          tax_amount: taxAmt,
          discount_amount: discountAmt,
          total_amount: total,
          payment_method: dbPaymentMethod,
          payment_status: dbPaymentStatus,
          notes,
          sale_date: new Date().toISOString(),
          created_by: currentUser?.id ?? null,
        })
        .select('id')
        .single()

      if (error) {
        // Only a genuine connectivity failure goes to the offline queue.
        // Anything else (constraint, permission, validation) must surface to the cashier.
        if (isNetworkError(error)) {
          await enqueueTransaction({ organizationId: orgId, branchId: null, payload })
          return { ref, offline: true, method: paymentMethod, change, details }
        }
        throw new Error(error.message)
      }

      // Insert line items
      const { error: itemsError } = await supabase.from('sale_item').insert(
        items.map((i) => ({
          organization_id: orgId,
          sale_id: sale.id,
          product_id: i.productId,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          discount_amount: 0,
          line_total: i.unitPrice * i.quantity,
        }))
      )
      if (itemsError) throw new Error(`Sale ${ref} was saved but its items failed: ${itemsError.message}`)

      // Post the sale to the customer's account: lifetime spend for any named customer,
      // and outstanding balance for credit sales (this is what the CRM profile shows).
      if (customerId) {
        const { data: cust, error: custReadError } = await supabase.from('customer').select('outstanding_balance, total_spend').eq('id', customerId).eq('organization_id', orgId).single()
        if (custReadError) throw new Error(`Sale ${ref} was saved but the customer account could not be read: ${custReadError.message}`)
        const { error: custError } = await supabase.from('customer').update({
          total_spend: Number(cust.total_spend ?? 0) + total,
          outstanding_balance: Number(cust.outstanding_balance ?? 0) + (paymentMethod === 'credit' ? total : 0),
          updated_at: new Date().toISOString(),
        }).eq('id', customerId).eq('organization_id', orgId)
        if (custError) throw new Error(`Sale ${ref} was saved but the customer account could not be updated: ${custError.message}`)
      }

      // Update stock levels
      for (const item of items) {
        const { error: stockError } = await supabase.rpc('decrement_stock', {
          p_product_id: item.productId,
          p_organization_id: orgId,
          p_quantity: item.quantity,
        })
        if (stockError) throw new Error(`Sale ${ref} was saved but stock could not be updated: ${stockError.message}`)
      }

      return { ref, offline: false, method: paymentMethod, change, details }
    },
    onError: (cause: Error) => setCheckoutError(cause.message),
    onSuccess: (result) => {
      setCheckoutError(null)
      // Snapshot the cart for the receipt before it is cleared
      setCompletedSale({
        ref: result.ref,
        date: new Date().toISOString(),
        orgName: org?.name ?? 'SmartBiz',
        cashier: currentUser?.user_metadata?.full_name ?? currentUser?.email ?? 'Cashier',
        customerName: customers.find((c) => c.id === result.details.customerId)?.name ?? null,
        items: items.map((i) => ({ name: i.name, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.unitPrice * i.quantity })),
        subtotal,
        discountAmt,
        total,
        method: result.method,
        tendered: result.details.tendered,
        change: result.change,
        reference: result.details.reference,
        offline: result.offline,
      })
      setCheckoutSuccess(result.offline ? `${result.ref} (saved offline — will sync)` : result.ref)
      clearCart()
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['products-list'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] })
      queryClient.invalidateQueries({ queryKey: ['pos-customers', orgId] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer-profile'] })
      setTimeout(() => setCheckoutSuccess(null), 4000)
    },
  })

  type StockLevel = { quantity: number }
  type ProductRow = typeof products[number]

  function getStockQty(product: ProductRow): number {
    const sl = product.stock_level as StockLevel[] | null
    if (!sl || sl.length === 0) return 0
    return sl.reduce((s, l) => s + l.quantity, 0)
  }

  /** Units still available to sell right now: on-hand stock minus what is already in the cart. */
  function getRemaining(product: ProductRow): number {
    const inCart = items.find((i) => i.productId === product.id)?.quantity ?? 0
    return Math.max(0, getStockQty(product) - inCart)
  }

  function getStockBadge(remaining: number, onHand: number) {
    if (onHand === 0) return <Badge variant="danger">Out of stock</Badge>
    if (remaining === 0) return <Badge variant="danger">All in cart</Badge>
    if (remaining <= 10) return <Badge variant="warning">Low · {remaining} left</Badge>
    return <Badge variant="success">{remaining} in stock</Badge>
  }

  /** Cap a cart quantity at the product's on-hand stock. */
  function stockFor(productId: string): number {
    const product = products.find((p) => p.id === productId)
    return product ? getStockQty(product) : Number.POSITIVE_INFINITY
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-72px)] lg:h-[calc(100vh-72px)]">
      {/* Left: Product browser */}
      <div className="flex-1 flex flex-col lg:border-r border-[#bacac8] min-w-0 min-h-[58vh] lg:min-h-0">
        {/* Header */}
        <div className="px-3 sm:px-5 py-3 border-b border-[#bacac8] flex items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products or scan barcode..."
            className="flex-1"
            startIcon={<span className="material-symbols-outlined text-[18px]">search</span>}
          />
          <button className="w-9 h-9 flex items-center justify-center border border-[#bacac8] rounded-lg text-[#6b7a79] hover:bg-[#e5eeff] transition-colors">
            <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
          </button>
        </div>

        {/* Category tabs */}
        <div className="px-3 sm:px-5 py-2 flex gap-2 overflow-x-auto border-b border-[#bacac8] shrink-0">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors',
              activeCategory === 'all'
                ? 'bg-[#006a67] text-white'
                : 'border border-[#bacac8] text-[#3b4948] hover:bg-[#e5eeff]'
            )}
          >
            All Items
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors',
                activeCategory === cat.id
                  ? 'bg-[#006a67] text-white'
                  : 'border border-[#bacac8] text-[#3b4948] hover:bg-[#e5eeff]'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="flex justify-center py-10"><Spinner size={28} /></div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filteredProducts.map((product) => {
              const onHand = getStockQty(product)
              const remaining = getRemaining(product)
              const outOfStock = remaining === 0
              return (
                <button
                  key={product.id}
                  disabled={outOfStock}
                  title={onHand === 0 ? 'No stock on hand' : remaining === 0 ? 'All available units are already in the cart' : `${remaining} available`}
                  onClick={() => addItem({
                    productId: product.id,
                    sku: product.sku,
                    name: product.name,
                    unitPrice: product.unit_price,
                    imageUrl: product.image_url,
                  })}
                  className={cn(
                    'relative text-left bg-white border border-[#bacac8] rounded-xl overflow-hidden',
                    'hover:border-[#006a67] hover:shadow-sm transition-all',
                    outOfStock && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="absolute top-2 right-2 z-10">{getStockBadge(remaining, onHand)}</div>
                  <div className="aspect-[4/3] bg-[#f8f9ff] flex items-center justify-center overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-[40px] text-[#bacac8]">inventory_2</span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-[13px] font-semibold text-[#0b1c30] line-clamp-1">{product.name}</p>
                    <p className="text-[11px] text-[#6b7a79] mb-1">SKU: {product.sku}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-bold text-[#006a67]">{formatCurrency(product.unit_price)}</span>
                      <div className="w-6 h-6 rounded-full border border-[#bacac8] flex items-center justify-center text-[#6b7a79] hover:border-[#006a67] hover:text-[#006a67] transition-colors">
                        <span className="material-symbols-outlined text-[16px]">add</span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right: Order panel */}
      <div className="w-full lg:w-80 xl:w-96 flex flex-col bg-white shrink-0 min-h-[420px] lg:min-h-0 border-t lg:border-t-0 border-[#bacac8]">
        <div className="px-5 py-4 border-b border-[#bacac8] flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-[#0b1c30]">Current Order</h3>
          {items.length > 0 && (
            <button onClick={clearCart} className="text-[12px] text-[#ba1a1a] hover:underline flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">clear_all</span>
              Clear
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
              <span className="material-symbols-outlined text-[40px] text-[#bacac8]">shopping_cart</span>
              <p className="text-[14px] font-semibold text-[#0b1c30]">Cart is empty</p>
              <p className="text-[12px] text-[#6b7a79]">Add products from the left panel</p>
            </div>
          )}
          {items.map((item) => (
            <div key={item.productId} className="flex items-center gap-3 px-5 py-3 border-b border-[#f8f9ff]">
              <div className="w-10 h-10 rounded-lg bg-[#f8f9ff] border border-[#e5eeff] flex items-center justify-center shrink-0 overflow-hidden">
                {item.imageUrl
                  ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  : <span className="material-symbols-outlined text-[20px] text-[#bacac8]">inventory_2</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#0b1c30] truncate">{item.name}</p>
                <p className="text-[11px] text-[#6b7a79]">{item.sku}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="text-[13px] font-semibold text-[#006a67]">
                  {formatCurrency(item.unitPrice * item.quantity)}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQty(item.productId, item.quantity - 1)}
                    className="w-6 h-6 rounded border border-[#bacac8] flex items-center justify-center text-[#6b7a79] hover:bg-[#e5eeff] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">remove</span>
                  </button>
                  <span className="w-8 text-center text-[13px] font-medium">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(item.productId, Math.min(item.quantity + 1, stockFor(item.productId)))}
                    disabled={item.quantity >= stockFor(item.productId)}
                    title={item.quantity >= stockFor(item.productId) ? 'No more stock available' : undefined}
                    className="w-6 h-6 rounded border border-[#bacac8] flex items-center justify-center text-[#6b7a79] hover:bg-[#e5eeff] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                  </button>
                  <button onClick={() => removeItem(item.productId)} className="w-6 h-6 ml-1 flex items-center justify-center text-[#bacac8] hover:text-[#ba1a1a] transition-colors">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Order summary */}
        <div className="px-5 py-4 border-t border-[#bacac8] space-y-2">
          {/* Discount field */}
          <div className="flex items-center gap-2 mb-3">
            <label className="text-[12px] text-[#6b7a79] shrink-0">Discount (%)</label>
            <Input
              type="number" min={0} max={100}
              value={discount || ''}
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="h-7 text-[12px]"
              placeholder="0"
            />
          </div>

          <div className="flex justify-between text-[13px] text-[#6b7a79]">
            <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-[13px] text-[#166534]">
              <span>Discount ({discount}%)</span><span>-{formatCurrency(discountAmt)}</span>
            </div>
          )}
          {TAX_RATE > 0 && (
            <div className="flex justify-between text-[13px] text-[#6b7a79]">
              <span>Tax ({Math.round(TAX_RATE * 100)}%)</span><span>{formatCurrency(taxAmt)}</span>
            </div>
          )}
          <div className="flex justify-between text-[16px] font-bold text-[#0b1c30] pt-2 border-t border-[#e5eeff]">
            <span>Total Due</span><span className="text-[#006a67]">{formatCurrency(total)}</span>
          </div>

          {checkoutSuccess && (
            <div className="flex items-center gap-2 p-2 bg-[#dcfce7] border border-[#86efac] rounded-lg">
              <span className="material-symbols-outlined text-[#166534] text-[18px]">check_circle</span>
              <p className="text-[12px] text-[#166534] font-medium">Sale {checkoutSuccess} recorded!</p>
            </div>
          )}

          <Button
            variant="primary"
            className="w-full h-11 text-[15px] font-semibold mt-1"
            disabled={items.length === 0}
            loading={checkout.isPending}
            onClick={() => { setCheckoutError(null); setCompletedSale(null); setPaymentOpen(true) }}
          >
            <span className="material-symbols-outlined text-[20px]">payments</span>
            Checkout — {formatCurrency(total)}
          </Button>
        </div>
      </div>
      <PaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        total={total}
        subtotal={subtotal}
        discountAmt={discountAmt}
        itemCount={items.reduce((n, i) => n + i.quantity, 0)}
        customers={customers}
        isPending={checkout.isPending}
        error={checkoutError}
        completed={completedSale}
        onConfirm={(details) => checkout.mutate(details)}
        onNewSale={() => { setCompletedSale(null); setPaymentOpen(false) }}
      />
    </div>
  )
}
