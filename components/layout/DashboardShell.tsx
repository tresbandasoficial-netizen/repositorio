'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { CampanaNotificaciones } from './CampanaNotificaciones'
import { Usuario } from '@/types'

interface Props {
  usuario: Pick<Usuario, 'id' | 'nombre' | 'rol'>
  children: React.ReactNode
}

function getFecha() {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

export function DashboardShell({ usuario, children }: Props) {
  const [abierto, setAbierto] = useState(false)
  const primerNombre = usuario.nombre.split(' ')[0]

  return (
    <div className="flex min-h-screen bg-[#eef2ff]">
      {/* Mobile overlay */}
      {abierto && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden backdrop-blur-sm"
          onClick={() => setAbierto(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-30 transition-transform duration-200
          md:relative md:translate-x-0
          ${abierto ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar usuario={usuario} onClose={() => setAbierto(false)} />
      </div>

      {/* Content column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">

        {/* Top header */}
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm">
          <div className="flex items-center gap-4 px-4 md:px-6 h-16">

            {/* Mobile: hamburger */}
            <button
              onClick={() => setAbierto(true)}
              className="md:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>

            {/* Desktop: greeting */}
            <div className="hidden md:flex flex-col justify-center">
              <p className="text-sm font-bold text-gray-900">
                Hola, {primerNombre} 👋
              </p>
              <p className="text-xs text-gray-400 capitalize">{getFecha()}</p>
            </div>

            {/* Mobile: brand */}
            <div className="md:hidden flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-blue-600 flex items-center justify-center">
                <span className="text-white font-black text-[10px]">TR</span>
              </div>
              <span className="font-bold text-gray-900 text-sm">Tres Bandas</span>
            </div>

            <div className="flex-1" />

            {/* Right: notifications */}
            <CampanaNotificaciones usuarioId={usuario.id} />
          </div>
        </header>

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
