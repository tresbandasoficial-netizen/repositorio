'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { createClient } from '@/lib/supabase/client'
import { Usuario } from '@/types'
import { CampanaNotificaciones } from './CampanaNotificaciones'

interface SidebarProps {
  usuario: Pick<Usuario, 'id' | 'nombre' | 'rol'>
  onClose?: () => void
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', rol: ['asesor', 'admin'] },
  { href: '/pedidos',   label: 'Pedidos',   rol: ['asesor', 'admin'] },
  { href: '/alertas',   label: 'Alertas',   rol: ['asesor', 'admin'] },
  { href: '/clientes',  label: 'Clientes',  rol: ['asesor', 'admin'] },
  { href: '/cartera',   label: 'Cartera',   rol: ['admin'] },
  { href: '/compras',   label: 'Compras',   rol: ['admin'] },
  { href: '/usuarios',  label: 'Usuarios',  rol: ['admin'] },
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
    <aside className="w-56 shrink-0 flex flex-col bg-gray-900 min-h-screen">
      <div className="px-4 py-5 border-b border-gray-700">
        <span className="text-white font-bold text-base">TR Original</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={cn(
              'flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pathname.startsWith(item.href)
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700 space-y-2">
        <div className="px-3 flex items-center justify-between">
          <Link href="/perfil" onClick={onClose} className="min-w-0 group">
            <p className="text-xs text-gray-400 truncate group-hover:text-white transition-colors">{usuario.nombre}</p>
            <p className="text-xs text-gray-500 capitalize">{usuario.rol}</p>
          </Link>
          <CampanaNotificaciones usuarioId={usuario.id} />
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
