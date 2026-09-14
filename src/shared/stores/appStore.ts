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
  setActiveOrganizationId: (id: string | null) => void
  setActiveBranchId: (id: string | null) => void
  setCurrentUser: (user: User | null) => void
  setIsPlatformAdmin: (value: boolean) => void
  reset: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeOrganizationId: null,
      activeBranchId: null,
      currentUser: null,
      isPlatformAdmin: false,
      setActiveOrganizationId: (id) => set({ activeOrganizationId: id }),
      setActiveBranchId: (id) => set({ activeBranchId: id }),
      setCurrentUser: (user) => set({ currentUser: user }),
      setIsPlatformAdmin: (value) => set({ isPlatformAdmin: value }),
      reset: () => set({ activeOrganizationId: null, activeBranchId: null, currentUser: null, isPlatformAdmin: false }),
    }),
    {
      name: 'smartbiz-app',
      partialize: (s) => ({
        activeOrganizationId: s.activeOrganizationId,
        activeBranchId: s.activeBranchId,
        currentUser: s.currentUser,
        isPlatformAdmin: s.isPlatformAdmin,
      }),
    }
  )
)

// ── POS Cart Store ─────────────────────────────────────────────────────────────
export interface CartItem {
  productId: string
  sku: string
  name: string
  unitPrice: number
  quantity: number
  imageUrl: string | null
}

interface POSState {
  items: CartItem[]
  customerId: string | null
  discount: number
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (productId: string) => void
  updateQty: (productId: string, qty: number) => void
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
      const existing = s.items.find((i) => i.productId === item.productId)
      if (existing) {
        return {
          items: s.items.map((i) =>
            i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i
          ),
        }
      }
      return { items: [...s.items, { ...item, quantity: 1 }] }
    }),
  removeItem: (productId) =>
    set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
  updateQty: (productId, qty) =>
    set((s) => ({
      items:
        qty <= 0
          ? s.items.filter((i) => i.productId !== productId)
          : s.items.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i)),
    })),
  setCustomer: (id) => set({ customerId: id }),
  setDiscount: (pct) => set({ discount: pct }),
  clearCart: () => set({ items: [], customerId: null, discount: 0 }),
}))
