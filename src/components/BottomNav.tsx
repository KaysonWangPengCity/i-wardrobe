import { NavLink } from 'react-router-dom'
import { Home, Shirt, Camera, Calendar, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { to: '/', label: '今日', icon: Home },
  { to: '/wardrobe', label: '衣橱', icon: Shirt },
  { to: '/capture', label: '拍照', icon: Camera, highlight: true },
  { to: '/history', label: '历史', icon: Calendar },
  { to: '/settings', label: '设置', icon: Settings },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map(({ to, label, icon: Icon, highlight }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  highlight && 'mt-[-12px]',
                )
              }
            >
              {highlight ? (
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                  <Icon size={20} />
                </span>
              ) : (
                <Icon size={20} />
              )}
              <span className={cn(highlight && 'mt-0.5')}>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
