'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Minus, X } from 'lucide-react'

// Banner motivacional para ASESORES con reto vigente: un mensaje distinto según
// la hora del día (mañana / mediodía / tarde / cierre), siempre con los números
// reales del momento, y mensajes de hito al cruzar 25/50/75/100% de la meta.
// Es una franja delgada y cerrable — NO el panel grande del reto, que se quitó
// a pedido del admin (los retos completos se ven en /retos).
// Aprobado por Johan (6-ago-2026): franjas + hitos, tono que empuja sin regañar.

type Props = {
  retoId: string
  nombre: string        // primer nombre del asesor
  objetivo: number      // meta en plata
  valorMes: number      // avance del mes (el suyo, o el del grupo si es grupal)
  ventaHoy: number      // lo vendido HOY por el asesor
  premio: string | null
}

function plata(v: number): string {
  if (v >= 1_000_000) {
    const m = v / 1_000_000
    return `$${(Math.round(m * 10) / 10).toLocaleString('es-CO')}M`
  }
  return `$${Math.round(v).toLocaleString('es-CO')}`
}

// Días del mes que faltan (incluyendo hoy), sin domingos: para el ritmo diario.
function diasHabilesRestantes(ahora: Date): number {
  const bogota = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  const anio = bogota.getFullYear(), mes = bogota.getMonth()
  const ultimo = new Date(anio, mes + 1, 0).getDate()
  let dias = 0
  for (let d = bogota.getDate(); d <= ultimo; d++) {
    if (new Date(anio, mes, d).getDay() !== 0) dias++
  }
  return Math.max(1, dias)
}

