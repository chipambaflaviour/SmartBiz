import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AppShell } from '@/shared/components/layout/AppShell'
import { ProtectedRoute } from '@/modules/auth/ProtectedRoute'
import ComingSoonPage from '@/shared/components/ComingSoonPage'
import { lazy, Suspense } from 'react'
import { Spinner } from '@/shared/components/ui/Display'
import { isDemoMode } from '@/shared/lib/supabase'
import RouteErrorPage from '@/shared/components/RouteErrorPage'

// Lazy-loaded pages
const LoginPage = lazy(() => import('@/modules/auth/LoginPage'))
const ForgotPasswordPage = lazy(() => import('@/modules/auth/ForgotPasswordPage'))
const OrgSelectPage = lazy(() => import('@/modules/auth/OrgSelectPage'))
const AcceptInvitePage = lazy(() => import('@/modules/auth/AcceptInvitePage'))
const DashboardPage = lazy(() => import('@/modules/dashboard/DashboardPage'))
const POSPage = lazy(() => import('@/modules/sales/POSPage'))
const InvoicesPage = lazy(() => import('@/modules/sales/InvoicesPage'))
const InvoiceDetailPage = lazy(() => import('@/modules/sales/InvoiceDetailPage'))
const CreateInvoicePage = lazy(() => import('@/modules/sales/CreateInvoicePage'))
const ProductsPage = lazy(() => import('@/modules/inventory/ProductsPage'))
const ProductDetailPage = lazy(() => import('@/modules/inventory/ProductDetailPage'))
const ProductEditorPage = lazy(() => import('@/modules/inventory/ProductEditorPage'))
const StockTransferPage = lazy(() => import('@/modules/inventory/StockTransferPage'))
const PurchasingPage = lazy(() => import('@/modules/purchasing/PurchasingPage'))
const PurchaseOrderDetailPage = lazy(() => import('@/modules/purchasing/PurchaseOrderDetailPage'))
const SuppliersPage = lazy(() => import('@/modules/purchasing/SuppliersPage'))
const CustomersPage = lazy(() => import('@/modules/crm/CustomersPage'))
const CustomerProfilePage = lazy(() => import('@/modules/crm/CustomerProfilePage'))
const CustomerEditorPage = lazy(() => import('@/modules/crm/CustomerEditorPage'))
const EmployeesPage = lazy(() => import('@/modules/hr/EmployeesPage'))
const EmployeeEditorPage = lazy(() => import('@/modules/hr/EmployeeEditorPage'))
const OrganizationSettingsPage = lazy(() => import('@/modules/settings/OrganizationSettingsPage'))
const ApprovalsInboxPage = lazy(() => import('@/modules/approvals/ApprovalsInboxPage'))
const ModulesPage = lazy(() => import('@/modules/settings/ModulesPage'))
const ControlCenterPage = lazy(() => import('@/modules/platform/ControlCenterPage'))
const VatSummaryPage = lazy(() => import('@/modules/finance/VatSummaryPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner size={28} />
    </div>
  )
}

function ProtectedShell() {
  return (
    <ProtectedRoute>
      <AppShell />
    </ProtectedRoute>
  )
}

