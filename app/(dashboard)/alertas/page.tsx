import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSesion } from '@/lib/auth/acceso'
import { EstadoBadge } from '@/components/pedidos/EstadoBadge'
import { EstadoPedido, ESTADO_LABELS } from '@/types'

function diasDesde(fecha: string) {
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000)
}

function hace(dias: number) {
  return new Date(Date.now() - dias * 86_400_000).toISOString()
}

function getMotivoAlerta(p: {
  estado: EstadoPedido
  fecha_actualizacion: string
  fecha_creacion: string
}): string {
  const diasEstado    = diasDesde(p.fecha_actualizacion)
  const diasCreacion  = diasDesde(p.fecha_creacion)

  if (
    ['pendiente', 'comprado', 'usa'].includes(p.estado) &&
    diasCreacion >= 15
  ) {
    return `${diasCreacion} días sin llegar a Bucaramanga`
  }

  const umbrales: Partial<Record<EstadoPedido, number>> = {
    pendiente:   2,
    comprado:    8,
    usa:         6,
    bucaramanga: 1,
    santa_rosa:  1,
  }

  const umbral = umbrales[p.estado]
  if (umbral && diasEstado >= umbral) {
    return `${diasEstado} días en ${ESTADO_LABELS[p.estado].toLowerCase()}`
  }

  return 'Requiere atención'
}

function urgencia(p: { fecha_actualizacion: string; fecha_creacion: string }): number {
  return Math.max(diasDesde(p.fecha_actualizacion), diasDesde(p.fecha_creacion))
}

type FilaPedido = {
  id: string
  numero_orden: string
  estado: EstadoPedido
  cliente_nombre: string
  asesor_nombre: string
  sede_codigo: string
  fecha_creacion: string
  fecha_actualizacion: string
}

const COLUMNAS = 'id, numero_orden, estado, cliente_nombre, asesor_nombre, sede_codigo, fecha_creacion, fecha_actualizacion'
const TIPOS_EXCLUIDOS = '("venta_inmediata","saldo_anterior")'
// Mismo umbral que la sirena 🚨 de la galería.
const DIAS_SIN_COMPRA = 5
// Más viejos que esto casi siempre son pedidos que ya no siguen vivos: van
// aparte para que no tapen a los que sí hay que comprar ya.
const DIAS_VIGENTE = 30

function ListaPedidos({ pedidos, motivo }: { pedidos: FilaPedido[]; motivo: (p: FilaPedido) => string }) {
  return (
    <div className="divide-y divide-gray-100">
      {pedidos.map(p => (
        <Link
          key={p.id}
          href={`/pedidos/${p.id}`}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-red-50/30 transition-colors"
        >
          <span className="font-mono font-semibold text-sm text-blue-600 w-24 shrink-0">{p.numero_orden}</span>
          <EstadoBadge estado={p.estado} enAlerta={true} />
          <span className="text-sm text-gray-700 flex-1 min-w-[8rem] truncate">{p.cliente_nombre}</span>
          <span className="text-xs text-red-600 font-medium">{motivo(p)}</span>
          <span className="text-xs text-gray-400 w-28 truncate text-right">{p.asesor_nombre}</span>
        </Link>
      ))}
    </div>
  )
}

