import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { Badge, Card, EmptyState, PageHeader, Skeleton, Table, Td, Th, Thead, Tr } from '@/shared/components/ui/Display'
import { Input, Select } from '@/shared/components/ui/FormElements'
import { formatDate } from '@/shared/lib/utils'

type ApprovalRow = { id:string; requester_id:string; reference_id:string; title:string; description:string|null; status:string; comment:string|null; created_at:string; decided_at:string|null; requested_changes:Record<string,unknown>|null }
type WriteOffRow = { id:string; requested_by:string; product_id:string; quantity:number; reason_category:string; reason:string; status:string; created_at:string; decided_at:string|null; approval_request_id:string|null; product:{name:string;sku:string}|null; warehouse:{name:string}|null }
type HistoryRow = { id:string; product:string; sku:string; warehouse:string; quantity:string; reasonType:string; reason:string; requestedBy:string; status:string; comment:string; createdAt:string; decidedAt:string|null }

export default function WriteOffHistoryPage() {
  const orgId = useAppStore(state => state.activeOrganizationId)
  const currentUserId = useAppStore(state => state.currentUser?.id)
  const isPlatformAdmin = useAppStore(state => state.isPlatformAdmin)
  const preview = useAppStore(state => state.accessPreview)
  const effectiveUserId = preview?.userId ?? currentUserId
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const { data: membershipRole = 'member', isLoading: roleLoading } = useQuery({ queryKey:['write-off-role',orgId,currentUserId], queryFn:async()=>{const{data,error}=await supabase.from('user_organization').select('role').eq('organization_id',orgId!).eq('user_id',currentUserId!).eq('is_active',true).maybeSingle();if(error)throw error;return data?.role??'member'}, enabled:Boolean(orgId&&currentUserId&&!isPlatformAdmin&&!preview) })
  const canSeeAll = !preview && (isPlatformAdmin || membershipRole === 'owner' || membershipRole === 'admin')
  const { data, isLoading, error } = useQuery({
    queryKey:['stock-write-off-history',orgId,effectiveUserId,canSeeAll],
    queryFn:async()=>{
      if(!orgId||!effectiveUserId)return{approvals:[],writeOffs:[],names:{}}
      let approvalsQuery=supabase.from('approval_request').select('id,requester_id,reference_id,title,description,status,comment,created_at,decided_at,requested_changes').eq('organization_id',orgId).eq('action','stock_write_off').order('created_at',{ascending:false})
      let writeOffsQuery=supabase.from('stock_write_off').select('id,requested_by,product_id,quantity,reason_category,reason,status,created_at,decided_at,approval_request_id,product(name,sku),warehouse(name)').eq('organization_id',orgId).order('created_at',{ascending:false})
      if(!canSeeAll){approvalsQuery=approvalsQuery.eq('requester_id',effectiveUserId);writeOffsQuery=writeOffsQuery.eq('requested_by',effectiveUserId)}
      const[approvalsResult,writeOffsResult,namesResult]=await Promise.all([approvalsQuery,writeOffsQuery,supabase.from('employee').select('user_id,first_name,last_name').eq('organization_id',orgId).not('user_id','is',null).is('deleted_at',null)])
      const firstError=approvalsResult.error||writeOffsResult.error||namesResult.error;if(firstError)throw firstError
      return{approvals:(approvalsResult.data??[]) as ApprovalRow[],writeOffs:(writeOffsResult.data??[]) as unknown as WriteOffRow[],names:Object.fromEntries((namesResult.data??[]).map(employee=>[employee.user_id,`${employee.first_name} ${employee.last_name}`])) as Record<string,string>}
    },enabled:Boolean(orgId&&effectiveUserId&&(preview||isPlatformAdmin||!roleLoading)),
  })
  const rows=useMemo(()=>{
    if(!data)return[] as HistoryRow[]
    const approvedRequestIds=new Set(data.writeOffs.map(item=>item.approval_request_id).filter(Boolean))
    const requested:HistoryRow[]=data.approvals.map(item=>({id:item.id,product:String(item.requested_changes?.product_name??item.title),sku:String(item.requested_changes?.sku??'—'),warehouse:String(item.requested_changes?.warehouse_name??'—'),quantity:`${String(item.requested_changes?.quantity??'—')} ${String(item.requested_changes?.base_unit??'units')}`,reasonType:String(item.requested_changes?.reason_category??'other'),reason:item.description??'—',requestedBy:data.names[item.requester_id]??'Organization user',status:item.status,comment:item.comment??'—',createdAt:item.created_at,decidedAt:item.decided_at}))
    const direct:HistoryRow[]=data.writeOffs.filter(item=>!item.approval_request_id||!approvedRequestIds.has(item.approval_request_id)||!data.approvals.some(request=>request.id===item.approval_request_id)).map(item=>({id:item.id,product:item.product?.name??item.product_id,sku:item.product?.sku??'—',warehouse:item.warehouse?.name??'—',quantity:`${item.quantity} units`,reasonType:item.reason_category,reason:item.reason,requestedBy:data.names[item.requested_by]??'Administrator',status:item.status,comment:'Direct administrator write-off',createdAt:item.created_at,decidedAt:item.decided_at}))
    return[...requested,...direct].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
  },[data])
  const filtered=rows.filter(row=>(status==='all'||row.status===status)&&`${row.product} ${row.sku} ${row.requestedBy} ${row.reason}`.toLowerCase().includes(search.toLowerCase()))
  const variant=(value:string)=>value==='approved'?'success':value==='rejected'?'danger':'warning'
  return <div className="pb-12"><PageHeader title="Stock Write-offs" subtitle={canSeeAll?'Review all stock write-off requests and completed adjustments across the organization.':'Track your write-off requests and administrator decisions.'} breadcrumb={[{label:'Inventory'},{label:'Stock Write-offs'}]} backHref="/app/inventory/products"/><div className="space-y-4 px-4 sm:px-6"><Card><div className="flex flex-wrap gap-3"><Input className="w-full sm:w-72" placeholder="Search product, SKU, requester or reason…" value={search} onChange={event=>setSearch(event.target.value)}/><Select className="w-full sm:w-44" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></Select></div></Card>{isLoading?<Skeleton className="h-72"/>:error?<Card><EmptyState icon="error" title="Could not load write-offs" description={(error as Error).message}/></Card>:!filtered.length?<Card><EmptyState icon="inventory" title="No write-offs found" description={canSeeAll?'No stock write-off activity matches these filters.':'You have not submitted any stock write-off requests yet.'}/></Card>:<Card noPadding className="overflow-hidden"><Table><Thead><tr><Th>Product</Th><Th>Quantity</Th><Th>Reason</Th>{canSeeAll&&<Th>Requested by</Th>}<Th>Status</Th><Th>Administrator comment</Th><Th>Submitted</Th></tr></Thead><tbody>{filtered.map(row=><Tr key={row.id}><Td><p className="font-semibold">{row.product}</p><p className="text-xs text-slate-500">{row.sku} · {row.warehouse}</p></Td><Td className="font-semibold">{row.quantity}</Td><Td><p className="capitalize">{row.reasonType}</p><p className="max-w-xs text-xs text-slate-500">{row.reason}</p></Td>{canSeeAll&&<Td>{row.requestedBy}</Td>}<Td><Badge variant={variant(row.status)}>{row.status}</Badge></Td><Td className="max-w-xs text-sm">{row.comment}</Td><Td><p>{formatDate(row.createdAt)}</p>{row.decidedAt&&<p className="text-xs text-slate-500">Decided {formatDate(row.decidedAt)}</p>}</Td></Tr>)}</tbody></Table></Card>}</div></div>
}
