'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { parsearPedido } from '@/lib/parser'
import { ParsedPedido, MetodoPago } from '@/types'
import { formatCOP } from '@/lib/utils/format'
import { crearPedidoDesdeDataAction } from '@/app/actions/pedidos'
import { buscarClientesAction, ClienteBusqueda } from '@/app/actions/clientes'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { ImagenProducto } from '@/components/pedidos/ImagenProducto'
import { uploadPedidoImage } from '@/lib/utils/uploadPedidoImage'

interface CrearPedidoFormProps {
  numeroSugerido: string
  asesorNombre: string
}

type Paso = 'pegar' | 'preview' | 'error_parser'

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo',      label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'credito',       label: 'Crédito' },
  { value: 'addi',          label: 'Addi' },
  { value: 'bold',          label: 'Bold' },
  { value: 'sistecredito',  label: 'Sistecredito' },
]

function InputField({ label, value, onChange, type = 'text', className = '' }: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}

export function CrearPedidoForm({ numeroSugerido, asesorNombre }: CrearPedidoFormProps) {
  const [paso, setPaso] = useState<Paso>('pegar')
  const [modoCrear, setModoCrear] = useState<'texto' | 'buscar'>('texto')
  const [texto, setTexto] = useState('')
  const [editableData, setEditableData] = useState<ParsedPedido | null>(null)
  const [errorParser, setErrorParser] = useState<string | null>(null)
  const [numeroOrden, setNumeroOrden] = useState(numeroSugerido)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [siguienteNumero, setSiguienteNumero] = useState<string | null>(null)
  const [advertencias, setAdvertencias] = useState<string[]>([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [resultadosCliente, setResultadosCliente] = useState<ClienteBusqueda[]>([])
  const [busquedaDirecta, setBusquedaDirecta] = useState('')
  const [resultadosDirecta, setResultadosDirecta] = useState<ClienteBusqueda[]>([])
  const [isPending, startTransition] = useTransition()
  const dropdownRef = useRef<HTMLUListElement>(null)

  // Paste global de imágenes: el click en una tarjeta de producto la marca como destino
  const activeProductIdxRef = useRef(0)
  const updateProductoRef   = useRef(updateProducto)
  useEffect(() => { updateProductoRef.current = updateProducto })

  useEffect(() => {
    if (paso !== 'preview') return
    async function onPaste(e: ClipboardEvent) {
      for (const item of Array.from(e.clipboardData?.items ?? [])) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          const url = await uploadPedidoImage(file)
          if (url) updateProductoRef.current(activeProductIdxRef.current, 'imagen_url', url)
          break
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [paso])

  useEffect(() => {
    if (busquedaCliente.trim().length < 2) { setResultadosCliente([]); return }
    const t = setTimeout(async () => {
      const res = await buscarClientesAction(busquedaCliente)
      setResultadosCliente(res)
    }, 300)
    return () => clearTimeout(t)
  }, [busquedaCliente])

  useEffect(() => {
    if (busquedaDirecta.trim().length < 2) { setResultadosDirecta([]); return }
    const t = setTimeout(async () => {
      const res = await buscarClientesAction(busquedaDirecta)
      setResultadosDirecta(res)
    }, 300)
    return () => clearTimeout(t)
  }, [busquedaDirecta])

  function seleccionarCliente(c: ClienteBusqueda) {
    updateField('cliente_nombre', c.nombre)
    updateField('cliente_telefono', c.telefono_normalizado)
    setBusquedaCliente('')
    setResultadosCliente([])
  }

  function crearDesdeCliente(c: ClienteBusqueda) {
    const sedeCode = numeroSugerido.slice(0, 2) as 'TR' | 'CR' | 'SR'
    setEditableData({
      formato_version: '1',
      sede: sedeCode,
      numero_orden_sugerido: numeroSugerido,
      asesor: asesorNombre,
      cliente_nombre: c.nombre,
      cliente_doc: c.cedula ? `CC ${c.cedula}` : null,
      cliente_telefono: c.telefono_normalizado,
      productos: [{ marca: '', descripcion: '', talla: null, cantidad: 1, precio_venta: 0 }],
      total: 0,
      abono: 0,
      metodo_pago_abono: 'efectivo',
      tipo_entrega: 'sede',
      direccion: null,
      notas: null,
    })
    setNumeroOrden(numeroSugerido)
    setAdvertencias([])
    setBusquedaDirecta('')
    setResultadosDirecta([])
    setPaso('preview')
  }

  function handleParsear() {
    const result = parsearPedido(texto)
    if (!result.ok) {
      setErrorParser(result.error)
      setPaso('error_parser')
      return
    }
    setEditableData(result.data)
    setAdvertencias(result.warnings ?? [])
    setErrorParser(null)
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
    setEditableData(null)
  }

  function updateField<K extends keyof ParsedPedido>(field: K, value: ParsedPedido[K]) {
    setEditableData(prev => prev ? { ...prev, [field]: value } : null)
  }

  function updateProducto(idx: number, field: string, value: string | number) {
    setEditableData(prev => {
      if (!prev) return null
      const productos = prev.productos.map((p, i) =>
        i === idx ? { ...p, [field]: value } : p
      )
      return { ...prev, productos }
    })
  }

  function handleConfirmar() {
    if (!editableData) return
    setErrorAccion(null)
    setSiguienteNumero(null)

    if (!editableData.cliente_nombre.trim()) {
      setErrorAccion('El nombre del cliente es obligatorio')
      return
    }
    if (!editableData.cliente_telefono.trim()) {
      setErrorAccion('El celular del cliente es obligatorio')
      return
    }
    const articuloVacio = editableData.productos.find(p => !p.descripcion.trim())
    if (articuloVacio) {
      setErrorAccion('Todos los artículos deben tener nombre')
      return
    }

    startTransition(async () => {
      const result = await crearPedidoDesdeDataAction(editableData, numeroOrden)
      if (!result.ok) {
        setErrorAccion(result.error)
        if (result.siguienteNumero) setSiguienteNumero(result.siguienteNumero)
      }
    })
  }

  const total = editableData?.productos.reduce((s, p) => s + p.precio_venta * p.cantidad, 0) ?? 0
  const saldo = total - (editableData?.abono ?? 0)

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Paso 1: pegar texto o buscar cliente */}
      {(paso === 'pegar' || paso === 'error_parser') && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            {/* Tabs */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModoCrear('texto')}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium active:scale-95 ${
                  modoCrear === 'texto'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
                }`}
              >
                📋 Pegar resumen
              </button>
              <button
                type="button"
                onClick={() => setModoCrear('buscar')}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium active:scale-95 ${
                  modoCrear === 'buscar'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
                }`}
              >
                🔍 Buscar cliente
              </button>
            </div>

            {/* Modo: pegar texto */}
            {modoCrear === 'texto' && (
              <>
                <textarea
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value)
                    if (paso === 'error_parser') setPaso('pegar')
                  }}
                  rows={12}
                  placeholder={`Numero de pedido: TR5946\nNombre: Juan Pérez\nCelular: 3001234567\nPrenda: Nike Air Max 95 negro\nTalla: 40\nPrecio: 350.000\nAbono: 100.000\nMétodo de pago: Bancolombia`}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                {paso === 'error_parser' && errorParser && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    <p className="font-medium mb-1">Error en el formato del resumen:</p>
                    <p className="font-mono text-xs">{errorParser}</p>
                  </div>
                )}
                <Button onClick={handleParsear} disabled={texto.trim().length < 10}>
                  Validar resumen →
                </Button>
              </>
            )}

            {/* Modo: buscar cliente */}
            {modoCrear === 'buscar' && (
              <div>
                <p className="text-xs text-gray-500 mb-3">Busca el cliente y luego llena los productos y número de pedido.</p>
                <div className="relative">
                  <input
                    type="text"
                    value={busquedaDirecta}
                    onChange={e => setBusquedaDirecta(e.target.value)}
                    onBlur={() => setTimeout(() => setResultadosDirecta([]), 150)}
                    placeholder="Nombre o celular del cliente..."
                    autoFocus
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {resultadosDirecta.length > 0 && (
                    <ul className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-auto">
                      {resultadosDirecta.map(c => (
                        <li
                          key={c.id}
                          onMouseDown={() => crearDesdeCliente(c)}
                          className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0"
                        >
                          <p className="text-sm font-medium text-gray-900">{c.nombre}</p>
                          <p className="text-xs text-gray-400">{c.telefono_normalizado}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Paso 2: preview editable */}
      {paso === 'preview' && editableData && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Confirma y edita antes de guardar</h2>
                <button onClick={handleReintentar} className="text-xs text-gray-400 hover:text-gray-600">
                  ← Volver al texto
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">

              {advertencias.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
                  <p className="font-medium mb-1">Completa los campos faltantes antes de confirmar:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {advertencias.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

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
                <p className="text-xs text-gray-400 mt-1">Puedes cambiarlo. El sistema valida que no exista.</p>
              </div>

              {/* Cliente */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Cliente</p>

                {/* Buscador de cliente existente */}
                <div className="relative mb-3">
                  <label className="block text-xs text-gray-500 mb-1">Buscar cliente existente</label>
                  <input
                    type="text"
                    value={busquedaCliente}
                    onChange={e => setBusquedaCliente(e.target.value)}
                    onBlur={() => setTimeout(() => setResultadosCliente([]), 150)}
                    placeholder="Nombre o celular..."
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {resultadosCliente.length > 0 && (
                    <ul ref={dropdownRef} className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-auto">
                      {resultadosCliente.map(c => (
                        <li
                          key={c.id}
                          onMouseDown={() => seleccionarCliente(c)}
                          className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm flex justify-between items-center"
                        >
                          <span className="font-medium text-gray-900">{c.nombre}</span>
                          <span className="text-gray-400 text-xs">{c.telefono_normalizado}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <InputField
                    label="Nombre"
                    value={editableData.cliente_nombre}
                    onChange={v => updateField('cliente_nombre', v)}
                  />
                  <InputField
                    label="Celular"
                    value={editableData.cliente_telefono}
                    onChange={v => updateField('cliente_telefono', v)}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  Asesor: {asesorNombre} · Sede: {editableData.sede}
                </p>
              </div>

              {/* Entrega */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Entrega</p>
                <div className="flex gap-2 mb-2">
                  {(['sede', 'domicilio'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => updateField('tipo_entrega', t)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium capitalize transition-colors ${
                        editableData.tipo_entrega === t
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {editableData.tipo_entrega === 'domicilio' && (
                  <InputField
                    label="Dirección"
                    value={editableData.direccion ?? ''}
                    onChange={v => updateField('direccion', (v || null) as string | null)}
                  />
                )}
              </div>

              {/* Productos */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Productos</p>
                <div className="space-y-3">
                  {editableData.productos.map((p, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2"
                      onMouseDown={() => { activeProductIdxRef.current = i }}>
                      <div className="flex gap-2">
                        <ImagenProducto
                          value={p.imagen_url ?? null}
                          onChange={url => updateProducto(i, 'imagen_url', url ?? '')}
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <InputField
                                label="Artículo"
                                value={[p.marca, p.descripcion].filter(Boolean).join(' ')}
                                onChange={v => { updateProducto(i, 'marca', ''); updateProducto(i, 'descripcion', v) }}
                              />
                            </div>
                            <div className="w-20">
                              <InputField
                                label="Talla"
                                value={p.talla ?? ''}
                                onChange={v => updateProducto(i, 'talla', v)}
                              />
                            </div>
                          </div>
                          <InputField
                            label="Precio"
                            value={p.precio_venta}
                            type="number"
                            onChange={v => updateProducto(i, 'precio_venta', parseInt(v) || 0)}
                            className="max-w-[160px]"
                          />
                        </div>
                      </div>
                      {editableData.productos.length > 1 && (
                        <button type="button"
                          onClick={() => setEditableData(prev => prev ? { ...prev, productos: prev.productos.filter((_, j) => j !== i) } : null)}
                          className="text-xs text-red-500 hover:text-red-700">
                          Quitar producto
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button"
                  onClick={() => setEditableData(prev => prev ? { ...prev, productos: [...prev.productos, { marca: '', descripcion: '', talla: null, cantidad: 1, precio_venta: 0 }] } : null)}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
                  + Agregar producto
                </button>
              </div>

              {/* Abono y método de pago */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Abono</p>
                <div className="space-y-3">
                  <InputField
                    label="Monto del abono"
                    value={editableData.abono}
                    type="number"
                    onChange={v => updateField('abono', parseInt(v) || 0)}
                    className="max-w-[180px]"
                  />
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Método de pago</label>
                    <div className="flex flex-wrap gap-2">
                      {METODOS.map(m => (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => updateField('metodo_pago_abono', m.value)}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-medium active:scale-95 ${
                            editableData.metodo_pago_abono === m.value
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Totales */}
              <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total pedido</span>
                  <span className="font-semibold text-gray-900">{formatCOP(total)}</span>
                </div>
                {editableData.abono > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Abono ({editableData.metodo_pago_abono})</span>
                    <span className="text-green-700">− {formatCOP(editableData.abono)}</span>
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

              {editableData.notas && (
                <div>
                  <InputField
                    label="Notas"
                    value={editableData.notas}
                    onChange={v => updateField('notas', v || null)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {errorAccion && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 space-y-2">
              <p>{errorAccion}</p>
              {siguienteNumero && (
                <div className="flex items-center gap-3">
                  <span className="text-red-600">
                    Próximo disponible: <strong className="font-mono">{siguienteNumero}</strong>
                  </span>
                  <button
                    onClick={() => { setNumeroOrden(siguienteNumero); setSiguienteNumero(null); setErrorAccion(null) }}
                    className="underline text-red-700 font-medium hover:text-red-900"
                  >
                    Usar este número
                  </button>
                </div>
              )}
            </div>
          )}

          <Button onClick={handleConfirmar} disabled={isPending} size="md" className="w-full">
            {isPending ? 'Guardando pedido...' : `Confirmar y crear pedido ${numeroOrden}`}
          </Button>
        </>
      )}
    </div>
  )
}
