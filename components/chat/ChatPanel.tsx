'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Send, MessagesSquare, Smile } from 'lucide-react'
import { formatCOP } from '@/lib/utils/format'
import { ESTADO_LABELS, type EstadoPedido } from '@/types'

// Los que se usan hablando de pedidos y del día a día. Un selector completo
// necesitaría una librería; con escribir desde el teclado (Win + .) también
// entra cualquier otro.
const EMOJIS = [
  '👍', '🙏', '😂', '❤️', '🔥', '🎉', '💪', '👀',
  '✅', '❌', '⚠️', '⏰', '📦', '👟', '👕', '💰',
  '😅', '😍', '🥲', '😡', '🤔', '🫡', '🙌', '✨',
]

// Chat interno 1 a 1. Los mensajes van y vienen directo contra Supabase con la
// sesión del usuario: el RLS de mensajes_chat garantiza que solo los dos
// participantes ven la conversación, sin server actions de por medio. La
// entrega instantánea la da Supabase Realtime; el refetch al volver a la
// pestaña es el respaldo por si el socket se cayó.

type Usuario = { id: string; nombre: string; rol: string }
type Mensaje = {
  id: string
  de_usuario: string
  para_usuario: string
  texto: string
  leido: boolean
  creado_en: string
}

// Un número de pedido dicho en el chat ("mira el TR6492") queda clicable hacia
// la galería, que es donde se ve con foto.
const REF_PEDIDO = /\b((?:TR|SR|CR|VL-TR)\d{3,5}(?:-\d+)?)\b/g

function TextoConRefs({ texto }: { texto: string }) {
  const partes = texto.split(REF_PEDIDO)
  return (
    <>
      {partes.map((p, i) =>
        i % 2 === 1 ? (
          <Link
            key={i}
            href={`/pedidos/galeria?q=${encodeURIComponent(p)}`}
            className="font-mono font-semibold underline decoration-dotted underline-offset-2 hover:opacity-80"
          >
            {p}
          </Link>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}

// Tarjeta con foto e información del pedido mencionado en un mensaje. La
// consulta se cachea por número a nivel de módulo: el mismo pedido citado en
// varios mensajes (o al re-renderizar) se consulta una sola vez.
type PedidoChat = {
  id: string
  numero_orden: string
  estado: string
  total: number
  total_pagado: number
  cliente_nombre: string | null
  imagen: string | null
}
const cachePedidos = new Map<string, Promise<PedidoChat | null>>()

function buscarPedido(numero: string): Promise<PedidoChat | null> {
  let p = cachePedidos.get(numero)
  if (!p) {
    p = (async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('vista_pedidos_asesor')
        .select('id, numero_orden, estado, total, total_pagado, cliente_nombre')
        .eq('numero_orden', numero)
        .maybeSingle()
      if (!data) return null
      const { data: items } = await supabase
        .from('pedido_items')
        .select('imagen_url')
        .eq('pedido_id', data.id)
        .not('imagen_url', 'is', null)
        .limit(1)
      return { ...data, imagen: items?.[0]?.imagen_url ?? null } as PedidoChat
    })()
    cachePedidos.set(numero, p)
  }
  return p
}

function TarjetaPedido({ numero, mio }: { numero: string; mio: boolean }) {
  const [pedido, setPedido] = useState<PedidoChat | null>(null)
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    let vivo = true
    buscarPedido(numero).then(p => { if (vivo) { setPedido(p); setCargado(true) } })
    return () => { vivo = false }
  }, [numero])

  // Si no existe o el RLS no deja verlo, no se muestra nada: queda el link del texto.
  if (!cargado || !pedido) return null

  const saldo = pedido.total - pedido.total_pagado
  return (
    <div className={`mt-1 flex ${mio ? 'justify-end' : 'justify-start'}`}>
      <Link
        href={`/pedidos/galeria?q=${encodeURIComponent(pedido.numero_orden)}`}
        className="flex w-64 max-w-[80%] items-center gap-2.5 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm transition-shadow hover:shadow-md"
      >
        {pedido.imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pedido.imagen}
            alt={pedido.numero_orden}
            className="h-14 w-14 shrink-0 rounded-xl bg-gray-100 object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-300">
            <MessagesSquare size={20} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-gray-900">{pedido.numero_orden}</span>
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
              {ESTADO_LABELS[pedido.estado as EstadoPedido] ?? pedido.estado}
            </span>
          </span>
          {pedido.cliente_nombre && (
            <span className="block truncate text-xs text-gray-600">{pedido.cliente_nombre}</span>
          )}
          <span className="block text-[11px] text-gray-400">
            {formatCOP(pedido.total)}
            {saldo > 0 ? ` · debe ${formatCOP(saldo)}` : ' · pagado'}
          </span>
        </span>
      </Link>
    </div>
  )
}

const horaBogota = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit',
})
const diaBogota = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', weekday: 'short', day: 'numeric', month: 'short',
})

