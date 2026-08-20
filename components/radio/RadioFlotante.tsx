'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Mic, Square, Volume2 } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Radio interno EN VIVO (16-ago-2026): oprimes el micrófono, hablas y tu voz
// va sonando en los computadores de los demás casi al instante (~1s), sin
// botón de enviar; al soltar se corta. El audio viaja en pedacitos (500ms,
// webm/opus en base64) por Supabase Realtime Broadcast y los oyentes lo
// reproducen con MediaSource a medida que llega.
//
// Respaldo: al terminar, la grabación completa se sube al bucket y se inserta
// en mensajes_radio. Quien la escuchó en vivo la ignora (transmision_id);
// quien tenía el autoplay bloqueado (o su navegador no soporta MediaSource)
// recibe el botón ámbar "toca para escuchar".

const MAX_SEGUNDOS = 60
const TIMESLICE_MS = 500
const MIME_VIVO = 'audio/webm;codecs=opus'

function aBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

function deBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function RadioFlotante({ miId, puedeHablar, nombre }: {
  miId: string
  puedeHablar: boolean
  nombre: string
}) {
  const [grabando, setGrabando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [sonando, setSonando] = useState<string | null>(null)      // nombre de quien habla
  const [pendiente, setPendiente] = useState<{ url: string; nombre: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Transmisión
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const segundosRef = useRef(0)
  const txRef = useRef<string>('')          // id de MI transmisión en curso
  const seqRef = useRef(0)
  const canalRef = useRef<RealtimeChannel | null>(null)

  // Escucha en vivo
  const escuchadasRef = useRef<Set<string>>(new Set())  // transmisiones oídas en vivo
  const vivoRef = useRef<{
    tx: string
    audio: HTMLAudioElement
    ms: MediaSource
    sb: SourceBuffer | null
    cola: Uint8Array[]
    fin: boolean
    bloqueado: boolean
  } | null>(null)

  // ── Canal Realtime: broadcast (vivo) + respaldo (postgres_changes) ─────────
  useEffect(() => {
    const supabase = createClient()

    function reproducirNota(url: string, quien: string) {
      const audio = new Audio(url)
      audio.onended = () => setSonando(null)
      audio.play()
        .then(() => { setPendiente(null); setSonando(quien) })
        .catch(() => setPendiente({ url, nombre: quien }))
    }

    function limpiarVivo() {
      const v = vivoRef.current
      if (v) {
        try { v.audio.pause() } catch { /* nada */ }
        vivoRef.current = null
      }
      setSonando(null)
    }

    function iniciarVivo(tx: string, quien: string) {
      if (vivoRef.current) return                       // ya hay una transmisión sonando
      if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(MIME_VIVO)) return
      const ms = new MediaSource()
      const audio = new Audio()
      audio.src = URL.createObjectURL(ms)
      const estado = { tx, audio, ms, sb: null as SourceBuffer | null, cola: [] as Uint8Array[], fin: false, bloqueado: false }
      vivoRef.current = estado

      ms.addEventListener('sourceopen', () => {
        if (vivoRef.current !== estado) return
        const sb = ms.addSourceBuffer(MIME_VIVO)
        estado.sb = sb
        sb.addEventListener('updateend', () => {
          if (vivoRef.current !== estado) return
          if (estado.cola.length > 0 && !sb.updating) {
            sb.appendBuffer(estado.cola.shift()!.buffer as ArrayBuffer)
          } else if (estado.fin && !sb.updating && ms.readyState === 'open') {
            try { ms.endOfStream() } catch { /* nada */ }
          }
        })
        if (estado.cola.length > 0) sb.appendBuffer(estado.cola.shift()!.buffer as ArrayBuffer)
      })

      audio.onended = () => { if (vivoRef.current === estado) { vivoRef.current = null; setSonando(null) } }
      audio.play()
        .then(() => { escuchadasRef.current.add(tx); setSonando(quien); setPendiente(null) })
        .catch(() => {
          // Autoplay bloqueado: no se puede oír en vivo — llegará como nota de
          // respaldo con el botón "toca para escuchar".
          estado.bloqueado = true
          vivoRef.current = null
        })
    }

    const canal = supabase
      .channel('radio-vivo', { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'inicio' }, ({ payload }) => {
        const p = payload as { tx: string; quien: string; emisor: string }
        if (p.emisor === miId) return
        iniciarVivo(p.tx, p.quien)
      })
      .on('broadcast', { event: 'chunk' }, ({ payload }) => {
        const p = payload as { tx: string; data: string }
        const v = vivoRef.current
        if (!v || v.tx !== p.tx) return
        const bytes = deBase64(p.data)
        if (v.sb && !v.sb.updating && v.cola.length === 0) {
          v.sb.appendBuffer(bytes.buffer as ArrayBuffer)
        } else {
          v.cola.push(bytes)
        }
      })
      .on('broadcast', { event: 'fin' }, ({ payload }) => {
        const p = payload as { tx: string }
        const v = vivoRef.current
        if (!v || v.tx !== p.tx) return
        v.fin = true
        if (v.sb && !v.sb.updating && v.cola.length === 0 && v.ms.readyState === 'open') {
          try { v.ms.endOfStream() } catch { /* nada */ }
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensajes_radio',
      }, payload => {
        const m = payload.new as { emisor_id: string; emisor_nombre: string; audio_url: string; transmision_id: string | null }
        if (m.emisor_id === miId) return
        // Ya se escuchó en vivo → el respaldo sobra.
        if (m.transmision_id && escuchadasRef.current.has(m.transmision_id)) return
        // Si está sonando en vivo ahora mismo, tampoco repetir.
        if (m.transmision_id && vivoRef.current?.tx === m.transmision_id) return
        reproducirNota(m.audio_url, m.emisor_nombre)
      })
      .subscribe()

    canalRef.current = canal
    return () => {
      limpiarVivo()
      supabase.removeChannel(canal)
      canalRef.current = null
    }
  }, [miId])

  // ── Transmitir ─────────────────────────────────────────────────────────────
  function pararTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  // Respaldo: la grabación completa queda guardada para quien no la oyó en vivo.
  async function subirRespaldo(blob: Blob, tx: string) {
    if (blob.size < 2000 || segundosRef.current < 1) return
    setEnviando(true)
    try {
      const supabase = createClient()
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
      const path = `radio/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const up = await supabase.storage.from('pedido-items').upload(path, blob, { contentType: blob.type })
      if (up.error) { setError('No se pudo guardar el audio'); return }
      const { data } = supabase.storage.from('pedido-items').getPublicUrl(path)
      const ins = await supabase.from('mensajes_radio').insert({
        emisor_id:      miId,
        emisor_nombre:  nombre,
        audio_url:      data.publicUrl,
        duracion_seg:   segundosRef.current,
        transmision_id: tx,
      })
      if (ins.error) setError('No se pudo transmitir')
    } catch {
      setError('No se pudo guardar el audio')
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
      const mime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(MIME_VIVO)
        ? MIME_VIVO
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined)
      recRef.current = rec
      chunksRef.current = []
      const tx = `${miId.slice(0, 8)}-${Date.now()}`
      txRef.current = tx
      seqRef.current = 0
      // Solo se transmite EN VIVO si el formato es el que los oyentes saben
      // armar (webm/opus); si no (Safari → mp4), va solo como respaldo.
      const enVivo = mime === MIME_VIVO && !!canalRef.current

      if (enVivo) {
        canalRef.current!.send({
          type: 'broadcast', event: 'inicio',
          payload: { tx, quien: nombre, emisor: miId },
        })
      }

      rec.ondataavailable = e => {
        if (e.data.size === 0) return
        chunksRef.current.push(e.data)
        if (enVivo) {
          e.data.arrayBuffer().then(buf => {
            canalRef.current?.send({
              type: 'broadcast', event: 'chunk',
              payload: { tx, seq: seqRef.current++, data: aBase64(buf) },
            })
          })
        }
      }
      rec.onstop = () => {
        pararTimer()
        setGrabando(false)
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        if (enVivo) {
          canalRef.current?.send({ type: 'broadcast', event: 'fin', payload: { tx } })
        }
        void subirRespaldo(new Blob(chunksRef.current, { type: mime || 'audio/webm' }), tx)
      }

      segundosRef.current = 0
      setSegundos(0)
      setGrabando(true)
      rec.start(TIMESLICE_MS)
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

      {/* Botón de transmitir (admin y asesores; el visor solo escucha) */}
      {puedeHablar && (
        <button
          type="button"
          onClick={toggleGrabar}
          disabled={enviando}
          aria-label={grabando ? 'Cortar' : 'Hablar por el radio'}
          title={grabando ? 'Cortar' : 'Hablar por el radio (suena en vivo donde los demás)'}
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
