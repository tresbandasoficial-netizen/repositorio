'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Mic, Square, Volume2 } from 'lucide-react'

// Radio interno (reemplaza el chat de texto, 15-ago-2026): el admin mantiene
// presionado / toca el micrófono, habla, y todos los usuarios conectados lo
// escuchan al instante en su computador. El audio se sube al bucket público
// (carpeta radio/) y la fila en mensajes_radio dispara el Realtime que lo
// reproduce en los demás navegadores.
//
// Autoplay: si el navegador bloquea el audio (sin gesto previo del usuario),
// se muestra un botón ámbar pulsante "toca para escuchar" en vez de sonar solo.

const MAX_SEGUNDOS = 60

export function RadioFlotante({ miId, esAdmin, nombre }: {
  miId: string
  esAdmin: boolean
  nombre: string
}) {
  const [grabando, setGrabando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [sonando, setSonando] = useState<string | null>(null)      // nombre de quien habla
  const [pendiente, setPendiente] = useState<{ url: string; nombre: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const segundosRef = useRef(0)

  // ── Escucha (todos los usuarios) ────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()

    function reproducir(url: string, quien: string) {
      const audio = new Audio(url)
      audio.onended = () => setSonando(null)
      audio.play()
        .then(() => { setPendiente(null); setSonando(quien) })
        .catch(() => setPendiente({ url, nombre: quien }))
    }

    const canal = supabase
      .channel('radio-interno')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensajes_radio',
      }, payload => {
        const m = payload.new as { emisor_id: string; emisor_nombre: string; audio_url: string }
        if (m.emisor_id === miId) return
        reproducir(m.audio_url, m.emisor_nombre)
      })
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [miId])

  // ── Transmisión (solo admin) ────────────────────────────────────────────────
  function pararTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  async function enviar(blob: Blob) {
    // Un toque accidental graba casi nada: no vale la pena transmitirlo.
    if (blob.size < 2000 || segundosRef.current < 1) return
    setEnviando(true)
    setError(null)
    try {
      const supabase = createClient()
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
      const path = `radio/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const up = await supabase.storage.from('pedido-items').upload(path, blob, { contentType: blob.type })
      if (up.error) { setError('No se pudo enviar el audio'); return }
      const { data } = supabase.storage.from('pedido-items').getPublicUrl(path)
      const ins = await supabase.from('mensajes_radio').insert({
        emisor_id:     miId,
        emisor_nombre: nombre,
        audio_url:     data.publicUrl,
        duracion_seg:  segundosRef.current,
      })
      if (ins.error) setError('No se pudo transmitir')
    } catch {
      setError('No se pudo enviar el audio')
    } finally {
      setEnviando(false)
    }
  }

  async function toggleGrabar() {
    setError(null)
    if (grabando) {
      recRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        pararTimer()
        setGrabando(false)
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        void enviar(new Blob(chunksRef.current, { type: mime || 'audio/webm' }))
      }
      segundosRef.current = 0
      setSegundos(0)
      setGrabando(true)
      rec.start()
      timerRef.current = setInterval(() => {
        segundosRef.current += 1
        setSegundos(segundosRef.current)
        if (segundosRef.current >= MAX_SEGUNDOS) recRef.current?.stop()
      }, 1000)
    } catch {
      setError('Permite el acceso al micrófono para transmitir')
    }
  }

  useEffect(() => () => {
    pararTimer()
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2 print:hidden">
      {error && (
        <span className="rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs text-red-700 shadow-sm">{error}</span>
      )}

      {/* Aviso: alguien está hablando */}
      {sonando && (
        <span className="flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-xs font-bold text-white shadow-lg">
          <Volume2 size={15} className="animate-pulse" /> {sonando} hablando…
        </span>
      )}

      {/* Autoplay bloqueado: tocar para oír el mensaje */}
      {pendiente && !sonando && (
        <button
          type="button"
          onClick={() => {
            const audio = new Audio(pendiente.url)
            audio.onended = () => setSonando(null)
            audio.play().then(() => { setSonando(pendiente.nombre); setPendiente(null) }).catch(() => {})
          }}
          className="flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-lg animate-pulse hover:bg-amber-600"
        >
          📻 Mensaje de {pendiente.nombre} — toca para escuchar
        </button>
      )}

      {/* Botón de transmitir (solo admin) */}
      {esAdmin && (
        <button
          type="button"
          onClick={toggleGrabar}
          disabled={enviando}
          aria-label={grabando ? 'Terminar y enviar' : 'Hablar por el radio'}
          title={grabando ? 'Terminar y enviar' : 'Hablar por el radio (todas las sedes escuchan)'}
          className={`flex items-center justify-center gap-2 rounded-full p-3.5 text-white shadow-lg transition-colors ${
            grabando
              ? 'bg-red-600 hover:bg-red-700 shadow-red-200 animate-pulse px-5'
              : enviando
              ? 'bg-gray-400'
              : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
          }`}
        >
          {enviando
            ? <Loader2 size={22} className="animate-spin" />
            : grabando
            ? <><Square size={18} fill="currentColor" /> <span className="text-sm font-bold tabular-nums">AL AIRE {segundos}s</span></>
            : <Mic size={22} />}
        </button>
      )}
    </div>
  )
}
