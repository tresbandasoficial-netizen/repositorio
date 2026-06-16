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
  MapPin,
  BarChart2,
  Wallet,
  ShoppingBag,
  UserCog,
  LogOut,
} from 'lucide-react'

interface SidebarProps {
  usuario: Pick<Usuario, 'id' | 'nombre' | 'rol'>
  onClose?: () => void
}

const navItems = [
  { href: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard, rol: ['asesor', 'admin'] },
  { href: '/pedidos',      label: 'Pedidos',      icon: Package,         rol: ['asesor', 'admin', 'visor'] },
  { href: '/alertas',      label: 'Alertas',      icon: Bell,            rol: ['asesor', 'admin', 'visor'] },
  { href: '/clientes',     label: 'Clientes',     icon: Users,           rol: ['asesor', 'admin', 'visor'] },
  { href: '/domicilios',   label: 'Domicilios',   icon: MapPin,          rol: ['asesor', 'admin'] },
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
    <aside className="flex flex-col bg-white border-r border-gray-100 min-h-screen shadow-sm
      w-56 md:w-[68px]">

      {/* Logo */}
      <div className="flex items-center h-16 px-4 md:justify-center border-b border-gray-100 shrink-0">
        <div className="w-9 h-9 rounded-2xl bg-blue-600 flex items-center justify-center shrink-0">
          <span className="text-white font-black text-sm tracking-tight">TR</span>
        </div>
        <span className="md:hidden ml-3 font-bold text-gray-900 text-sm">Tres Bandas</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col items-start md:items-center gap-1 px-3 md:px-2 py-4">
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
                'flex items-center gap-3 md:gap-0 md:justify-center w-full md:w-11 h-11 rounded-2xl transition-all text-sm font-medium px-3 md:px-0',
                active
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
              )}
            >
              <Icon size={18} className="shrink-0" />
              <span className="md:hidden">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="flex flex-col items-start md:items-center gap-2 px-3 md:px-2 pb-5 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-3 md:gap-0 md:justify-center w-full">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-blue-700">{usuario.nombre.charAt(0).toUpperCase()}</span>
          </div>
          <div className="md:hidden min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate">{usuario.nombre}</p>
            <p className="text-xs text-gray-400 capitalize">{usuario.rol}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Cerrar sesión"
          className="flex items-center gap-3 md:gap-0 md:justify-center w-full md:w-11 h-10 rounded-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors px-3 md:px-0 text-sm"
        >
          <LogOut size={16} className="shrink-0" />
          <span className="md:hidden">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
