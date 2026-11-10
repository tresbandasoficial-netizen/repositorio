'use server'

import { getSesion } from '@/lib/auth/acceso'
import { calcularMisionNavidad, META } from '@/lib/mision-navidad'

// Resumen PERSONAL para la ventanita flotante de cada asesora. Solo devuelve lo suyo y el avance
// del equipo; el crédito y lo pendiente de las demás no sale de aquí.
export type ResumenMision = {
  nombre: string            // primer nombre
  cuenta: number            // lo suyo que ya cuenta (facturado y pagado)
  credito: number           // entregado y aún debido: no cuenta todavía
  porFacturar: number
  porFacturarN: number
  puesto: number
  de: number
  arriba: { nombre: string; falta: number } | null   // quién va un puesto adelante y cuánto le falta
  meta: number
  totalEquipo: number
  pctEquipo: number
  pctTiempo: number
}

export async function resumenMisionNavidadAction(): Promise<ResumenMision | null> {
  const sesion = await getSesion()
  if (sesion.rol !== 'asesor') return null

  const m = await calcularMisionNavidad()
  if (m.terminada) return null

  const puesto = m.ranking.findIndex(f => f.id === sesion.id)
  if (puesto < 0) return null   // cuentas que no participan (p. ej. jhon fredy)
  const mia = m.ranking[puesto]
  const adelante = puesto > 0 ? m.ranking[puesto - 1] : null

  return {
    nombre: mia.asesor.trim().split(/\s+/)[0].replace(/^\p{Ll}/u, (c: string) => c.toUpperCase()),
    cuenta: mia.valor,
    credito: mia.credito,
    porFacturar: mia.porFacturar,
    porFacturarN: mia.porFacturarN,
    puesto: puesto + 1,
    de: m.ranking.length,
    arriba: adelante ? { nombre: adelante.asesor.trim().split(/\s+/)[0], falta: Math.max(adelante.valor - mia.valor, 0) } : null,
    meta: META,
    totalEquipo: m.total,
    pctEquipo: m.pct,
    pctTiempo: m.pctTiempo,
  }
}
