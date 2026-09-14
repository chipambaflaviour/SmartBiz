import * as React from 'react'
import { cn } from '@/shared/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'link'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  loading?: boolean
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-[#006a67] text-white hover:bg-[#005552] active:bg-[#004442] shadow-sm',
  secondary:
    'bg-[#e5eeff] text-[#006a67] hover:bg-[#dce9ff] active:bg-[#d3e4fe]',
  ghost:
    'bg-transparent text-[#3b4948] hover:bg-[#e5eeff] active:bg-[#dce9ff]',
  outline:
    'border border-[#bacac8] bg-white text-[#0b1c30] hover:bg-[#eff4ff] active:bg-[#e5eeff]',
  danger:
    'bg-[#ba1a1a] text-white hover:bg-[#941515] active:bg-[#741010] shadow-sm',
  link:
    'bg-transparent text-[#006a67] underline-offset-4 hover:underline p-0 h-auto',
}

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm:   'h-7 px-3 text-[12px] font-medium rounded',
  md:   'h-9 px-4 text-[13px] font-medium rounded',
  lg:   'h-10 px-5 text-[14px] font-semibold rounded',
  icon: 'h-9 w-9 p-0 rounded flex items-center justify-center',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00CEC8] focus-visible:ring-offset-1',
          'disabled:opacity-50 disabled:pointer-events-none',
          'active:scale-[0.97]',
          variantClasses[variant],
          sizeClasses[size],
          variant === 'link' && 'rounded-none',
          className
        )}
        {...props}
      >
        {loading && (
          <span className="material-symbols-outlined animate-spin text-[16px]">refresh</span>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
