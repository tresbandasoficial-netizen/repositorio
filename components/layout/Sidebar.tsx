'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { createClient } from '@/lib/supabase/client'
import { Usuario } from '@/types'
import { CampanaNotificaciones } from './CampanaNotificaciones'
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
    <aside className="w-60 shrink-0 flex flex-col bg-gray-950 min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <span className="text-white font-black text-xs">TR</span>
          </div>
          <span className="text-white font-bold text-sm tracking-tight">TR Original</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                active
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-100'
              )}
            >
              <Icon size={16} className="shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-gray-800 pt-4 space-y-1">
        <div className="px-3 py-2 flex items-center justify-between mb-1">
          <Link href="/perfil" onClick={onClose} className="min-w-0 group flex-1">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-gray-300">{usuario.nombre.charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-300 truncate group-hover:text-white transition-colors">{usuario.nombre}</p>
                <p className="text-xs text-gray-500 capitalize">{usuario.rol}</p>
              </div>
            </div>
          </Link>
          <CampanaNotificaciones usuarioId={usuario.id} />
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-800/60 hover:text-gray-300 transition-all"
        >
          <LogOut size={14} className="shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
