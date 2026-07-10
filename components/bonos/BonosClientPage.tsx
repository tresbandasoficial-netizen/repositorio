'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearBonoAction, pagarPedidoConBonoAction, consultarBonoAction, Bono } from '@/app/actions/bonos'
import { formatCOP, formatMiles, formatFecha } from '@/lib/utils/format'

type Cuenta = { id: string; nombre: string }

const ESTADO_COLOR: Record<string, string> = {
  activo:  'bg-green-100 text-green-800',
  agotado: 'bg-gray-100 text-gray-500',
  anulado: 'bg-red-100 text-red-700',
}

export function BonosClientPage({ bonos, cuentas }: { bonos: Bono[]; cuentas: Cuenta[] }) {
  const router = useRouter()
  const [modal, setModal] = useState<'vender' | 'usar' | null>(null)

  const activos = bonos.filter(b => b.estado === 'activo')
  const saldoPendiente = activos.reduce((s, b) => s + b.saldo, 0)
  const vendidoTotal = bonos.filter(b => b.estado !== 'anulado').reduce((s, b) => s + b.valor_inicial, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bonos de regalo</h1>
          <p className="text-sm text-gray-500 mt-0.5">La plata entra al venderlos; la mercancía sale cuando el cliente escoge y usa el bono</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('usar')}
            className="rounded-lg border border-purple-300 text-purple-700 px-4 py-2 text-sm font-medium hover:bg-purple-50">
            Usar bono
          </button>
          <button onClick={() => setModal('vender')}
            className="rounded-lg bg-purple-700 text-white px-4 py-2 text-sm font-medium hover:bg-purple-800">
            + Vender bono
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Bonos activos</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{activos.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Saldo por redimir</p>
          <p className="text-lg font-bold text-purple-700 mt-1">{formatCOP(saldoPendiente)}</p>
          <p className="text-[10px] text-gray-400">mercancía que debemos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase">Total vendido en bonos</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatCOP(vendidoTotal)}</p>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {bonos.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">Aún no se han vendido bonos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="text-left px-5 py-2">Código</th>
                  <th className="text-right px-3 py-2">Valor</th>
                  <th className="text-right px-3 py-2">Saldo</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-left px-3 py-2">Para / notas</th>
                  <th className="text-left px-5 py-2">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bonos.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 font-mono font-semibold text-gray-900">{b.codigo}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{formatCOP(b.valor_inicial)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-purple-700">{formatCOP(b.saldo)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_COLOR[b.estado]}`}>
                        {b.estado === 'activo' ? 'Activo' : b.estado === 'agotado' ? 'Usado' : 'Anulado'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs max-w-xs truncate">
                      {[b.comprador, b.notas].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-5 py-2.5 text-gray-500">{formatFecha(b.creado_en)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal === 'vender' && <ModalVender cuentas={cuentas} onClose={() => { setModal(null); router.refresh() }} />}
      {modal === 'usar' && <ModalUsar onClose={() => { setModal(null); router.refresh() }} />}
    </div>
  )
}

function ModalVender({ cuentas, onClose }: { cuentas: Cuenta[]; onClose: () => void }) {
  const [valor, setValor] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [comprador, setComprador] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [codigoGenerado, setCodigoGenerado] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const valorNum = parseInt(valor.replace(/\D/g, ''), 10) || 0

  function vender() {
    setError('')
    if (valorNum <= 0) { setError('Escribe el valor del bono'); return }
    if (!cuentaId) { setError('Selecciona la cuenta donde entró el dinero'); return }
    start(async () => {
      const r = await crearBonoAction({ valor: valorNum, cuenta_id: cuentaId, comprador, notas })
      if (!r.ok) { setError(r.error); return }
      setCodigoGenerado(r.codigo)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Vender bono de regalo</h2>
          <p className="text-xs text-gray-500 mt-0.5">La plata entra a la cuenta que elijas. El producto sale después, cuando lo usen.</p>
        </div>

        {codigoGenerado ? (
          <div className="px-6 py-8 text-center space-y-3">
            <p className="text-sm text-gray-500">Bono creado. Entrégale este código al cliente:</p>
            <p className="text-2xl font-mono font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded-xl py-4">{codigoGenerado}</p>
            <p className="text-xs text-gray-400">Con este código el cliente redime su bono cuando escoja sus productos.</p>
            <button onClick={onClose} className="mt-2 w-full py-2 rounded-lg bg-purple-700 text-white text-sm font-semibold hover:bg-purple-800">Listo</button>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Valor del bono *</label>
                  <input type="text" inputMode="numeric" value={formatMiles(valor)}
                    onChange={e => setValor(e.target.value.replace(/\D/g, ''))} placeholder="200000"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  {valorNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(valorNum)}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Entró a *</label>
                  <select value={cuentaId} onChange={e => setCuentaId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">— Cuenta —</option>
                    {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Para / de quién (opcional)</label>
                <input type="text" value={comprador} onChange={e => setComprador(e.target.value)}
                  placeholder="Ej: regalo de Ana para Sofía"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nota (opcional)</label>
                <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={vender} disabled={pending} className="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold disabled:opacity-50">
                {pending ? 'Creando…' : 'Vender bono'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ModalUsar({ onClose }: { onClose: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [numeroOrden, setNumeroOrden] = useState('')
  const [monto, setMonto] = useState('')
  const [saldoBono, setSaldoBono] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [pending, start] = useTransition()

  const montoNum = parseInt(monto.replace(/\D/g, ''), 10) || 0

  function consultar() {
    setError(''); setSaldoBono(null)
    if (codigo.trim().length < 3) return
    start(async () => {
      const r = await consultarBonoAction(codigo)
      if (!r.ok) { setError(r.error); return }
      if (r.estado !== 'activo') { setError(r.estado === 'agotado' ? 'Ese bono ya está agotado' : 'Ese bono está anulado'); return }
      setSaldoBono(r.saldo)
    })
  }

  function usar() {
    setError(''); setExito('')
    if (!codigo.trim()) { setError('Escribe el código del bono'); return }
    if (!numeroOrden.trim()) { setError('Escribe el número del pedido/venta a pagar'); return }
    if (montoNum <= 0) { setError('Escribe cuánto se paga con el bono'); return }
    start(async () => {
      const r = await pagarPedidoConBonoAction(numeroOrden, codigo, montoNum)
      if (!r.ok) { setError(r.error); return }
      setExito(`Pago aplicado. Al bono le quedan ${formatCOP(r.saldoRestante)}.`)
      setSaldoBono(r.saldoRestante)
      setMonto('')
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Usar bono en una venta</h2>
          <p className="text-xs text-gray-500 mt-0.5">Primero crea la venta con los productos (queda con saldo); aquí el bono la paga.</p>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Código del bono *</label>
            <input type="text" value={codigo} onChange={e => { setCodigo(e.target.value.toUpperCase()); setSaldoBono(null) }}
              onBlur={consultar} placeholder="BONO-A3F2"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
            {saldoBono !== null && <p className="text-xs text-green-700 mt-1">Saldo disponible: <b>{formatCOP(saldoBono)}</b></p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">N° pedido/venta *</label>
              <input type="text" value={numeroOrden} onChange={e => setNumeroOrden(e.target.value.toUpperCase())}
                placeholder="SR6663"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Monto a pagar *</label>
              <input type="text" inputMode="numeric" value={formatMiles(monto)}
                onChange={e => setMonto(e.target.value.replace(/\D/g, ''))} placeholder="150000"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {exito && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✓ {exito}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cerrar</button>
          <button onClick={usar} disabled={pending} className="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold disabled:opacity-50">
            {pending ? 'Aplicando…' : 'Pagar con bono'}
          </button>
        </div>
      </div>
    </div>
  )
}
