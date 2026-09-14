import { cn } from '@/shared/lib/utils'

interface MarkProps {
  size?: number
  className?: string
  /** Adds the teal glow used in the dark sidebar */
  glow?: boolean
}

/** The SmartBiz app icon: stacked "S" on a teal tile. Inline SVG so it needs no asset request. */
export function LogoMark({ size = 36, className, glow }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="SmartBiz"
      className={cn('shrink-0 rounded-[25%]', glow && 'shadow-[0_0_24px_rgba(0,206,200,.25)]', className)}
    >
      <defs>
        <linearGradient id="sb-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#19dcd6" />
          <stop offset="1" stopColor="#006a67" />
        </linearGradient>
        <linearGradient id="sb-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#sb-tile)" />
      <rect width="64" height="32" rx="16" fill="url(#sb-sheen)" />
      <path d="M45 20H26a6 6 0 0 0 0 12h12a6 6 0 0 1 0 12H19" fill="none" stroke="#fff" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="47.5" cy="44" r="3.75" fill="#5af9f2" />
    </svg>
  )
}

interface LogoProps {
  /** 'light' = dark text for light backgrounds; 'dark' = white text for dark backgrounds */
  variant?: 'light' | 'dark'
  size?: 'sm' | 'md' | 'lg'
  tagline?: string | false
  className?: string
}

const SIZES = { sm: { mark: 32, word: 'text-[18px]', tag: 'text-[9px]' }, md: { mark: 40, word: 'text-[22px]', tag: 'text-[10px]' }, lg: { mark: 52, word: 'text-[28px]', tag: 'text-[11px]' } }

/** Horizontal lockup: mark + "SmartBiz" wordmark + optional tagline. */
export function Logo({ variant = 'light', size = 'md', tagline = 'Business OS', className }: LogoProps) {
  const s = SIZES[size]
  const dark = variant === 'dark'
  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={s.mark} glow={dark} />
      <div className="leading-none">
        <p className={cn('font-black tracking-[-0.03em] leading-none', s.word, dark ? 'text-white' : 'text-[#0b1c30]')}>
          Smart<span className={dark ? 'text-[#5af9f2]' : 'text-[#006a67]'}>Biz</span>
        </p>
        {tagline && (
          <p className={cn('mt-1 font-semibold uppercase tracking-[.16em] leading-none', s.tag, dark ? 'text-[#62e6df]' : 'text-[#6b7a79]')}>{tagline}</p>
        )}
      </div>
    </div>
  )
}
