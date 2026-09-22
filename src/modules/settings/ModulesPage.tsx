import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/shared/stores/appStore'
import { isDemoMode, supabase } from '@/shared/lib/supabase'
import { DEMO_MODULES } from '@/shared/lib/demo'
import { PageHeader, Card, Spinner, Badge } from '@/shared/components/ui/Display'
import { cn } from '@/shared/lib/utils'

const MODULES_CONFIG = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', description: 'Executive overview, KPIs, charts, and activity feed.' },
  { key: 'pos', label: 'Sales / POS', icon: 'point_of_sale', description: 'Point-of-sale terminal, orders, and invoicing.' },
  { key: 'inventory', label: 'Inventory', icon: 'inventory_2', description: 'Product catalog, stock levels, and warehouse management.' },
  { key: 'crm', label: 'CRM', icon: 'groups', description: 'Customer relationship management and sales pipeline.' },
  { key: 'hr', label: 'Human Resources', icon: 'badge', description: 'Employee directory, attendance, leave, and payroll.' },
  { key: 'finance', label: 'Finance', icon: 'payments', description: 'Invoices, payments, aging reports, and accounting.' },
  { key: 'approvals', label: 'Approvals', icon: 'task_alt', description: 'Multi-level approval workflows across all modules.' },
  { key: 'payroll', label: 'Payroll', icon: 'account_balance_wallet', description: 'Payslip generation, salary processing, and compliance.' },
  { key: 'purchasing', label: 'Purchasing', icon: 'shopping_cart', description: 'Purchase orders, supplier management, and GRN.' },
  { key: 'workflow', label: 'Workflow Automation', icon: 'account_tree', description: 'Custom automation rules, triggers, and integrations.' },
  { key: 'ai', label: 'AI & Analytics', icon: 'auto_awesome', description: 'AI-powered insights, forecasting, and BI reports.' },
] as const

type ModuleSetting = { module_key: string; is_enabled: boolean }

export default function ModulesPage() {
  const orgId = useAppStore((s) => s.activeOrganizationId)

  const { data: modules = [], isLoading } = useQuery<ModuleSetting[]>({
    // NOTE: must differ from useOrganizationModules' ['org-modules'] key — the row shape is different
    queryKey: ['org-module-settings', orgId],
    queryFn: async () => {
      if (!orgId) return []
      if (isDemoMode) {
        const saved = localStorage.getItem('smartbiz-demo-modules')
        return saved ? JSON.parse(saved) as ModuleSetting[] : DEMO_MODULES.map((module) => ({ module_key: module.moduleKey, is_enabled: module.isEnabled }))
      }
      const { data } = await supabase
        .from('organization_module')
        .select('module_key, is_enabled')
        .eq('organization_id', orgId)
      return data ?? []
    },
    enabled: !!orgId,
  })

  const isEnabled = (key: string) => modules.find((m) => m.module_key === key)?.is_enabled ?? false

  return (
    <div>
      <PageHeader
        title="Module Management"
        subtitle="Modules included in your organization’s SmartBiz subscription."
        breadcrumb={[{ label: 'Settings' }, { label: 'Modules' }]}
      />

      <div className="px-6">
        {isLoading && <div className="flex justify-center py-20"><Spinner size={28} /></div>}

        {!isLoading && (
          <>
            <div className="mb-4 p-3 bg-[#eff4ff] border border-[#dce9ff] rounded-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-[#006a67] text-[18px]">info</span>
              <p className="text-[13px] text-[#3b4948]">
                Purchased modules are controlled by SmartBiz Platform Administration. Organization administrators can distribute these modules to branches and employees, but cannot add unpaid modules.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {MODULES_CONFIG.map((mod) => {
                const enabled = isEnabled(mod.key)
                const isComing = false
                return (
                  <div
                    key={mod.key}
                    className={cn(
                      'bg-white border rounded-xl p-5 flex flex-col gap-3 transition-all',
                      enabled && !isComing ? 'border-[#006a67]' : 'border-[#bacac8]',
                      isComing && 'opacity-60'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center',
                        enabled && !isComing ? 'bg-[#006a67] text-white' : 'bg-[#e5eeff] text-[#006a67]'
                      )}>
                        <span className="material-symbols-outlined text-[22px]">{mod.icon}</span>
                      </div>
                      <Badge variant={enabled ? 'success' : 'outline'}>{enabled ? 'Purchased' : 'Not included'}</Badge>
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-[#0b1c30]">{mod.label}</p>
                      <p className="text-[12px] text-[#6b7a79] mt-0.5">{mod.description}</p>
                    </div>
                    <div className="flex items-center gap-1 mt-auto">
                      <span className={cn(
                        'w-2 h-2 rounded-full',
                        isComing ? 'bg-[#bacac8]' : enabled ? 'bg-[#16a34a]' : 'bg-[#bacac8]'
                      )} />
                      <span className="text-[11px] text-[#6b7a79]">
                        {enabled ? 'Available to assign' : 'Contact SmartBiz to add this module'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
