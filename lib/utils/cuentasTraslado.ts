import { metodosDeSede } from '@/types'

// Opciones de cuentas para el modal de traslado/consignación.
// grupo: encabezado del <optgroup> en el selector de destino.
export type CuentaTrasladoOpcion = { id: string; nombre: string; grupo?: string }

type CuentaRow = { id: string; nombre: string; tipo: string; sede_id: string | null; metodo_pago: string | null }
type SedeRow = { id: string; codigo: string; nombre: string }

// Financieras que pagan después (Addi/Sistecrédito): su saldo es por cobrar,
// nadie consigna plata "hacia" ellas.
const TIPOS_NO_DESTINO = ['addi', 'sistecredito']

// Cuentas desde las que un asesor puede sacar plata: las de los métodos de su
// sede (efectivo = solo la caja de su sede). Mismo criterio que el selector
// de gastos, para que la asesora solo mueva dinero que ella maneja.
export function origenesTraslado(
  cuentas: CuentaRow[],
  sedes: SedeRow[],
  sedeId: string | null,
): CuentaTrasladoOpcion[] {
  if (!sedeId) return []
  const codigo = sedes.find(s => s.id === sedeId)?.codigo
  const permitidos = new Set<string>(metodosDeSede(codigo))
  return cuentas
    .filter(c =>
      !!c.metodo_pago && permitidos.has(c.metodo_pago) &&
      (c.metodo_pago !== 'efectivo' || c.sede_id === sedeId))
    .map(c => ({ id: c.id, nombre: c.nombre }))
}

// Destinos: TODAS las cuentas activas agrupadas por sede. Bucaramanga y las
// cuentas globales del negocio (bancos) van de primeras: el caso típico es la
// asesora consignando o entregando plata hacia allá.
export function destinosTraslado(cuentas: CuentaRow[], sedes: SedeRow[]): CuentaTrasladoOpcion[] {
  const nombreSede = new Map(sedes.map(s => [s.id, s.nombre]))
  const idTR = sedes.find(s => s.codigo === 'TR')?.id ?? null
  const peso = (c: CuentaRow) => (c.sede_id === idTR ? 0 : c.sede_id === null ? 1 : 2)
  const grupoDe = (c: CuentaRow) =>
    c.sede_id === null ? 'Cuentas del negocio (bancos)' : (nombreSede.get(c.sede_id) ?? 'Otras')
  return cuentas
    .filter(c => !TIPOS_NO_DESTINO.includes(c.tipo))
    .slice()
    // Por peso y luego por grupo, para que cada sede quede en un solo bloque
    // (el sort estable conserva el orden `orden` dentro de cada sede).
    .sort((a, b) => peso(a) - peso(b) || grupoDe(a).localeCompare(grupoDe(b)))
    .map(c => ({ id: c.id, nombre: c.nombre, grupo: grupoDe(c) }))
}