export default async function AlertasPage() {
  const sesion = await getSesion()
  const esAdmin = sesion.rol === 'admin'
  const supabase = await createClient()

  // El visor solo ve su sede (igual que antes).
  let sedeCodigo: string | undefined
  if (sesion.rol === 'visor' && sesion.sede_id) {
    const { data } = await supabase.from('sedes').select('codigo').eq('id', sesion.sede_id).maybeSingle()
    sedeCodigo = data?.codigo
  }

  // Todas las alertas, sin paginar: antes se mostraban solo las 25 más nuevas y
  // los pedidos con más días quedaban por fuera.
  let qAlertas = supabase
    .from('vista_pedidos_asesor')
    .select(COLUMNAS)
    .eq('en_alerta', true)
    .not('tipo', 'in', TIPOS_EXCLUIDOS)
    .limit(1000)
  if (sedeCodigo) qAlertas = qAlertas.eq('sede_codigo', sedeCodigo)

  // Sin comprar: pedidos vivos sin compra asignada ni factura, con más de 5
  // días. Solo admin (información de compras, igual que el rojo de la galería).
  const qSinCompra = esAdmin
    ? supabase
        .from('vista_pedidos_asesor')
        .select(COLUMNAS)
        .in('estado', ['pendiente', 'comprado', 'usa'])
        .eq('tiene_compra', false)
        .is('factura_id', null)
        .not('tipo', 'in', TIPOS_EXCLUIDOS)
        .lt('fecha_creacion', hace(DIAS_SIN_COMPRA))
        .order('fecha_creacion', { ascending: true })
        .limit(1000)
    : null

  const [{ data: alertasData }, sinCompraRes] = await Promise.all([qAlertas, qSinCompra])
  const alertas = (alertasData ?? []) as FilaPedido[]
  const sinCompra = (sinCompraRes?.data ?? []) as FilaPedido[]

  const limiteVigente = hace(DIAS_VIGENTE)
  const sinCompraRecientes = sinCompra.filter(p => p.fecha_creacion >= limiteVigente)
  const sinCompraViejos = sinCompra.filter(p => p.fecha_creacion < limiteVigente)
  const idsSinCompra = new Set(sinCompra.map(p => p.id))
  const otras = alertas
    .filter(p => !idsSinCompra.has(p.id))
    .sort((a, b) => urgencia(b) - urgencia(a))

  const motivoSinCompra = (p: FilaPedido) => `${diasDesde(p.fecha_creacion)} días sin compra`
  const total = otras.length + sinCompra.length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Alertas</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {total === 0
            ? 'Todos los pedidos están al día.'
            : `${total} ${total === 1 ? 'pedido requiere' : 'pedidos requieren'} atención`}
        </p>
      </div>

      {esAdmin && (
        <section className="bg-white border-2 border-red-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-100">
            <h2 className="text-sm font-bold text-red-800">
              🚨 Sin comprar · {sinCompraRecientes.length} {sinCompraRecientes.length === 1 ? 'pedido' : 'pedidos'}
            </h2>
            <p className="text-xs text-red-700/80 mt-0.5">
              Más de {DIAS_SIN_COMPRA} días creados y todavía sin compra asignada. Los de más días primero.
            </p>
          </div>
          {sinCompraRecientes.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-500">Ningún pedido reciente está esperando compra.</p>
          ) : (
            <ListaPedidos pedidos={sinCompraRecientes} motivo={motivoSinCompra} />
          )}
          {sinCompraViejos.length > 0 && (
            <details className="border-t border-red-100">
              <summary className="px-4 py-3 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50">
                {sinCompraViejos.length} con más de {DIAS_VIGENTE} días sin compra — revisar si siguen vigentes o cancelarlos
              </summary>
              <ListaPedidos pedidos={sinCompraViejos} motivo={motivoSinCompra} />
            </details>
          )}
        </section>
      )}

      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">
            {esAdmin ? 'Otras alertas' : 'Alertas'} · {otras.length}
          </h2>
        </div>
        {otras.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-500">Sin alertas activas.</p>
        ) : (
          <ListaPedidos pedidos={otras} motivo={getMotivoAlerta} />
        )}
      </section>

      <div className="text-xs text-gray-400 space-y-1">
        <p><span className="font-medium text-gray-500">Umbrales:</span></p>
        {esAdmin && <p>· Sin comprar: más de {DIAS_SIN_COMPRA} días creado sin compra asignada</p>}
        <p>· Pendiente: más de 2 días sin cambio</p>
        <p>· Comprado: más de 8 días sin cambio</p>
        <p>· Cualquier pedido activo: más de 15 días sin llegar a Colombia</p>
        <p>· En USA: más de 6 días · Bucaramanga o Santa Rosa: más de 1 día</p>
      </div>
    </div>
  )
}
