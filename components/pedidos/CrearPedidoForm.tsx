'use client'

import { useState, useTransition } from 'react'
import { parsearPedido } from '@/lib/parser'
import { ParsedPedido } from '@/types'
import { formatCOP } from '@/lib/utils/format'
import { formatearTelefono } from '@/lib/utils/phone'
import { crearPedidoAction } from '@/app/actions/pedidos'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'

interface CrearPedidoFormProps {
  numeroSugerido: string
}

type Paso = 'pegar' | 'preview' | 'error_parser'

export function CrearPedidoForm({ numeroSugerido }: CrearPedidoFormProps) {
  const [paso, setPaso] = useState<Paso>('pegar')
  const [texto, setTexto] = useState('')
  const [parsedData, setParsedData] = useState<ParsedPedido | null>(null)
  const [errorParser, setErrorParser] = useState<string | null>(null)
  const [numeroOrden, setNumeroOrden] = useState(numeroSugerido)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [siguienteNumero, setSiguienteNumero] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleParsear() {
    const result = parsearPedido(texto)
    if (!result.ok) {
      setErrorParser(result.error)
      setPaso('error_parser')
      return
    }
    setParsedData(result.data)
    setErrorParser(null)
    // Usar número extraído del pedido libre, o el sugerido si no hay
    if (result.data.numero_orden_sugerido) {
      setNumeroOrden(result.data.numero_orden_sugerido)
    } else if (!numeroOrden.startsWith(result.data.sede)) {
      setNumeroOrden(numeroSugerido)
    }
    setPaso('preview')
  }

  function handleReintentar() {
    setPaso('pegar')
    setErrorParser(null)
    setParsedData(null)
  }

  function handleUsarSiguiente() {
    if (siguienteNumero) {
      setNumeroOrden(siguienteNumero)
      setSiguienteNumero(null)
      setErrorAccion(null)
    }
  }

  function handleConfirmar() {
    if (!parsedData) return
    setErrorAccion(null)
    setSiguienteNumero(null)

    startTransition(async () => {
      const result = await crearPedidoAction(texto, numeroOrden)
      // Si llega aquí es porque no hubo redirect (hubo error)
      if (!result.ok) {
        setErrorAccion(result.error)
        if (result.siguienteNumero) setSiguienteNumero(result.siguienteNumero)
      }
    })
  }

  const saldo = parsedData ? parsedData.total - parsedData.abono : 0

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Paso 1: pegar resumen */}
      {(paso === 'pegar' || paso === 'error_parser') && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Pega el resumen del Claude externo</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              El resumen debe incluir <code className="bg-gray-100 px-1 rounded">===INICIO_PEDIDO===</code> y <code className="bg-gray-100 px-1 rounded">===FIN_PEDIDO===</code>
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value)
                if (paso === 'error_parser') setPaso('pegar')
              }}
              rows={14}
              placeholder={`Numero de pedido: TR5946\nNombre: Juan Pérez\nCelular: 3001234567\nArtículo/Link: https://... ó Nike Air Max 95\nTalla: 40\nPrecio: 350.000\nAbono: 100.000\nMétodo de pago: Bancolombia\nAsesor: nombre del asesor\n\n— Opcionales —\nCédula: 12345678\nDirección: Cra 10 # 20-30\nBarrio: El Prado\nCiudad: Bucaramanga`}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />

            {paso === 'error_parser' && errorParser && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                <p className="font-medium mb-1">Error en el formato del resumen:</p>
                <p className="font-mono text-xs">{errorParser}</p>
              </div>
            )}

            <Button
              onClick={handleParsear}
              disabled={texto.trim().length < 10}
            >
              Validar resumen →
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Paso 2: preview + confirmación */}
      {paso === 'preview' && parsedData && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Resumen parseado — confirma antes de guardar</h2>
                <button
                  onClick={handleReintentar}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  ← Editar resumen
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Número de orden */}
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Número de orden
                </label>
                <input
                  type="text"
                  value={numeroOrden}
                  onChange={(e) => {
                    setNumeroOrden(e.target.value.toUpperCase())
                    setErrorAccion(null)
                    setSiguienteNumero(null)
                  }}
                  className="font-mono font-bold text-lg border border-gray-300 rounded-lg px-3 py-2 w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Puedes cambiarlo. El sistema valida que no exista.
                </p>
              </div>

              {/* Cliente */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Cliente</p>
                  <p className="font-medium text-gray-900">{parsedData.cliente_nombre}</p>
                  <p className="text-gray-500">{formatearTelefono(parsedData.cliente_telefono)}</p>
                  {parsedData.cliente_doc && (
                    <p className="text-gray-400 text-xs">{parsedData.cliente_doc}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Entrega</p>
                  <p className="font-medium text-gray-900 capitalize">{parsedData.tipo_entrega}</p>
                  {parsedData.direccion && (
                    <p className="text-gray-500 text-xs">{parsedData.direccion}</p>
                  )}
                  <p className="text-gray-400 text-xs mt-1">Asesor: {parsedData.asesor} · Sede: {parsedData.sede}</p>
                </div>
              </div>

              {/* Productos */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Productos</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400">
                      <th className="text-left pb-1">Marca / Producto</th>
                      <th className="text-center pb-1">Talla</th>
                      <th className="text-center pb-1">Cant.</th>
                      <th className="text-right pb-1">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {parsedData.productos.map((p, i) => (
                      <tr key={i}>
                        <td className="py-1.5">
                          <span className="font-medium text-gray-900">{p.marca}</span>
                          <span className="text-gray-500 ml-1.5">{p.descripcion}</span>
                        </td>
                        <td className="py-1.5 text-center text-gray-500">{p.talla ?? '—'}</td>
                        <td className="py-1.5 text-center text-gray-500">{p.cantidad}</td>
                        <td className="py-1.5 text-right font-medium text-gray-900">{formatCOP(p.precio_venta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totales */}
              <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total pedido</span>
                  <span className="font-semibold text-gray-900">{formatCOP(parsedData.total)}</span>
                </div>
                {parsedData.abono > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      Abono ({parsedData.metodo_pago_abono})
                    </span>
                    <span className="text-green-700">− {formatCOP(parsedData.abono)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span className={saldo > 0 ? 'text-red-600' : 'text-green-600'}>
                    {saldo > 0 ? 'Saldo pendiente' : 'Pagado completo'}
                  </span>
                  <span className={saldo > 0 ? 'text-red-600' : 'text-green-600'}>
                    {saldo > 0 ? formatCOP(saldo) : '✓'}
                  </span>
                </div>
              </div>

              {parsedData.notas && (
                <div className="bg-yellow-50 rounded-lg px-3 py-2 text-sm text-yellow-800">
                  <span className="font-medium">Notas: </span>{parsedData.notas}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Error de acción (ej. número duplicado) */}
          {errorAccion && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 space-y-2">
              <p>{errorAccion}</p>
              {siguienteNumero && (
                <div className="flex items-center gap-3">
                  <span className="text-red-600">
                    Próximo disponible: <strong className="font-mono">{siguienteNumero}</strong>
                  </span>
                  <button
                    onClick={handleUsarSiguiente}
                    className="underline text-red-700 font-medium hover:text-red-900"
                  >
                    Usar este número
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Botón confirmar */}
          <Button
            onClick={handleConfirmar}
            disabled={isPending}
            size="md"
            className="w-full"
          >
            {isPending ? 'Guardando pedido...' : `Confirmar y crear pedido ${numeroOrden}`}
          </Button>
        </>
      )}
    </div>
  )
}
