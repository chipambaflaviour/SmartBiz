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
}

export default function ApprovalsInboxPage() {
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const currentUser = useAppStore((s) => s.currentUser)
  const queryClient = useQueryClient()
  const [commentMap, setCommentMap] = useState<Record<string, string>>({})

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['approvals', orgId, currentUser?.id],
    queryFn: async () => {
      if (isDemoMode) { const saved=localStorage.getItem('smartbiz-demo-approvals'); return saved ? JSON.parse(saved) as ApprovalRequest[] : DEMO_APPROVALS as ApprovalRequest[] }
      if (!orgId || !currentUser?.id) return []
      const { data } = await supabase
        .from('approval_request')
        .select('*')
        .eq('organization_id', orgId)
        .eq('approver_id', currentUser.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      return (data ?? []) as ApprovalRequest[]
    },
    enabled: !!orgId && !!currentUser?.id,
  })

  const decide = useMutation({
    mutationFn: async ({ id, status, comment }: { id: string; status: 'approved' | 'rejected'; comment: string }) => {
      if (isDemoMode) {
        localStorage.setItem('smartbiz-demo-approvals',JSON.stringify(approvals.filter((approval)=>approval.id!==id)))
        await new Promise((resolve)=>setTimeout(resolve,350))
        return
      }
      await supabase
        .from('approval_request')
        .update({ status, comment, decided_at: new Date().toISOString() } as any)
        .eq('id', id)

      // If it's a leave request, update its status too
      const approval = approvals.find((a) => a.id === id)
      if (approval?.reference_type === 'leave_request') {
        await supabase.from('leave_request').update({ status, approved_by: currentUser?.id, approved_at: new Date().toISOString() } as any).eq('id', approval.reference_id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] })
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
                  <p className="text-[11px] text-[#bacac8]">Submitted {formatDate(approval.created_at)}</p>
                </div>
              </div>

              {/* Comment field */}
              <div className="mt-4">
                <input
                  type="text"
                  value={commentMap[approval.id] ?? ''}
                  onChange={(e) => setCommentMap((m) => ({ ...m, [approval.id]: e.target.value }))}
                  placeholder="Add a comment (optional)..."
                  className="w-full h-8 px-3 text-[13px] border border-[#bacac8] rounded focus:outline-none focus:ring-2 focus:ring-[#00CEC8]"
                />
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
