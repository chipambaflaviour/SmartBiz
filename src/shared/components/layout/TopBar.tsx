import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAppStore, useUIStore } from '@/shared/stores/appStore'
import { Avatar } from '@/shared/components/ui/Display'
import { cn } from '@/shared/lib/utils'
import { isDemoMode } from '@/shared/lib/supabase'

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '')

export function TopBar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const setMobileSidebarOpen = useUIStore((s) => s.setMobileSidebarOpen)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const setNotificationCenterOpen = useUIStore((s) => s.setNotificationCenterOpen)
  const setOrgSwitcherOpen = useUIStore((s) => s.setOrgSwitcherOpen)
  const activeOrgId = useAppStore((s) => s.activeOrganizationId)
  const currentUser = useAppStore((s) => s.currentUser)
  const isPlatformAdmin = useAppStore((s) => s.isPlatformAdmin)
  const resetApp = useAppStore((s) => s.reset)
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fetch active org info
  const { data: org } = useQuery({
    queryKey: ['org-info', activeOrgId],
    queryFn: async () => {
      if (isDemoMode) return { name: 'Lusaka Fresh Market', logo_url: null }
      if (!activeOrgId) return null
      const { data } = await supabase.from('organization').select('name, logo_url').eq('id', activeOrgId).single()
      return data
    },
    enabled: !!activeOrgId,
  })

  // Unread notification count
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notification-count', currentUser?.id],
    queryFn: async () => {
      if (isDemoMode) return 3
      if (!currentUser?.id) return 0
      const { count } = await supabase
        .from('notification')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', currentUser.id)
        .eq('is_read', false)
      return count ?? 0
    },
    enabled: !!currentUser?.id,
    refetchInterval: 30000,
  })

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const sidebarWidth = collapsed ? 'left-0 md:left-16' : 'left-0 md:left-64'

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-[72px] z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/80',
        'flex items-center justify-between px-6 transition-all duration-300',
        sidebarWidth
      )}
    >
      {/* Left: collapse toggle + org/branch switcher */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => window.matchMedia('(min-width: 768px)').matches ? toggleSidebar() : setMobileSidebarOpen(true)}
          aria-label="Open navigation menu"
          className="w-8 h-8 flex items-center justify-center rounded text-[#6b7a79] hover:bg-[#e5eeff] hover:text-[#006a67] transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>

        {/* Org switcher trigger */}
        <button
          onClick={() => setOrgSwitcherOpen(true)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#e5eeff] transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-[#00CEC8] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
            {org?.name ? org.name.slice(0, 2).toUpperCase() : isPlatformAdmin ? 'SA' : 'SB'}
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-[12px] font-semibold text-[#0b1c30] leading-none">{org?.name ?? (isPlatformAdmin ? 'SmartBiz Platform' : 'Select Org')}</p>
            <p className="text-[11px] text-[#6b7a79] leading-none mt-0.5">{isPlatformAdmin ? (org ? 'Super Administrator · full access' : 'Super Administrator') : 'Main Branch'}</p>
          </div>
          <span className="material-symbols-outlined text-[#6b7a79] text-[18px]">expand_more</span>
        </button>
      </div>

      {/* Center: global search */}
      <div className="flex-1 hidden md:flex justify-center px-4">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          aria-label="Open command palette"
          aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
          className={cn(
            'group w-full max-w-[460px] h-10 pl-3.5 pr-2 flex items-center gap-2.5 text-left',
            'rounded-xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(11,28,48,.04)]',
            'text-[13px] text-[#6b7a79] transition-all duration-150',
            'hover:border-[#00CEC8]/60 hover:shadow-[0_0_0_3px_rgba(0,206,200,.12)] hover:text-[#3b4948]',
            'focus-visible:outline-none focus-visible:border-[#00CEC8] focus-visible:shadow-[0_0_0_3px_rgba(0,206,200,.18)]'
          )}
        >
          <span className="material-symbols-outlined text-[20px] text-[#8a9796] group-hover:text-[#006a67] transition-colors">search</span>
          <span className="flex-1 truncate">
            Search or jump to<span className="hidden lg:inline"> — products, customers, invoices</span>…
          </span>
          <span className="flex items-center gap-1 shrink-0" aria-hidden="true">
            <kbd className="h-6 min-w-6 px-1.5 inline-flex items-center justify-center rounded-md bg-[#eff4ff] border border-[#dce9ff] text-[11px] font-medium text-[#3b4948] font-sans">
              {isMac ? '⌘' : 'Ctrl'}
            </kbd>
            <kbd className="h-6 min-w-6 px-1.5 inline-flex items-center justify-center rounded-md bg-[#eff4ff] border border-[#dce9ff] text-[11px] font-medium text-[#3b4948] font-sans">
              K
            </kbd>
          </span>
        </button>
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Mobile search */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-[#6b7a79] hover:bg-[#e5eeff] transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">search</span>
        </button>

        {/* Notifications */}
        <button
          onClick={() => setNotificationCenterOpen(true)}
          className="relative w-9 h-9 flex items-center justify-center rounded-lg text-[#6b7a79] hover:bg-[#e5eeff] hover:text-[#006a67] transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#ba1a1a] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <div className="w-px h-6 bg-[#bacac8] mx-1" />

        {/* User avatar + menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-[#e5eeff] transition-colors"
          >
            <Avatar
              name={currentUser?.email ?? 'User'}
              imageUrl={currentUser?.user_metadata?.avatar_url}
              size="sm"
            />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-[#bacac8] rounded-xl shadow-lg z-50 py-1 overflow-hidden">
              <div className="px-3 py-2 border-b border-[#e5eeff]">
                <p className="text-[13px] font-semibold text-[#0b1c30] truncate">
                  {currentUser?.user_metadata?.full_name ?? currentUser?.email}
                </p>
                <p className="text-[11px] text-[#6b7a79] truncate">{currentUser?.email}</p>
              </div>
              <button
                onClick={() => { setUserMenuOpen(false); navigate('/app/settings/organization') }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#3b4948] hover:bg-[#eff4ff] transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[16px]">manage_accounts</span>
                Profile & Settings
              </button>
              <button
                onClick={async () => { setUserMenuOpen(false); await supabase.auth.signOut(); resetApp(); navigate('/auth/login') }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#991b1b] hover:bg-[#fee2e2] transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[16px]">logout</span>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