// `compacto`: modo de una sola columna (lista O conversación) para el panel
// flotante, donde no caben las dos columnas lado a lado.
export function ChatPanel({ miId, usuarios, compacto = false }: {
  miId: string
  usuarios: Usuario[]
  compacto?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [conQuien, setConQuien] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [emojisAbierto, setEmojisAbierto] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const conQuienRef = useRef<string | null>(null)
  conQuienRef.current = conQuien
  const finRef = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('mensajes_chat')
      .select('*')
      .order('creado_en', { ascending: true })
      .limit(1000)
    setMensajes((data ?? []) as Mensaje[])
  }, [supabase])

  // Marca como leídos los mensajes de la conversación abierta.
  const marcarLeidos = useCallback(async (deQuien: string) => {
    setMensajes(prev => prev.map(m =>
      m.de_usuario === deQuien && m.para_usuario === miId && !m.leido ? { ...m, leido: true } : m
    ))
    await supabase
      .from('mensajes_chat')
      .update({ leido: true })
      .eq('de_usuario', deQuien)
      .eq('para_usuario', miId)
      .eq('leido', false)
  }, [supabase, miId])

  useEffect(() => { cargar() }, [cargar])

  // Tiempo real: cada mensaje nuevo para mí llega al instante. El filtro va por
  // destinatario; lo que yo envío se agrega localmente al confirmar el insert.
  useEffect(() => {
    const canal = supabase
      .channel('chat-interno')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensajes_chat',
        filter: `para_usuario=eq.${miId}`,
      }, payload => {
        const m = payload.new as Mensaje
        setMensajes(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
        if (conQuienRef.current === m.de_usuario) marcarLeidos(m.de_usuario)
      })
      .subscribe()

    // Respaldo por si el socket estuvo caído mientras la pestaña dormía.
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      supabase.removeChannel(canal)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [supabase, miId, cargar, marcarLeidos])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, conQuien])

  const noLeidosDe = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const m of mensajes) {
      if (m.para_usuario === miId && !m.leido) {
        mapa.set(m.de_usuario, (mapa.get(m.de_usuario) ?? 0) + 1)
      }
    }
    return mapa
  }, [mensajes, miId])

  // Orden de la lista: primero con quien hay mensajes sin leer, luego por
  // conversación más reciente, luego alfabético.
  const usuariosOrdenados = useMemo(() => {
    const ultimo = new Map<string, string>()
    for (const m of mensajes) {
      const otro = m.de_usuario === miId ? m.para_usuario : m.de_usuario
      const prev = ultimo.get(otro)
      if (!prev || m.creado_en > prev) ultimo.set(otro, m.creado_en)
    }
    return [...usuarios].sort((a, b) => {
      const na = noLeidosDe.get(a.id) ?? 0, nb = noLeidosDe.get(b.id) ?? 0
      if ((na > 0) !== (nb > 0)) return nb - na
      const ua = ultimo.get(a.id) ?? '', ub = ultimo.get(b.id) ?? ''
      if (ua !== ub) return ub.localeCompare(ua)
      return a.nombre.localeCompare(b.nombre, 'es')
    })
  }, [usuarios, mensajes, miId, noLeidosDe])

  const conversacion = useMemo(() => (
    conQuien
      ? mensajes.filter(m =>
          (m.de_usuario === miId && m.para_usuario === conQuien) ||
          (m.de_usuario === conQuien && m.para_usuario === miId))
      : []
  ), [mensajes, conQuien, miId])

  const otro = usuarios.find(u => u.id === conQuien)

  function abrir(id: string) {
    setConQuien(id)
    setEmojisAbierto(false)
    marcarLeidos(id)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const t = texto.trim()
    if (!t || !conQuien || enviando) return
    setEnviando(true)
    setTexto('')
    const { data, error } = await supabase
      .from('mensajes_chat')
      .insert({ de_usuario: miId, para_usuario: conQuien, texto: t })
      .select()
      .single()
    setEnviando(false)
    if (error) {
      // Se devuelve el texto al campo para no perder lo escrito.
      setTexto(t)
      return
    }
    setMensajes(prev => [...prev, data as Mensaje])
  }

  return (
    <div className="flex h-full rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Lista de gente */}
      <div className={compacto
        ? `w-full flex-col ${conQuien ? 'hidden' : 'flex'}`
        : `w-full sm:w-64 sm:shrink-0 border-r border-gray-100 flex-col ${conQuien ? 'hidden sm:flex' : 'flex'}`
      }>
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">Chat interno</p>
          <p className="text-xs text-gray-400 mt-0.5">Escríbele a cualquiera del equipo</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {usuariosOrdenados.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400">No hay más usuarios activos.</p>
          )}
          {usuariosOrdenados.map(u => {
            const n = noLeidosDe.get(u.id) ?? 0
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => abrir(u.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                  conQuien === u.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                  {u.nombre.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">{u.nombre}</span>
                  <span className="block text-xs text-gray-400 capitalize">{u.rol}</span>
                </span>
                {n > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Conversación */}
      <div className={compacto
        ? `flex-1 flex-col ${conQuien ? 'flex' : 'hidden'}`
        : `flex-1 flex-col ${conQuien ? 'flex' : 'hidden sm:flex'}`
      }>
        {!otro ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-300">
            <MessagesSquare size={40} />
            <p className="text-sm">Elige a alguien para empezar</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setConQuien(null)}
                className={`${compacto ? '' : 'sm:hidden'} text-sm text-blue-600`}
              >
                ← Volver
              </button>
              <p className="text-sm font-semibold text-gray-900">{otro.nombre}</p>
              <p className="text-xs text-gray-400 capitalize">{otro.rol}</p>
            </div>

            <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3 bg-gray-50/50">
              {conversacion.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-400">
                  Sin mensajes todavía. Menciona un pedido por su número (TR6492) y queda clicable.
                </p>
              )}
              {conversacion.map((m, i) => {
                const mio = m.de_usuario === miId
                const fecha = new Date(m.creado_en)
                const diaPrev = i > 0 ? diaBogota.format(new Date(conversacion[i - 1].creado_en)) : null
                const dia = diaBogota.format(fecha)
                // Pedidos citados en el mensaje → tarjeta con foto e info (máx. 3).
                const refs = [...new Set(m.texto.match(new RegExp(REF_PEDIDO.source, 'g')) ?? [])].slice(0, 3)
                return (
                  <div key={m.id}>
                    {dia !== diaPrev && (
                      <p className="my-2 text-center text-[11px] text-gray-400">{dia}</p>
                    )}
                    <div className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                        mio ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-800'
                      }`}>
                        <TextoConRefs texto={m.texto} />
                        <span className={`ml-2 align-bottom text-[10px] ${mio ? 'text-blue-200' : 'text-gray-400'}`}>
                          {horaBogota.format(fecha)}
                        </span>
                      </div>
                    </div>
                    {refs.map(r => <TarjetaPedido key={r} numero={r} mio={mio} />)}
                  </div>
                )
              })}
              <div ref={finRef} />
            </div>

            <form onSubmit={enviar} className="relative flex items-center gap-2 border-t border-gray-100 px-3 py-2.5">
              {/* Selector de emojis: no se cierra al elegir, para poner varios */}
              {emojisAbierto && (
                <div className="absolute bottom-full left-2 mb-1 grid grid-cols-8 gap-0.5 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                  {EMOJIS.map(e => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        setTexto(prev => prev + e)
                        inputRef.current?.focus()
                      }}
                      className="rounded-lg p-1 text-xl leading-none hover:bg-gray-100"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setEmojisAbierto(v => !v)}
                aria-label="Emojis"
                aria-expanded={emojisAbierto}
                className={`rounded-xl p-2 transition-colors ${
                  emojisAbierto ? 'bg-amber-100 text-amber-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
              >
                <Smile size={18} />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder={`Mensaje para ${otro.nombre.split(' ')[0]}…`}
                maxLength={2000}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={!texto.trim() || enviando}
                aria-label="Enviar"
                className="rounded-xl bg-blue-600 p-2.5 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
