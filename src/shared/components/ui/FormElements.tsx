import * as React from 'react'
import { cn } from '@/shared/lib/utils'

// ── Input ─────────────────────────────────────────────────────────────────────
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  startIcon?: React.ReactNode
  endIcon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, startIcon, endIcon, ...props }, ref) => (
    <div className="relative flex items-center">
      {startIcon && (
        <span className="absolute left-3 text-[#6b7a79] pointer-events-none">{startIcon}</span>
      )}
      <input
        ref={ref}
        className={cn(
          'w-full h-9 border rounded bg-white text-[#0b1c30] text-[14px] placeholder:text-[#6b7a79]',
          'transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-[#00CEC8] focus:border-[#006a67]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          startIcon ? 'pl-9 pr-3' : 'px-3',
          endIcon ? 'pr-9' : '',
          error
            ? 'border-[#ba1a1a] focus:ring-[#ba1a1a]'
            : 'border-[#bacac8]',
          className
        )}
        {...props}
      />
      {endIcon && (
        <span className="absolute right-3 text-[#6b7a79]">{endIcon}</span>
      )}
    </div>
  )
)
Input.displayName = 'Input'

// ── Label ─────────────────────────────────────────────────────────────────────
export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('block text-[12px] font-medium text-[#3b4948] mb-1', className)}
      {...props}
    />
  )
)
Label.displayName = 'Label'

// ── FormField ─────────────────────────────────────────────────────────────────
export interface FormFieldProps {
  label?: string
  error?: string
  hint?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}

export function FormField({ label, error, hint, required, children, className }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && (
        <Label>
          {label}
          {required && <span className="text-[#ba1a1a] ml-0.5">*</span>}
        </Label>
      )}
      {children}
      {hint && !error && <p className="text-[12px] text-[#6b7a79]">{hint}</p>}
      {error && <p className="text-[12px] text-[#ba1a1a]">{error}</p>}
    </div>
  )
}

// ── Textarea ──────────────────────────────────────────────────────────────────
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }
>(({ className, error, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full min-h-[80px] border rounded px-3 py-2 bg-white text-[#0b1c30] text-[14px]',
      'placeholder:text-[#6b7a79] resize-y transition-colors duration-150',
      'focus:outline-none focus:ring-2 focus:ring-[#00CEC8] focus:border-[#006a67]',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      error ? 'border-[#ba1a1a]' : 'border-[#bacac8]',
      className
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

// ── Select ────────────────────────────────────────────────────────────────────
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }
>(({ className, error, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'w-full h-9 border rounded px-3 bg-white text-[#0b1c30] text-[14px]',
      'focus:outline-none focus:ring-2 focus:ring-[#00CEC8] focus:border-[#006a67]',
      'disabled:opacity-50 disabled:cursor-not-allowed appearance-none',
      'bg-[url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b7a79%22 stroke-width=%222%22%3E%3Cpolyline points=%226 9 12 15 18 9%22/%3E%3C/svg%3E")] bg-no-repeat bg-[right_0.75rem_center]',
      error ? 'border-[#ba1a1a]' : 'border-[#bacac8]',
      className
    )}
    {...props}
  />
))
Select.displayName = 'Select'
