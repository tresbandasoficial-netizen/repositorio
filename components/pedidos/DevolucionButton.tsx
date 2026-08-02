'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { registrarDevolucionAction } from '@/app/actions/devoluciones'
import { formatCOP } from '@/lib/utils/format'
import { Undo2, X, Copy, Check } from 'lucide-react'

type ItemDev = {
  id: string
  label: string       // "ADIDAS Falda · T S · ×1"
  valor: number       // precio_venta * cantidad
  tieneFicha: boolean // enlazado al catálogo (necesario para entrar a stock)
}

// Botón "Cambio / Devolución" del detalle del pedido (solo entregados):
// se eligen las prendas devueltas → entran al inventario y sale un BONO por su
// valor para pagar el pedido nuevo (la otra talla / el otro producto).
export function DevolucionButton({ pedidoId, items }: { pedidoId: string; items: ItemDev[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [marcados, setMarcados] = useState<string[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ codigo: string; valor: number; entradas: string[] } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const valorSel = items.filter(i => marcados.includes(i.id)).reduce((s, i) => s + i.valor, 0)

  async function registrar() {
    if (!confirm(
      `¿Registrar la devolución de ${marcados.length} prenda(s) por ${formatCOP(valorSel)}?\n\n` +
      `• Las prendas ENTRAN al inventario de la sede\n` +
      `• Se genera un BONO por ${formatCOP(valorSel)} para pagar el cambio`
    )) return
    setCargando(true)
    setError(null)
    const r = await registrarDevolucionAction(pedidoId, marcados)
    setCargando(false)
    if (!r.ok) { setError(r.error); return }
    setResultado({ codigo: r.codigo, valor: r.valor, entradas: r.entradas })
    router.refresh()
  }

  function copiarCodigo() {
    if (!resultado) return
    navigator.clipboard.writeText(resultado.codigo).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  return (
    <>
      <button
        onClick={() => { setAbierto(true); setMarcados([]); setError(null); setResultado(null) }}
        className="text-sm bg-white border border-amber-300 hover:bg-amber-50 px-3.5 py-2 rounded-xl font-medium text-amber-700 transition-colors inline-flex items-center gap-1.5"
      >
        <Undo2 size={15} /> Cambio / Devolución
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !cargando && setAbierto(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setAbierto(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>

            {resultado ? (
              <>
                <h3 className="text-base font-bold text-gray-900">✅ Devolución registrada</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p className="font-medium text-gray-800">Entró al inventario:</p>
                  {resultado.entradas.map((e, i) => <p key={i}>• {e}</p>)}
                </div>
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-center space-y-1">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Bono de cambio</p>
                  <p className="font-mono text-2xl font-bold text-gray-900">{resultado.codigo}</p>
                  <p className="text-sm font-semibold text-amber-800">{formatCOP(resultado.valor)}</p>
                  <button
                    onClick={copiarCodigo}
                    className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-white border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-100"
                  >
                    {copiado ? <Check size={13} /> : <Copy size={13} />}
                    {copiado ? 'Copiado' : 'Copiar código'}
                  </button>
                </div>
                <div className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3 space-y-1">
                  <p className="font-semibold text-gray-700">Siguiente paso — el cambio:</p>
                  <p>1. Crea el pedido nuevo (la otra talla o el otro producto).</p>
                  <p>2. Al registrar el pago, elige método <strong>Bono regalo</strong> y usa este código.</p>
                  <p>3. Si el nuevo vale más, el cliente paga la diferencia; si vale menos, le queda saldo en el bono.</p>
                </div>
                <button
                  onClick={() => setAbierto(false)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl py-2.5"
                >
                  Listo
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-gray-900">Cambio / Devolución</h3>
                <p className="text-xs text-gray-500">
                  Marca las prendas que el cliente devolvió. Entran al inventario y su valor queda en un
                  bono para pagar el cambio.
                </p>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {items.map(it => (
                    <label
                      key={it.id}
                      className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                        marcados.includes(it.id) ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
                      } ${!it.tieneFicha ? 'opacity-60' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={marcados.includes(it.id)}
                        disabled={!it.tieneFicha}
                        onChange={() => setMarcados(prev => prev.includes(it.id) ? prev.filter(x => x !== it.id) : [...prev, it.id])}
                        className="accent-amber-500 w-4 h-4"
                      />
                      <span className="flex-1 text-sm text-gray-800">{it.label}</span>
                      <span className="text-sm font-bold text-gray-900">{formatCOP(it.valor)}</span>
                    </label>
                  ))}
                </div>

                {items.some(i => !i.tieneFicha) && (
                  <p className="text-[11px] text-amber-700">
                    Las prendas opacas no están enlazadas al catálogo — enlázalas primero (Editar pedido) para poder devolverlas a stock.
                  </p>
                )}

                {error && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
                )}

                <button
                  onClick={registrar}
                  disabled={marcados.length === 0 || cargando}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl py-2.5 disabled:opacity-50"
                >
                  {cargando ? 'Registrando…' : marcados.length > 0
                    ? `Registrar devolución · bono de ${formatCOP(valorSel)}`
                    : 'Marca las prendas devueltas'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
