import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isDemoMode, supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { Button } from '@/shared/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/shared/components/ui/FormElements'
import { Card, PageHeader } from '@/shared/components/ui/Display'
import { cn, formatCurrency, friendlyDbError } from '@/shared/lib/utils'

interface ProductForm {
  name: string
  sku: string
  barcode: string
  category_id: string
  description: string
  unit_price: string
  cost_price: string
  reorder_level: string
  image_url: string
  is_active: boolean
  base_unit: string
  pack_unit: string
  units_per_pack: string
  pack_price: string
}

/** quantity on hand per warehouse id (string for controlled inputs) */
type StockMap = Record<string, string>

type FieldErrors = Partial<Record<keyof ProductForm, string>>

const initial: ProductForm = {
  name: '', sku: '', barcode: '', category_id: '', description: '',
  unit_price: '', cost_price: '', reorder_level: '10', image_url: '', is_active: true,
  base_unit: 'piece', pack_unit: '', units_per_pack: '', pack_price: '',
}

/** Suggest a SKU from the product name, e.g. "Coca-Cola 500ml" → "COC-COL-4F2A" */
export function suggestSku(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const base = words.slice(0, 2).map(w => w.slice(0, 3)).join('-') || 'PRD'
  const rand = Math.random().toString(16).slice(2, 6).toUpperCase()
  return `${base}-${rand}`
}

export function validate(form: ProductForm, stock: StockMap): FieldErrors & { stock?: string } {
  const errors: FieldErrors = {}
  if (!form.name.trim()) errors.name = 'Product name is required'
  if (!form.sku.trim()) errors.sku = 'SKU is required'
  const price = Number(form.unit_price)
  if (form.unit_price === '' || Number.isNaN(price) || price < 0) errors.unit_price = 'Enter a valid selling price'
  if (form.cost_price !== '' && (Number.isNaN(Number(form.cost_price)) || Number(form.cost_price) < 0)) errors.cost_price = 'Enter a valid cost price'
  if (form.pack_unit && (!Number.isFinite(Number(form.units_per_pack)) || Number(form.units_per_pack) <= 1)) errors.units_per_pack = 'Enter how many base units are in one pack'
  if (form.pack_unit && (form.pack_price.trim() === '' || !Number.isFinite(Number(form.pack_price)) || Number(form.pack_price) <= 0)) errors.pack_price = 'Enter the selling price for one pack'
  const reorder = Number(form.reorder_level)
  if (form.reorder_level === '' || !Number.isInteger(reorder) || reorder < 0) errors.reorder_level = 'Enter a whole number'
  const badStock = Object.values(stock).some(v => v !== '' && (Number.isNaN(Number(v)) || Number(v) < 0))
  if (badStock) (errors as { stock?: string }).stock = 'Stock quantities must be zero or more'
  return errors
}

