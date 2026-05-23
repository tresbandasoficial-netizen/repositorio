'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Usuario } from '@/types'

interface Props {
  usuario: Pick<Usuario, 'id' | 'nombre' | 'rol'>
  children: React.ReactNode
}

export function DashboardShell({ usuario, children }: Props) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="flex min-h-screen">
      {/* Overlay móvil */}
      {abierto && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setAbierto(false)}
        />
      )}

      {/* Sidebar — fijo en desktop, slide-in en móvil */}
      <div
        className={`
          fixed inset-y-0 left-0 z-30 transition-transform duration-200
          md:relative md:translate-x-0
          ${abierto ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar usuario={usuario} onClose={() => setAbierto(false)} />
      </div>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {/* Barra superior móvil */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
          <button
            onClick={() => setAbierto(true)}
            className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <span className="font-bold text-gray-900 text-sm">TR Original</span>
        </div>

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
