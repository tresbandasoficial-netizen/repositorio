'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { formatCOP } from '@/lib/utils/format'
import { requiereConfirmacion } from '@/types'
import type { CuadreMetodo, CuadreIngreso } from '@/lib/queries/cuadre'
import { confirmarPagoCuadreAction } from '@/app/actions/cuadre'

const ORIGEN_LABEL: Record<string, string> = { venta: 'venta', abono: 'abono', cartera: 'factura' }

// Pagos que el MISMO cliente hizo con minutos de diferencia se muestran como
// un solo grupo con su total: cuando alguien entrega $1.000.000 repartido en
// varios pedidos, el cuadre enseña el millón junto y no 4 pagos sueltos que
// toca sumar a mano.
type GrupoPagos = { cliente: string | null; pagos: CuadreIngreso[]; total: number }

const VENTANA_GRUPO_MS = 15 * 60_000

function agruparDetalle(detalle: CuadreIngreso[]): GrupoPagos[] {
  const orden = [...detalle].sort((a, b) => (a.creado_en ?? '').localeCompare(b.creado_en ?? ''))
  const grupos: GrupoPagos[] = []
  for (const d of orden) {
    const ultimo = grupos[grupos.length - 1]
    const anterior = ultimo?.pagos[ultimo.pagos.length - 1]
    const juntos = !!ultimo && !!ultimo.cliente && d.cliente_nombre === ultimo.cliente &&
      !!anterior?.creado_en && !!d.creado_en &&
      new Date(d.creado_en).getTime() - new Date(anterior.creado_en).getTime() <= VENTANA_GRUPO_MS
    if (juntos) {
      ultimo.pagos.push(d)
      ultimo.total += d.monto
    } else {
      grupos.push({ cliente: d.cliente_nombre, pagos: [d], total: d.monto })
    }
  }
  // Grupos de mayor a menor plata, como estaba el detalle plano.
  return grupos.sort((a, b) => b.total - a.total)
}

// Tabla de métodos del cuadre. Cada método se despliega para ver sus ingresos
// (cada factura/pedido) y permite chulear cada uno = confirmar que el dinero entró.
export function MetodosCuadre({ metodos }: { metodos: CuadreMetodo[] }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [confirmados, setConfirmados] = useState<Set<string>>(
    () => new Set(metodos.flatMap(m => m.detalle.filter(d => d.confirmado).map(d => d.id)))
  )
  const [, start] = useTransition()

  function toggle(id: string, origen: string) {
    const nuevo = !confirmados.has(id)
    setConfirmados(prev => {
      const s = new Set(prev)
      if (nuevo) s.add(id); else s.delete(id)
      return s
    })
    start(async () => {
      const r = await confirmarPagoCuadreAction(id, origen, nuevo)
      if (!r.ok) {
        // revertir si falla
        setConfirmados(prev => {
          const s = new Set(prev)
          if (nuevo) s.delete(id); else s.add(id)
          return s
        })
      }
    })
  }

  return (
    <div className="px-3 pb-3">
      <p className="text-[11px] text-gray-400 uppercase font-semibold px-2 py-2">Recaudo por método</p>
      <div className="space-y-1.5">
        {metodos.map((m, idx) => {
          const tieneDetalle = m.detalle.length > 0
          const expandido = abierto === m.metodo
          const confirmable = requiereConfirmacion(m.metodo)
          const conf = m.detalle.filter(d => confirmados.has(d.id)).length
          const todos = tieneDetalle && conf === m.detalle.length
          return (
            <div key={m.metodo} className={`rounded-lg border overflow-hidden ${m.monto > 0 ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/60'}`}>
              <div
                className={`px-3 py-2 flex items-center justify-between gap-2 text-sm ${m.monto === 0 ? 'text-gray-400' : ''} ${tieneDetalle ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                onClick={tieneDetalle ? () => setAbierto(expandido ? null : m.metodo) : undefined}
              >
                <span className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className={`w-5 h-5 rounded-md text-[11px] font-bold flex items-center justify-center shrink-0 ${m.monto > 0 ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{idx + 1}</span>
                  <span className={m.monto > 0 ? 'font-medium text-gray-800' : ''}>{m.label}</span>
                  {tieneDetalle && <span className="text-gray-400 text-xs">{expandido ? '▾' : '▸'}</span>}
                  {m.tipo === 'mensajeria' && <span className="text-[10px] text-amber-600">por cobrar</span>}
                  {m.tipo === 'credito' && <span className="text-[10px] text-gray-400">a crédito</span>}
                  {!m.esperado && m.monto > 0 && <span className="text-[10px] text-purple-500">no esperado</span>}
                  {tieneDetalle && confirmable && (
                    <span className={`text-[10px] font-medium ${todos ? 'text-green-600' : 'text-gray-400'}`}>
                      {todos ? '✓ confirmado' : `${conf}/${m.detalle.length} confirmados`}
                    </span>
                  )}
                </span>
                <span className={`font-bold shrink-0 ${m.monto ? 'text-gray-900' : 'text-gray-300'}`}>{m.monto ? formatCOP(m.monto) : '—'}</span>
              </div>
              {expandido && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {agruparDetalle(m.detalle).map((g, gi) => {
                    const esGrupo = g.pagos.length > 1
                    return (
                      <div key={m.metodo + '-g' + gi} className={esGrupo ? 'bg-indigo-50/40' : undefined}>
                        {esGrupo && (
                          <div className="px-3 py-1.5 pl-6 flex items-center justify-between text-xs bg-indigo-50 border-l-2 border-indigo-400">
                            <span className="font-semibold text-indigo-800">
                              👤 {g.cliente} entregó junto ({g.pagos.length} pagos)
                            </span>
                            <span className="font-bold text-indigo-800">{formatCOP(g.total)}</span>
                          </div>
                        )}
                        {g.pagos.map((d, i) => {
                          const ok = confirmable && confirmados.has(d.id)
                          return (
                            <div key={d.id + '-' + i} className={`px-3 py-1.5 ${esGrupo ? 'pl-12' : 'pl-9'} flex items-center justify-between text-xs ${ok ? 'bg-green-50' : esGrupo ? '' : 'bg-gray-50/60'}`}>
                              <span className="flex items-center gap-2 min-w-0">
                                {confirmable && (
                                  <input
                                    type="checkbox"
                                    checked={ok}
                                    onChange={() => toggle(d.id, d.origen)}
                                    className="w-4 h-4 accent-green-600 cursor-pointer"
                                    title="Confirmar que el dinero entró"
                                  />
                                )}
                                {d.origen === 'cartera' ? (
                                  <Link
                                    href={`/facturacion/n/${encodeURIComponent(d.referencia)}`}
                                    className={`font-mono hover:underline ${ok ? 'text-green-700 font-medium' : 'text-blue-600'}`}
                                  >
                                    {d.referencia}
                                  </Link>
                                ) : (
                                  <span className={`font-mono ${ok ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{d.referencia}</span>
                                )}
                                <span className="text-gray-400">{ORIGEN_LABEL[d.origen] ?? d.origen}</span>
                                {!esGrupo && d.cliente_nombre && (
                                  <span className="text-gray-400 truncate">· {d.cliente_nombre}</span>
                                )}
                              </span>
                              <span className={ok ? 'text-green-700 font-medium' : 'text-gray-700'}>{formatCOP(d.monto)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {metodos.length === 0 && (
          <p className="px-3 py-3 text-sm text-gray-400 text-center">Sin recaudo</p>
        )}
      </div>
    </div>
  )
}
