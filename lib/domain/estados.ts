import { EstadoPedido } from '@/types'

const TODOS: EstadoPedido[] = [
  'pendiente', 'comprado', 'usa', 'bucaramanga', 'santa_rosa', 'entregado', 'cancelado',
]

// Cualquier estado no-terminal puede pasar a cualquier otro estado.
export const TRANSICIONES: Record<EstadoPedido, EstadoPedido[]> = {
  pendiente:   TODOS.filter(e => e !== 'pendiente'),
  comprado:    TODOS.filter(e => e !== 'comprado'),
  usa:         TODOS.filter(e => e !== 'usa'),
  bucaramanga: TODOS.filter(e => e !== 'bucaramanga'),
  santa_rosa:  TODOS.filter(e => e !== 'santa_rosa'),
  entregado:   [],
  cancelado:   [],
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

// Orden natural del flujo para mostrar en el stepper
export const FLUJO_ESTADOS: EstadoPedido[] = ['comprado', 'usa', 'bucaramanga', 'santa_rosa', 'entregado']