export function MensajeMotivacional({ retoId, nombre, objetivo, valorMes, ventaHoy, premio }: Props) {
  const [visible, setVisible] = useState(false)
  const [minimizado, setMinimizado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [esHito, setEsHito] = useState(false)
  const [claveCierre, setClaveCierre] = useState('')

  useEffect(() => {
    if (!objetivo || objetivo <= 0) return
    const ahora = new Date()
    const bogota = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
    const hora = bogota.getHours()
    const esDomingo = bogota.getDay() === 0
    const fecha = bogota.toISOString().slice(0, 10)

    if (esDomingo || hora < 9 || hora >= 21) return

    const pct = Math.min(100, Math.round((valorMes / objetivo) * 100))
    const faltante = Math.max(0, objetivo - valorMes)
    const ritmoDia = Math.ceil(faltante / diasHabilesRestantes(ahora))
    const arriba = valorMes > 0 && ritmoDia <= Math.round(objetivo / 26)

    // 1º: hitos (una sola vez cada uno, por reto)
    const hitos: Array<[number, string]> = [
      [100, `🏆 ¡¡META CUMPLIDA, ${nombre}!! ${plata(objetivo)} — ${premio ? `${premio} es TUYO` : 'lo lograste'}. A romper el récord.`],
      [75, `🚀 ¡${nombre}, cruzaste el 75% de la meta! ${premio ? 'El premio ya se huele. ' : ''}Falta el último empujón.`],
      [50, `⚡ ¡MITAD DE LA META, ${nombre}! ${plata(valorMes)} — de aquí en adelante es cuesta abajo.`],
      [25, `🎉 ¡${nombre}, cruzaste el 25% de la meta! Un cuarto del camino hecho.`],
    ]
    for (const [marca, texto] of hitos) {
      if (pct >= marca) {
        const clave = `reto-hito-${retoId}-${marca}`
        if (!localStorage.getItem(clave)) {
          localStorage.setItem(clave, fecha)
          setMensaje(texto)
          setEsHito(true)
          setClaveCierre('')
          setMinimizado(false)
          setVisible(true)
          return
        }
        break
      }
    }

    // 2º: mensaje de la franja horaria (cerrable; vuelve en la franja siguiente)
    const franja = hora < 11 ? 'manana' : hora < 15 ? 'mediodia' : hora < 18 ? 'tarde' : 'cierre'
    const clave = `reto-motiv-${retoId}-${fecha}-${franja}`
    if (localStorage.getItem(clave)) return

    let texto = ''
    if (franja === 'manana') {
      texto = `☀️ ¡Buen día, ${nombre}! Meta del mes: ${plata(objetivo)} — llevas ${plata(valorMes)} (${pct}%). El día de hoy vale ${plata(ritmoDia)}: ¡a por él! 💪`
    } else if (franja === 'mediodia') {
      texto = ventaHoy > 0
        ? `🔥 ${nombre}, hoy llevas ${plata(ventaHoy)}. Para sostener el ritmo del mes necesitas ${plata(ritmoDia)} hoy — ¡cada cliente cuenta!`
        : `🔥 ${nombre}, el día vale ${plata(ritmoDia)} y aún está entero. ¡La primera venta abre el camino!`
    } else if (franja === 'tarde') {
      const faltaDia = Math.max(0, ritmoDia - ventaHoy)
      texto = faltaDia > 0
        ? `⏰ Recta final, ${nombre}: hoy llevas ${plata(ventaHoy)}, te faltan ${plata(faltaDia)} para ganarte el día. Una venta más y queda 🏁`
        : `⏰ ${nombre}, ¡el día ya está GANADO con ${plata(ventaHoy)}! Lo que venga ahora es ventaja pura 🏁`
    } else {
      texto = arriba
        ? `🌙 Día de hoy: ${plata(ventaHoy)}. Acumulado: ${plata(valorMes)} (${pct}%). Vas ARRIBA del ritmo — ${premio ? `${premio} está` : 'la meta está'} cada día más cerca 🏆`
        : `🌙 Día de hoy: ${plata(ventaHoy)}. Acumulado: ${plata(valorMes)} (${pct}%). Mañana es buen día para recortar: ${plata(ritmoDia)} diarios y llegas 💪`
    }

    setMensaje(texto)
    setEsHito(false)
    setClaveCierre(clave)
    setMinimizado(false)
    setVisible(true)
  }, [retoId, nombre, objetivo, valorMes, ventaHoy, premio])

  if (!visible || !mensaje) return null

  function cerrar() {
    if (claveCierre) localStorage.setItem(claveCierre, '1')
    setVisible(false)
  }

  // Minimizado: solo queda una burbujita flotante; al tocarla vuelve el mensaje.
  if (minimizado) {
    return (
      <div className="fixed bottom-4 left-4 z-40 print:hidden">
        <button
          onClick={() => setMinimizado(false)}
          className={`h-11 w-11 flex items-center justify-center rounded-full border shadow-lg text-lg transition-transform hover:scale-110 ${
            esHito
              ? 'bg-amber-50 border-amber-300 shadow-amber-100'
              : 'bg-violet-50 border-violet-200 shadow-violet-100'
          }`}
          aria-label="Ver mensaje de motivación"
        >
          {esHito ? '🏆' : '💪'}
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[calc(100vw-2rem)] sm:w-auto sm:max-w-md print:hidden">
      <div className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 shadow-lg ${
        esHito
          ? 'bg-amber-50 border-amber-300 shadow-amber-100'
          : 'bg-violet-50 border-violet-200 shadow-violet-100'
      }`}>
        <Link href="/retos" className={`text-sm font-medium leading-snug ${esHito ? 'text-amber-900' : 'text-violet-900'}`}>
          {mensaje}
        </Link>
        <div className="shrink-0 flex items-center gap-0.5">
          <button
            onClick={() => setMinimizado(true)}
            className={`p-1 rounded-lg transition-colors ${esHito ? 'text-amber-600 hover:bg-amber-100' : 'text-violet-500 hover:bg-violet-100'}`}
            aria-label="Minimizar"
          >
            <Minus size={15} />
          </button>
          <button
            onClick={cerrar}
            className={`p-1 rounded-lg transition-colors ${esHito ? 'text-amber-600 hover:bg-amber-100' : 'text-violet-500 hover:bg-violet-100'}`}
            aria-label="Cerrar"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