export const router = createBrowserRouter([
  // Auth routes
  {
    path: '/auth',
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Navigate to="/auth/login" replace /> },
      { path: 'login', element: <Suspense fallback={<PageLoader />}><LoginPage /></Suspense> },
      { path: 'signup', element: <Navigate to="/auth/login" replace /> },
      { path: 'forgot-password', element: <Suspense fallback={<PageLoader />}><ForgotPasswordPage /></Suspense> },
      { path: 'org-select', element: <Suspense fallback={<PageLoader />}><OrgSelectPage /></Suspense> },
      { path: 'accept-invite', element: <Suspense fallback={<PageLoader />}><AcceptInvitePage /></Suspense> },
    ],
  },

  // App routes (protected, inside AppShell)
  {
    path: '/app',
    element: <ProtectedShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Navigate to="/app/dashboard" replace /> },

      // Dashboard
      {
        path: 'dashboard',
        element: <Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>,
      },

      // Sales
      {
        path: 'sales',
        children: [
          { index: true, element: <Navigate to="/app/sales/pos" replace /> },
          { path: 'pos', element: <Suspense fallback={<PageLoader />}><POSPage /></Suspense> },
          {
            path: 'orders',
            element: <Suspense fallback={<PageLoader />}><ComingSoonPage module="Orders" /></Suspense>,
          },
          {
            path: 'invoices',
            element: <Suspense fallback={<PageLoader />}><InvoicesPage /></Suspense>,
          },
          {
            path: 'invoices/new',
            element: <Suspense fallback={<PageLoader />}><CreateInvoicePage /></Suspense>,
          },
          {
            path: 'invoices/:id',
            element: isDemoMode ? <ComingSoonPage module="Invoice Detail" /> : <Suspense fallback={<PageLoader />}><InvoiceDetailPage /></Suspense>,
          },
        ],
      },

      // Inventory
      {
        path: 'inventory',
        children: [
          { index: true, element: <Navigate to="/app/inventory/products" replace /> },
          { path: 'products', element: <Suspense fallback={<PageLoader />}><ProductsPage /></Suspense> },
          { path: 'products/new', element: <Suspense fallback={<PageLoader />}><ProductEditorPage /></Suspense> },
          {
            path: 'products/:id',
            element: isDemoMode ? <ComingSoonPage module="Product Detail" /> : <Suspense fallback={<PageLoader />}><ProductDetailPage /></Suspense>,
          },
          { path: 'products/:id/edit', element: <Suspense fallback={<PageLoader />}><ProductEditorPage /></Suspense> },
          {
            path: 'warehouses',
            element: <Suspense fallback={<PageLoader />}><ComingSoonPage module="Warehouses" /></Suspense>,
          },
          {
            path: 'adjustments',
            element: <Suspense fallback={<PageLoader />}><ComingSoonPage module="Stock Adjustments" /></Suspense>,
          },
          { path: 'transfers/new', element: isDemoMode ? <ComingSoonPage module="Stock Transfer" /> : <Suspense fallback={<PageLoader />}><StockTransferPage /></Suspense> },
        ],
      },

      // CRM
      {
        path: 'crm',
        children: [
          { index: true, element: <Navigate to="/app/crm/customers" replace /> },
          { path: 'customers', element: <Suspense fallback={<PageLoader />}><CustomersPage /></Suspense> },
          { path: 'customers/new', element: <Suspense fallback={<PageLoader />}><CustomerEditorPage /></Suspense> },
          {
            path: 'customers/:id',
            element: isDemoMode ? <ComingSoonPage module="Customer Profile" /> : <Suspense fallback={<PageLoader />}><CustomerProfilePage /></Suspense>,
          },
          { path: 'customers/:id/edit', element: <Suspense fallback={<PageLoader />}><CustomerEditorPage /></Suspense> },
        ],
      },

      // HR
      {
        path: 'hr',
        children: [
          { index: true, element: <Navigate to="/app/hr/employees" replace /> },
          { path: 'employees', element: <Suspense fallback={<PageLoader />}><EmployeesPage /></Suspense> },
          { path: 'employees/new', element: <Suspense fallback={<PageLoader />}><EmployeeEditorPage /></Suspense> },
          {
            path: 'employees/:id',
            element: <Suspense fallback={<PageLoader />}><EmployeeEditorPage /></Suspense>,
          },
          {
            path: 'leave',
            element: <Suspense fallback={<PageLoader />}><ComingSoonPage module="Leave Management" /></Suspense>,
          },
        ],
      },

      // Finance
      {
        path: 'finance',
        children: [
          { index: true, element: <Navigate to="/app/finance/invoices" replace /> },
          {
            path: 'invoices',
            element: <Suspense fallback={<PageLoader />}><ComingSoonPage module="Finance — Invoices" /></Suspense>,
          },
          {
            path: 'payments',
            element: <Suspense fallback={<PageLoader />}><ComingSoonPage module="Payment Recording" /></Suspense>,
          },
          {
            path: 'aging',
            element: <Suspense fallback={<PageLoader />}><ComingSoonPage module="AR Aging Report" /></Suspense>,
          },
          { path: 'vat-summary', element: <Suspense fallback={<PageLoader />}><VatSummaryPage /></Suspense> },
        ],
      },

      // Approvals
      {
        path: 'approvals',
        element: <Suspense fallback={<PageLoader />}><ApprovalsInboxPage /></Suspense>,
      },

      // Settings
      {
        path: 'settings',
        children: [
          { index: true, element: <Navigate to="/app/settings/organization" replace /> },
          {
            path: 'organization',
            element: <Suspense fallback={<PageLoader />}><OrganizationSettingsPage /></Suspense>,
          },
          {
            path: 'modules',
            element: <Suspense fallback={<PageLoader />}><ModulesPage /></Suspense>,
          },
          {
            path: 'roles',
            element: <Suspense fallback={<PageLoader />}><ComingSoonPage module="Roles & Permissions" /></Suspense>,
          },
        ],
      },

      // Coming-soon module shells
      { path: 'payroll', element: <ComingSoonPage module="Payroll" /> },
      { path: 'purchasing', element: <Suspense fallback={<PageLoader />}><PurchasingPage /></Suspense> },
      { path: 'purchasing/:id', element: <Suspense fallback={<PageLoader />}><PurchaseOrderDetailPage /></Suspense> },
      { path: 'suppliers', element: <Suspense fallback={<PageLoader />}><SuppliersPage /></Suspense> },
      { path: 'expenses', element: <ComingSoonPage module="Expenses" /> },
      { path: 'accounting', element: <ComingSoonPage module="Accounting" /> },
      { path: 'loans', element: <ComingSoonPage module="Loans" /> },
      { path: 'projects', element: <ComingSoonPage module="Projects" /> },
      { path: 'assets', element: <ComingSoonPage module="Assets" /> },
      { path: 'fleet', element: <ComingSoonPage module="Fleet & Fuel" /> },
      { path: 'reports', element: <ComingSoonPage module="Reports" /> },
      { path: 'crm-pipeline', element: <ComingSoonPage module="CRM Pipeline" /> },
      { path: 'workflow', element: <ComingSoonPage module="Workflow Automation" /> },
      { path: 'ai', element: <ComingSoonPage module="AI & Analytics" /> },
      { path: 'marketplace', element: <ComingSoonPage module="Marketplace" /> },
      { path: 'security', element: <ComingSoonPage module="Security Center" /> },
      { path: 'audit', element: <ComingSoonPage module="Audit Logs" /> },
      { path: 'subscription', element: <ComingSoonPage module="Subscription & Billing" /> },
      { path: 'notifications', element: <ComingSoonPage module="Notifications" /> },
      { path: 'developer', element: <ComingSoonPage module="Developer Portal" /> },
      { path: 'control-center', element: <Suspense fallback={<PageLoader />}><ControlCenterPage /></Suspense> },
      { path: 'portal/customer', element: <ComingSoonPage module="Customer Portal" /> },
      { path: 'portal/employee', element: <ComingSoonPage module="Employee Portal" /> },
    ],
  },

  // Root redirect
  { path: '/', element: <Navigate to="/app/dashboard" replace /> },
  { path: '*', element: <Navigate to="/app/dashboard" replace /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