export default function ProductEditorPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const orgId = useAppStore(s => s.activeOrganizationId)
  const activeBranchId = useAppStore(s => s.activeBranchId)
  const currentUser = useAppStore(s => s.currentUser)
  const accessPreview = useAppStore(s => s.accessPreview)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ProductForm>(initial)
  const [errors, setErrors] = useState<FieldErrors & { stock?: string }>({})
  const [stock, setStock] = useState<StockMap>({})
  // Used only when the organization has no warehouse yet (see save mutation).
  const [pendingQuantity, setPendingQuantity] = useState('')
  const setQty = (warehouseId: string, value: string) => {
    setStock(m => ({ ...m, [warehouseId]: value }))
    if (errors.stock) setErrors(e => ({ ...e, stock: undefined }))
  }
  const [submitError, setSubmitError] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [changeReason, setChangeReason] = useState('')

  const { data: membershipRole = 'member', isLoading: roleLoading } = useQuery({
    queryKey: ['product-editor-role', orgId, currentUser?.id],
    queryFn: async () => {
      if (isDemoMode) return 'owner'
      const { data } = await supabase.from('user_organization').select('role').eq('organization_id', orgId!).eq('user_id', currentUser!.id).eq('is_active', true).maybeSingle()
      return data?.role ?? 'member'
    },
    enabled: !!orgId && !!currentUser?.id,
  })
  const isPlatformAdmin = useAppStore(s => s.isPlatformAdmin)
  const canAdministerProducts = accessPreview ? accessPreview.role === 'owner' || accessPreview.role === 'admin' : isPlatformAdmin || membershipRole === 'owner' || membershipRole === 'admin'
  const effectiveRequesterId = accessPreview?.userId ?? currentUser?.id

  const { data: approverId } = useQuery({
    queryKey: ['product-approval-admin', orgId, currentUser?.id, isPlatformAdmin],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_organization').select('user_id').eq('organization_id', orgId!).eq('is_active', true).in('role', ['owner', 'admin']).limit(1).maybeSingle()
      if (error) throw error
      return data?.user_id ?? (isPlatformAdmin ? currentUser?.id : null) ?? null
    },
    enabled: editing && !!orgId && !canAdministerProducts,
  })

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  const { data: categories = [] } = useQuery({
    queryKey: ['product-categories', orgId],
    queryFn: async () => (await supabase.from('product_category').select('id, name').eq('organization_id', orgId!).is('deleted_at', null).order('name')).data ?? [],
    enabled: !!orgId,
  })

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses', orgId, activeBranchId],
    queryFn: async () => {
      let query = supabase.from('warehouse').select('id, name, is_default, branch_id').eq('organization_id', orgId!).is('deleted_at', null).order('name')
      if (activeBranchId) query = query.eq('branch_id', activeBranchId)
      return (await query).data ?? []
    },
    enabled: !!orgId,
  })

  const { data: product, isLoading: loadingProduct } = useQuery({
    queryKey: ['product-detail', orgId, id],
    queryFn: async () => {
      const { data, error } = await supabase.from('product').select('*').eq('organization_id', orgId!).eq('id', id!).single()
      if (error) throw error
      return data
    },
    enabled: editing && !!orgId,
  })

  const { data: existingStock = [] } = useQuery({
    queryKey: ['product-stock', orgId, activeBranchId, id],
    queryFn: async () => {
      const warehouseIds = warehouses.map((warehouse) => warehouse.id)
      if (activeBranchId && warehouseIds.length === 0) return []
      let query = supabase.from('stock_level').select('warehouse_id, quantity').eq('organization_id', orgId!).eq('product_id', id!)
      if (activeBranchId) query = query.in('warehouse_id', warehouseIds)
      return (await query).data ?? []
    },
    enabled: editing && !!orgId && (!activeBranchId || warehouses.length > 0),
  })

  const totalOnHand = warehouses.length === 0
    ? Number(pendingQuantity) || 0
    : Object.values(stock).reduce((sum, v) => sum + (Number(v) || 0), 0)

  useEffect(() => {
    if (!editing) return
    setStock(Object.fromEntries(existingStock.map(r => [r.warehouse_id, String(r.quantity)])))
  }, [existingStock, editing])

  useEffect(() => {
    if (!product) return
    setForm({
      name: product.name ?? '', sku: product.sku ?? '', barcode: product.barcode ?? '',
      category_id: product.category_id ?? '', description: product.description ?? '',
      unit_price: product.unit_price == null ? '' : String(product.unit_price),
      cost_price: product.cost_price == null ? '' : String(product.cost_price),
      reorder_level: String(product.reorder_level ?? 10), image_url: product.image_url ?? '',
      is_active: product.is_active ?? true,
      base_unit: product.base_unit ?? 'piece', pack_unit: product.pack_unit ?? '',
      units_per_pack: product.units_per_pack == null ? '' : String(product.units_per_pack),
      pack_price: product.pack_price == null ? '' : String(product.pack_price),
    })
  }, [product])

  const createCategory = useMutation({
    mutationFn: async () => {
      const name = newCategory.trim()
      if (!name) throw new Error('Category name is required')
      const { data, error } = await supabase.from('product_category').insert({ organization_id: orgId, name }).select('id, name').single()
      if (error) throw error
      return data
    },
    onSuccess: (cat) => {
      queryClient.invalidateQueries({ queryKey: ['product-categories', orgId] })
      set('category_id', cat.id)
      setNewCategory('')
      setShowNewCategory(false)
    },
    onError: (cause: Error) => setSubmitError(friendlyDbError(cause, 'products')),
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No organization selected')
      if (editing && roleLoading) throw new Error('Your permissions are still loading. Try again in a moment.')
      if (editing && !changeReason.trim()) throw new Error('Explain why this product needs to be changed.')
      let imageUrl = form.image_url.trim() || null
      if (imageFile) {
        if (!imageFile.type.startsWith('image/')) throw new Error('Choose a valid image file.')
        if (imageFile.size > 5 * 1024 * 1024) throw new Error('Product images must be 5 MB or smaller.')
        const extension = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `${orgId}/${id ?? crypto.randomUUID()}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from('product-images').upload(path, imageFile, { contentType: imageFile.type, upsert: false })
        if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`)
        imageUrl = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
      }
      const payload = {
        organization_id: orgId,
        name: form.name.trim(),
        sku: form.sku.trim().toUpperCase(),
        barcode: form.barcode.trim() || null,
        category_id: form.category_id || null,
        description: form.description.trim() || null,
        unit_price: Number(form.unit_price),
        cost_price: form.cost_price === '' ? null : Number(form.cost_price),
        reorder_level: Number(form.reorder_level),
        image_url: imageUrl,
        is_active: form.is_active,
        base_unit: form.base_unit,
        pack_unit: form.pack_unit || null,
        units_per_pack: form.pack_unit ? Number(form.units_per_pack) : null,
        pack_price: form.pack_unit && form.pack_price.trim() !== '' ? Number(form.pack_price) : null,
        updated_by: currentUser?.id ?? null,
        updated_at: new Date().toISOString(),
      }

      if (editing && !canAdministerProducts) {
        if (!approverId) throw new Error('No organization owner or administrator is available to approve this change.')
        const { error } = await supabase.from('approval_request').insert({
          organization_id: orgId,
          module: 'inventory',
          reference_type: 'product',
          reference_id: id,
          title: `Edit product: ${product?.name ?? form.name}`,
          description: changeReason.trim(),
          requester_id: effectiveRequesterId,
          approver_id: approverId,
          status: 'pending',
          action: 'update',
          requested_changes: payload,
        })
        if (error) throw error
        return { productId: id!, approvalRequested: true }
      }

      const result = editing
        ? await supabase.from('product').update(payload).eq('id', id!).eq('organization_id', orgId).select('id').single()
        : await supabase.from('product').insert({ ...payload, created_by: currentUser?.id ?? null }).select('id').single()

      if (result.error) {
        if (result.error.code === '23505') throw new Error(`SKU "${payload.sku}" is already used by another product`)
        throw result.error
      }

      // Write stock on hand for every warehouse the user touched.
      const productId = result.data.id
      let targets = warehouses
      const entries = Object.entries(stock).filter(([, v]) => v !== '')
      if (entries.length === 0 && pendingQuantity !== '' && Number(pendingQuantity) > 0) {
        if (!activeBranchId) throw new Error('Select a branch before creating its default warehouse and opening stock.')
        // No warehouse existed when the form loaded: create the default one now.
        const { data: created, error: whError } = await supabase.from('warehouse')
          .insert({ organization_id: orgId, branch_id: activeBranchId, name: 'Main Warehouse', code: `MAIN-${activeBranchId.slice(0, 6).toUpperCase()}`, is_default: true })
          .select('id, name, is_default, branch_id').single()
        if (whError) throw new Error(`Product saved, but no warehouse exists to hold stock and one could not be created: ${whError.message}`)
        targets = [created]
        entries.push([created.id, pendingQuantity])
      }
      for (const [warehouseId, value] of entries) {
        if (!targets.some(w => w.id === warehouseId)) continue
        const qty = Number(value)
        const wasExisting = existingStock.some(r => r.warehouse_id === warehouseId)
        if (!editing && qty === 0) continue
        if (editing && !wasExisting && qty === 0) continue
        const { error: rpcError } = await supabase.rpc('set_stock_level', {
          p_organization_id: orgId, p_product_id: productId, p_warehouse_id: warehouseId, p_quantity: qty,
        })
        if (rpcError) {
          // Fallback for databases where default_warehouse.sql has not been applied yet.
          if (rpcError.code !== 'PGRST202') throw new Error(`Product saved, but stock could not be updated: ${rpcError.message}`)
          const { error: upsertError } = await supabase.from('stock_level')
            .upsert({ organization_id: orgId, product_id: productId, warehouse_id: warehouseId, quantity: qty, updated_at: new Date().toISOString() }, { onConflict: 'product_id,warehouse_id' })
          if (upsertError) throw new Error(`Product saved, but stock could not be updated: ${upsertError.message}`)
        }
      }
      if (editing) await supabase.from('audit_log').insert({ organization_id: orgId, user_id: currentUser?.id, module: 'inventory', action: 'PRODUCT_UPDATED', entity_type: 'product', entity_id: result.data.id, metadata: { reason: changeReason.trim() } })
      return { productId: result.data.id, approvalRequested: false }
    },
    onSuccess: ({ productId, approvalRequested }) => {
      queryClient.invalidateQueries({ queryKey: ['products-list'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['product-detail', orgId, productId] })
      queryClient.invalidateQueries({ queryKey: ['product-stock', orgId, productId] })
      queryClient.invalidateQueries({ queryKey: ['warehouses', orgId] })
      navigate(`/app/inventory/products/${productId}`, { state: approvalRequested ? { notice: 'Your product change was sent to an administrator for approval.' } : undefined })
    },
    onError: (cause: Error) => setSubmitError(friendlyDbError(cause, 'products')),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitError('')
    const next = validate(form, stock)
    setErrors(next)
    if (Object.keys(next).length === 0) save.mutate()
  }

  const price = Number(form.unit_price) || 0
  const cost = Number(form.cost_price) || 0
  const margin = price > 0 && form.cost_price !== '' ? ((price - cost) / price) * 100 : null
  const backHref = editing ? `/app/inventory/products/${id}` : '/app/inventory/products'

  if (editing && loadingProduct) return <div className="p-6 text-sm text-[#6b7a79]">Loading product…</div>

  return (
    <div>
      <PageHeader
        title={editing ? 'Edit Product' : 'Add Product'}
        subtitle={editing ? 'Update catalogue details, pricing and reorder settings.' : 'Add a new item to your catalogue and set its opening stock.'}
        breadcrumb={[{ label: 'Inventory' }, { label: 'Products' }, { label: editing ? 'Edit' : 'New' }]}
      />

      <form onSubmit={submit} noValidate className="mx-auto max-w-5xl px-4 sm:px-6 pb-10">
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-5">
            <Card>
              <h2 className="font-bold">Product details</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <FormField label="Product name" required error={errors.name} className="sm:col-span-2">
                  <Input
                    autoFocus
                    placeholder="e.g. Coca-Cola 500ml"
                    value={form.name}
                    error={!!errors.name}
                    onChange={e => set('name', e.target.value)}
                  />
                </FormField>

                <FormField label="SKU" required error={errors.sku} hint={editing ? undefined : 'Unique code used for lookups and barcodes.'}>
                  <div className="flex gap-2">
                    <Input
                      placeholder="COC-500-A1B2"
                      value={form.sku}
                      error={!!errors.sku}
                      className="font-mono uppercase"
                      onChange={e => set('sku', e.target.value)}
                    />
                    {!editing && (
                      <Button type="button" variant="outline" onClick={() => set('sku', suggestSku(form.name))} title="Generate SKU from name">
                        <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                      </Button>
                    )}
                  </div>
                </FormField>

                <FormField label="Barcode" hint="EAN / UPC, optional">
                  <Input placeholder="5449000000996" value={form.barcode} className="font-mono" onChange={e => set('barcode', e.target.value)} />
                </FormField>

                <FormField label="Category" className="sm:col-span-2">
                  {showNewCategory ? (
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        placeholder="New category name"
                        value={newCategory}
                        onChange={e => setNewCategory(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createCategory.mutate() } }}
                      />
                      <Button type="button" onClick={() => createCategory.mutate()} loading={createCategory.isPending}>Add</Button>
                      <Button type="button" variant="ghost" onClick={() => { setShowNewCategory(false); setNewCategory('') }}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Select value={form.category_id} onChange={e => set('category_id', e.target.value)}>
                        <option value="">Uncategorised</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                      <Button type="button" variant="outline" onClick={() => setShowNewCategory(true)} className="shrink-0">
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        New
                      </Button>
                    </div>
                  )}
                </FormField>

                <FormField label="Description" className="sm:col-span-2">
                  <Textarea placeholder="Optional notes shown on the product page" value={form.description} onChange={e => set('description', e.target.value)} />
                </FormField>

                <FormField label="Product image (optional)" className="sm:col-span-2" hint="JPG, PNG, WebP or GIF. Maximum 5 MB.">
                  <div className="flex flex-wrap items-center gap-3">
                    {(imageFile || form.image_url) && <img src={imageFile ? URL.createObjectURL(imageFile) : form.image_url} alt="Product preview" className="h-20 w-20 rounded-xl border border-[#d7e0ed] object-cover" />}
                    <Input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => setImageFile(e.target.files?.[0] ?? null)} className="h-auto max-w-md py-2" />
                    {(imageFile || form.image_url) && <Button type="button" variant="ghost" size="sm" onClick={() => { setImageFile(null); set('image_url', '') }}>Remove image</Button>}
                  </div>
                </FormField>
              </div>
            </Card>

            <Card>
              <h2 className="font-bold">Pricing</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <FormField label="Selling price (ZMW)" required error={errors.unit_price}>
                  <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={form.unit_price} error={!!errors.unit_price} onChange={e => set('unit_price', e.target.value)} />
                </FormField>
                <FormField label="Cost price (ZMW)" error={errors.cost_price}>
                  <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={form.cost_price} error={!!errors.cost_price} onChange={e => set('cost_price', e.target.value)} />
                </FormField>
                <FormField label="Gross margin">
                  <div className="h-9 flex items-center px-3 rounded border border-dashed border-[#bacac8] bg-[#eff4ff] text-[14px]">
                    {margin == null ? <span className="text-[#6b7a79]">—</span> : (
                      <span className={margin < 0 ? 'text-[#991b1b] font-semibold' : 'text-[#166534] font-semibold'}>
                        {margin.toFixed(1)}% <span className="font-normal text-[#6b7a79]">({formatCurrency(price - cost)})</span>
                      </span>
                    )}
                  </div>
                </FormField>
              </div>
            </Card>

            <Card>
              <h2 className="font-bold">Selling units and packaging</h2>
              <p className="mt-1 text-xs text-[#6b7a79]">Track stock in the smallest unit, then optionally sell complete packs, boxes or bags. Example: bottle + pack of 30 bottles.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <FormField label="Smallest stock unit" required hint="The unit deducted from stock for retail sales.">
                  <Select value={form.base_unit} onChange={e => set('base_unit', e.target.value)}><option value="piece">Piece</option><option value="bottle">Bottle</option><option value="can">Can</option><option value="sachet">Sachet</option><option value="kg">Kilogram (kg)</option><option value="litre">Litre</option><option value="metre">Metre</option></Select>
                </FormField>
                <FormField label="Wholesale package" hint="Optional">
                  <Select value={form.pack_unit} onChange={e => { set('pack_unit', e.target.value); if (!e.target.value) { set('units_per_pack', ''); set('pack_price', '') } }}><option value="">No package</option><option value="pack">Pack</option><option value="box">Box</option><option value="bag">Bag</option><option value="carton">Carton</option><option value="crate">Crate</option></Select>
                </FormField>
                {form.pack_unit && <><FormField label={`Units in one ${form.pack_unit}`} required error={errors.units_per_pack} hint={`Example: 30 ${form.base_unit}s`}><Input type="number" min="2" step="1" value={form.units_per_pack} error={!!errors.units_per_pack} onChange={e => set('units_per_pack', e.target.value)} /></FormField><FormField label={`${form.pack_unit} selling price (ZMW)`} required error={errors.pack_price}><Input type="number" min="0" step="0.01" value={form.pack_price} error={!!errors.pack_price} onChange={e => set('pack_price', e.target.value)} /></FormField></>}
              </div>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-bold">Stock on hand</h2>
                  <p className="text-xs text-[#6b7a79] mt-1">
                    {editing ? 'Set the quantity currently held in each warehouse.' : 'Enter the quantity you have right now. You can leave it at 0 and receive stock later.'}
                  </p>
                </div>
                <div className={cn('shrink-0 rounded-lg px-3 py-1.5 text-right', totalOnHand > 0 ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[#991b1b]')}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Total</p>
                  <p className="text-lg font-bold leading-tight">{totalOnHand} <span className="text-xs font-medium">units</span></p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {warehouses.length === 0 ? (
                  <FormField label="Quantity in stock" hint="Your organization has no warehouse yet — a “Main Warehouse” will be created automatically when you save.">
                    <Input type="number" inputMode="decimal" min="0" step="1" placeholder="0" className="max-w-xs" value={pendingQuantity} onChange={e => setPendingQuantity(e.target.value)} />
                  </FormField>
                ) : warehouses.map(w => (
                  <div key={w.id} className="flex items-center gap-3 rounded-lg border border-[#e5eeff] bg-[#f8f9ff] px-3 py-2">
                    <span className="material-symbols-outlined text-[#006a67] text-[20px]">warehouse</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{w.name}</p>
                      {w.is_default && <p className="text-[11px] text-[#6b7a79]">Default warehouse</p>}
                    </div>
                    <Input
                      type="number" inputMode="decimal" min="0" step="1" placeholder="0"
                      aria-label={`Quantity in ${w.name}`}
                      className="w-32 text-right"
                      value={stock[w.id] ?? ''}
                      onChange={e => setQty(w.id, e.target.value)}
                    />
                    <span className="text-xs text-[#6b7a79] w-8">units</span>
                  </div>
                ))}
                {errors.stock && <p className="text-[12px] text-[#ba1a1a]">{errors.stock}</p>}
              </div>
            </Card>
          </div>

          {/* Side column */}
          <div className="space-y-5">
            <Card>
              <h2 className="font-bold">Reorder</h2>
              <div className="mt-4">
                <FormField label="Reorder level" required error={errors.reorder_level} hint="You'll be alerted when stock falls to this level.">
                  <Input type="number" inputMode="numeric" min="0" step="1" value={form.reorder_level} error={!!errors.reorder_level} onChange={e => set('reorder_level', e.target.value)} />
                </FormField>
              </div>
            </Card>

            <Card>
              <h2 className="font-bold">Status</h2>
              <label className="mt-4 flex cursor-pointer items-start gap-3">
                <input className="mt-1 h-4 w-4 accent-[#007f7a]" type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
                <span>
                  <span className="block text-sm font-semibold">Active</span>
                  <span className="block text-xs text-[#6b7a79]">Inactive products are hidden from POS and sales.</span>
                </span>
              </label>
            </Card>
          </div>
        </div>

        {submitError && (
          <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
            {submitError}
          </p>
        )}

        {editing && <Card className="mt-5"><FormField label={canAdministerProducts ? 'Reason for editing' : 'Reason for approval request'} required hint={canAdministerProducts ? 'Saved in the audit log.' : 'The product will not change until an owner or administrator approves this request.'}><Textarea value={changeReason} onChange={e=>setChangeReason(e.target.value)} placeholder="Explain what needs to change and why" /></FormField></Card>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(backHref)}>Cancel</Button>
          <Button type="submit" loading={save.isPending || (editing && roleLoading)}>{editing ? canAdministerProducts ? 'Save changes' : 'Request approval' : 'Create product'}</Button>
        </div>
      </form>
    </div>
  )
}
