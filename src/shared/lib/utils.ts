import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a number as currency */
export function formatCurrency(
  amount: number,
  currency = 'ZMW',
  locale = 'en-ZM'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

/** Format a number with commas */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-ZM').format(n)
}

/** Format an ISO date string to a readable date */
export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-ZM', opts ?? {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

/** Return initials from a full name */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/** Deterministic avatar color from a string */
const AVATAR_COLORS = [
  '#006a67', '#006591', '#565e74', '#2563eb',
  '#7c3aed', '#059669', '#d97706', '#dc2626',
]
export function avatarColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

/** Truncate a string */
export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str
}

/** Generate a reference number */
export function generateRef(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `${prefix}-${ts}${rand}`
}

/**
 * Turn a Supabase/Postgres error into something a business user can act on.
 * Row-level-security rejections in particular are opaque ("new row violates…").
 */
export function friendlyDbError(error: { message?: string; code?: string } | Error | null | undefined, what = 'this record'): string {
  const message = error?.message ?? 'Something went wrong'
  if (/row-level security/i.test(message)) {
    return `You don't have permission to create or change ${what} in this organization. Only the organization owner or an administrator can do this. ` +
      `If you are the platform super admin, run supabase/platform_admin_full_access.sql in the Supabase SQL editor to enable super-admin access inside organizations.`
  }
  if ((error as { code?: string })?.code === '23505' || /duplicate key/i.test(message)) {
    // Postgres details look like: Key (organization_id, employee_id)=(uuid, AX005) already exists.
    const details = (error as { details?: string })?.details ?? ''
    const match = details.match(/Key \(([^)]+)\)=\(([^)]+)\)/)
    if (match) {
      const cols = match[1].split(',').map((c) => c.trim())
      const vals = match[2].split(',').map((v) => v.trim())
      const idx = cols.findIndex((c) => c !== 'organization_id')
      if (idx >= 0) {
        const label = cols[idx].replace(/_id$/, ' ID').replace(/_/g, ' ')
        return `${label.charAt(0).toUpperCase() + label.slice(1)} "${vals[idx]}" is already used by another record in this organization. Open that record to edit it, or use a different ${label}.`
      }
    }
    return `A record with the same code or ID already exists in this organization. Open the existing record to edit it instead.`
  }
  return message
}
