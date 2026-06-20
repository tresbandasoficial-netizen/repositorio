'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { createClient } from '@/lib/supabase/client'
import { Usuario } from '@/types'
import {
  LayoutDashboard,
  Package,
  Bell,
  Users,
  BarChart2,
  Wallet,
  ShoppingBag,
  UserCog,
  LogOut,
  LucideProps,
} from 'lucide-react'

function MotoIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="5.5" cy="17.5" r="2.5" />
      <circle cx="18.5" cy="17.5" r="2.5" />
      <path d="M8 17.5h7" />
      <path d="M14 17.5V13l-3-4H7l-2 4.5" />
      <path d="M14 9h3l2 4.5" />
      <path d="M10 9h2" />
    </svg>
  )
}

interface SidebarProps {
  usuario: Pick<Usuario, 'id' | 'nombre' | 'rol'>
  onClose?: () => void
}

type NavIcon = React.ComponentType<LucideProps> | typeof MotoIcon

const navItems: { href: string; label: string; icon: NavIcon; rol: string[] }[] = [
  { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard, rol: ['asesor', 'admin'] },
  { href: '/pedidos',      label: 'Pedidos',      icon: Package,         rol: ['asesor', 'admin', 'visor'] },
  { href: '/alertas',      label: 'Alertas',      icon: Bell,            rol: ['asesor', 'admin', 'visor'] },
  { href: '/clientes',     label: 'Clientes',     icon: Users,           rol: ['asesor', 'admin', 'visor'] },
  { href: '/domicilios',   label: 'Domicilios',   icon: MotoIcon,        rol: ['asesor', 'admin'] },
  { href: '/estadisticas', label: 'Estadísticas', icon: BarChart2,       rol: ['admin'] },
  { href: '/cartera',      label: 'Cartera',      icon: Wallet,          rol: ['admin'] },
  { href: '/compras',      label: 'Compras',      icon: ShoppingBag,     rol: ['admin'] },
  { href: '/usuarios',     label: 'Usuarios',     icon: UserCog,         rol: ['admin'] },
]

export function Sidebar({ usuario, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const items = navItems.filter((item) => item.rol.includes(usuario.rol))

  return (
    <aside className="flex flex-col bg-white border-r border-gray-100 min-h-screen shadow-sm w-52">

      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-gray-100 shrink-0">
        <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-3b.jpg"
            alt="3-B"
            className="w-full h-full object-cover scale-110"
            style={{ filter: 'invert(1)' }}
          />
        </div>
        <span className="ml-3 font-bold text-gray-900 text-sm">Tres Bandas</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col items-start gap-1 px-3 py-4">
        {items.map((item) => {
          const Icon = item.icon
          const active =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              title={item.label}
              className={cn(
                'flex items-center gap-3 w-full h-11 rounded-2xl text-sm font-medium px-3',
                'transition-all duration-150 ease-out active:scale-95',
                active
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-300/50'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 hover:-translate-y-0.5'
              )}
            >
              <Icon size={18} className="shrink-0" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="flex flex-col items-start gap-2 px-3 pb-5 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-3 w-full">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-blue-700">{usuario.nombre.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate">{usuario.nombre}</p>
            <p className="text-xs text-gray-400 capitalize">{usuario.rol}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Cerrar sesión"
          className="flex items-center gap-3 w-full h-10 rounded-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors px-3 text-sm"
        >
          <LogOut size={16} className="shrink-0" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
