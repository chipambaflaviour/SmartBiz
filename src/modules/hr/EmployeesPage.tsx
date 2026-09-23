import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore } from '@/shared/stores/appStore'
import { formatDate } from '@/shared/lib/utils'
import { Badge, PageHeader, Table, Thead, Th, Tr, Td, Skeleton, EmptyState, Avatar, StatusDot } from '@/shared/components/ui/Display'
import { Input, Select } from '@/shared/components/ui/FormElements'
import { Button } from '@/shared/components/ui/Button'
import { isDemoMode } from '@/shared/lib/supabase'; import { DEMO_EMPLOYEES } from '@/shared/lib/demo'
import { usePreviewPermission } from '@/shared/hooks/usePreviewPermission'

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'outline'> = {
  active: 'success', 'on-leave': 'warning', inactive: 'outline', terminated: 'danger',
}

const typeVariant: Record<string, 'default' | 'info' | 'outline'> = {
  'full-time': 'default', 'part-time': 'info', contract: 'outline', intern: 'outline',
}

export default function EmployeesPage() {
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const activeBranchId = useAppStore((s) => s.activeBranchId)
  const navigate = useNavigate()
  const location = useLocation()
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20
  const canCreate = usePreviewPermission('hr', 'create')

  const { data: departments = [] } = useQuery({
    queryKey: ['departments', orgId],
    queryFn: async () => {
      if (isDemoMode) return [{id:'operations',name:'Operations'},{id:'sales',name:'Sales'},{id:'inventory',name:'Inventory'},{id:'finance',name:'Finance'}]
      if (!orgId) return []
      const { data } = await supabase.from('department').select('id, name').eq('organization_id', orgId).is('deleted_at', null)
      return data ?? []
    },
    enabled: !!orgId,
  })

  const { data, isLoading, error: employeesError } = useQuery({
    queryKey: ['employees', orgId, activeBranchId, deptFilter, page, search],
    queryFn: async () => {
      if (isDemoMode) { const q=search.toLowerCase(); const rows=DEMO_EMPLOYEES.filter(x=>!q||`${x.first_name} ${x.last_name} ${x.position}`.toLowerCase().includes(q)); return {data:rows,count:rows.length} }
      if (!orgId) return { data: [], count: 0 }
      let query = supabase
        .from('employee')
        .select(
          'id, employee_id, first_name, last_name, email, avatar_url, position, employment_type, status, user_id, department_id, branch_id',
          { count: 'exact' }
        )
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('first_name')
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (deptFilter !== 'all') query = query.eq('department_id', deptFilter)
      // Employees created as "All / unassigned" belong to the organization rather
      // than one branch. Keep them visible when a branch context is selected so a
      // successful create never appears to vanish from the directory.
      const safeSearch = search.replace(/[(),.%]/g, ' ').trim()
      const nameSearch = safeSearch ? `or(first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,employee_id.ilike.%${safeSearch}%,position.ilike.%${safeSearch}%)` : ''
      if (activeBranchId && nameSearch) query = query.or(`and(branch_id.eq.${activeBranchId},${nameSearch}),and(branch_id.is.null,${nameSearch})`)
      else if (activeBranchId) query = query.or(`branch_id.eq.${activeBranchId},branch_id.is.null`)
      else if (nameSearch) query = query.or(nameSearch.slice(3, -1))

      const { data, count, error } = await query
      if (error) throw error
      return { data: data ?? [], count: count ?? 0 }
    },
    enabled: !!orgId,
  })

  const employees = data?.data ?? []
  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE)

  return (
    <div>
      <PageHeader
        title="Employee Directory"
        subtitle="Manage and view all personnel across your organization."
        breadcrumb={[{ label: 'HR' }, { label: 'Employees' }]}
        actions={
          canCreate ? <Button variant="primary" onClick={() => navigate('/app/hr/employees/new')}>
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Add Employee
          </Button> : undefined
        }
      />

      <div className="px-6">
        {notice && (
          <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-[#9ce8e4] bg-[#e8fbfa] px-4 py-3 text-sm text-[#006a67]">
            <span className="material-symbols-outlined text-[20px] shrink-0">check_circle</span>
            <p className="flex-1">{notice}</p>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100"><span className="material-symbols-outlined text-[18px]">close</span></button>
          </div>
        )}
        <div className="flex gap-3 mb-4 flex-wrap">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by name, ID, or position..."
            className="w-64"
            startIcon={<span className="material-symbols-outlined text-[18px]">search</span>}
          />
          <Select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1) }} className="w-44">
            <option value="all">All Departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Button variant="outline" size="md">
            <span className="material-symbols-outlined text-[18px]">tune</span>
            More Filters
          </Button>
        </div>

        <div className="bg-white border border-[#bacac8] rounded-xl overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Employee</Th>
                <Th>ID</Th>
                <Th>Department</Th>
                <Th>Position</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>System access</Th>
              </tr>
            </Thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <Tr key={i}>{Array.from({ length: 7 }).map((_, j) => <Td key={j}><Skeleton className="h-4 w-24" /></Td>)}</Tr>
              ))}
              {!isLoading && employeesError && (
                <Tr><Td colSpan={7}>
                  <EmptyState icon="error" title="Could not load employees" description={(employeesError as Error).message} />
                </Td></Tr>
              )}
              {!isLoading && !employeesError && employees.length === 0 && (
                <Tr><Td colSpan={7}>
                  <EmptyState icon="badge" title="No employees found" description="Adjust filters or add a new employee." />
                </Td></Tr>
              )}
              {employees.map((emp) => {
                const fullName = `${emp.first_name} ${emp.last_name}`
                const employeeRecord = emp as typeof emp & { department_id?: string | null; department?: { name: string } | null }
                const dept = employeeRecord.department ?? departments.find(item => item.id === employeeRecord.department_id)
                return (
                  <Tr key={emp.id} onClick={() => navigate(`/app/hr/employees/${emp.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={fullName} imageUrl={emp.avatar_url} size="sm" />
                        <div>
                          <p className="text-[13px] font-semibold text-[#0b1c30]">{fullName}</p>
                          <p className="text-[11px] text-[#6b7a79]">{emp.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-[#6b7a79] font-mono text-[12px]">{emp.employee_id}</Td>
                    <Td className="text-[#6b7a79]">{dept?.name ?? '—'}</Td>
                    <Td className="text-[#3b4948]">{emp.position ?? '—'}</Td>
                    <Td>
                      <Badge variant={typeVariant[emp.employment_type] ?? 'outline'}>
                        {emp.employment_type.replace('-', ' ')}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <StatusDot status={emp.status as 'active' | 'inactive' | 'on-leave'} />
                        <span className={emp.status === 'on-leave' ? 'text-[#d97706]' : emp.status === 'active' ? 'text-[#16a34a]' : 'text-[#6b7a79]'}>
                          {emp.status === 'on-leave' ? 'On Leave' : emp.status.charAt(0).toUpperCase() + emp.status.slice(1)}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      {(emp as { user_id?: string | null }).user_id ? (
                        <Badge variant="success"><span className="material-symbols-outlined text-[14px] mr-1 align-middle">verified_user</span>Has login</Badge>
                      ) : (
                        <Badge variant="outline">No access</Badge>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>

          <div className="flex items-center justify-between px-4 py-3 border-t border-[#bacac8]">
            <p className="text-[13px] text-[#6b7a79]">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.count ?? 0)} of {data?.count ?? 0} employees
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </Button>
              {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => i + 1).map((p) => (
                <Button key={p} size="sm" variant={p === page ? 'primary' : 'outline'} onClick={() => setPage(p)}>{p}</Button>
              ))}
              <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
