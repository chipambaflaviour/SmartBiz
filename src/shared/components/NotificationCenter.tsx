import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isDemoMode, supabase } from '@/shared/lib/supabase'
import { useAppStore, useUIStore } from '@/shared/stores/appStore'
import { formatDate } from '@/shared/lib/utils'
import { cn } from '@/shared/lib/utils'

const DEMO_NOTIFICATIONS = [
  { id: 'notice-1', type: 'warning', title: 'Low stock requires attention', body: '23 products are below their reorder level.', is_read: false, created_at: new Date().toISOString() },
  { id: 'notice-2', type: 'success', title: 'Payment received', body: 'Invoice INV-2024-0847 was paid in full.', is_read: false, created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 'notice-3', type: 'info', title: 'Payroll review ready', body: 'September payroll is ready for approval.', is_read: false, created_at: new Date(Date.now() - 7200000).toISOString() },
]

export function NotificationCenter() {
  const open = useUIStore((s) => s.notificationCenterOpen)
  const setOpen = useUIStore((s) => s.setNotificationCenterOpen)
  const currentUser = useAppStore((s) => s.currentUser)
  const orgId = useAppStore((s) => s.activeOrganizationId)
  const queryClient = useQueryClient()

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return []
      if (isDemoMode) return DEMO_NOTIFICATIONS
      const { data } = await supabase
        .from('notification')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(30)
      return data ?? []
    },
    enabled: !!currentUser?.id && open,
  })

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) return id
      await supabase.from('notification').update({ is_read: true }).eq('id', id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notification-count'] })
    },
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id) return
      if (isDemoMode) return
      await supabase.from('notification').update({ is_read: true }).eq('user_id', currentUser.id).eq('is_read', false)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notification-count'] })
    },
  })

  // Real-time updates
  useEffect(() => {
    if (isDemoMode || !currentUser?.id || !orgId) return
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notification',
        filter: `user_id=eq.${currentUser.id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
        queryClient.invalidateQueries({ queryKey: ['notification-count'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUser?.id, orgId, queryClient])

  // Keyboard close
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  const iconMap: Record<string, string> = {
    info: 'info', success: 'check_circle', warning: 'warning', error: 'error',
  }
  const colorMap: Record<string, string> = {
    info: 'text-[#2563eb]', success: 'text-[#16a34a]', warning: 'text-[#d97706]', error: 'text-[#dc2626]',
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[150]" onClick={() => setOpen(false)} />
      <div className="fixed top-16 right-0 w-80 h-[calc(100vh-64px)] z-[160] bg-white border-l border-[#bacac8] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5eeff]">
          <h3 className="text-[16px] font-semibold text-[#0b1c30]">Notifications</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => markAllRead.mutate()}
              className="text-[12px] text-[#006a67] hover:underline"
            >
              Mark all read
            </button>
            <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#e5eeff] text-[#6b7a79]">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
              <span className="material-symbols-outlined text-[36px] text-[#bacac8]">notifications_none</span>
              <p className="text-[14px] font-semibold text-[#0b1c30]">All caught up</p>
              <p className="text-[12px] text-[#6b7a79]">No new notifications</p>
            </div>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.is_read && markRead.mutate(n.id)}
              className={cn(
                'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-[#e5eeff] transition-colors hover:bg-[#f8f9ff]',
                !n.is_read && 'bg-[#eff4ff]'
              )}
            >
              <span className={cn('material-symbols-outlined text-[20px] mt-0.5 shrink-0', colorMap[n.type] ?? 'text-[#6b7a79]')}>
                {iconMap[n.type] ?? 'circle'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={cn('text-[13px] text-[#0b1c30]', !n.is_read && 'font-semibold')}>{n.title}</p>
                <p className="text-[12px] text-[#6b7a79] mt-0.5">{n.body}</p>
                <p className="text-[11px] text-[#bacac8] mt-1">{formatDate(n.created_at)}</p>
              </div>
              {!n.is_read && (
                <span className="w-2 h-2 rounded-full bg-[#006a67] mt-1.5 shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
