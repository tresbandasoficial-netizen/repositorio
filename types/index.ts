export type Rol = 'asesor' | 'admin'

export type Sede = {
  id: string
  codigo: 'TR' | 'CR' | 'SR'
  nombre: string
  direccion: string | null
  creado_en: string
}

export type Usuario = {
  id: string
  email: string
  nombre: string
  rol: Rol
  sede_id: string | null
  activo: boolean
  creado_en: string
  sede?: Sede
}

export type Cliente = {
  id: string
  telefono_normalizado: string
  nombre: string
  cedula: string | null
  email: string | null
  notas: string | null
  creado_en: string
  actualizado_en: string
}

export type EstadoPedido =
  | 'pendiente'
  | 'comprado'
  | 'llego_usa'
  | 'bodega_colombia'
  | 'en_sede'
  | 'entregado'
  | 'cancelado'

export type MetodoPago = 'efectivo' | 'transferencia' | 'datafono' | 'otro'

export type PedidoItem = {
  id: string
  pedido_id: string
  marca: string
  descripcion: string
  talla: string | null
  cantidad: number
  precio_venta: number
}

export type Pago = {
  id: string
  pedido_id: string
  monto: number
  metodo: MetodoPago
  fecha: string
  asesor_id: string
  notas: string | null
  creado_en: string
  asesor?: Pick<Usuario, 'nombre'>
}

export type Pedido = {
  id: string
  numero_orden: string
  sede_id: string
  cliente_id: string
  asesor_id: string
  estado: EstadoPedido
  total: number
  tipo_entrega: 'domicilio' | 'sede'
  direccion_entrega: string | null
  notas: string | null
  fecha_creacion: string
  fecha_actualizacion: string
  cliente?: Cliente
  asesor?: Pick<Usuario, 'nombre' | 'rol'>
  sede?: Sede
  items?: PedidoItem[]
  pagos?: Pago[]
}

export type Alerta = {
  id: string
  pedido_id: string
  tipo: 'tiempo_excedido' | 'zombie'
  creada_en: string
  resuelta_en: string | null
  pedido?: Pick<Pedido, 'numero_orden' | 'estado' | 'sede_id'>
}

export type HistorialCambio = {
  id: string
  tabla: string
  registro_id: string
  campo: string
  valor_anterior: string | null
  valor_nuevo: string | null
  usuario_id: string
  fecha: string
  usuario?: Pick<Usuario, 'nombre'>
}

// Parser types
export type ParsedPedido = {
  formato_version: string
  sede: 'TR' | 'CR' | 'SR'
  asesor: string
  cliente_nombre: string
  cliente_doc: string | null
  cliente_telefono: string
  productos: Array<{
    marca: string
    descripcion: string
    talla: string | null
    cantidad: number
    precio_venta: number
  }>
  total: number
  abono: number
  metodo_pago_abono: MetodoPago
  tipo_entrega: 'domicilio' | 'sede'
  direccion: string | null
  notas: string | null
}

export type ParseResult =
  | { ok: true; data: ParsedPedido }
  | { ok: false; error: string }

// Dashboard types
export type MetricasAdmin = {
  pedidos_hoy: number
  pedidos_semana: number
  pedidos_mes: number
  ventas_hoy: number
  ventas_semana: number
  ventas_mes: number
  pedidos_en_alerta: number
  pedidos_zombie: number
  ticket_promedio: number
  abonos_mes: number
}

export type MetricasAsesor = {
  pedidos_activos: number
  pedidos_en_alerta: number
  ventas_mes: number
  ticket_promedio: number
}

export const ESTADO_LABELS: Record<EstadoPedido, string> = {
  pendiente: 'Pendiente',
  comprado: 'Comprado',
  llego_usa: 'Llegó a USA',
  bodega_colombia: 'Bodega Colombia',
  en_sede: 'En sede',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

export const ESTADO_COLORES: Record<EstadoPedido, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  comprado: 'bg-blue-100 text-blue-800',
  llego_usa: 'bg-purple-100 text-purple-800',
  bodega_colombia: 'bg-indigo-100 text-indigo-800',
  en_sede: 'bg-orange-100 text-orange-800',
  entregado: 'bg-green-100 text-green-800',
  cancelado: 'bg-gray-100 text-gray-600',
}

// Días máximos por estado antes de generar alerta
export const UMBRAL_ALERTA_DIAS: Partial<Record<EstadoPedido, number>> = {
  pendiente: 3,
  comprado: 7,
  llego_usa: 15,
  bodega_colombia: 5,
  en_sede: 2,
}

export const DIAS_ZOMBIE = 30
