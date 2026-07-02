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
  | 'usa'
  | 'bucaramanga'
  | 'santa_rosa'
  | 'entregado'
  | 'cancelado'

export type MetodoPago =
  // Métodos activos
  | 'efectivo'
  | 'recaudo_mensajeria'
  | 'nequi_johan'
  | 'nequi_marisol'
  | 'nequi_luisa'
  | 'bancolombia_ronaldo'
  | 'bancolombia_johan'
  | 'bancolombia_carlos'
  | 'bancolombia_cristian'
  | 'bancolombia_huber'
  | 'davivienda'
  | 'addi'
  | 'bold'
  | 'sistecredito'
  | 'credito'
  // Históricos (registros anteriores)
  | 'contra_entrega'
  | 'bancolombia'
  | 'nequi'
  | 'daviplata'
  | 'transferencia'
  | 'datafono'
  | 'otro'

// Etiquetas y orden canónico de los métodos de pago (fuente única para selectores y cuadre).
export const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  efectivo:              'Efectivo',
  recaudo_mensajeria:    'Recaudo Mensajería',
  nequi_johan:           'Nequi Johan',
  nequi_marisol:         'Nequi Marisol',
  nequi_luisa:           'Nequi Luisa Santa Rosa',
  bancolombia_ronaldo:   'Bancolombia Ronaldo',
  bancolombia_johan:     'Bancolombia Johan',
  bancolombia_carlos:    'Bancolombia Carlos',
  bancolombia_cristian:  'Bancolombia Cristian',
  bancolombia_huber:     'Bancolombia Huber',
  davivienda:            'Davivienda',
  addi:                  'Addi',
  bold:                  'Bold',
  sistecredito:          'Sistecrédito',
  credito:               'Crédito',
  // Históricos
  contra_entrega:        'Contra entrega (antiguo)',
  bancolombia:           'Bancolombia (antiguo)',
  nequi:                 'Nequi (antiguo)',
  daviplata:             'Daviplata',
  transferencia:         'Transferencia',
  datafono:              'Datáfono',
  otro:                  'Otro',
}

// Métodos activos que aparecen en los selectores de la app.
export const METODOS_PAGO: MetodoPago[] = [
  'efectivo',
  'nequi_johan', 'nequi_marisol', 'nequi_luisa',
  'bancolombia_ronaldo', 'bancolombia_johan', 'bancolombia_carlos',
  'bancolombia_cristian', 'bancolombia_huber',
  'davivienda', 'addi', 'bold', 'sistecredito', 'credito',
]

// Métodos permitidos por sede (código). Si una sede no está aquí, se muestran
// todos. Santa Rosa solo maneja estos: efectivo (Caja/Efectivo Santa Rosa),
// Nequi Luisa, Addi, Sistecrédito, Bold y Crédito.
export const METODOS_PAGO_POR_SEDE: Record<string, MetodoPago[]> = {
  SR: ['efectivo', 'nequi_luisa', 'addi', 'sistecredito', 'bold', 'credito'],
}

// Devuelve los métodos de pago que debe mostrar el selector para una sede.
export function metodosDeSede(sedeCodigo?: string | null): MetodoPago[] {
  if (sedeCodigo && METODOS_PAGO_POR_SEDE[sedeCodigo]) return METODOS_PAGO_POR_SEDE[sedeCodigo]
  return METODOS_PAGO
}

// Cuentas (métodos electrónicos) cuyo SALDO ACUMULADO puede ver un asesor de la
// sede en el cuadre. El efectivo de su sede siempre lo ve; el acumulado de las
// demás cuentas es solo para admin (a menos que la cuenta sea "de la sede").
//   - Santa Rosa: la asesora maneja Nequi Luisa → puede ver su acumulado.
//   - Bucaramanga / Cúcuta: las cuentas son del dueño → acumulado solo admin.
export const CUENTAS_ACUMULADO_ASESOR: Record<string, MetodoPago[]> = {
  SR: ['nequi_luisa'],
}

export function cuentasAcumuladoAsesor(sedeCodigo?: string | null): MetodoPago[] {
  return (sedeCodigo && CUENTAS_ACUMULADO_ASESOR[sedeCodigo]) || []
}

// El efectivo se muestra con el nombre de la caja de su sede (ej: en Santa Rosa
// aparece "Efectivo Santa Rosa", no solo "Efectivo").
const EFECTIVO_LABEL_POR_SEDE: Record<string, string> = {
  SR: 'Efectivo Santa Rosa',
  CR: 'Efectivo Cúcuta',
}

// Etiqueta de un método de pago, ajustada a la sede cuando aplica.
export function labelMetodo(metodo: MetodoPago, sedeCodigo?: string | null): string {
  if (metodo === 'efectivo' && sedeCodigo && EFECTIVO_LABEL_POR_SEDE[sedeCodigo]) {
    return EFECTIVO_LABEL_POR_SEDE[sedeCodigo]
  }
  return METODO_PAGO_LABELS[metodo] ?? metodo
}

