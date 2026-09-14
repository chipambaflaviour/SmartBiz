import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import { Badge, PageHeader, Table, Thead, Th, Tr, Td, Skeleton, EmptyState, Avatar } from '@/shared/components/ui/Display'
import { Input, Select } from '@/shared/components/ui/FormElements'
import { Button } from '@/shared/components/ui/Button'
import { isDemoMode } from '@/shared/lib/supabase'; import { DEMO_CUSTOMERS } from '@/shared/lib/demo'

export default function CustomersPage() {
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [segmentFilter, setSegmentFilter] = useState('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const { data, isLoading } = useQuery({
    queryKey: ['customers', orgId, segmentFilter, page, search],
    queryFn: async () => {
      if (isDemoMode) { const q=search.toLowerCase(); const rows=DEMO_CUSTOMERS.filter(x=>(segmentFilter==='all'||x.segment===segmentFilter)&&(!q||String(x.name).toLowerCase().includes(q)||String(x.email).toLowerCase().includes(q))); return {data:rows,count:rows.length} }
      if (!orgId) return { data: [], count: 0 }
      let query = supabase
        .from('customer')
        .select('id, name, email, phone, segment, total_spend, outstanding_balance, created_at', { count: 'exact' })
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('name')
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (segmentFilter !== 'all') query = query.eq('segment', segmentFilter)
      if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)

      const { data, count, error } = await query
      if (error) throw error
      return { data: data ?? [], count: count ?? 0 }
    },
    enabled: !!orgId,
  })

  const customers = data?.data ?? []
  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE)

  const segmentVariant: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
    retail: 'default', wholesale: 'info', corporate: 'warning', vip: 'success',
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Manage your customer relationships and accounts."
        breadcrumb={[{ label: 'CRM' }, { label: 'Customers' }]}
        actions={
          <Button variant="primary" onClick={() => navigate('/app/crm/customers/new')}>
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Add Customer
          </Button>
        }
      />

      <div className="px-6">
        <div className="flex gap-3 mb-4 flex-wrap">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by name or email..."
            className="w-56"
            startIcon={<span className="material-symbols-outlined text-[18px]">search</span>}
          />
          <Select value={segmentFilter} onChange={(e) => { setSegmentFilter(e.target.value); setPage(1) }} className="w-40">
            <option value="all">All Segments</option>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
            <option value="corporate">Corporate</option>
            <option value="vip">VIP</option>
          </Select>
        </div>

        <div className="bg-white border border-[#bacac8] rounded-xl overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Customer</Th>
                <Th>Email</Th>
                <Th>Segment</Th>
                <Th>Total Spend</Th>
                <Th>Outstanding</Th>
                <Th>Since</Th>
              </tr>
            </Thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <Tr key={i}>{Array.from({ length: 6 }).map((_, j) => <Td key={j}><Skeleton className="h-4 w-24" /></Td>)}</Tr>
              ))}
              {!isLoading && customers.length === 0 && (
                <Tr><Td colSpan={6}>
                  <EmptyState icon="groups" title="No customers found" description="Add your first customer to start tracking sales, invoices and credit." action={<Button variant="primary" onClick={() => navigate('/app/crm/customers/new')}>Add Customer</Button>} />
                </Td></Tr>
              )}
              {customers.map((c) => (
                <Tr key={c.id} onClick={() => navigate(`/app/crm/customers/${c.id}`)}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Avatar name={c.name} size="sm" />
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </Td>
                  <Td className="text-[#6b7a79]">{c.email ?? '—'}</Td>
                  <Td>
                    {c.segment && (
                      <Badge variant={segmentVariant[c.segment] ?? 'default'}>
                        {c.segment.charAt(0).toUpperCase() + c.segment.slice(1)}
                      </Badge>
                    )}
                  </Td>
                  <Td className="font-semibold">{formatCurrency(c.total_spend)}</Td>
                  <Td>
                    <span className={c.outstanding_balance > 0 ? 'text-[#dc2626] font-semibold' : 'text-[#6b7a79]'}>
                      {formatCurrency(c.outstanding_balance)}
                    </span>
                  </Td>
                  <Td className="text-[#6b7a79]">{formatDate(c.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#bacac8]">
              <p className="text-[13px] text-[#6b7a79]">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.count ?? 0)} of {data?.count ?? 0} customers
              </p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                </Button>
                <Button size="sm" variant="primary">{page}</Button>
                <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
