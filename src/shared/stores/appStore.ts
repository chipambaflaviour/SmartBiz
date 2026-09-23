import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@supabase/supabase-js'

// ── Module keys that exist in the system ─────────────────────────────────────
export const MODULE_KEYS = [
  'dashboard',
  'pos',
  'inventory',
  'crm',
  'hr',
  'finance',
  'approvals',
  'payroll',
  'purchasing',
  'workflow',
  'ai',
  'settings',
] as const

export type ModuleKey = typeof MODULE_KEYS[number]

// ── UI State Store ─────────────────────────────────────────────────────────────
interface UIState {
  sidebarCollapsed: boolean
  mobileSidebarOpen: boolean
  commandPaletteOpen: boolean
  notificationCenterOpen: boolean
  orgSwitcherOpen: boolean
  setSidebarCollapsed: (v: boolean) => void
  setMobileSidebarOpen: (v: boolean) => void
  toggleSidebar: () => void
  setCommandPaletteOpen: (v: boolean) => void
  setNotificationCenterOpen: (v: boolean) => void
  setOrgSwitcherOpen: (v: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      commandPaletteOpen: false,
      notificationCenterOpen: false,
      orgSwitcherOpen: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setMobileSidebarOpen: (v) => set({ mobileSidebarOpen: v }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
      setNotificationCenterOpen: (v) => set({ notificationCenterOpen: v }),
      setOrgSwitcherOpen: (v) => set({ orgSwitcherOpen: v }),
    }),
    { name: 'smartbiz-ui', partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) }
  )
)

// ── App State Store ────────────────────────────────────────────────────────────
interface AppState {
  activeOrganizationId: string | null
  activeBranchId: string | null
  currentUser: User | null
  isPlatformAdmin: boolean
  accessPreview: AccessPreview | null
  setActiveOrganizationId: (id: string | null) => void
  setActiveBranchId: (id: string | null) => void
  setCurrentUser: (user: User | null) => void
  setIsPlatformAdmin: (value: boolean) => void
  startAccessPreview: (preview: AccessPreview) => void
  stopAccessPreview: () => void
  reset: () => void
}

export type PreviewModuleAccess = {
  moduleKey: string
  canView: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}

export type AccessPreview = {
  employeeId: string
  userId: string
  name: string
  email: string
  position: string | null
  role: string
  branchIds: string[]
  modules: PreviewModuleAccess[]
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeOrganizationId: null,
      activeBranchId: null,
      currentUser: null,
      isPlatformAdmin: false,
      accessPreview: null,
      // A branch always belongs to exactly one organization. Clearing it here
      // prevents a stale branch from leaking into the next workspace context.
      setActiveOrganizationId: (id) => set((state) => ({
        activeOrganizationId: id,
        activeBranchId: state.activeOrganizationId === id ? state.activeBranchId : null,
        accessPreview: state.activeOrganizationId === id ? state.accessPreview : null,
      })),
      setActiveBranchId: (id) => set({ activeBranchId: id }),
      setCurrentUser: (user) => set({ currentUser: user }),
      setIsPlatformAdmin: (value) => set({ isPlatformAdmin: value }),
      startAccessPreview: (accessPreview) => set({ accessPreview, activeBranchId: null }),
      stopAccessPreview: () => set({ accessPreview: null, activeBranchId: null }),
      reset: () => set({ activeOrganizationId: null, activeBranchId: null, currentUser: null, isPlatformAdmin: false, accessPreview: null }),
    }),
    {
      name: 'smartbiz-app',
      partialize: (s) => ({
        activeOrganizationId: s.activeOrganizationId,
        activeBranchId: s.activeBranchId,
        currentUser: s.currentUser,
        isPlatformAdmin: s.isPlatformAdmin,
        accessPreview: s.accessPreview,
      }),
    }
  )
)

// ── POS Cart Store ─────────────────────────────────────────────────────────────
export interface CartItem {
  cartKey: string
  productId: string
  sku: string
  name: string
  unitPrice: number
  quantity: number
  saleUnit: string
  unitMultiplier: number
  imageUrl: string | null
}

interface POSState {
  items: CartItem[]
  customerId: string | null
  discount: number
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (cartKey: string) => void
  updateQty: (cartKey: string, qty: number) => void
  setCustomer: (id: string | null) => void
  setDiscount: (pct: number) => void
  clearCart: () => void
}

export const usePOSStore = create<POSState>()((set) => ({
  items: [],
  customerId: null,
  discount: 0,
  addItem: (item) =>
    set((s) => {
      const existing = s.items.find((i) => i.cartKey === item.cartKey)
      if (existing) {
        return {
          items: s.items.map((i) =>
            i.cartKey === item.cartKey ? { ...i, quantity: i.quantity + 1 } : i
          ),
        }
      }
      return { items: [...s.items, { ...item, quantity: 1 }] }
    }),
  removeItem: (cartKey) =>
    set((s) => ({ items: s.items.filter((i) => i.cartKey !== cartKey) })),
  updateQty: (cartKey, qty) =>
    set((s) => ({
      items:
        qty <= 0
          ? s.items.filter((i) => i.cartKey !== cartKey)
          : s.items.map((i) => (i.cartKey === cartKey ? { ...i, quantity: qty } : i)),
    })),
  setCustomer: (id) => set({ customerId: id }),
  setDiscount: (pct) => set({ discount: pct }),
  clearCart: () => set({ items: [], customerId: null, discount: 0 }),
}))
