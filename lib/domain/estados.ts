import { EstadoPedido } from '@/types'

// Fuente de verdad para transiciones de estado.
// Para añadir/quitar una transición: editar AQUÍ únicamente.
// La función SQL 004_cambiar_estado_fn.sql espeja estas reglas — mantenerlas en sync.

export const TRANSICIONES: Record<EstadoPedido, EstadoPedido[]> = {
  pendiente:       ['comprado', 'cancelado'],
  comprado:        ['llego_usa', 'cancelado'],
  llego_usa:       ['bodega_colombia', 'cancelado'],
  bodega_colombia: ['en_sede', 'cancelado'],
  en_sede:         ['entregado', 'cancelado'],
  entregado:       [],
  cancelado:       [],
}

// Estados que solo el admin puede asignar
export const SOLO_ADMIN: EstadoPedido[] = ['cancelado']

export function transicionesDisponibles(
  estadoActual: EstadoPedido,
  rol: 'asesor' | 'admin'
): EstadoPedido[] {
  const posibles = TRANSICIONES[estadoActual] ?? []
  if (rol === 'admin') return posibles
  return posibles.filter((e) => !SOLO_ADMIN.includes(e))
}

export function puedeTransicionar(
  desde: EstadoPedido,
  hacia: EstadoPedido,
  rol: 'asesor' | 'admin'
): boolean {
  return transicionesDisponibles(desde, rol).includes(hacia)
}
