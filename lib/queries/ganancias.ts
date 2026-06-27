import { createClient } from '@/lib/supabase/server'
import { getGastosAction } from '@/app/actions/gastos'

// Fila de vista_ganancia_pedidos (migración 086).
export type GananciaPedido = {
  pedido_id: string
  numero_orden: string
  tipo: string
  sede_id: string
  cliente_id: string | null
  estado: string
  fecha_creacion: string
  factura_id: string | null
  venta: number
  costo: number
  utilidad: number
  tiene_costo: boolean
}

// Costo de una compra asignada a un pedido (para el desglose en el detalle).
export type CostoAsignado = {
  codigo: string | null
  descripcion: string
  costo_unitario_cop: number
  cantidad: number
}

export type GananciaPedidoDetalle = GananciaPedido & {
  compras: CostoAsignado[]
}

// Ganancia de un pedido + las compras que le dan el costo. Para el detalle (admin).
export async function getGananciaPedido(pedidoId: string): Promise<GananciaPedidoDetalle | null> {
  const supabase = await createClient()

  const [{ data: fila }, { data: compras }] = await Promise.all([
    supabase.from('vista_ganancia_pedidos').select('*').eq('pedido_id', pedidoId).maybeSingle(),
    supabase
      .from('compra_items')
      .select('codigo, descripcion, costo_unitario_cop, cantidad')
      .eq('pedido_id', pedidoId)
      .order('creado_en', { ascending: true }),
  ])

  if (!fila) return null
  return { ...(fila as GananciaPedido), compras: (compras ?? []) as CostoAsignado[] }
}

export type GananciasNegocio = {
  venta_total: number
  costo_total: number
  utilidad_bruta: number
  gastos_operativos: number
  utilidad_neta: number
  pedidos_sin_costo: number
  pedidos: GananciaPedido[]
}

// Resumen de ganancias del negocio en un rango. Solo pedidos entregados (venta
// realizada). La utilidad neta resta los gastos OPERATIVOS, excluyendo
// 'compras_mercancia' porque ese costo ya está dentro de la utilidad por pedido
// (si no, se restaría dos veces).
export async function getGananciasNegocio(params: {
  desde: string
  hasta: string
  sede_id?: string
}): Promise<GananciasNegocio> {
  const supabase = await createClient()

  let q = supabase
    .from('vista_ganancia_pedidos')
    .select('*')
    .eq('estado', 'entregado')
    .gte('fecha_creacion', params.desde)
    .lte('fecha_creacion', `${params.hasta}T23:59:59.999`)
    .order('fecha_creacion', { ascending: false })
    .limit(1000)

  if (params.sede_id) q = q.eq('sede_id', params.sede_id)

  const [{ data }, gastos] = await Promise.all([
    q,
    getGastosAction({ desde: params.desde, hasta: params.hasta, sede_id: params.sede_id }),
  ])

  const pedidos = (data ?? []) as GananciaPedido[]

  const venta_total  = pedidos.reduce((s, p) => s + p.venta, 0)
  const costo_total  = pedidos.reduce((s, p) => s + p.costo, 0)
  const utilidad_bruta = venta_total - costo_total
  const pedidos_sin_costo = pedidos.filter(p => !p.tiene_costo && p.venta > 0).length

  const gastos_operativos = gastos
    .filter(g => g.categoria !== 'compras_mercancia')
    .reduce((s, g) => s + g.valor, 0)

  return {
    venta_total,
    costo_total,
    utilidad_bruta,
    gastos_operativos,
    utilidad_neta: utilidad_bruta - gastos_operativos,
    pedidos_sin_costo,
    pedidos,
  }
}
