import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { formatDate } from '@/shared/lib/utils'
import { Badge, PageHeader, Table, Thead, Th, Tr, Td, Skeleton, EmptyState, Avatar } from '@/shared/components/ui/Display'
import { Button } from '@/shared/components/ui/Button'
import { isDemoMode } from '@/shared/lib/supabase'; import { DEMO_APPROVALS } from '@/shared/lib/demo'

type ApprovalRequest = {
  id: string
  title: string
  description: string | null
  module: string
  reference_type: string
  reference_id: string
  created_at: string
  status: string
  requester_id: string
  action?: 'update' | 'delete' | 'stock_write_off' | null
  requested_changes?: Record<string, unknown> | null
}

export default function ApprovalsInboxPage() {
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const currentUser = useAppStore((s) => s.currentUser)
  const isPlatformAdmin = useAppStore((s) => s.isPlatformAdmin)
  const queryClient = useQueryClient()
  const [commentMap, setCommentMap] = useState<Record<string, string>>({})
  const { data: membershipRole = 'member', isLoading: roleLoading } = useQuery({
    queryKey: ['approvals-membership-role', orgId, currentUser?.id],
    queryFn: async () => {
      if (isDemoMode) return 'owner'
      const { data, error } = await supabase.from('user_organization').select('role').eq('organization_id', orgId!).eq('user_id', currentUser!.id).eq('is_active', true).maybeSingle()
      if (error) throw error
      return data?.role ?? 'member'
    },
    enabled: Boolean(orgId && currentUser?.id && !isPlatformAdmin),
  })
  const canReviewOrganizationApprovals = isPlatformAdmin || membershipRole === 'owner' || membershipRole === 'admin'
  const { data: requesterNames = {} } = useQuery({
    queryKey: ['approval-requester-names', orgId],
    queryFn: async () => {
      if (!orgId || isDemoMode) return {} as Record<string, string>
      const { data, error } = await supabase.from('employee').select('user_id,first_name,last_name').eq('organization_id', orgId).not('user_id', 'is', null).is('deleted_at', null)
      if (error) throw error
      return Object.fromEntries((data ?? []).map(employee => [employee.user_id, `${employee.first_name} ${employee.last_name}`])) as Record<string, string>
    },
    enabled: Boolean(orgId),
  })

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['approvals', orgId, currentUser?.id, isPlatformAdmin, membershipRole],
    queryFn: async () => {
      if (isDemoMode) { const saved=localStorage.getItem('smartbiz-demo-approvals'); return saved ? JSON.parse(saved) as ApprovalRequest[] : DEMO_APPROVALS as ApprovalRequest[] }
      if (!orgId || !currentUser?.id) return []
      let request = supabase
        .from('approval_request')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (!canReviewOrganizationApprovals) request = request.eq('approver_id', currentUser.id)
      const { data, error } = await request
      if (error) throw error
      return (data ?? []) as ApprovalRequest[]
    },
    enabled: !!orgId && !!currentUser?.id && (isPlatformAdmin || !roleLoading),
  })

  const decide = useMutation({
    mutationFn: async ({ id, status, comment }: { id: string; status: 'approved' | 'rejected'; comment: string }) => {
      if (status === 'rejected' && !comment.trim()) throw new Error('Explain why this request is being rejected.')
      if (isDemoMode) {
        localStorage.setItem('smartbiz-demo-approvals',JSON.stringify(approvals.filter((approval)=>approval.id!==id)))
        await new Promise((resolve)=>setTimeout(resolve,350))
        return
      }
      const approval = approvals.find((a) => a.id === id)
      if (status === 'approved' && approval?.reference_type === 'product') {
        if (approval.action === 'delete') {
          const { error } = await supabase.from('product').update({ deleted_at: new Date().toISOString(), deleted_by: currentUser?.id, updated_by: currentUser?.id }).eq('id', approval.reference_id).eq('organization_id', orgId!)
          if (error) throw error
        } else if (approval.action === 'stock_write_off' && approval.requested_changes) {
          const stockLevelId = String(approval.requested_changes.stock_level_id ?? '')
          const quantity = Number(approval.requested_changes.quantity)
          if (!stockLevelId || !Number.isFinite(quantity) || quantity <= 0) throw new Error('This stock write-off request is incomplete.')
          const { error: writeOffError } = await supabase.rpc('apply_stock_write_off', { p_organization_id: orgId, p_product_id: approval.reference_id, p_stock_level_id: stockLevelId, p_quantity: quantity, p_reason_category: String(approval.requested_changes.reason_category ?? 'other'), p_reason: approval.description ?? 'Approved stock write-off', p_requested_by: approval.requester_id, p_approval_request_id: approval.id })
          if (writeOffError) throw writeOffError
        } else if (approval.action === 'update' && approval.requested_changes) {
          const allowed = ['name','sku','barcode','category_id','description','unit_price','cost_price','reorder_level','image_url','is_active','base_unit','pack_unit','units_per_pack','pack_price']
          const changes = Object.fromEntries(Object.entries(approval.requested_changes).filter(([key]) => allowed.includes(key)))
          const { error } = await supabase.from('product').update({ ...changes, updated_by: currentUser?.id, updated_at: new Date().toISOString() }).eq('id', approval.reference_id).eq('organization_id', orgId!)
          if (error) throw error
        }
        await supabase.from('audit_log').insert({ organization_id: orgId, user_id: currentUser?.id, module: 'inventory', action: approval.action === 'delete' ? 'PRODUCT_DELETE_APPROVED' : approval.action === 'stock_write_off' ? 'STOCK_WRITE_OFF_APPROVED' : 'PRODUCT_UPDATE_APPROVED', entity_type: 'product', entity_id: approval.reference_id, metadata: { request_id: approval.id, requester_id: approval.requester_id, reason: approval.description, approver_comment: comment, requested_changes: approval.requested_changes } })
      }
      if (approval?.reference_type === 'leave_request') {
        const { error } = await supabase.from('leave_request').update({ status, approved_by: currentUser?.id, approved_at: new Date().toISOString() } as any).eq('id', approval.reference_id)
        if (error) throw error
      }
      const { error: decisionError } = await supabase.from('approval_request').update({ status, comment, decided_at: new Date().toISOString() } as any).eq('id', id).eq('status', 'pending')
      if (decisionError) throw decisionError
    },
    onSuccess: (_result, variables) => {
      setCommentMap(current => { const next = { ...current }; delete next[variables.id]; return next })
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] })
      queryClient.invalidateQueries({ queryKey: ['products-list'] })
      queryClient.invalidateQueries({ queryKey: ['product-detail'] })
    },
  })

  const moduleIcon: Record<string, string> = {
    hr: 'badge', sales: 'point_of_sale', finance: 'payments', inventory: 'inventory_2',
  }

  const moduleColor: Record<string, string> = {
    hr: 'bg-[#e5eeff] text-[#006a67]', sales: 'bg-[#dcfce7] text-[#166534]',
    finance: 'bg-[#fef3c7] text-[#92400e]', inventory: 'bg-[#dbeafe] text-[#1e40af]',
  }

  return (
    <div>
      <PageHeader
        title="Approvals Inbox"
        subtitle="Review and act on pending approval requests from across all modules."
        breadcrumb={[{ label: 'Approvals' }]}
        actions={
          <div className="flex items-center gap-2">
            {approvals.length > 0 && (
              <Badge variant="danger">{approvals.length} pending</Badge>
            )}
          </div>
        }
      />

      <div className="px-6">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-[#bacac8] rounded-xl p-5">
                <Skeleton className="h-5 w-1/3 mb-2" />
                <Skeleton className="h-4 w-2/3 mb-4" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-24" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && approvals.length === 0 && (
          <div className="bg-white border border-[#bacac8] rounded-xl py-16">
            <EmptyState
              icon="task_alt"
              title="Inbox is clear"
              description="No pending approvals require your action."
            />
          </div>
        )}

        <div className="space-y-3">
          {approvals.map((approval) => (
            <div key={approval.id} className="bg-white border border-[#bacac8] rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${moduleColor[approval.module] ?? 'bg-[#e5eeff] text-[#006a67]'}`}>
                  <span className="material-symbols-outlined text-[20px]">{moduleIcon[approval.module] ?? 'task_alt'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[15px] font-semibold text-[#0b1c30]">{approval.title}</p>
                    <Badge variant="warning">Pending</Badge>
                    <Badge variant="outline">{approval.module.toUpperCase()}</Badge>
                  </div>
                  {approval.description && (
                    <p className="text-[13px] text-[#6b7a79] mb-2">{approval.description}</p>
                  )}
                  <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#526563]">
                    <span><strong>Requested by:</strong> {requesterNames[approval.requester_id] ?? 'Organization user'}</span>
                    {approval.action && <span><strong>Operation:</strong> {approval.action === 'delete' ? 'Delete product' : approval.action === 'stock_write_off' ? 'Write off stock' : 'Edit product'}</span>}
                    {typeof approval.requested_changes?.product_name === 'string' && <span><strong>Product:</strong> {approval.requested_changes.product_name}</span>}
                    {typeof approval.requested_changes?.sku === 'string' && <span><strong>SKU:</strong> {approval.requested_changes.sku}</span>}
                    {approval.action === 'stock_write_off' && <span><strong>Quantity:</strong> {String(approval.requested_changes?.quantity ?? '—')} {String(approval.requested_changes?.base_unit ?? 'units')}</span>}
                    {approval.action === 'stock_write_off' && <span><strong>Reason type:</strong> {String(approval.requested_changes?.reason_category ?? 'other')}</span>}
                  </div>
                  {approval.action === 'update' && approval.requested_changes && <details className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"><summary className="cursor-pointer font-semibold text-[#0b1c30]">Review proposed product changes</summary><dl className="mt-2 grid gap-1 sm:grid-cols-2">{Object.entries(approval.requested_changes).filter(([key]) => !['organization_id','updated_by','updated_at'].includes(key)).map(([key, value]) => <div key={key}><dt className="inline font-medium capitalize">{key.split('_').join(' ')}: </dt><dd className="inline text-slate-600">{value == null || value === '' ? '—' : String(value)}</dd></div>)}</dl></details>}
                  <p className="text-[11px] text-[#bacac8]">Submitted {formatDate(approval.created_at)}</p>
                </div>
              </div>

              {/* Comment field */}
              <div className="mt-4">
                <label htmlFor={`approval-comment-${approval.id}`} className="mb-1 block text-xs font-semibold text-[#3b4948]">Administrator comment <span className="font-normal text-[#6b7a79]">(required when rejecting)</span></label>
                <input
                  id={`approval-comment-${approval.id}`}
                  type="text"
                  value={commentMap[approval.id] ?? ''}
                  onChange={(e) => setCommentMap((m) => ({ ...m, [approval.id]: e.target.value }))}
                  placeholder="Explain your decision, especially why a request is rejected…"
                  className="w-full h-8 px-3 text-[13px] border border-[#bacac8] rounded focus:outline-none focus:ring-2 focus:ring-[#00CEC8]"
                />
                {decide.isError && decide.variables?.id === approval.id && <p role="alert" className="mt-1 text-xs text-red-700">{decide.error.message}</p>}
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3">
                <Button
                  variant="primary"
                  size="sm"
                  loading={decide.isPending}
                  onClick={() => decide.mutate({ id: approval.id, status: 'approved', comment: commentMap[approval.id] ?? '' })}
                >
                  <span className="material-symbols-outlined text-[16px]">check</span>
                  Approve
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={decide.isPending}
                  disabled={!commentMap[approval.id]?.trim()}
                  onClick={() => decide.mutate({ id: approval.id, status: 'rejected', comment: commentMap[approval.id] ?? '' })}
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                  Reject
                </Button>
                <Button variant="ghost" size="sm">
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  View Details
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
