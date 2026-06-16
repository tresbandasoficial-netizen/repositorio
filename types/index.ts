export type Rol = 'asesor' | 'admin' | 'visor'

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
  | 'avisado'
  | 'en_sede'
  | 'entregado'
  | 'cancelado'

export type MetodoPago = 'efectivo' | 'transferencia' | 'datafono' | 'addi' | 'bold' | 'sistecredito' | 'credito' | 'otro'

export type PedidoItem = {
  id: string
  pedido_id: string
  marca: string
  descripcion: string
  talla: string | null
  cantidad: number
  precio_venta: number
  imagen_url: string | null
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

export type TipoAlerta = 'tiempo_excedido' | 'zombie'

export type Notificacion = {
  id: string
  usuario_id: string
  alerta_id: string
  leida: boolean
  email_enviado: boolean
  creada_en: string
  alerta?: Pick<Alerta, 'tipo'> & {
    pedido?: Pick<Pedido, 'id' | 'numero_orden' | 'estado'>
  }
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
  numero_orden_sugerido?: string   // extraído del formato libre (ej. TR5946)
  asesor?: string
  cliente_nombre: string
  cliente_doc: string | null
  cliente_telefono: string
  productos: Array<{
    marca: string
    descripcion: string
    talla: string | null
    cantidad: number
    precio_venta: number
    imagen_url?: string | null
  }>
  total: number
  abono: number
  metodo_pago_abono: MetodoPago
  tipo_entrega: 'domicilio' | 'sede'
  direccion: string | null
  notas: string | null
}

export type ParseResult =
  | { ok: true; data: ParsedPedido; warnings?: string[] }
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
  cartera_clientes: number
  cartera_saldo: number
}

export type MetricasAsesor = {
  pedidos_activos: number
  pedidos_en_alerta: number
  ventas_mes: number
  ticket_promedio: number
}

export type MetricasSede = {
  sede_codigo: string
  sede_nombre: string
  pedidos_activos: number
  pedidos_en_alerta: number
  ventas_mes: number
}

export const ESTADO_LABELS: Record<EstadoPedido, string> = {
  pendiente: 'Pendiente',
  comprado: 'Comprado',
  llego_usa: 'Llegó a USA',
  bodega_colombia: 'Bodega Colombia',
  avisado: 'Avisado',
  en_sede: 'En sede',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

export const ESTADO_COLORES: Record<EstadoPedido, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  comprado: 'bg-blue-100 text-blue-800',
  llego_usa: 'bg-purple-100 text-purple-800',
  bodega_colombia: 'bg-indigo-100 text-indigo-800',
  avisado: 'bg-cyan-100 text-cyan-800',
  en_sede: 'bg-orange-100 text-orange-800',
  entregado: 'bg-green-100 text-green-800',
  cancelado: 'bg-gray-100 text-gray-600',
}

export type Compra = {
  id: string
  tipo: 'usa' | 'colombia'
  proveedor: string
  fecha: string
  total_usd: number | null
  trm: number | null
  total_cop: number
  notas: string | null
  creado_por: string
  creado_en: string
  items?: CompraItem[]
}

export type CompraItem = {
  id: string
  compra_id: string
  descripcion: string
  marca: string | null
  talla: string | null
  cantidad: number
  costo_unitario_cop: number
  destino: 'pedido' | 'contoda' | 'sin_asignar'
  pedido_id: string | null
  pedido_item_indice: number | null
  transferido_contoda: boolean
  transferido_en: string | null
  creado_en: string
  pedido?: Pick<Pedido, 'numero_orden'>
}

// REFERENCIA DOCUMENTAL — los umbrales reales que generan alertas
// están definidos en supabase/migrations/002_alertas_view.sql
// (vista_pedidos_asesor, columna en_alerta).
// NO usar estas constantes para calcular alertas en el frontend.
export const UMBRAL_ALERTA_DIAS_DOC: Partial<Record<EstadoPedido, number>> = {
  pendiente: 3,
  comprado: 7,
  llego_usa: 15,
  bodega_colombia: 5,
  avisado: 3,
  en_sede: 2,
}

// REFERENCIA DOCUMENTAL — el umbral real de zombie está en la misma migración.
export const DIAS_ZOMBIE_DOC = 30
