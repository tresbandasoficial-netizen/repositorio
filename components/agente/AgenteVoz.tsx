'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, X, Loader2, Volume2, Ear } from 'lucide-react'
import { agenteVozAction, type MensajeVoz } from '@/app/actions/agente-voz'

// Botón flotante de voz. Abajo a la DERECHA: el aviso de tareas va centrado, el
// de retos a la izquierda, y los toasts arriba a la derecha — este es el hueco
// libre que queda.
//
// Reconocimiento y voz usan las APIs del navegador (webkitSpeechRecognition y
// speechSynthesis): sin costo y sin instalar nada. En un navegador sin soporte
// queda el modo texto.
//
// "Hola Siri": un reconocedor CONTINUO de fondo espera la frase de activación y,
// al oírla, abre el panel y pasa a escuchar el comando. Se pausa solo mientras
// el agente escucha un comando, piensa o habla (para no oírse a sí mismo), y
// Chrome lo corta cada rato por silencio, así que se rearranca solo. Se puede
// apagar con el botón del oído y la elección queda guardada en el navegador.

const FRASE_ACTIVACION = /\b(hola|ola|oye|hey)[\s,]*(siri|sir[ií]|asistente)\b/i
// Frases para terminar la conversación con la voz, sin tocar nada.
const FRASE_DESPEDIDA = /^\s*(gracias|muchas gracias|adi[oó]s|hasta luego|listo,? gracias|ya est[aá]|nada m[aá]s|ci[eé]rrate|cierra)\s*\.?\s*$/i
const CLAVE_OIDO = 'agente-voz-oido'

function getSR(): any {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null
}

