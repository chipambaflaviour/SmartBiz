import { useEffect, useRef, useState } from 'react'
import { useBranches } from '@/shared/hooks/useBranches'
import { useAppStore } from '@/shared/stores/appStore'
import { cn } from '@/shared/lib/utils'

export function BranchSwitcher() {
  const { branches, activeBranch, canUseAllBranches, isLoading } = useBranches()
  const setActiveBranchId = useAppStore((state) => state.setActiveBranchId)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Current branch: ${activeBranch?.name ?? (canUseAllBranches ? 'All branches' : 'No branch selected')}`}
        disabled={isLoading || branches.length === 0}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-[190px] items-center gap-1 rounded-md text-[11px] text-[#6b7a79] outline-none hover:text-[#006a67] focus-visible:ring-2 focus-visible:ring-[#00CEC8] disabled:cursor-default"
      >
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">store</span>
        <span className="truncate">{isLoading ? 'Loading branches…' : activeBranch?.name ?? (canUseAllBranches ? 'All branches' : 'No active branch')}</span>
        {branches.length > 1 && <span className="material-symbols-outlined text-[14px]" aria-hidden="true">expand_more</span>}
      </button>

      {open && branches.length > 0 && (
        <div role="listbox" aria-label="Choose active branch" className="absolute left-0 top-full z-[190] mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-semibold text-[#0b1c30]">Working branch</p>
            <p className="text-[11px] text-[#6b7a79]">New activity will use this location.</p>
          </div>
          {canUseAllBranches && <button type="button" role="option" aria-selected={!activeBranch} onClick={() => { setActiveBranchId(null); setOpen(false) }} className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:bg-[#eff4ff]', !activeBranch && 'bg-[#eff4ff]')}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#00cec8]/10 text-[#007f7a]"><span className="material-symbols-outlined text-[18px]">corporate_fare</span></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-[#0b1c30]">All branches</span><span className="block text-[11px] text-[#6b7a79]">Organization-wide reporting and oversight</span></span>{!activeBranch && <span className="material-symbols-outlined text-[19px] text-[#006a67]">check_circle</span>}</button>}
          {branches.map((branch) => {
            const selected = branch.id === activeBranch?.id
            return (
              <button
                type="button"
                role="option"
                aria-selected={selected}
                key={branch.id}
                onClick={() => { setActiveBranchId(branch.id); setOpen(false) }}
                className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:bg-[#eff4ff]', selected && 'bg-[#eff4ff]')}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#00cec8]/10 text-[#007f7a]">
                  <span className="material-symbols-outlined text-[18px]">{branch.is_headquarters ? 'domain' : 'store'}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-[#0b1c30]">
                    <span className="truncate">{branch.name}</span>
                    {branch.is_headquarters && <span className="rounded bg-[#e5eeff] px-1.5 py-0.5 text-[9px] font-bold text-[#006a67]">HQ</span>}
                  </span>
                  <span className="block truncate text-[11px] text-[#6b7a79]">{branch.code}{branch.city ? ` · ${branch.city}` : ''}</span>
                </span>
                {selected && <span className="material-symbols-outlined text-[19px] text-[#006a67]">check_circle</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
