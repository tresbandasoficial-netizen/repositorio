'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, X, Loader2, Volume2 } from 'lucide-react'
import { agenteVozAction, type MensajeVoz } from '@/app/actions/agente-voz'

// Botón flotante de voz. Abajo a la DERECHA: el aviso de tareas va centrado, el
// de retos a la izquierda, y los toasts arriba a la derecha — este es el hueco
// libre que queda.
//
// Reconocimiento y voz usan las APIs del navegador (webkitSpeechRecognition y
// speechSynthesis): sin costo y sin instalar nada. En un navegador sin soporte
// queda el modo texto.
export function AgenteVoz({ rol }: { rol: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [escuchando, setEscuchando] = useState(false)
  const [pensando, setPensando] = useState(false)
  const [hablando, setHablando] = useState(false)
  const [soportaVoz, setSoportaVoz] = useState(false)
  const [conversacion, setConversacion] = useState<MensajeVoz[]>([])
  const [texto, setTexto] = useState('')
  const recRef = useRef<any>(null)
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    setSoportaVoz(!!SR)
  }, [])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversacion, pensando])

  // El visor no tiene agente: ni siquiera se monta el botón.
  if (rol === 'visor') return null

  function hablar(t: string) {
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(t)
      u.lang = 'es-CO'
      const voz = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('es'))
      if (voz) u.voice = voz
      u.onstart = () => setHablando(true)
      u.onend = () => setHablando(false)
      u.onerror = () => setHablando(false)
      window.speechSynthesis.speak(u)
    } catch { /* sin voz no pasa nada: el texto queda en pantalla */ }
  }

  async function enviar(dicho: string) {
    const limpio = dicho.trim()
    if (!limpio || pensando) return
    setTexto('')
    setPensando(true)
    const historial = conversacion
    setConversacion(prev => [...prev, { role: 'user', content: limpio }])

    const r = await agenteVozAction(limpio, historial)

    setConversacion(prev => [...prev, { role: 'assistant', content: r.texto }])
    setPensando(false)
    hablar(r.texto)
    if (r.navegarA) router.push(r.navegarA)
  }

  function escuchar() {
    if (escuchando) { recRef.current?.stop(); return }
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) return
    window.speechSynthesis.cancel()

    const rec = new SR()
    recRef.current = rec
    rec.lang = 'es-CO'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e: any) => {
      const t = e.results?.[0]?.[0]?.transcript ?? ''
      if (t) enviar(t)
    }
    rec.onend = () => setEscuchando(false)
    rec.onerror = () => setEscuchando(false)
    setEscuchando(true)
    rec.start()
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        type="button"
        onClick={() => {
          setAbierto(v => !v)
          if (!abierto && soportaVoz) escuchar()
        }}
        title="Asistente de voz"
        aria-label="Asistente de voz"
        className={`fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-colors ${
          escuchando ? 'bg-red-600 animate-pulse' : 'bg-blue-600 hover:bg-blue-700'
        } text-white`}
      >
        <Mic size={22} />
      </button>

      {/* Panel de conversación */}
      {abierto && (
        <div className="fixed bottom-24 right-5 z-40 flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Asistente de voz</span>
            {hablando && <Volume2 size={14} className="text-blue-500" />}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => { setAbierto(false); window.speechSynthesis.cancel(); recRef.current?.stop() }}
              aria-label="Cerrar"
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>

          <div className="max-h-80 min-h-[8rem] space-y-2 overflow-y-auto px-4 py-3">
            {conversacion.length === 0 && (
              <p className="text-xs text-gray-400">
                {soportaVoz
                  ? 'Toca el micrófono y habla: "ábreme la galería", "busca el pedido TR6492", "¿cuánto vendimos hoy?"…'
                  : 'Este navegador no tiene reconocimiento de voz. Escribe abajo lo que necesitas.'}
              </p>
            )}
            {conversacion.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'ml-auto bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {m.content}
              </div>
            ))}
            {pensando && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 size={13} className="animate-spin" /> Pensando…
              </div>
            )}
            <div ref={finRef} />
          </div>

          <form
            onSubmit={e => { e.preventDefault(); enviar(texto) }}
            className="flex items-center gap-2 border-t border-gray-100 px-3 py-2.5"
          >
            <input
              type="text"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder={escuchando ? 'Escuchando…' : 'O escribe aquí…'}
              className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {soportaVoz && (
              <button
                type="button"
                onClick={escuchar}
                aria-label={escuchando ? 'Dejar de escuchar' : 'Hablar'}
                className={`rounded-lg p-2 transition-colors ${
                  escuchando ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Mic size={16} />
              </button>
            )}
          </form>
        </div>
      )}
    </>
  )
}