export function AgenteVoz({ rol }: { rol: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [escuchando, setEscuchando] = useState(false)
  const [pensando, setPensando] = useState(false)
  const [hablando, setHablando] = useState(false)
  const [soportaVoz, setSoportaVoz] = useState(false)
  const [oidoActivo, setOidoActivo] = useState(false)
  const [conversacion, setConversacion] = useState<MensajeVoz[]>([])
  const [texto, setTexto] = useState('')

  const recRef = useRef<any>(null)        // reconocedor del comando
  const oidoRef = useRef<any>(null)       // reconocedor de fondo (palabra clave)
  const oidoDebeRef = useRef(false)       // si el fondo debe estar corriendo
  // Modo conversación: tras cada respuesta hablada se vuelve a escuchar solo,
  // sin tocar el micrófono. Termina con una despedida ("gracias", "adiós"),
  // cerrando el panel, o cuando hay silencio.
  const conversandoRef = useRef(false)
  const escucharRef = useRef<() => void>(() => {})
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSoportaVoz(!!getSR())
    // Encendido por defecto: quien no lo quiera lo apaga una vez y queda guardado.
    setOidoActivo(localStorage.getItem(CLAVE_OIDO) !== '0')
  }, [])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversacion, pensando])

  function hablar(t: string) {
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(t)
      u.lang = 'es-CO'
      const voz = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('es'))
      if (voz) u.voice = voz
      u.onstart = () => setHablando(true)
      u.onend = () => {
        setHablando(false)
        // Conversación continua: al terminar de hablar vuelve a escuchar sola.
        if (conversandoRef.current) setTimeout(() => escucharRef.current(), 300)
      }
      u.onerror = () => {
        setHablando(false)
        if (conversandoRef.current) setTimeout(() => escucharRef.current(), 300)
      }
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
    const SR = getSR()
    if (!SR) return
    window.speechSynthesis.cancel()
    // El oído de fondo suelta el micrófono mientras se escucha el comando:
    // solo puede haber un reconocedor a la vez.
    try { oidoRef.current?.stop() } catch { /* ya estaba parado */ }

    const rec = new SR()
    recRef.current = rec
    rec.lang = 'es-CO'
    rec.interimResults = false
    rec.maxAlternatives = 1
    let hubo = false
    rec.onresult = (e: any) => {
      const t = String(e.results?.[0]?.[0]?.transcript ?? '').trim()
      if (!t) return
      hubo = true
      // Despedida: cierra la conversación sin mandar nada al agente.
      if (FRASE_DESPEDIDA.test(t)) {
        conversandoRef.current = false
        setConversacion(prev => [...prev, { role: 'user', content: t }])
        hablar('Listo, aquí estoy si me necesitas.')
        return
      }
      enviar(t)
    }
    rec.onend = () => {
      setEscuchando(false)
      // Silencio (terminó sin oír nada): se corta la conversación continua para
      // no dejar el micrófono en bucle; "hola siri" la retoma cuando quiera.
      if (!hubo) conversandoRef.current = false
    }
    rec.onerror = () => setEscuchando(false)
    setEscuchando(true)
    rec.start()
  }
  escucharRef.current = escuchar

  // ── Oído de fondo: espera "hola siri" ──────────────────────────────────────
  const arrancarOido = useCallback(() => {
    const SR = getSR()
    if (!SR || oidoRef.current) return

    const oido = new SR()
    oidoRef.current = oido
    oido.lang = 'es-CO'
    oido.continuous = true
    oido.interimResults = true

    oido.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript ?? ''
        if (FRASE_ACTIVACION.test(t)) {
          try { oido.stop() } catch { /* ya parando */ }
          setAbierto(true)
          // Desde aquí la conversación es continua: habla, responde y vuelve a
          // escuchar sola hasta la despedida o el silencio.
          conversandoRef.current = true
          // Pequeña espera para que el micrófono quede libre antes de escuchar
          // el comando.
          setTimeout(() => escucharRef.current(), 250)
          return
        }
      }
    }
    // Chrome corta el reconocimiento continuo por silencio o a los ~60s: si el
    // oído sigue habilitado, se rearranca.
    oido.onend = () => {
      oidoRef.current = null
      if (oidoDebeRef.current) setTimeout(() => arrancarOido(), 400)
    }
    oido.onerror = (e: any) => {
      // Sin permiso de micrófono no hay nada que reintentar: se apaga y queda
      // guardado, para no pedir permiso en bucle.
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        oidoDebeRef.current = false
        setOidoActivo(false)
        localStorage.setItem(CLAVE_OIDO, '0')
      }
    }
    try { oido.start() } catch { oidoRef.current = null }
  }, [])

  // El oído corre solo cuando nada más está usando el micrófono ni la voz.
  useEffect(() => {
    const debe = soportaVoz && oidoActivo && !escuchando && !pensando && !hablando
    oidoDebeRef.current = debe
    if (debe) {
      arrancarOido()
    } else {
      try { oidoRef.current?.stop() } catch { /* ya estaba parado */ }
    }
    return () => {
      oidoDebeRef.current = false
      try { oidoRef.current?.stop() } catch { /* desmontando */ }
    }
  }, [soportaVoz, oidoActivo, escuchando, pensando, hablando, arrancarOido])

  function alternarOido() {
    const nuevo = !oidoActivo
    setOidoActivo(nuevo)
    localStorage.setItem(CLAVE_OIDO, nuevo ? '1' : '0')
  }

  // El visor no tiene agente: ni siquiera se monta el botón.
  if (rol === 'visor') return null

  return (
    <>
      {/* Botón flotante */}
      <button
        type="button"
        onClick={() => {
          setAbierto(v => !v)
          if (!abierto && soportaVoz) {
            conversandoRef.current = true   // abrir con el botón también conversa
            escuchar()
          }
          if (abierto) conversandoRef.current = false
        }}
        title={oidoActivo ? 'Asistente de voz — di "Hola Siri" para activarlo' : 'Asistente de voz'}
        aria-label="Asistente de voz"
        className={`fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-colors ${
          escuchando ? 'bg-red-600 animate-pulse' : 'bg-blue-600 hover:bg-blue-700'
        } text-white`}
      >
        <Mic size={22} />
        {/* Punto verde: el oído de fondo está esperando "hola siri" */}
        {oidoActivo && soportaVoz && !escuchando && (
          <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
        )}
      </button>

      {/* Panel de conversación */}
      {abierto && (
        <div className="fixed bottom-24 right-5 z-40 flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Asistente de voz</span>
            {hablando && <Volume2 size={14} className="text-blue-500" />}
            <div className="flex-1" />
            {soportaVoz && (
              <button
                type="button"
                onClick={alternarOido}
                title={oidoActivo
                  ? 'Escuchando "Hola Siri" — toca para apagar el oído'
                  : 'El oído está apagado — toca para que responda a "Hola Siri"'}
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                  oidoActivo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                <Ear size={12} />
                {oidoActivo ? 'Hola Siri' : 'Apagado'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                conversandoRef.current = false
                setAbierto(false)
                window.speechSynthesis.cancel()
                recRef.current?.stop()
              }}
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
                  ? `Di "Hola Siri" en cualquier momento, o toca el micrófono y habla: "ábreme la galería", "busca el pedido TR6492", "¿cuánto vendimos hoy?"…`
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
                onClick={() => { conversandoRef.current = true; escuchar() }}
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
