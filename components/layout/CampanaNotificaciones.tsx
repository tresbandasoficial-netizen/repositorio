'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { marcarTodasLeidasAction } from '@/app/actions/notificaciones'
import { ESTADO_LABELS, EstadoPedido } from '@/types'
import { cn } from '@/lib/utils/cn'

interface Notificacion {
  id: string
  creada_en: string
  alerta: {
    tipo: 'tiempo_excedido' | 'zombie'
    pedido: { id: string; numero_orden: string; estado: string } | null
  } | null
}

interface Props {
  usuarioId: string
}

export function CampanaNotificaciones({ usuarioId }: Props) {
  const [noLeidas, setNoLeidas] = useState<Notificacion[]>([])
  const [abierto, setAbierto] = useState(false)
  const [isPending, startTransition] = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()

    async function cargar() {
      const { data } = await supabase
        .from('notificaciones')
        .select(`
          id,
          creada_en,
          alerta:alertas (
            tipo,
            pedido:pedidos ( id, numero_orden, estado )
          )
        `)
        .eq('usuario_id', usuarioId)
        .eq('leida', false)
        .order('creada_en', { ascending: false })
        .limit(20)

      if (data) setNoLeidas(data as unknown as Notificacion[])
    }

    cargar()

    const channel = supabase
      .channel(`notif-${usuarioId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones',
          filter: `usuario_id=eq.${usuarioId}`,
        },
        () => cargar()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [usuarioId])

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleAbrir() {
    setAbierto((prev) => !prev)
  }

  function handleMarcarTodas() {
    startTransition(async () => {
      await marcarTodasLeidasAction()
      setNoLeidas([])
      setAbierto(false)
    })
  }

  const count = noLeidas.length

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={handleAbrir}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell size={16} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute left-full ml-2 top-0 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">
              Notificaciones {count > 0 && <span className="text-red-500">({count})</span>}
            </span>
            {count > 0 && (
              <button
                onClick={handleMarcarTodas}
                disabled={isPending}
                className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                Marcar todas leídas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {noLeidas.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">Sin notificaciones pendientes</p>
            ) : (
              noLeidas.map((n) => {
                const pedido = n.alerta?.pedido
                const tipo = n.alerta?.tipo
                return (
                  <Link
                    key={n.id}
                    href={pedido ? `/pedidos/${pedido.id}` : '/pedidos'}
                    onClick={() => setAbierto(false)}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                  >
                    <span
                      className={cn(
                        'mt-0.5 w-2 h-2 rounded-full shrink-0',
                        tipo === 'zombie' ? 'bg-red-500' : 'bg-yellow-500'
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {pedido?.numero_orden ?? '—'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {tipo === 'zombie' ? 'Pedido zombi' : 'Tiempo excedido'} ·{' '}
                        {ESTADO_LABELS[pedido?.estado as EstadoPedido] ?? pedido?.estado}
                      </p>
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
