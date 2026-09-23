import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import { Badge, PageHeader, Table, Thead, Th, Tr, Td, Skeleton, EmptyState, Avatar } from '@/shared/components/ui/Display'
import { Input, Select } from '@/shared/components/ui/FormElements'
import { Button } from '@/shared/components/ui/Button'
import { isDemoMode } from '@/shared/lib/supabase'; import { DEMO_PRODUCTS } from '@/shared/lib/demo'
import { usePreviewPermission } from '@/shared/hooks/usePreviewPermission'

export default function ProductsPage() {
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const activeBranchId = useAppStore((s) => s.activeBranchId)
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20
  const canCreate = usePreviewPermission('inventory', 'create')

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

  const { data, isLoading } = useQuery({
    queryKey: ['products-list', orgId, activeBranchId, categoryFilter, page, search],
    queryFn: async () => {
      if (isDemoMode) { const q=search.toLowerCase(); const rows=DEMO_PRODUCTS.filter(p=>(categoryFilter==='all'||p.category_id===categoryFilter)&&(!q||String(p.name).toLowerCase().includes(q)||String(p.sku).toLowerCase().includes(q))); return {data:rows,count:rows.length} }
      if (!orgId) return { data: [], count: 0 }
      let query = supabase
        .from('product')
        .select(
          'id, sku, name, unit_price, image_url, is_active, category_id, product_category(name), stock_level(quantity, warehouse(name,branch_id))',
          { count: 'exact' }
        )
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('name')
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (categoryFilter !== 'all') query = query.eq('category_id', categoryFilter)
      if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)

      const { data, count, error } = await query
      if (error) throw error
      return { data: data ?? [], count: count ?? 0 }
    },
    enabled: !!orgId,
  })

  const products = data?.data ?? []
  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE)

  type StockLevelEntry = { quantity: number; warehouse: { name: string; branch_id: string | null } | null }

  function getTotalStock(sl: StockLevelEntry[] | null): number {
    if (!sl) return 0
    return sl.filter((level) => !activeBranchId || level.warehouse?.branch_id === activeBranchId).reduce((s, l) => s + l.quantity, 0)
  }

  function getStockBadge(qty: number) {
    if (qty === 0) return <Badge variant="danger">Out of Stock</Badge>
    if (qty <= 10) return <Badge variant="warning">Low Stock</Badge>
    return <Badge variant="success">Available</Badge>
  }

  return (
    <div>
      <PageHeader
        title="Product Catalog"
        subtitle={`Manage ${data?.count ?? 0} products across all locations.`}
        breadcrumb={[{ label: 'Inventory' }, { label: 'Products' }]}
        actions={
          <>
            <Button variant="outline">
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export
            </Button>
            <Button variant="outline">
              <span className="material-symbols-outlined text-[18px]">upload</span>
              Import CSV
            </Button>
            {canCreate && <Button variant="primary" onClick={() => navigate('/app/inventory/products/new')}>
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add Product
            </Button>}
          </>
        }
      />

      <div className="px-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by name or SKU..."
            className="w-56"
            startIcon={<span className="material-symbols-outlined text-[18px]">search</span>}
          />
          <Select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }} className="w-44">
            <option value="all">Category: All</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-36">
            <option value="all">Status: All</option>
            <option value="available">Available</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </Select>
          <Button variant="outline" size="md">
            <span className="material-symbols-outlined text-[18px]">tune</span>
            Advanced Filters
          </Button>
        </div>

        <div className="bg-white border border-[#bacac8] rounded-xl overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th><input type="checkbox" className="accent-[#006a67]" /></Th>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th>Warehouse</Th>
                <Th>Quantity</Th>
                <Th>Status</Th>
                <Th>Price</Th>
                <Th></Th>
              </tr>
            </Thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <Tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <Td key={j}><Skeleton className="h-4 w-20" /></Td>
                  ))}
                </Tr>
              ))}
              {!isLoading && products.length === 0 && (
                <Tr><Td colSpan={8}>
                  <EmptyState icon="inventory_2" title="No products found" description="Try adjusting your filters or add a new product." />
                </Td></Tr>
              )}
              {products.map((p) => {
                const sl = p.stock_level as unknown as StockLevelEntry[] | null
                const totalQty = getTotalStock(sl)
                const cat = p.product_category as unknown as { name: string } | null
                const warehouse = sl?.[0]?.warehouse?.name ?? 'Main Warehouse'
                return (
                  <Tr key={p.id} onClick={() => navigate(`/app/inventory/products/${p.id}`)}>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="accent-[#006a67]" />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#f8f9ff] border border-[#e5eeff] flex items-center justify-center overflow-hidden shrink-0">
                          {p.image_url
                            ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                            : <span className="material-symbols-outlined text-[20px] text-[#bacac8]">inventory_2</span>
                          }
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-[#0b1c30]">{p.name}</p>
                          <p className="text-[11px] text-[#6b7a79]">SKU: {p.sku}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-[#6b7a79]">{cat?.name ?? '—'}</Td>
                    <Td className="text-[#6b7a79]">{warehouse}</Td>
                    <Td className="font-semibold">{totalQty}</Td>
                    <Td>{getStockBadge(totalQty)}</Td>
                    <Td className="font-semibold">{formatCurrency(p.unit_price)}</Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon">
                        <span className="material-symbols-outlined text-[18px]">more_vert</span>
                      </Button>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>

          {/* Summary row */}
          {!isLoading && products.length > 0 && (
            <div className="px-4 py-3 bg-[#f8f9ff] border-t border-[#bacac8] flex items-center justify-between">
              <p className="text-[13px] text-[#6b7a79]">
                Rows per page: <select className="mx-1 text-[#0b1c30] font-medium bg-transparent border-none focus:outline-none"><option>20</option><option>50</option></select>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.count ?? 0)} of {data?.count ?? 0} products
              </p>
              <div className="flex gap-1">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="w-8 h-8 flex items-center justify-center rounded border border-[#bacac8] text-[#6b7a79] disabled:opacity-30 hover:bg-[#e5eeff]"
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded bg-[#006a67] text-white text-[12px] font-semibold">{page}</button>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="w-8 h-8 flex items-center justify-center rounded border border-[#bacac8] text-[#6b7a79] disabled:opacity-30 hover:bg-[#e5eeff]"
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
