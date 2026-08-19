'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { crearPrestamoAction, abonarPrestamoAction, eliminarAbonoPrestamoAction, eliminarPrestamoAction } from '@/app/actions/prestamos'
import { formatCOP, formatFecha, formatMiles, hoyBogota } from '@/lib/utils/format'
import { Loader2 } from 'lucide-react'

type Abono = { id: string; monto: number; fecha: string; notas: string | null; cuenta_nombre: string | null }
type Prestamo = { id: string; acreedor: string; monto: number; fecha: string; notas: string | null; abonos: Abono[] }
type Cuenta = { id: string; nombre: string }

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// Panel de préstamos de terceros (solo admin): crear la deuda (opcionalmente
// registrando la entrada de la plata a una cuenta), abonarle (la plata sale de
// la cuenta elegida) y ver cuánto falta por pagar de cada una.
export function PrestamosPanel({ prestamos, cuentas }: { prestamos: Prestamo[]; cuentas: Cuenta[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  // Form crear
  const [creando, setCreando] = useState(false)
  const [acreedor, setAcreedor] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoyBogota())
  const [notas, setNotas] = useState('')
  const [cuentaEntrada, setCuentaEntrada] = useState('')

  // Form abonar (por préstamo)
  const [abonando, setAbonando] = useState<string | null>(null)
  const [abMonto, setAbMonto] = useState('')
  const [abCuenta, setAbCuenta] = useState('')
  const [abFecha, setAbFecha] = useState(hoyBogota())

  const totalDeuda = prestamos.reduce((s, p) => s + Math.max(0, p.monto - p.abonos.reduce((x, a) => x + a.monto, 0)), 0)

  function crear() {
    setError('')
    const m = parseInt(monto.replace(/\D/g, ''), 10) || 0
    start(async () => {
      const r = await crearPrestamoAction({
        acreedor, monto: m, fecha, notas,
        cuenta_id: cuentaEntrada || null,
      })
      if (!r.ok) { setError(r.error); return }
      setCreando(false); setAcreedor(''); setMonto(''); setNotas(''); setCuentaEntrada('')
      router.refresh()
    })
  }

  function abonar(prestamoId: string) {
    setError('')
    const m = parseInt(abMonto.replace(/\D/g, ''), 10) || 0
    start(async () => {
      const r = await abonarPrestamoAction(prestamoId, { monto: m, cuenta_id: abCuenta, fecha: abFecha })
      if (!r.ok) { setError(r.error); return }
      setAbonando(null); setAbMonto(''); setAbCuenta('')
      router.refresh()
    })
  }

  function eliminarAbono(abonoId: string) {
    if (!confirm('¿Eliminar este abono? La plata vuelve a la cuenta de donde salió.')) return
    start(async () => {
      const r = await eliminarAbonoPrestamoAction(abonoId)
      if (!r.ok) { setError(r.error); return }
      router.refresh()
    })
  }

  function eliminarPrestamo(p: Prestamo) {
    if (!confirm(`¿Eliminar el préstamo de ${p.acreedor} (${formatCOP(p.monto)})? Se revierten también sus movimientos de caja.`)) return
    start(async () => {
      const r = await eliminarPrestamoAction(p.id)
      if (!r.ok) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Total + crear */}
      <div className="flex items-center justify-between gap-3">
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-500 uppercase">Total por pagar</p>
          <p className={`text-lg font-bold ${totalDeuda > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCOP(totalDeuda)}</p>
        </div>
        <button
          onClick={() => { setCreando(v => !v); setError('') }}
          className="rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-700"
        >
          {creando ? 'Cancelar' : '+ Nueva deuda'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {/* Form nueva deuda */}
      {creando && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">¿Quién te prestó? *</label>
              <input className={inputCls} value={acreedor} onChange={e => setAcreedor(e.target.value)} placeholder="Nombre de la persona" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Monto prestado *</label>
              <input className={inputCls} type="text" inputMode="numeric" value={formatMiles(monto)}
                onChange={e => setMonto(e.target.value.replace(/\D/g, ''))} placeholder="5.000.000" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha del préstamo</label>
              <input className={inputCls} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">¿La plata entró a una cuenta del negocio?</label>
              <select className={inputCls} value={cuentaEntrada} onChange={e => setCuentaEntrada(e.target.value)}>
                <option value="">No registrar entrada (ya estaba registrada / no entró al sistema)</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>Sí — entró a {c.nombre}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Notas</label>
              <input className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Acordamos pagarlo en diciembre, sin interés…" />
            </div>
          </div>
          <button onClick={crear} disabled={pending}
            className="w-full rounded-lg bg-blue-600 text-white py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {pending ? <Loader2 size={15} className="animate-spin inline" /> : 'Guardar deuda'}
          </button>
        </div>
      )}

      {/* Lista */}
      {prestamos.length === 0 && !creando && (
        <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 px-4 py-6 text-center">
          No tienes préstamos registrados.
        </p>
      )}
      {prestamos.map(p => {
        const abonado = p.abonos.reduce((s, a) => s + a.monto, 0)
        const saldo = p.monto - abonado
        const pagado = saldo <= 0
        return (
          <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{p.acreedor}</p>
                <p className="text-xs text-gray-400">{formatFecha(p.fecha)}{p.notas ? ` · ${p.notas}` : ''}</p>
              </div>
              <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${pagado ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {pagado ? 'PAGADO' : `Debes ${formatCOP(saldo)}`}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="bg-gray-50 rounded-lg py-2">
                <p className="text-[10px] text-gray-400 uppercase">Prestó</p>
                <p className="text-sm font-bold text-gray-900">{formatCOP(p.monto)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg py-2">
                <p className="text-[10px] text-gray-400 uppercase">Abonado</p>
                <p className="text-sm font-bold text-green-700">{formatCOP(abonado)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg py-2">
                <p className="text-[10px] text-gray-400 uppercase">Falta</p>
                <p className={`text-sm font-bold ${pagado ? 'text-green-700' : 'text-red-600'}`}>{formatCOP(Math.max(0, saldo))}</p>
              </div>
            </div>

            {/* Abonos */}
            {p.abonos.length > 0 && (
              <ul className="mt-3 space-y-1 border-l-2 border-gray-100 pl-3">
                {p.abonos.map(a => (
                  <li key={a.id} className="flex items-center justify-between text-xs text-gray-600">
                    <span>
                      {formatFecha(a.fecha)}{a.cuenta_nombre ? ` · desde ${a.cuenta_nombre}` : ''}{a.notas ? ` · ${a.notas}` : ''}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="font-medium text-gray-800">{formatCOP(a.monto)}</span>
                      <button onClick={() => eliminarAbono(a.id)} disabled={pending}
                        className="text-gray-300 hover:text-red-500" title="Eliminar abono">✕</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Acciones */}
            <div className="flex items-center gap-2 mt-3">
              {!pagado && (
                abonando === p.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="w-28 rounded-lg border border-blue-300 px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      type="text" inputMode="numeric" autoFocus placeholder="Monto"
                      value={formatMiles(abMonto)} onChange={e => setAbMonto(e.target.value.replace(/\D/g, ''))} />
                    <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={abCuenta} onChange={e => setAbCuenta(e.target.value)}>
                      <option value="">¿De qué cuenta sale?</option>
                      {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <input className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" type="date" value={abFecha} onChange={e => setAbFecha(e.target.value)} />
                    <button onClick={() => abonar(p.id)} disabled={pending}
                      className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-blue-700 disabled:opacity-50">
                      {pending ? '…' : 'OK'}
                    </button>
                    <button onClick={() => setAbonando(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                ) : (
                  <button onClick={() => { setAbonando(p.id); setAbMonto(''); setAbCuenta(''); setAbFecha(hoyBogota()); setError('') }}
                    className="rounded-lg border border-blue-200 bg-blue-50 text-blue-700 px-3 py-1.5 text-xs font-semibold hover:bg-blue-100">
                    + Abonar
                  </button>
                )
              )}
              <button onClick={() => eliminarPrestamo(p)} disabled={pending}
                className="ml-auto text-xs text-gray-300 hover:text-red-500">
                Eliminar
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
