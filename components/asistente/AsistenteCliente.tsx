'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { resumenAsistenteAction, alertasAsistenteAction, chatAsistenteAction, MensajeChat } from '@/app/actions/asistente'
import { analistaChatAction } from '@/app/actions/analista'
import { FacturaTab } from './FacturaTab'

function Markdown({ texto }: { texto: string }) {
  const html = texto
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1 rounded text-xs font-mono">$1</code>')
    .split('\n')
    .map(l => l.startsWith('- ') || l.startsWith('• ')
      ? `<li class="ml-4 list-disc">${l.slice(2)}</li>`
      : l.match(/^\d+\.\s/)
        ? `<li class="ml-4 list-decimal">${l.replace(/^\d+\.\s/, '')}</li>`
        : l.trim() === '' ? '<br/>' : `<p>${l}</p>`
    ).join('')
  return (
    <div
      className="text-sm text-gray-700 leading-relaxed space-y-1 [&_strong]:font-semibold [&_strong]:text-gray-900 [&_p]:mb-1"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function BotIcon() {
  return (
    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-none text-white text-xs font-black">3B</div>
  )
}

export function AsistenteCliente({ rol }: { rol: string }) {
  const [tab, setTab] = useState<'resumen' | 'alertas' | 'chat' | 'factura' | 'analista'>('resumen')
  const [resumen, setResumen] = useState('')
  const [alertas, setAlertas] = useState('')
  const [historial, setHistorial] = useState<MensajeChat[]>([])
  const [pregunta, setPregunta] = useState('')
  const [cargandoResumen, setCargandoResumen] = useState(false)
  const [cargandoAlertas, setCargandoAlertas] = useState(false)
  const [isPending, start] = useTransition()
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Cargar resumen al montar
  useEffect(() => {
    setCargandoResumen(true)
    resumenAsistenteAction().then(r => { setResumen(r); setCargandoResumen(false) })
  }, [])

  // Cargar alertas cuando el usuario va a esa tab
  useEffect(() => {
    if (tab === 'alertas' && !alertas && !cargandoAlertas) {
      setCargandoAlertas(true)
      alertasAsistenteAction().then(a => { setAlertas(a); setCargandoAlertas(false) })
    }
  }, [tab])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [historial])

  function enviarPregunta() {
    if (!pregunta.trim() || isPending) return
    const preguntaActual = pregunta.trim()
    setPregunta('')
    const nuevoHistorial: MensajeChat[] = [...historial, { role: 'user', content: preguntaActual }]
    setHistorial(nuevoHistorial)

    start(async () => {
      const respuesta = await chatAsistenteAction(preguntaActual, historial)
      setHistorial(h => [...h, { role: 'assistant', content: respuesta }])
    })
  }

  // ── Analista de datos (solo admin) ──
  const [historialAnalista, setHistorialAnalista] = useState<MensajeChat[]>([])
  const [preguntaAnalista, setPreguntaAnalista] = useState('')
  const [isPendingAnalista, startAnalista] = useTransition()

  function enviarPreguntaAnalista() {
    if (!preguntaAnalista.trim() || isPendingAnalista) return
    const preguntaActual = preguntaAnalista.trim()
    setPreguntaAnalista('')
    const previo = historialAnalista
    setHistorialAnalista(h => [...h, { role: 'user', content: preguntaActual }])

    startAnalista(async () => {
      const r = await analistaChatAction(preguntaActual, previo)
      setHistorialAnalista(h => [...h, { role: 'assistant', content: r.texto }])
    })
  }

  // Facturas de proveedor y analista de datos exponen información financiera: solo admin.
  const SOLO_ADMIN = ['factura', 'analista']
  const TABS = ([
    { key: 'resumen',  label: '📊 Resumen' },
    { key: 'alertas', label: '⚠️ Alertas' },
    { key: 'chat',    label: '💬 Chat' },
    { key: 'factura', label: '📄 Factura' },
    { key: 'analista', label: '📈 Analista' },
  ] as const).filter(t => !SOLO_ADMIN.includes(t.key) || rol === 'admin')

  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* Tabs */}
      <div className="flex gap-2 bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === t.key
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── RESUMEN ── */}
      {tab === 'resumen' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100"
            style={{ background: 'linear-gradient(135deg,#2563eb,#1e40af)' }}>
            <div>
              <p className="text-xs font-bold text-blue-200 uppercase tracking-wider">Asistente IA</p>
              <p className="text-white font-bold text-lg mt-0.5">Resumen de pedidos pendientes</p>
            </div>
            <button
              type="button"
              onClick={() => { setResumen(''); setCargandoResumen(true); resumenAsistenteAction().then(r => { setResumen(r); setCargandoResumen(false) }) }}
              className="h-8 px-3 rounded-lg bg-white/20 text-white text-xs font-semibold hover:bg-white/30 transition-colors"
            >
              ↺ Actualizar
            </button>
          </div>
          <div className="p-5">
            {cargandoResumen ? (
              <div className="flex items-center gap-3 text-gray-400 text-sm py-6 justify-center">
                <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                Consultando pedidos…
              </div>
            ) : (
              <div className="flex gap-3">
                <BotIcon />
                <Markdown texto={resumen} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ALERTAS ── */}
      {tab === 'alertas' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100"
            style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)' }}>
            <div>
              <p className="text-xs font-bold text-red-200 uppercase tracking-wider">Asistente IA</p>
              <p className="text-white font-bold text-lg mt-0.5">Casos que necesitan atención</p>
            </div>
            <button
              type="button"
              onClick={() => { setAlertas(''); setCargandoAlertas(true); alertasAsistenteAction().then(a => { setAlertas(a); setCargandoAlertas(false) }) }}
              className="h-8 px-3 rounded-lg bg-white/20 text-white text-xs font-semibold hover:bg-white/30 transition-colors"
            >
              ↺ Actualizar
            </button>
          </div>
          <div className="p-5">
            {cargandoAlertas ? (
              <div className="flex items-center gap-3 text-gray-400 text-sm py-6 justify-center">
                <div className="w-5 h-5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                Analizando alertas…
              </div>
            ) : (
              <div className="flex gap-3">
                <BotIcon />
                <Markdown texto={alertas} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FACTURA ── */}
      {tab === 'factura' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100"
            style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
            <p className="text-xs font-bold text-green-200 uppercase tracking-wider">Asistente IA</p>
            <p className="text-white font-bold text-lg mt-0.5">Subir factura de proveedor</p>
          </div>
          <div className="p-5">
            <FacturaTab />
          </div>
        </div>
      )}

      {/* ── ANALISTA DE DATOS (solo admin) ── */}
      {tab === 'analista' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: 480 }}>
          <div className="px-5 py-4 border-b border-gray-100"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#4c1d95)' }}>
            <p className="text-xs font-bold text-purple-200 uppercase tracking-wider">Analista de datos</p>
            <p className="text-white font-bold text-lg mt-0.5">Pregunta lo que quieras sobre el negocio</p>
            <p className="text-purple-200 text-xs mt-0.5">Consulta en vivo ventas, finanzas, productos, gastos, ganancias y cartera</p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ maxHeight: 420 }}>
            {historialAnalista.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <BotIcon />
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                  Soy tu analista de datos. Tengo acceso de lectura a toda la información del negocio. ¿Qué quieres saber?
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    '¿Cuáles fueron los 10 productos más vendidos este mes?',
                    '¿Cuánta ganancia dejó cada sede este mes?',
                    '¿Cómo van las ventas de este mes contra el mes pasado?',
                    '¿Qué marca deja mejor margen?',
                    '¿Quiénes son mis 10 mejores clientes del año?',
                  ].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setPreguntaAnalista(s) }}
                      className="text-xs text-purple-700 border border-purple-200 rounded-lg px-3 py-1.5 hover:bg-purple-50 transition-colors mx-auto"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {historialAnalista.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && <BotIcon />}
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  m.role === 'user'
                    ? 'bg-purple-700 text-white text-sm'
                    : 'bg-gray-50 border border-gray-100'
                }`}>
                  {m.role === 'user'
                    ? <p className="text-sm">{m.content}</p>
                    : <Markdown texto={m.content} />}
                </div>
              </div>
            ))}

            {isPendingAnalista && (
              <div className="flex gap-2.5 justify-start">
                <BotIcon />
                <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
                  <p className="text-xs text-gray-400">Consultando la base de datos…</p>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
            <input
              type="text"
              value={preguntaAnalista}
              onChange={e => setPreguntaAnalista(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarPreguntaAnalista()}
              placeholder="¿Cuál fue mi mejor semana de ventas?"
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={isPendingAnalista}
            />
            <button
              type="button"
              onClick={enviarPreguntaAnalista}
              disabled={isPendingAnalista || !preguntaAnalista.trim()}
              className="h-10 w-10 rounded-xl bg-purple-700 text-white flex items-center justify-center hover:bg-purple-800 disabled:opacity-40 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── CHAT ── */}
      {tab === 'chat' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: 480 }}>
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-bold text-gray-900">Chat con tus pedidos</p>
            <p className="text-xs text-gray-400 mt-0.5">Pregúntale lo que quieras sobre los pedidos pendientes</p>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ maxHeight: 380 }}>
            {historial.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <BotIcon />
                <p className="text-sm text-gray-500 max-w-xs mx-auto">
                  Hola. Tengo acceso a todos tus pedidos pendientes. ¿Qué quieres saber?
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    '¿Cuáles pedidos llevan más de 5 días?',
                    '¿Cuánto saldo hay pendiente en total?',
                    '¿Hay pedidos en estado enviado sin confirmar?',
                  ].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setPregunta(s) }}
                      className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors mx-auto"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {historial.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && <BotIcon />}
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white text-sm'
                    : 'bg-gray-50 border border-gray-100'
                }`}>
                  {m.role === 'user'
                    ? <p className="text-sm">{m.content}</p>
                    : <Markdown texto={m.content} />}
                </div>
              </div>
            ))}

            {isPending && (
              <div className="flex gap-2.5 justify-start">
                <BotIcon />
                <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex gap-1 items-center">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
            <input
              type="text"
              value={pregunta}
              onChange={e => setPregunta(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarPregunta()}
              placeholder="¿Qué pedidos llevan más de una semana?"
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isPending}
            />
            <button
              type="button"
              onClick={enviarPregunta}
              disabled={isPending || !pregunta.trim()}
              className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
