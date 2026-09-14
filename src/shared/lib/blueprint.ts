export type SmartBizModule = {
  key: string
  label: string
  icon: string
  href: string
  group: 'Operate' | 'People' | 'Finance' | 'Intelligence' | 'Platform'
  description: string
  core?: boolean
}

export const SMARTBIZ_MODULES: SmartBizModule[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/app/dashboard', group: 'Operate', description: 'Executive and branch performance', core: true },
  { key: 'pos', label: 'Sales & POS', icon: 'point_of_sale', href: '/app/sales/pos', group: 'Operate', description: 'POS, orders, invoices and returns' },
  { key: 'inventory', label: 'Products & Inventory', icon: 'inventory_2', href: '/app/inventory/products', group: 'Operate', description: 'Products, warehouses and stock control' },
  { key: 'purchasing', label: 'Purchasing', icon: 'shopping_cart', href: '/app/purchasing', group: 'Operate', description: 'Requisitions, purchase orders and GRNs' },
  { key: 'suppliers', label: 'Suppliers', icon: 'local_shipping', href: '/app/suppliers', group: 'Operate', description: 'Supplier master and performance' },
  { key: 'crm', label: 'Customers & CRM', icon: 'groups', href: '/app/crm/customers', group: 'Operate', description: 'Customers, credit accounts and pipeline' },
  { key: 'hr', label: 'Employees & HR', icon: 'badge', href: '/app/hr/employees', group: 'People', description: 'Employees, attendance and performance' },
  { key: 'payroll', label: 'Payroll', icon: 'account_balance_wallet', href: '/app/payroll', group: 'People', description: 'Payroll runs, payslips and deductions' },
  { key: 'leave', label: 'Leave', icon: 'event_available', href: '/app/hr/leave', group: 'People', description: 'Requests, balances and policies' },
  { key: 'loans', label: 'Employee Loans', icon: 'request_quote', href: '/app/loans', group: 'People', description: 'Applications, schedules and repayments' },
  { key: 'finance', label: 'Finance', icon: 'payments', href: '/app/finance/invoices', group: 'Finance', description: 'Receivables, payables and cash' },
  { key: 'expenses', label: 'Expenses', icon: 'receipt_long', href: '/app/expenses', group: 'Finance', description: 'Claims, approvals and budgets' },
  { key: 'accounting', label: 'Accounting', icon: 'account_balance', href: '/app/accounting', group: 'Finance', description: 'Ledger, journals and statements' },
  { key: 'assets', label: 'Assets', icon: 'precision_manufacturing', href: '/app/assets', group: 'Finance', description: 'Register, assignment and depreciation' },
  { key: 'reports', label: 'Reports & BI', icon: 'insights', href: '/app/reports', group: 'Intelligence', description: 'Reports, KPIs and scheduled exports' },
  { key: 'approvals', label: 'Approvals', icon: 'task_alt', href: '/app/approvals', group: 'Intelligence', description: 'Cross-module approval inbox', core: true },
  { key: 'workflow', label: 'Automation', icon: 'account_tree', href: '/app/workflow', group: 'Intelligence', description: 'Rules, triggers and workflows' },
  { key: 'ai', label: 'AI & Analytics', icon: 'auto_awesome', href: '/app/ai', group: 'Intelligence', description: 'Forecasts, anomalies and recommendations' },
  { key: 'marketplace', label: 'Marketplace', icon: 'storefront', href: '/app/marketplace', group: 'Platform', description: 'Industry modules and integrations' },
  { key: 'security', label: 'Security Center', icon: 'shield_lock', href: '/app/security', group: 'Platform', description: 'Sessions, policies and risk' },
  { key: 'audit', label: 'Audit Logs', icon: 'manage_search', href: '/app/audit', group: 'Platform', description: 'Tamper-evident activity history' },
  { key: 'subscription', label: 'Subscription', icon: 'workspace_premium', href: '/app/subscription', group: 'Platform', description: 'Entitlements, usage and renewal', core: true },
  { key: 'developer', label: 'Developer & APIs', icon: 'terminal', href: '/app/developer', group: 'Platform', description: 'API keys, webhooks and integrations' },
]

export const DEFAULT_ENABLED_MODULES = SMARTBIZ_MODULES.map(({ key }) => key)
