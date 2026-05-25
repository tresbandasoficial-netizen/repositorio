import { EstadoPedido } from '@/types'

const TODOS: EstadoPedido[] = [
  'pendiente', 'comprado', 'llego_usa', 'bodega_colombia',
  'avisado', 'en_sede', 'entregado', 'cancelado',
]

// Cualquier estado no-terminal puede pasar a cualquier otro estado.
export const TRANSICIONES: Record<EstadoPedido, EstadoPedido[]> = {
  pendiente:       TODOS.filter(e => e !== 'pendiente'),
  comprado:        TODOS.filter(e => e !== 'comprado'),
  llego_usa:       TODOS.filter(e => e !== 'llego_usa'),
  bodega_colombia: TODOS.filter(e => e !== 'bodega_colombia'),
  avisado:         TODOS.filter(e => e !== 'avisado'),
  en_sede:         TODOS.filter(e => e !== 'en_sede'),
  entregado:       [],
  cancelado:       [],
}

export const SOLO_ADMIN: EstadoPedido[] = []

export function transicionesDisponibles(
  estadoActual: EstadoPedido,
  rol: 'asesor' | 'admin'
): EstadoPedido[] {
  return TRANSICIONES[estadoActual] ?? []
}

export function puedeTransicionar(
  desde: EstadoPedido,
  hacia: EstadoPedido,
  rol: 'asesor' | 'admin'
): boolean {
  return transicionesDisponibles(desde, rol).includes(hacia)
}
