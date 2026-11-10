'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Minus, X } from 'lucide-react'
import { resumenMisionNavidadAction, type ResumenMision } from '@/app/actions/mision-navidad'

// Ventanita flotante (abajo a la derecha) para cada ASESORA durante la Misión Navidad:
// su avance, su puesto y un mensaje motivacional que cambia solo. Se puede minimizar
// (burbuja) o cerrar por hoy. Solo lee; los números salen de la misma cuenta de /mision-navidad.

function plata(v: number): string {
  if (v >= 1_000_000) return `$${(Math.round((v / 1_000_000) * 10) / 10).toLocaleString('es-CO')}M`
  return `$${Math.round(v).toLocaleString('es-CO')}`
}

// Mensajes que dependen de la situación real de la asesora (siempre con sus números).
function mensajesDe(r: ResumenMision): string[] {
  const n = r.nombre
  const m: string[] = []

  if (r.cuenta <= 0) {
    m.push(`🌱 ${n}, tu marcador está en $0: la primera venta pagada abre el camino. ¡Hoy es el día! 💪`)
  } else if (r.puesto === 1 && r.de > 1) {
    m.push(`🥇 ¡${n}, vas de PRIMERA con ${plata(r.cuenta)}! Cuida el trono: ¡no pares! 🔥`)
  } else if (r.arriba) {
    m.push(`🏃‍♀️ ${n}, te faltan solo ${plata(r.arriba.falta)} para pasar a ${r.arriba.nombre}. ¡Una buena venta y la alcanzas! ✨`)
  }

  if (r.credito > 0) {
    m.push(`💸 Tienes ${plata(r.credito)} entregados y por cobrar. Cada cobro es plata que suma a tu meta: ¡escríbele hoy a esos clientes! 📲`)
  }
  if (r.porFacturarN > 0) {
    m.push(`📦 Tienes ${r.porFacturarN} pedido${r.porFacturarN !== 1 ? 's' : ''} por entregar (${plata(r.porFacturar)}). ¡Entrégalos y cobra para que cuenten! 🚚`)
  }

  if (r.pctEquipo >= 100) {
    m.push(`🏆 ¡META DEL EQUIPO CUMPLIDA! Gracias, ${n}. ¡A romper el récord! 🎉`)
  } else {
    m.push(`🎯 El equipo lleva ${r.pctEquipo.toFixed(1)}% de los ${plata(r.meta)}. Cada venta tuya acerca la Navidad del equipo 🎄`)
  }
  if (r.pctEquipo + 0.05 < r.pctTiempo) {
    m.push(`⏰ Ya pasó el ${r.pctTiempo.toFixed(0)}% del tiempo y el equipo va en ${r.pctEquipo.toFixed(0)}%. ¡Hay que acelerar, tú puedes, ${n}! 🚀`)
  } else {
    m.push(`🚀 El equipo va a buen ritmo, ${n}. ¡Sigamos sumando, no soltemos el paso! 👏`)
  }

  // Frases sueltas de ánimo para ventas.
  m.push(
    `🌟 ${n}, cada "no" te acerca a un "sí". ¡Sigue ofreciendo!`,
    `📞 Una llamada más, un mensaje más: así se llega al viaje, ${n}. ✈️`,
    `🤝 Un cliente bien atendido vuelve y trae a otros. ¡Atiende con cariño! 💛`,
    `🔥 No esperes la venta, ve por ella. ¡Hoy es un gran día para vender, ${n}!`,
    `✈️ El viaje se gana un pedido a la vez. ¡Tú puedes, ${n}! 💪`,
    `🎁 Ofrece algo más: un par de medias, una gorra… ¡las ventas pequeñas también suman! 🧦`,
    `😄 Sonríe, escucha al cliente y cierra con confianza. ¡Eres buena en esto, ${n}!`,
    `📈 Constancia le gana al talento. Un poquito más cada día y llegamos a los $650M 🙌`,
  )
  return m
}

