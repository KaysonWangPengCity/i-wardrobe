import * as React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary'
type Size = 'default' | 'sm' | 'lg' | 'icon'

const variantStyles: Record<Variant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
}

const sizeStyles: Record<Size, string> = {
  default: 'h-9 px-4 text-sm',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-11 px-6 text-base',
  icon: 'h-9 w-9',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
