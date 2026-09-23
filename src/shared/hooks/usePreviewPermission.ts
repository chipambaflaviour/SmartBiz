import { useAppStore } from '@/shared/stores/appStore'

export type PreviewAction = 'view' | 'create' | 'update' | 'delete'

export function usePreviewPermission(moduleKey: string, action: PreviewAction) {
  const preview = useAppStore(state => state.accessPreview)
  if (!preview) return true
  const permission = preview.modules.find(module => module.moduleKey === moduleKey)
  if (!permission) return false
  return action === 'view' ? permission.canView : action === 'create' ? permission.canCreate : action === 'update' ? permission.canUpdate : permission.canDelete
}
