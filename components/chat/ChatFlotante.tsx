'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MessagesSquare, X } from 'lucide-react'
import { ChatPanel } from '@/components/chat/ChatPanel'

// Burbuja de chat presente en todas las páginas. El contador de no leídos vive
// aquí (consulta liviana + Realtime) porque el ChatPanel solo se monta al
// abrir; al cerrar se reconsulta por si se leyeron mensajes adentro.
export function ChatFlotante({ miId, usuarios }: {
  miId: string
  usuarios: Array<{ id: string; nombre: string; rol: string }>
}) {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)
  const [noLeidos, setNoLeidos] = useState(0)

  const contar = useCallback(async () => {
    const supabase = createClient()
    const { count } = await supabase
      .from('mensajes_chat')
      .select('*', { count: 'exact', head: true })
      .eq('para_usuario', miId)
      .eq('leido', false)
    setNoLeidos(count ?? 0)
  }, [miId])

  useEffect(() => { contar() }, [contar])

  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel('chat-burbuja')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensajes_chat',
        filter: `para_usuario=eq.${miId}`,
      }, () => setNoLeidos(n => n + 1))
      .subscribe()

    const alVolver = () => { if (document.visibilityState === 'visible') contar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      supabase.removeChannel(canal)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [miId, contar])

  // En la página /chat ya está el panel completo; la burbuja sobraría.
  if (pathname?.startsWith('/chat')) return null

  return (
    <>
      {abierto && (
        <div className="fixed bottom-36 right-2 left-2 z-50 h-[65vh] sm:left-auto sm:right-4 sm:h-[540px] sm:w-[400px] print:hidden">
          <ChatPanel miId={miId} usuarios={usuarios} />
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setAbierto(v => {
            if (v) contar()
            return !v
          })
        }}
        aria-label={abierto ? 'Cerrar chat' : 'Abrir chat'}
        className="fixed bottom-20 right-4 z-50 flex items-center justify-center rounded-full bg-blue-600 p-3.5 text-white shadow-lg shadow-blue-200 transition-colors hover:bg-blue-700 print:hidden"
      >
        {abierto ? <X size={22} /> : <MessagesSquare size={22} />}
        {!abierto && noLeidos > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
            {noLeidos}
          </span>
        )}
      </button>
    </>
  )
}