// Métodos que NO se confirman en el cuadre: no son transferencias a verificar en
// el banco. Efectivo (se cuenta físico), crédito (deuda, no entró plata),
// recaudo/contra-entrega (lo cobra la mensajería, aún no recibido) y las
// financieras Addi/Sistecrédito (se concilian aparte con la plataforma).
export const METODOS_SIN_CONFIRMAR = new Set<string>([
  'efectivo', 'credito', 'recaudo_mensajeria', 'contra_entrega', 'addi', 'sistecredito',
])

// ¿Este método requiere confirmación (es una transferencia/tarjeta a verificar)?
export function requiereConfirmacion(metodo: string): boolean {
  return !METODOS_SIN_CONFIRMAR.has(metodo)
}

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
    articulo_id?: string | null
    color?: string | null
    sexo?: 'hombre' | 'mujer' | 'nino' | null
    categoria?: 'ropa' | 'tenis' | 'accesorios' | null
  }>
  total: number
  abono: number
  metodo_pago_abono: MetodoPago
  cuenta_id_abono?: string | null
  // Abonos múltiples (cliente paga una parte por una cuenta y otra por otra).
  // Si está presente, reemplaza a `abono`/`metodo_pago_abono`.
  abonos?: Array<{ monto: number; metodo: MetodoPago }>
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
  pendiente:   'Pendiente',
  comprado:    'Comprado',
  usa:         'En USA',
  bucaramanga: 'Bucaramanga',
  santa_rosa:  'Santa Rosa',
  entregado:   'Entregado',
  cancelado:   'Cancelado',
}

