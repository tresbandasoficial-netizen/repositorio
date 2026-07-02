'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  editarFacturaDatosAction,
  editarAbonoFacturaAction,
  eliminarAbonoFacturaAction,
} from '@/app/actions/facturacion'
import { MetodoPago, metodosDeSede, labelMetodo } from '@/types'
import { formatCOP, formatFecha } from '@/lib/utils/format'

type Factura = {
  id: string
  cliente_id: string
  fecha_vencimiento: string
  notas: string
  envio: number
  descuento: number
  cliente_nombre: string
  total: number
  total_abonado: number
  saldo: number
}
type Abono = { id: string; monto: number; metodo: string; fecha: string; notas: string | null; asesor_nombre: string }
type Pedido = { id: string; numero_orden: string; total: number; fecha_creacion: string }

export function EditarFacturaForm({ factura, abonos, pedidos, sedeCodigo }: {
  factura: Factura
  abonos: Abono[]
  pedidos: Pedido[]
  sedeCodigo?: string
}) {
  const router = useRouter()

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <Resumen label="Total" valor={formatCOP(factura.total)} />
        <Resumen label="Abonado" valor={formatCOP(factura.total_abonado)} color="text-green-600" />
        <Resumen label="Saldo" valor={formatCOP(factura.saldo)} color={factura.saldo > 0 ? 'text-gray-900' : 'text-green-600'} />
      </div>

      <DatosFactura factura={factura} onSaved={() => router.refresh()} />
      <AbonosEditor abonos={abonos} sedeCodigo={sedeCodigo} onChanged={() => router.refresh()} />
      <ProductosEditor pedidos={pedidos} />
    </div>
  )
}

function Resumen({ label, valor, color = 'text-gray-900' }: { label: string; valor: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className={`text-base font-bold mt-1 ${color}`}>{valor}</p>
    </div>
  )
}

// ── Datos de la factura ──────────────────────────────────────────────────────
function DatosFactura({ factura, onSaved }: { factura: Factura; onSaved: () => void }) {
  const [vence, setVence] = useState(factura.fecha_vencimiento)
  const [notas, setNotas] = useState(factura.notas)
  const [envio, setEnvio] = useState(String(factura.envio || ''))
  const [descuento, setDescuento] = useState(String(factura.descuento || ''))
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [pending, start] = useTransition()

  function guardar() {
    setError(''); setOk(false)
    start(async () => {
      const r = await editarFacturaDatosAction(factura.id, {
        cliente_id: factura.cliente_id,
        fecha_vencimiento: vence,
        notas,
        envio: parseInt(envio.replace(/\D/g, '')) || 0,
        descuento: parseInt(descuento.replace(/\D/g, '')) || 0,
      })
      if (!r.ok) { setError(r.error); return }
      setOk(true); onSaved()
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <p className="text-sm font-semibold text-gray-900">Datos de la factura</p>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Cliente</label>
        <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {factura.cliente_nombre}
          <span className="text-xs text-gray-400"> · se cambia desde el pedido</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Fecha de vencimiento</label>
          <input type="date" value={vence} onChange={e => setVence(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div></div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Envío</label>
          <input type="text" inputMode="numeric" value={envio} onChange={e => setEnvio(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Descuento</label>
          <input type="text" inputMode="numeric" value={descuento} onChange={e => setDescuento(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Notas</label>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-600">✓ Datos guardados</p>}
      <button onClick={guardar} disabled={pending}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
        {pending ? 'Guardando…' : 'Guardar datos'}
      </button>
    </div>
  )
}

// ── Abonos ───────────────────────────────────────────────────────────────────
function AbonosEditor({ abonos, sedeCodigo, onChanged }: { abonos: Abono[]; sedeCodigo?: string; onChanged: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
      <p className="text-sm font-semibold text-gray-900">Abonos / método de pago ({abonos.length})</p>
      {abonos.length === 0 ? (
        <p className="text-sm text-gray-400">Sin abonos. Agrégalos desde el detalle de la factura.</p>
      ) : (
        <div className="space-y-2">
          {abonos.map(a => <AbonoRow key={a.id} abono={a} sedeCodigo={sedeCodigo} onChanged={onChanged} />)}
        </div>
      )}
    </div>
  )
}

function AbonoRow({ abono, sedeCodigo, onChanged }: { abono: Abono; sedeCodigo?: string; onChanged: () => void }) {
  const [editando, setEditando] = useState(false)
  const [monto, setMonto] = useState(String(abono.monto))
  const [metodo, setMetodo] = useState<MetodoPago>(abono.metodo as MetodoPago)
  const [fecha, setFecha] = useState(abono.fecha)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function guardar() {
    setError('')
    const montoNum = parseInt(monto.replace(/\D/g, '')) || 0
    if (montoNum <= 0) { setError('Monto inválido'); return }
    start(async () => {
      const r = await editarAbonoFacturaAction(abono.id, { monto: montoNum, metodo, fecha })
      if (!r.ok) { setError(r.error); return }
      setEditando(false); onChanged()
    })
  }

  function eliminar() {
    if (!confirm('¿Eliminar este abono? El saldo de la factura se recalcula.')) return
    start(async () => {
      const r = await eliminarAbonoFacturaAction(abono.id)
      if (!r.ok) { setError(r.error); return }
      onChanged()
    })
  }

  if (!editando) {
    return (
      <div className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-2.5">
        <div>
          <p className="text-sm font-medium text-gray-900">{formatCOP(abono.monto)}</p>
          <p className="text-xs text-gray-400">
            {formatFecha(abono.fecha)} · {labelMetodo(abono.metodo as MetodoPago, sedeCodigo)} · {abono.asesor_nombre}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditando(true)}
            className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50">
            Editar
          </button>
          <button onClick={eliminar} disabled={pending}
            className="px-3 py-1.5 text-xs font-medium border border-red-200 rounded-lg bg-white text-red-600 hover:bg-red-50 disabled:opacity-50">
            Eliminar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-blue-200 bg-blue-50/40 rounded-lg px-4 py-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Monto</label>
          <input type="text" inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value.replace(/\D/g, ''))}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Método</label>
          <select value={metodo} onChange={e => setMetodo(e.target.value as MetodoPago)}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {/* incluye el método actual aunque no esté en la lista de la sede */}
            {Array.from(new Set([abono.metodo as MetodoPago, ...metodosDeSede(sedeCodigo)])).map(m => <option key={m} value={m}>{labelMetodo(m, sedeCodigo)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={guardar} disabled={pending}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {pending ? 'Guardando…' : 'Guardar abono'}
        </button>
        <button onClick={() => setEditando(false)}
          className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Productos (vía edición de cada pedido) ───────────────────────────────────
function ProductosEditor({ pedidos }: { pedidos: Pedido[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
      <p className="text-sm font-semibold text-gray-900">Productos ({pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''})</p>
      <p className="text-xs text-gray-400">Los productos viven en cada pedido. Al editarlos, el total de la factura se recalcula solo.</p>
      <div className="space-y-2">
        {pedidos.map(p => (
          <div key={p.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-2.5">
            <div>
              <p className="font-mono text-sm text-gray-900">{p.numero_orden}</p>
              <p className="text-xs text-gray-400">{formatCOP(p.total)}</p>
            </div>
            <Link href={`/pedidos/${p.id}/editar`}
              className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50">
              Editar productos
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
