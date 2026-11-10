import { createAdminClient } from '@/lib/supabase/admin'
import { hoyBogota } from '@/lib/utils/format'

// Misión Navidad — Bucaramanga (TR). Meta de equipo: $650M del 1-nov al 31-dic-2026.
// Reglas del dueño (10-nov): SOLO cuenta lo facturado (la factura sale cuando se entrega)
// desde el 1-nov Y PAGADO: el crédito (entregado que aún se debe) NO cuenta. Las ventas de los
// administradores suman a la meta; la cuenta jhon fredy no.
// Solo LEE: la cuenta la hace la función SQL mision_navidad (migración 217).
// Lo usan la página /mision-navidad y la ventanita flotante de cada asesora.
// El que llama debe haber verificado el rol: la función SQL solo la puede llamar el service_role.
export const SEDE = 'TR'
export const META = 650_000_000
export const DESDE = '2026-11-01'
export const HASTA = '2026-12-31'
// Luisa (Santa Rosa) entra al ranking del VIAJE (10-nov), pero sus ventas no suman a la
// meta de $650M, que es solo de Bucaramanga.
const LUISA_SR_ID = '35aea4c1-4974-492d-b86e-2ddb345165f1'
// Ventas que NO suman a nada: la cuenta de asesora "jhon fredy" (decisión del dueño, 10-nov).
// Las ventas de los ADMINISTRADORES (Johan, Ronaldo) sí suman a la meta del equipo, pero no
// participan en el ranking del viaje (es para la asesora que más venda).
const EXCLUIDOS = [
  '5aa07286-5ada-4e4b-a4b3-ef020068e229', // jhon fredy
]

type FilaSql = {
  asesor_id: string | null; asesor: string
  facturado_n: number; facturado_total: string | number
  facturado_bruto: string | number; credito: string | number
  facturado_de_antes: string | number
  por_facturar_n: number; por_facturar: string | number
}

export type FilaMision = {
  id: string | null
  esAdmin: boolean
  asesor: string
  sede: string
  n: number
  valor: number        // lo PAGADO de lo facturado: lo que cuenta
  credito: number      // entregado y aún debido: NO cuenta
  deOctubre: number
  porFacturar: number
  porFacturarN: number
}

const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

export async function calcularMisionNavidad() {
  const admin = createAdminClient()

  const { data, error } = await (admin as any).rpc('mision_navidad', {
    p_sede: SEDE, p_desde: DESDE, p_hasta: HASTA, p_excluir: EXCLUIDOS,
  })
  if (error) throw new Error(`Misión Navidad: no se pudo calcular el avance (${error.message})`)

  // Administradores: suman a la meta del equipo pero no entran al ranking del viaje.
  const { data: admins, error: errorAdmins } = await admin.from('usuarios').select('id').eq('rol', 'admin')
  if (errorAdmins) throw new Error(`Misión Navidad: no se pudo leer los administradores (${errorAdmins.message})`)
  const idsAdmin = new Set(((admins ?? []) as Array<{ id: string }>).map(a => a.id))

  const aFila = (f: FilaSql, sede: string): FilaMision => ({
    id: f.asesor_id,
    esAdmin: !!f.asesor_id && idsAdmin.has(f.asesor_id),
    asesor: f.asesor,
    sede,
    n: Number(f.facturado_n),
    valor: Number(f.facturado_total),
    credito: Number(f.credito),
    deOctubre: Number(f.facturado_de_antes),
    porFacturar: Number(f.por_facturar),
    porFacturarN: Number(f.por_facturar_n),
  })
  const filas = ((data ?? []) as FilaSql[]).map(f => aFila(f, 'Bucaramanga')).sort((a, b) => b.valor - a.valor)

  // Ranking del viaje = asesoras de Bucaramanga + Luisa de Santa Rosa.
  const { data: dataSR, error: errorSR } = await (admin as any).rpc('mision_navidad', {
    p_sede: 'SR', p_desde: DESDE, p_hasta: HASTA, p_excluir: [],
  })
  if (errorSR) throw new Error(`Misión Navidad: no se pudo calcular lo de Luisa (${errorSR.message})`)
  const luisa = ((dataSR ?? []) as FilaSql[]).find(f => f.asesor_id === LUISA_SR_ID)
  const ranking = [...filas.filter(f => !f.esAdmin), ...(luisa ? [aFila(luisa, 'Santa Rosa')] : [])]
    .sort((a, b) => b.valor - a.valor)
  const deAdmins = filas.filter(f => f.esAdmin)

  const total = filas.reduce((s, f) => s + f.valor, 0)
  const hoy = hoyBogota()
  const totalDias = dias(DESDE, HASTA) + 1
  const transcurridos = Math.min(Math.max(dias(DESDE, hoy) + 1, 1), totalDias)
  const ritmoDiario = total / transcurridos

  return {
    hoy,
    terminada: hoy > HASTA,
    ranking,
    deAdmins,
    totalAdmins: deAdmins.reduce((s, f) => s + f.valor, 0),
    total,
    deOctubre: filas.reduce((s, f) => s + f.deOctubre, 0),
    credito: filas.reduce((s, f) => s + f.credito, 0),
    porFacturar: filas.reduce((s, f) => s + f.porFacturar, 0),
    porFacturarN: filas.reduce((s, f) => s + f.porFacturarN, 0),
    pct: (total / META) * 100,
    totalDias,
    transcurridos,
    pctTiempo: (transcurridos / totalDias) * 100,
    ritmoDiario,
    proyeccion: ritmoDiario * totalDias,
    falta: Math.max(META - total, 0),
  }
}
