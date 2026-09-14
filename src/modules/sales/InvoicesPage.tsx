import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import { Badge, PageHeader, Table, Thead, Th, Tr, Td, Skeleton, EmptyState, Avatar } from '@/shared/components/ui/Display'
import { Input, Select } from '@/shared/components/ui/FormElements'
import { Button } from '@/shared/components/ui/Button'
import { isDemoMode } from '@/shared/lib/supabase'; import { DEMO_INVOICES } from '@/shared/lib/demo'

const STATUS_OPTIONS = ['all', 'pending', 'paid', 'overdue', 'draft', 'cancelled']

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'outline'> = {
  paid: 'success', pending: 'warning', overdue: 'danger', draft: 'outline', cancelled: 'outline',
}

export default function InvoicesPage() {
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', orgId, statusFilter, page],
    queryFn: async () => {
      if (isDemoMode) { const rows=DEMO_INVOICES.filter(x=>statusFilter==='all'||x.status===statusFilter); return {data:rows,count:rows.length} }
      if (!orgId) return { data: [], count: 0 }
      let query = supabase
        .from('invoice')
        .select('id, invoice_number, issue_date, due_date, total_amount, status, customer(id, name)', { count: 'exact' })
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('issue_date', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      const { data, count, error } = await query
      if (error) throw error
      return { data: data ?? [], count: count ?? 0 }
    },
    enabled: !!orgId,
  })

  const invoices = (data?.data ?? []).filter((inv) => {
    if (!search) return true
    const cust = inv.customer as unknown as { name: string } | null
    return (
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      cust?.name.toLowerCase().includes(search.toLowerCase())
    )
  })

  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE)

  return (
    <div>
      <PageHeader
        title="Invoice Management"
        subtitle="Review and manage your enterprise billing records."
        breadcrumb={[{ label: 'Sales' }, { label: 'Invoices' }]}
        actions={
          <Button variant="primary" onClick={() => navigate('/app/sales/invoices/new')}>
            <span className="material-symbols-outlined text-[18px]">add</span>
            Create New Invoice
          </Button>
        }
      />

      <div className="px-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoices..."
            className="w-56"
            startIcon={<span className="material-symbols-outlined text-[18px]">search</span>}
          />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </Select>
          <Button variant="outline" size="md">
            <span className="material-symbols-outlined text-[18px]">filter_list</span>
            Advanced Filters
          </Button>
        </div>

        {/* Table */}
        <div className="bg-white border border-[#bacac8] rounded-xl overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Invoice #</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </Thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <Tr key={i}>
                  <Td><Skeleton className="h-4 w-24" /></Td>
                  <Td><Skeleton className="h-4 w-20" /></Td>
                  <Td><Skeleton className="h-4 w-32" /></Td>
                  <Td><Skeleton className="h-4 w-20" /></Td>
                  <Td><Skeleton className="h-4 w-16" /></Td>
                  <Td><Skeleton className="h-4 w-16" /></Td>
                </Tr>
              ))}
              {!isLoading && invoices.length === 0 && (
                <Tr>
                  <Td colSpan={6}>
                    <EmptyState icon="receipt_long" title="No invoices found" description="Adjust your filters or create a new invoice." />
                  </Td>
                </Tr>
              )}
              {invoices.map((inv) => {
                const cust = inv.customer as unknown as { id: string; name: string } | null
                return (
                  <Tr key={inv.id} onClick={() => navigate(`/app/sales/invoices/${inv.id}`)}>
                    <Td>
                      <span className="text-[#006a67] font-semibold hover:underline">#{inv.invoice_number}</span>
                    </Td>
                    <Td className="text-[#6b7a79]">{formatDate(inv.issue_date)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Avatar name={cust?.name ?? 'Unknown'} size="xs" />
                        <span>{cust?.name ?? '—'}</span>
                      </div>
                    </Td>
                    <Td className="font-semibold">{formatCurrency(inv.total_amount)}</Td>
                    <Td>
                      <Badge variant={statusVariant[inv.status] ?? 'outline'}>
                        {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                      </Badge>
                    </Td>
                    <Td>
                      <Button variant="ghost" size="sm">
                        <span className="material-symbols-outlined text-[16px]">more_horiz</span>
                      </Button>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#bacac8]">
              <p className="text-[13px] text-[#6b7a79]">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.count ?? 0)} of {data?.count ?? 0} invoices
              </p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                  <Button key={p} size="sm" variant={p === page ? 'primary' : 'outline'} onClick={() => setPage(p)}>
                    {p}
                  </Button>
                ))}
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
