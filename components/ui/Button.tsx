import { cn } from '@/lib/utils/cn'
import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
}

const variants = {
  primary: [
    'bg-blue-600 text-white shadow-sm',
    'hover:bg-blue-700 hover:-translate-y-0.5 hover:shadow-md hover:shadow-blue-300/50',
    'active:translate-y-0 active:shadow-sm active:bg-blue-800',
  ].join(' '),

  secondary: [
    'bg-white text-gray-700 border border-gray-200 shadow-sm',
    'hover:bg-gray-50 hover:-translate-y-0.5 hover:shadow-md hover:border-gray-300',
    'active:translate-y-0 active:shadow-sm active:bg-gray-100',
  ].join(' '),

  danger: [
    'bg-red-600 text-white shadow-sm',
    'hover:bg-red-700 hover:-translate-y-0.5 hover:shadow-md hover:shadow-red-300/50',
    'active:translate-y-0 active:shadow-sm active:bg-red-800',
  ].join(' '),

  ghost: [
    'text-gray-600',
    'hover:bg-gray-100 hover:text-gray-900 hover:-translate-y-0.5',
    'active:translate-y-0 active:bg-gray-200',
  ].join(' '),
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  )
}
