'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// Avisos flotantes de "cambio realizado". Van arriba a la derecha a propósito:
// abajo ya viven el aviso de tareas (centrado) y el de retos (izquierda).

type Tono = 'ok' | 'error'
type Aviso = { id: number; texto: string; tono: Tono }

type AvisoCtx = {
  avisar: (texto?: string) => void
  avisarError: (texto: string) => void
}

const Ctx = createContext<AvisoCtx | null>(null)

// Se puede llamar desde cualquier componente cliente dentro del dashboard.
// Fuera del proveedor no truena: simplemente no muestra nada.
export function useAviso(): AvisoCtx {
  const ctx = useContext(Ctx)
  return ctx ?? { avisar: () => {}, avisarError: () => {} }
}

let siguienteId = 0

export function AvisoProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])

  const push = useCallback((texto: string, tono: Tono) => {
    const id = siguienteId++
    setAvisos(prev => [...prev, { id, texto, tono }])
  }, [])

  const avisar = useCallback((texto = 'Cambio realizado') => push(texto, 'ok'), [push])
  const avisarError = useCallback((texto: string) => push(texto, 'error'), [push])

  return (
    <Ctx.Provider value={{ avisar, avisarError }}>
      {children}
      <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {avisos.map(a => (
          <Burbuja
            key={a.id}
            aviso={a}
            onCerrar={() => setAvisos(prev => prev.filter(x => x.id !== a.id))}
          />
        ))}
      </div>
    </Ctx.Provider>
  )
}

function Burbuja({ aviso, onCerrar }: { aviso: Aviso; onCerrar: () => void }) {
  const [saliendo, setSaliendo] = useState(false)

  // Los errores se quedan más tiempo: hay algo que leer y decidir.
  const duracion = aviso.tono === 'error' ? 6000 : 2500

  useEffect(() => {
    const irse = setTimeout(() => setSaliendo(true), duracion)
    const quitar = setTimeout(onCerrar, duracion + 200)
    return () => { clearTimeout(irse); clearTimeout(quitar) }
  }, [duracion, onCerrar])

  const ok = aviso.tono === 'ok'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 shadow-lg
        transition-all duration-200 motion-reduce:transition-none
        ${saliendo ? 'opacity-0 translate-x-2' : 'opacity-100 translate-x-0'}
        ${ok
          ? 'bg-emerald-600 border-emerald-700 text-white'
          : 'bg-red-600 border-red-700 text-white'}
      `}
    >
      <span className="text-sm font-bold">{ok ? '✓' : '!'}</span>
      <span className="text-sm font-medium">{aviso.texto}</span>
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar aviso"
        className="ml-1 text-white/70 hover:text-white text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded"
      >
        ✕
      </button>
    </div>
  )
}
