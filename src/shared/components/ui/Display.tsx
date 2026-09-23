import React from 'react'
import { useNavigate } from 'react-router-dom'
import { cn, getInitials, avatarColor } from '@/shared/lib/utils'

// ── Badge ─────────────────────────────────────────────────────────────────────
interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline'
  size?: 'sm' | 'md'
  children: React.ReactNode
  className?: string
}

const badgeVariants: Record<NonNullable<BadgeProps['variant']>, string> = {
  default:  'bg-[#e5eeff] text-[#006a67]',
  success:  'bg-[#dcfce7] text-[#166534]',
  warning:  'bg-[#fef3c7] text-[#92400e]',
  danger:   'bg-[#fee2e2] text-[#991b1b]',
  info:     'bg-[#dbeafe] text-[#1e40af]',
  outline:  'border border-[#bacac8] text-[#3b4948] bg-transparent',
}

export function Badge({ variant = 'default', size = 'sm', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded font-medium whitespace-nowrap',
        size === 'sm' ? 'text-[11px] px-1.5 py-0.5' : 'text-[12px] px-2 py-0.5',
        badgeVariants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

// Status dot badge
export function StatusDot({ status }: { status: 'active' | 'inactive' | 'on-leave' | 'pending' | 'online' | 'offline' }) {
  const map: Record<string, string> = {
    active:   'bg-[#16a34a]',
    online:   'bg-[#16a34a]',
    inactive: 'bg-[#6b7a79]',
    offline:  'bg-[#6b7a79]',
    'on-leave': 'bg-[#d97706]',
    pending:  'bg-[#d97706]',
  }
  return <span className={cn('inline-block w-2 h-2 rounded-full', map[status] ?? 'bg-[#6b7a79]')} />
}

// ── Avatar ────────────────────────────────────────────────────────────────────
interface AvatarProps {
  name: string
  imageUrl?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const avatarSizes: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-[13px]',
  lg: 'w-12 h-12 text-[15px]',
}

export function Avatar({ name, imageUrl, size = 'md', className }: AvatarProps) {
  const initials = getInitials(name)
  const color = avatarColor(name)

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={cn('rounded-full object-cover border border-[#bacac8]', avatarSizes[size], className)}
      />
    )
  }

  return (
    <span
      className={cn(
        'rounded-full flex items-center justify-center font-semibold text-white shrink-0',
        avatarSizes[size],
        className
      )}
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean
}

export function Card({ className, noPadding, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white/90 border border-slate-200 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,.03),0_10px_30px_rgba(15,23,42,.04)]',
        !noPadding && 'p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-[18px] font-semibold leading-[26px] text-[#0b1c30]', className)} {...props}>
      {children}
    </h3>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse bg-[#e5eeff] rounded', className)} />
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-[#bacac8]', className)} />
}

// ── Empty State ───────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon = 'inbox', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <span className="material-symbols-outlined text-[40px] text-[#bacac8]">{icon}</span>
      <div>
        <p className="text-[16px] font-semibold text-[#0b1c30]">{title}</p>
        {description && <p className="text-[13px] text-[#6b7a79] mt-1">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────
export function Table({ className, children, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-[14px] text-left border-collapse', className)} {...props}>
        {children}
      </table>
    </div>
  )
}

export function Thead({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('border-b border-[#bacac8] bg-[#f8f9ff]', className)} {...props}>
      {children}
    </thead>
  )
}

export function Th({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#6b7a79]', className)} {...props}>
      {children}
    </th>
  )
}

export function Tr({ className, onClick, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-[#bacac8] transition-colors',
        onClick && 'cursor-pointer hover:bg-[#eff4ff]',
        className
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </tr>
  )
}

export function Td({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-4 py-3 text-[14px] text-[#0b1c30]', className)} {...props}>
      {children}
    </td>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="material-symbols-outlined animate-spin text-[#006a67]"
      style={{ fontSize: size }}
    >
      refresh
    </span>
  )
}

// ── Page Header ───────────────────────────────────────────────────────────────
interface PageHeaderProps {
  title: string
  subtitle?: string
  breadcrumb?: Array<{ label: string; href?: string }>
  actions?: React.ReactNode
  showBack?: boolean
  backHref?: string
}

interface BackButtonProps {
  href?: string
  label?: string
  className?: string
}

export function BackButton({ href, label = 'Go back to previous page', className }: BackButtonProps) {
  const navigate = useNavigate()
  const goBack = () => {
    if (href) navigate(href)
    else if (window.history.length > 1) navigate(-1)
    else navigate('/app/dashboard')
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      title={label}
      className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#bacac8] bg-white text-[#3b4948] transition-colors hover:bg-[#e8f7f6] hover:text-[#006a67] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00CEC8]', className)}
    >
      <span className="material-symbols-outlined text-[20px]">arrow_back</span>
    </button>
  )
}

export function PageHeader({ title, subtitle, breadcrumb, actions, showBack = true, backHref }: PageHeaderProps) {
  return (
    <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-2 sm:gap-3">
        {showBack && (
          <BackButton href={backHref} className="mt-5 sm:mt-6" />
        )}
        <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1 text-[12px] text-[#6b7a79] mb-1">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="material-symbols-outlined text-[14px]">chevron_right</span>}
                {crumb.href ? (
                  <a href={crumb.href} className="hover:text-[#006a67] transition-colors">{crumb.label}</a>
                ) : (
                  <span className={i === breadcrumb.length - 1 ? 'text-[#006a67] font-semibold' : ''}>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-[32px] font-semibold leading-[40px] tracking-tight text-[#0b1c30]">{title}</h1>
        {subtitle && <p className="text-[14px] text-[#6b7a79] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0 sm:ml-4 w-full sm:w-auto">{actions}</div>}
    </div>
  )
}
