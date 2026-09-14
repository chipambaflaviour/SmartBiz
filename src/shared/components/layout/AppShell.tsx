import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { CommandPalette } from '@/shared/components/CommandPalette'
import { NotificationCenter } from '@/shared/components/NotificationCenter'
import { OrgSwitcher } from '@/shared/components/OrgSwitcher'
import { ModuleGuard } from '@/shared/components/ModuleGuard'
import { useUIStore } from '@/shared/stores/appStore'
import { cn } from '@/shared/lib/utils'

export function AppShell() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const mobileOpen = useUIStore((s) => s.mobileSidebarOpen)
  const setMobileOpen = useUIStore((s) => s.setMobileSidebarOpen)

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