export function VentanaMision() {
  const pathname = usePathname()
  const [r, setR] = useState<ResumenMision | null>(null)
  const [i, setI] = useState(0)
  const [estado, setEstado] = useState<'abierta' | 'minimizada' | 'cerrada'>('abierta')

  // Carga una vez al montar el layout y refresca cada 10 minutos.
  useEffect(() => {
    let vivo = true
    const cargar = () => {
      resumenMisionNavidadAction().then(x => { if (vivo) setR(x) }).catch(() => {})
    }
    cargar()
    const t = setInterval(cargar, 10 * 60 * 1000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  // Recuerda si la cerró hoy o la dejó minimizada (por navegador).
  useEffect(() => {
    try {
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      if (localStorage.getItem('mision-ventana-cerrada') === hoy) setEstado('cerrada')
      else if (localStorage.getItem('mision-ventana-min') === '1') setEstado('minimizada')
    } catch { /* sin almacenamiento: queda abierta */ }
  }, [])

  const mensajes = useMemo(() => (r ? mensajesDe(r) : []), [r])

  // Arranca en un mensaje distinto cada día/hora y rota solo cada 40 s.
  useEffect(() => {
    if (!mensajes.length) return
    setI(Math.floor(Date.now() / 3_600_000) % mensajes.length)
    const t = setInterval(() => setI(x => (x + 1) % mensajes.length), 40_000)
    return () => clearInterval(t)
  }, [mensajes])

  if (!r || estado === 'cerrada' || pathname.startsWith('/mision-navidad')) return null

  const guardarMin = (v: boolean) => { try { v ? localStorage.setItem('mision-ventana-min', '1') : localStorage.removeItem('mision-ventana-min') } catch {} }
  const minimizar = () => { setEstado('minimizada'); guardarMin(true) }
  const abrir = () => { setEstado('abierta'); guardarMin(false) }
  const cerrarHoy = () => {
    setEstado('cerrada')
    try { localStorage.setItem('mision-ventana-cerrada', new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })) } catch {}
  }

  // Encima del botón del radio y del agente de voz para no taparlos.
  if (estado === 'minimizada') {
    return (
      <button
        onClick={abrir}
        className="fixed bottom-40 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-xl shadow-lg transition-transform hover:scale-110 print:hidden"
        aria-label="Abrir Misión Navidad"
      >
        🎄
      </button>
    )
  }

  const pctPersonal = r.pctEquipo
  return (
    <div className="fixed bottom-40 right-4 z-40 w-72 max-w-[calc(100vw-2rem)] print:hidden">
      <div className="rounded-2xl border border-emerald-200 bg-white shadow-xl shadow-emerald-100">
        <div className="flex items-center justify-between rounded-t-2xl bg-emerald-600 px-3 py-2 text-white">
          <span className="text-sm font-bold">🎄 Misión Navidad</span>
          <span className="flex items-center gap-0.5">
            <button onClick={minimizar} className="rounded p-1 hover:bg-emerald-700" aria-label="Minimizar"><Minus size={14} /></button>
            <button onClick={cerrarHoy} className="rounded p-1 hover:bg-emerald-700" aria-label="Cerrar por hoy"><X size={14} /></button>
          </span>
        </div>

        <div className="space-y-2 px-3 py-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[11px] text-gray-500">Tú llevas (ya pagado)</p>
              <p className="text-xl font-bold leading-tight text-gray-900">{plata(r.cuenta)}</p>
            </div>
            <p className="text-right text-xs text-gray-600">
              {r.puesto === 1 ? '🥇' : r.puesto === 2 ? '🥈' : r.puesto === 3 ? '🥉' : '🏅'} Puesto <b>{r.puesto}</b> de {r.de}
            </p>
          </div>

          <div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(pctPersonal, 100)}%` }} />
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">Equipo: {plata(r.totalEquipo)} de {plata(r.meta)} ({pctPersonal.toFixed(1)}%)</p>
          </div>

          <button
            type="button"
            onClick={() => setI(x => (x + 1) % Math.max(mensajes.length, 1))}
            className="w-full rounded-xl bg-emerald-50 px-3 py-2 text-left text-[13px] leading-snug text-emerald-900"
            title="Toca para ver otro mensaje"
          >
            {mensajes[i] ?? ''}
          </button>

          <Link href="/mision-navidad" className="block text-center text-[11px] font-medium text-emerald-700 hover:underline">
            Ver el ranking completo →
          </Link>
        </div>
      </div>
    </div>
  )
}