export const ESTADO_COLORES: Record<EstadoPedido, string> = {
  pendiente:   'bg-yellow-100 text-yellow-800',
  comprado:    'bg-blue-100 text-blue-800',
  usa:         'bg-purple-100 text-purple-800',
  bucaramanga: 'bg-indigo-100 text-indigo-800',
  santa_rosa:  'bg-orange-100 text-orange-800',
  entregado:   'bg-green-100 text-green-800',
  cancelado:   'bg-gray-100 text-gray-600',
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
// están definidos en supabase/migrations/025_simplificar_estados.sql
// (vista_pedidos_asesor, columna en_alerta).
// NO usar estas constantes para calcular alertas en el frontend.
export const UMBRAL_ALERTA_DIAS_DOC: Partial<Record<EstadoPedido, number>> = {
  pendiente:   2,
  comprado:    8,
  usa:         6,
  bucaramanga: 1,
  santa_rosa:  1,
}

// REFERENCIA DOCUMENTAL — el umbral real de zombie está en la misma migración.
export const DIAS_ZOMBIE_DOC = 30

// ─── Inventario / Artículos ──────────────────────────────────────────────────

export type CategoriaArticulo = 'ropa' | 'tenis' | 'accesorios'
export type SexoArticulo = 'hombre' | 'mujer' | 'nino'

export const SEXO_LABELS: Record<SexoArticulo, string> = {
  hombre: 'Hombre',
  mujer:  'Mujer',
  nino:   'Niño',
}

export type Articulo = {
  id: string
  codigo: string | null      // código SKU del modelo (mismo para todas las tallas)
  nombre: string             // nombre para mostrar
  marca: string
  referencia: string | null  // código técnico del proveedor
  color: string | null
  sexo: SexoArticulo | null
  talla: string | null       // obsoleto — solo en registros migrados de v027
  categoria: CategoriaArticulo | null
  fotos: string[]
  descripcion: string | null
  activo: boolean
  creado_en: string
}

export type TipoMovimiento = 'entrada' | 'asignacion' | 'transferencia' | 'salida' | 'ajuste'

export type MovimientoInventario = {
  id: string
  articulo_id: string
  talla: string | null       // talla de este movimiento (null = sin talla específica)
  sede_id: string | null     // null = inventario central
  delta: number
  tipo: TipoMovimiento
  compra_item_id: string | null
  pedido_id: string | null
  transferencia_id: string | null
  costo_unitario_cop: number | null
  usuario_id: string
  notas: string | null
  creado_en: string
}

// Fila de vista_stock_por_sede (agrupa por articulo + talla + sede)
export type StockSede = {
  articulo_id: string
  nombre: string
  marca: string
  talla: string | null
  categoria: CategoriaArticulo | null
  sede_id: string | null   // null = central
  stock: number
}

// ─── Cuentas financieras ─────────────────────────────────────────────────────

export type TipoCuenta = 'bancolombia' | 'nequi' | 'daviplata' | 'efectivo' | 'addi' | 'sistecredito' | 'bold' | 'credito' | 'otro'

export type Cuenta = {
  id: string
  nombre: string
  tipo: TipoCuenta
  metodo_pago: string | null
  sede_id: string | null
  activa: boolean
  orden: number
  creado_en: string
  sede?: Pick<Sede, 'codigo' | 'nombre'>
}

// ─── Gastos ──────────────────────────────────────────────────────────────────

export type CategoriaGasto =
  | 'compras_mercancia'
  | 'domicilios'
  | 'publicidad'
  | 'nomina'
  | 'arriendo'
  | 'servicios'
  | 'transporte'
  | 'papeleria'
  | 'otros'

export const CATEGORIA_GASTO_LABELS: Record<CategoriaGasto, string> = {
  compras_mercancia: 'Compras de mercancía',
  domicilios:        'Domicilios',
  publicidad:        'Publicidad',
  nomina:            'Nómina',
  arriendo:          'Arriendo',
  servicios:         'Servicios',
  transporte:        'Transporte',
  papeleria:         'Papelería',
  otros:             'Otros',
}

export const CATEGORIAS_GASTO: CategoriaGasto[] = [
  'compras_mercancia','domicilios','publicidad','nomina',
  'arriendo','servicios','transporte','papeleria','otros',
]

export type Gasto = {
  id: string
  fecha: string
  valor: number
  categoria: CategoriaGasto
  sede_id: string
  cuenta_id: string | null
  responsable_id: string
  observacion: string | null
  origen: 'manual' | 'compra' | 'domicilio' | null
  origen_id: string | null
  creado_en: string
  sede?: Pick<Sede, 'codigo' | 'nombre'>
  cuenta?: Pick<Cuenta, 'nombre' | 'tipo'>
  responsable?: Pick<Usuario, 'nombre'>
}

// ─── Mensajerías ─────────────────────────────────────────────────────────────

export type TipoMensajeria = 'exneider' | 'servigo'

export const MENSAJERIA_LABELS: Record<TipoMensajeria, string> = {
  exneider: 'Exneider',
  servigo:  'Servigo',
}

// ─── Tipo de entrega al facturar ──────────────────────────────────────────────
export type TipoEntrega = 'tienda' | 'domicilio' | 'envio'
export type QuienPagaEntrega = 'cliente' | 'tb' | 'contra_entrega'

export type PagoMensajeria = {
  id: string
  mensajeria: TipoMensajeria
  tipo: 'deuda' | 'pago'
  monto: number
  fecha: string
  domicilio_id: string | null
  cuenta_id: string | null
  notas: string | null
  responsable_id: string
  creado_en: string
  cuenta?: Pick<Cuenta, 'nombre'>
  responsable?: Pick<Usuario, 'nombre'>
}

// ─── Domicilios (tipo de cobro) ───────────────────────────────────────────────

export type TipoCobroDomicilio = 'regalado' | 'mensajero' | 'tb_cobra'

export const TIPO_COBRO_LABELS: Record<TipoCobroDomicilio, string> = {
  regalado:  'Tres Bandas asume el domicilio',
  mensajero: 'El cliente paga al mensajero',
  tb_cobra:  'El cliente paga a Tres Bandas',
}

// ─── Facturación ──────────────────────────────────────────────────────────────

export type EstadoFactura = 'pendiente' | 'pagada' | 'vencida' | 'anulada'

export type Factura = {
  id: string
  numero_factura: string
  cliente_id: string
  sede_id: string
  asesor_id: string
  fecha_factura: string
  fecha_vencimiento: string
  total: number
  estado: EstadoFactura
  notas: string | null
  creado_en: string
  actualizado_en: string
}

// Fila de vista_facturas (con saldo calculado)
export type FacturaRow = {
  id: string
  numero_factura: string
  cliente_id: string
  cliente_nombre: string
  cliente_telefono: string
  sede_id: string
  sede_codigo: string
  sede_nombre: string
  asesor_id: string
  asesor_nombre: string
  fecha_factura: string
  fecha_vencimiento: string
  total: number
  total_abonado: number
  saldo: number
  dias_atraso: number
  estado: EstadoFactura
  notas: string | null
  creado_en: string
}

export type PagoFacturaInput = {
  monto: number
  metodo: MetodoPago
  cuenta_id: string | null
  mensajeria?: TipoMensajeria | null
}

export type PagoFactura = {
  id: string
  factura_id: string
  monto: number
  metodo: MetodoPago
  fecha: string
  asesor_id: string
  notas: string | null
  creado_en: string
  asesor?: Pick<Usuario, 'nombre'>
}

export const ESTADO_FACTURA_LABELS: Record<EstadoFactura, string> = {
  pendiente: 'Pendiente',
  pagada:    'Pagada',
  vencida:   'Vencida',
  anulada:   'Anulada',
}

export const ESTADO_FACTURA_COLORES: Record<EstadoFactura, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  pagada:    'bg-green-100 text-green-800',
  vencida:   'bg-red-100 text-red-800',
  anulada:   'bg-gray-100 text-gray-600',
}

// Utilidad (CPP) por pedido / factura — solo visible para admin
export type UtilidadPedido = {
  pedido_id: string
  numero_orden: string
  tipo: 'encargo' | 'venta_inmediata'
  sede_id: string
  cliente_id: string
  fecha_creacion: string
  ingreso: number
  costo: number
  utilidad: number
}
