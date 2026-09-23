import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import { Card, Skeleton, Badge, PageHeader } from '@/shared/components/ui/Display'
import { Button } from '@/shared/components/ui/Button'
import { isDemoMode } from '@/shared/lib/supabase'
import { usePreviewPermission } from '@/shared/hooks/usePreviewPermission'

// Recharts custom tooltip
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-[#bacac8] rounded-lg px-3 py-2 shadow-lg text-[13px]">
      <p className="font-semibold text-[#0b1c30] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const activeBranchId = useAppStore((s) => s.activeBranchId)
  const currentUser = useAppStore((s) => s.currentUser)
  const accessPreview = useAppStore((s) => s.accessPreview)
  const canUsePos = usePreviewPermission('pos', 'view')
  const canCreateSales = usePreviewPermission('pos', 'create')
  const canUseInventory = usePreviewPermission('inventory', 'view')
  const canUpdateInventory = usePreviewPermission('inventory', 'update')
  const canCreateEmployees = usePreviewPermission('hr', 'create')
  const canViewFinance = usePreviewPermission('finance', 'view')
  const canViewApprovals = usePreviewPermission('approvals', 'view')
  const navigate = useNavigate()

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good Morning'
    if (h < 17) return 'Good Afternoon'
    return 'Good Evening'
  }

  // KPIs
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['dashboard-kpis', orgId, activeBranchId],
    queryFn: async () => {
      if (isDemoMode) return { revenue: 730387.93, grossSales: 847250, vatCollected: 116862.07, sales: 1284, outstanding: 124800, pendingApprovals: 4, lowStockCount: 23 }
      if (!orgId) return null

      const today = new Date()
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

      let salesQuery = supabase
          .from('sale')
          .select('total_amount,tax_amount')
          .eq('organization_id', orgId)
          .gte('sale_date', startOfMonth)
          .eq('payment_status', 'paid')
      let invoiceQuery = supabase
          .from('invoice')
          .select('total_amount, paid_amount, status')
          .eq('organization_id', orgId)
      if (activeBranchId) {
        salesQuery = salesQuery.eq('branch_id', activeBranchId)
        invoiceQuery = invoiceQuery.eq('branch_id', activeBranchId)
      }
      const [salesRes, invoiceRes, pendingRes, lowStockRes] = await Promise.all([
        salesQuery,
        invoiceQuery,
        supabase
          .from('approval_request')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'pending'),
        supabase
          .from('stock_level')
          .select('product_id, quantity, product(reorder_level), warehouse(branch_id)')
          .eq('organization_id', orgId),
      ])

      const grossSales = (salesRes.data ?? []).reduce((s, r) => s + Number(r.total_amount), 0)
      const vatCollected = (salesRes.data ?? []).reduce((s, r) => s + Number(r.tax_amount ?? 0), 0)
      const revenue = grossSales - vatCollected
      const sales = (salesRes.data ?? []).length
      const outstanding = (invoiceRes.data ?? [])
        .filter((inv) => inv.status !== 'paid' && inv.status !== 'cancelled')
        .reduce((s, inv) => s + (inv.total_amount - inv.paid_amount), 0)
      const pendingApprovals = pendingRes.count ?? 0
      const lowStockCount = (lowStockRes.data ?? []).filter((sl) => {
        const warehouse = sl.warehouse as unknown as { branch_id: string | null } | null
        if (activeBranchId && warehouse?.branch_id !== activeBranchId) return false
        const prod = sl.product as unknown as { reorder_level: number } | null
        return sl.quantity <= (prod?.reorder_level ?? 10)
      }).length

      return { revenue, grossSales, vatCollected, sales, outstanding, pendingApprovals, lowStockCount }
    },
    enabled: !!orgId,
  })

  // Revenue chart data (last 6 months)
  const { data: chartData = [] } = useQuery({
    queryKey: ['dashboard-chart', orgId, activeBranchId],
    queryFn: async () => {
      if (isDemoMode) return [
        { month:'APR', revenue:510000, expenses:320000 },{ month:'MAY', revenue:570000, expenses:350000 },{ month:'JUN', revenue:620000, expenses:390000 },{ month:'JUL', revenue:735000, expenses:430000 },{ month:'AUG', revenue:780000, expenses:470000 },{ month:'SEP', revenue:847250, expenses:505000 },
      ]
      if (!orgId) return []
      const months: { month: string; revenue: number; expenses: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString()
        let query = supabase
          .from('sale')
          .select('total_amount,tax_amount')
          .eq('organization_id', orgId)
          .gte('sale_date', start)
          .lte('sale_date', end)
          .eq('payment_status', 'paid')
        if (activeBranchId) query = query.eq('branch_id', activeBranchId)
        const { data } = await query
        const revenue = (data ?? []).reduce((s, r) => s + Number(r.total_amount) - Number(r.tax_amount ?? 0), 0)
        months.push({
          month: d.toLocaleString('default', { month: 'short' }).toUpperCase(),
          revenue,
          expenses: revenue * 0.62, // stub: will be replaced with real expense data
        })
      }
      return months
    },
    enabled: !!orgId,
  })

  // Recent activity
  const { data: recentActivity = [] } = useQuery({
    queryKey: ['dashboard-activity', orgId, activeBranchId],
    queryFn: async () => {
      if (isDemoMode) return [
        { id:'sale-1', reference_number:'INV-2024-0847', total_amount:12450, sale_date:new Date().toISOString(), customer:{name:'Kabwe Trading Co.'} },
        { id:'sale-2', reference_number:'INV-2024-0846', total_amount:3120, sale_date:new Date(Date.now()-3600000).toISOString(), customer:{name:'Mwansa Grocers'} },
        { id:'sale-3', reference_number:'INV-2024-0845', total_amount:18900, sale_date:new Date(Date.now()-86400000).toISOString(), customer:{name:'Lusaka Plaza Store'} },
        { id:'sale-4', reference_number:'INV-2024-0844', total_amount:4500, sale_date:new Date(Date.now()-172800000).toISOString(), customer:{name:'Choma Agro Fields'} },
      ]
      if (!orgId) return []
      let query = supabase
        .from('sale')
        .select('id, reference_number, total_amount, sale_date, customer(name)')
        .eq('organization_id', orgId)
        .order('sale_date', { ascending: false })
        .limit(5)
      if (activeBranchId) query = query.eq('branch_id', activeBranchId)
      const { data } = await query
      return data ?? []
    },
    enabled: !!orgId,
  })

  // Pending approvals for the right panel
  const { data: approvals = [] } = useQuery({
    queryKey: ['dashboard-approvals', orgId],
    queryFn: async () => {
      if (isDemoMode) return [
        { id:'approval-1', title:'Purchase Order Approval', description:'PO-2024-0089 • Fresh Farm Suppliers', module:'purchasing', created_at:new Date().toISOString(), reference_type:'purchase_order' },
        { id:'approval-2', title:'Leave Request', description:'5 days annual leave • Sarah Bwalya', module:'hr', created_at:new Date(Date.now()-7200000).toISOString(), reference_type:'leave_request' },
        { id:'approval-3', title:'Expense Claim', description:'ZMW 4,850 • Regional travel', module:'finance', created_at:new Date(Date.now()-86400000).toISOString(), reference_type:'expense_claim' },
      ]
      if (!orgId) return []
      const { data } = await supabase
        .from('approval_request')
        .select('id, title, description, module, created_at, reference_type')
        .eq('organization_id', orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(3)
      return data ?? []
    },
    enabled: !!orgId,
  })

  const StatCard = ({
    label, value, subtext, icon, badge, badgeVariant, loading,
  }: {
    label: string; value: string; subtext?: string; icon: string;
    badge?: string; badgeVariant?: 'success' | 'danger' | 'warning'; loading?: boolean
  }) => (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[12px] font-medium text-[#6b7a79] uppercase tracking-wider">{label}</p>
        {badge && <Badge variant={badgeVariant ?? 'success'}>{badge}</Badge>}
      </div>
      {loading ? (
        <>
          <Skeleton className="h-8 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </>
      ) : (
        <>
          <p className="text-[28px] font-bold text-[#0b1c30] leading-none mb-1">{value}</p>
          {subtext && <p className="text-[12px] text-[#6b7a79]">{subtext}</p>}
        </>
      )}
    </Card>
  )

  const userName = accessPreview?.name ?? currentUser?.user_metadata?.full_name ?? currentUser?.email?.split('@')[0] ?? 'there'
  const quickActions = [
    canCreateSales && { label: 'New Sale', icon: 'point_of_sale', href: '/app/sales/pos' },
    canCreateSales && { label: 'Create Invoice', icon: 'receipt_long', href: '/app/sales/invoices' },
    canCreateEmployees && { label: 'Add Employee', icon: 'person_add', href: '/app/hr/employees/new' },
    canUpdateInventory && { label: 'Stock Adjustment', icon: 'inventory', href: '/app/inventory/adjustments' },
  ].filter(Boolean) as Array<{ label: string; icon: string; href: string }>

  return (
    <div className="min-h-full pb-10">
      <PageHeader
        title={`${greeting()}, ${userName}`}
        subtitle={`${new Date().toLocaleDateString('en-ZM', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`}
        actions={
          <>
            <Button variant="outline" size="md">
              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
              Schedule
            </Button>
            {canCreateSales && <Button variant="primary" size="md" onClick={() => navigate('/app/sales/pos')}>
              <span className="material-symbols-outlined text-[18px]">add</span>
              New Sale
            </Button>}
          </>
        }
      />

      <div className="px-6 grid grid-cols-12 gap-5">
        {/* KPI Cards */}
        {canViewFinance && <div className="col-span-12 md:col-span-6 xl:col-span-3">
          <StatCard
            label="Net Revenue (Month)"
            value={kpis ? formatCurrency(kpis.revenue) : '—'}
            icon="payments"
            badge={kpis ? '+8.2%' : undefined}
            badgeVariant="success"
            loading={kpisLoading}
          />
        </div>}
        {canViewFinance && <div className="col-span-12 md:col-span-6 xl:col-span-2">
          <StatCard
            label="VAT Collected"
            value={kpis ? formatCurrency(kpis.vatCollected) : '—'}
            icon="receipt_long"
            badge={kpis?.vatCollected ? 'Tax liability' : undefined}
            badgeVariant="warning"
            loading={kpisLoading}
          />
        </div>}
        <div className="col-span-12 md:col-span-6 xl:col-span-2">
          <StatCard label="Gross Sales" value={kpis ? formatCurrency(kpis.grossSales) : '—'} icon="shopping_cart" loading={kpisLoading} />
        </div>
        {canViewFinance && <div className="col-span-12 md:col-span-6 xl:col-span-3">
          <StatCard
            label="Outstanding Receivables"
            value={kpis ? formatCurrency(kpis.outstanding) : '—'}
            icon="account_balance"
            loading={kpisLoading}
          />
        </div>}
        {canViewApprovals && <div className="col-span-12 md:col-span-6 xl:col-span-2">
          <StatCard
            label="Pending Approvals"
            value={kpis ? String(kpis.pendingApprovals) : '—'}
            icon="task_alt"
            badge={kpis?.pendingApprovals ? 'Action needed' : undefined}
            badgeVariant="warning"
            loading={kpisLoading}
          />
        </div>}

        {/* Revenue Chart */}
        {canViewFinance && <div className="col-span-12 lg:col-span-8">
          <Card noPadding>
            <div className="flex items-center justify-between p-5 border-b border-[#e5eeff]">
              <div>
                <h3 className="text-[16px] font-semibold text-[#0b1c30]">Revenue vs Expenses</h3>
                <p className="text-[12px] text-[#6b7a79] mt-0.5">Year-to-date performance overview</p>
              </div>
              <Button variant="outline" size="sm">Last 6 Months</Button>
            </div>
            <div className="p-5">
              {chartData.length === 0 ? (
                <div className="h-48 flex items-center justify-center">
                  <Skeleton className="w-full h-full" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5eeff" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7a79' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7a79' }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `K${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      formatter={(value) => <span style={{ fontSize: 12, color: '#6b7a79' }}>{value}</span>}
                    />
                    <Bar dataKey="revenue" name="Revenue" fill="#006a67" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="#bacac8" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>}

        {/* Right column */}
        <div className="col-span-12 lg:col-span-4 space-y-5">
          {/* Quick Actions */}
          {quickActions.length > 0 && <Card>
            <h3 className="text-[16px] font-semibold text-[#0b1c30] mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((a) => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.href)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-[#e5eeff] hover:border-[#00CEC8] hover:bg-[#eff4ff] transition-all text-center"
                >
                  <span className="material-symbols-outlined text-[#006a67] text-[22px]">{a.icon}</span>
                  <span className="text-[11px] font-medium text-[#3b4948]">{a.label}</span>
                </button>
              ))}
            </div>
          </Card>}

          {/* Pending Approvals */}
          {canViewApprovals && <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[16px] font-semibold text-[#0b1c30]">Pending Approvals</h3>
              {(kpis?.pendingApprovals ?? 0) > 0 && (
                <Badge variant="danger">{kpis?.pendingApprovals} urgent</Badge>
              )}
            </div>
            {approvals.length === 0 && (
              <p className="text-[13px] text-[#6b7a79]">No pending approvals.</p>
            )}
            <div className="space-y-3">
              {approvals.map((a) => (
                <div key={a.id} className="border border-[#e5eeff] rounded-lg p-3">
                  <p className="text-[13px] font-semibold text-[#0b1c30] truncate">{a.title}</p>
                  <p className="text-[12px] text-[#6b7a79] mt-0.5 truncate">{a.description}</p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="primary" className="flex-1">Approve</Button>
                    <Button size="sm" variant="outline" className="flex-1">View</Button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/app/approvals')}
              className="mt-3 text-[12px] font-medium text-[#006a67] hover:underline"
            >
              View all approvals
            </button>
          </Card>}
        </div>

        {/* Recent Activity */}
        {canUsePos && <div className="col-span-12">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-semibold text-[#0b1c30]">Recent Sales</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate('/app/sales/orders')}>
                View All
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </Button>
            </div>
            <div className="space-y-2">
              {recentActivity.length === 0 && (
                <p className="text-[13px] text-[#6b7a79]">No recent sales.</p>
              )}
              {recentActivity.map((sale) => (
                <div key={sale.id} className="flex items-center gap-3 py-2 border-b border-[#f8f9ff] last:border-0">
                  <div className="w-8 h-8 rounded-full bg-[#e5eeff] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[#006a67] text-[16px]">shopping_cart</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#0b1c30]">{sale.reference_number}</p>
                    <p className="text-[12px] text-[#6b7a79]">
                      {(sale.customer as unknown as { name: string } | null)?.name ?? 'Walk-in Customer'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-semibold text-[#0b1c30]">{formatCurrency(sale.total_amount)}</p>
                    <p className="text-[11px] text-[#6b7a79]">{formatDate(sale.sale_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>}

        {/* Low stock alert */}
        {canUseInventory && (kpis?.lowStockCount ?? 0) > 0 && (
          <div className="col-span-12">
            <div className="flex items-center gap-3 p-4 bg-[#fef3c7] border border-[#fde68a] rounded-xl">
              <span className="material-symbols-outlined text-[#d97706] text-[22px]">warning</span>
              <p className="text-[14px] text-[#92400e] font-medium">
                {kpis?.lowStockCount} product{kpis?.lowStockCount !== 1 ? 's' : ''} are below reorder level.
              </p>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => navigate('/app/inventory/products')}>
                Review Inventory
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
