import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { CommandPalette } from '@/shared/components/CommandPalette'
import { NotificationCenter } from '@/shared/components/NotificationCenter'
import { OrgSwitcher } from '@/shared/components/OrgSwitcher'
import { ModuleGuard } from '@/shared/components/ModuleGuard'
import { useAppStore, useUIStore } from '@/shared/stores/appStore'
import { cn } from '@/shared/lib/utils'
import { useBranches } from '@/shared/hooks/useBranches'

export function AppShell() {
  // Establish and continuously validate branch context for every workspace page.
  useBranches()
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const mobileOpen = useUIStore((s) => s.mobileSidebarOpen)
  const setMobileOpen = useUIStore((s) => s.setMobileSidebarOpen)
  const accessPreview = useAppStore((s) => s.accessPreview)
  const stopAccessPreview = useAppStore((s) => s.stopAccessPreview)

  return (
    <div className="min-h-screen bg-transparent">
      <Sidebar />
      {mobileOpen && (
        <button
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <TopBar />

      <main
        className={cn(
          'pt-[72px] min-h-screen transition-all duration-300 page-content-enter',
          collapsed ? 'md:ml-16' : 'md:ml-64'
        )}
      >
        {accessPreview && (
          <div role="status" className="sticky top-[72px] z-30 flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 shadow-sm sm:px-6">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-200 text-amber-900"><span className="material-symbols-outlined text-[20px]">person_play</span></span>
              <div><p className="text-sm font-bold text-amber-950">Workspace preview: {accessPreview.name}</p><p className="text-xs text-amber-800">{accessPreview.position ?? 'Employee'} · {accessPreview.role} · navigation and actions are filtered to this profile</p></div>
            </div>
            <button type="button" onClick={stopAccessPreview} className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100">Exit employee view</button>
          </div>
        )}
        <ModuleGuard>
          <Outlet />
        </ModuleGuard>
      </main>

      {/* Global overlays */}
      <CommandPalette />
      <NotificationCenter />
      <OrgSwitcher />
    </div>
  )
}
