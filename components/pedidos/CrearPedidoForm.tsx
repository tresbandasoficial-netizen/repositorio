'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { parsearPedido } from '@/lib/parser'
import { ParsedPedido, Cuenta } from '@/types'
import { formatCOP } from '@/lib/utils/format'
import { crearPedidoDesdeDataAction } from '@/app/actions/pedidos'
import { getCuentasAction } from '@/app/actions/cuentas'
import { buscarClientesAction, buscarDireccionPorTelefonoAction, ClienteBusqueda } from '@/app/actions/clientes'
import { buscarPorCodigoAction, buscarArticulosAction, ArticuloBusqueda } from '@/app/actions/articulos'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { ImagenProducto } from '@/components/pedidos/ImagenProducto'
import { uploadPedidoImage } from '@/lib/utils/uploadPedidoImage'
import { PedidoSuccessOverlay } from '@/components/pedidos/PedidoSuccessOverlay'

type CatalogLink = {
  articulo_id: string
  codigo: string
  marca: string
  nombre: string
  color: string | null
  sexo: string | null
}

interface CrearPedidoFormProps {
  numeroSugerido: string
  asesorNombre: string
}

type Paso = 'pegar' | 'preview' | 'error_parser'

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
        value={type === 'number' && value === 0 ? '' : value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}

export function CrearPedidoForm({ numeroSugerido, asesorNombre }: CrearPedidoFormProps) {
  const [paso, setPaso] = useState<Paso>('preview')
  const [modoCrear, setModoCrear] = useState<'texto' | 'buscar'>('texto')
  const [texto, setTexto] = useState('')
  const [errorParser, setErrorParser] = useState<string | null>(null)
  const [numeroOrden, setNumeroOrden] = useState(numeroSugerido)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [siguienteNumero, setSiguienteNumero] = useState<string | null>(null)
  const [advertencias, setAdvertencias] = useState<string[]>([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [resultadosCliente, setResultadosCliente] = useState<ClienteBusqueda[]>([])
  const [busquedaDirecta, setBusquedaDirecta] = useState('')
  const [resultadosDirecta, setResultadosDirecta] = useState<ClienteBusqueda[]>([])
  const [ultimaDireccion, setUltimaDireccion] = useState<string | null>(null)
  const [pedidoCreado, setPedidoCreado] = useState<{ id: string; numero: string } | null>(null)
  const [codigos, setCodigos] = useState<string[]>([''])
  const [catalogLinks, setCatalogLinks] = useState<(CatalogLink | null)[]>([null])
  const [artSuggs, setArtSuggs] = useState<CatalogLink[][]>([[]])
  const [suggAbierto, setSuggAbierto] = useState<boolean[]>([false])

  const editableDataVacio: ParsedPedido = {
    formato_version: '1',
    sede: 'TR',
    cliente_nombre: '',
    cliente_doc: null,
    cliente_telefono: '',
    productos: [{ marca: '', descripcion: '', talla: null, cantidad: 1, precio_venta: 0, imagen_url: null, codigo: null, color: null, sexo: null, categoria: null }],
    total: 0,
    abono: 0,
    metodo_pago_abono: 'efectivo',
    tipo_entrega: 'sede',
    direccion: null,
    notas: null,
  }
  const [editableData, setEditableData] = useState<ParsedPedido>(editableDataVacio)
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [cuentaId, setCuentaId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const dropdownRef = useRef<HTMLUListElement>(null)
  const searchTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => { getCuentasAction().then(r => setCuentas(r.ok ? r.cuentas : [])).catch(console.error) }, [])

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
    setUltimaDireccion(c.ultima_direccion ?? null)
    setBusquedaCliente('')
    setResultadosCliente([])
  }

  function crearDesdeCliente(c: ClienteBusqueda) {
    const sedeCode = numeroSugerido.slice(0, 2) as 'TR' | 'CR' | 'SR'
    setUltimaDireccion(c.ultima_direccion ?? null)
    setEditableData({
      formato_version: '1',
      sede: sedeCode,
      numero_orden_sugerido: numeroSugerido,
      asesor: asesorNombre,
      cliente_nombre: c.nombre,
      cliente_doc: c.cedula ? `CC ${c.cedula}` : null,
      cliente_telefono: c.telefono_normalizado,
      productos: [{ marca: '', descripcion: '', talla: null, cantidad: 1, precio_venta: 0, codigo: '', color: '', sexo: '', categoria: '' }],
      total: 0,
      abono: 0,
      metodo_pago_abono: 'cuenta',
      tipo_entrega: 'sede',
      direccion: null,
      notas: null,
    })
    setCodigos([''])
    setCatalogLinks([null])
    setArtSuggs([[]])
    setSuggAbierto([false])
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
      return
    }
    setEditableData(result.data)
    setCodigos(result.data.productos.map(() => ''))
    setCatalogLinks(result.data.productos.map(() => null))
    setArtSuggs(result.data.productos.map(() => []))
    setSuggAbierto(result.data.productos.map(() => false))
    setAdvertencias(result.warnings ?? [])
    setErrorParser(null)
    if (result.data.numero_orden_sugerido) {
      setNumeroOrden(result.data.numero_orden_sugerido)
    } else if (!numeroOrden.startsWith(result.data.sede)) {
      setNumeroOrden(numeroSugerido)
    }
    if (result.data.cliente_telefono) {
      buscarDireccionPorTelefonoAction(result.data.cliente_telefono).then(dir => {
        setUltimaDireccion(dir)
      })
    }
  }

  function updateField<K extends keyof ParsedPedido>(field: K, value: ParsedPedido[K]) {
    setEditableData(prev => ({ ...prev, [field]: value }))
  }

  function updateProducto(idx: number, field: string, value: string | number | null) {
    setEditableData(prev => {
      if (!prev) return prev
      const productos = prev.productos.map((p, i) =>
        i === idx ? { ...p, [field]: value } : p
      )
      return { ...prev, productos }
    })
  }

  function setCodigo(idx: number, val: string) {
    setCodigos(prev => prev.map((c, i) => i === idx ? val : c))
    updateProducto(idx, 'codigo', val)
    const prev = searchTimeoutsRef.current.get(idx)
    if (prev) clearTimeout(prev)
    if (val.trim().length < 2) {
      setArtSuggs(s => s.map((x, i) => i === idx ? [] : x))
      return
    }
    const t = setTimeout(async () => {
      const res = await buscarArticulosAction(val.trim(), null)
      const links = res.map((a: ArticuloBusqueda) => ({
        articulo_id: a.id, codigo: a.codigo ?? '', marca: a.marca,
        nombre: a.nombre, color: a.color, sexo: a.sexo,
      }))
      setArtSuggs(s => s.map((x, i) => i === idx ? links : x))
      setSuggAbierto(s => s.map((o, i) => i === idx ? links.length > 0 : o))
    }, 250)
    searchTimeoutsRef.current.set(idx, t)
  }

  function elegirArticulo(idx: number, link: CatalogLink) {
    setCatalogLinks(prev => prev.map((c, i) => i === idx ? link : c))
    setCodigos(prev => prev.map((c, i) => i === idx ? (link.codigo || '') : c))
    setArtSuggs(s => s.map((x, i) => i === idx ? [] : x))
    setSuggAbierto(s => s.map((o, i) => i === idx ? false : o))
    updateProducto(idx, 'articulo_id', link.articulo_id)
    updateProducto(idx, 'codigo', link.codigo || '')
    if (link.color) updateProducto(idx, 'color', link.color)
    if (link.sexo) updateProducto(idx, 'sexo', link.sexo)
    if (!editableData?.productos[idx].marca) updateProducto(idx, 'marca', link.marca)
  }

  function clearCatalogLink(idx: number) {
    setCatalogLinks(prev => prev.map((c, i) => i === idx ? null : c))
    updateProducto(idx, 'articulo_id', null)
  }

  async function lookupCodigo(idx: number) {
    const codigo = codigos[idx]?.trim()
    if (!codigo) return
    const art = await buscarPorCodigoAction(codigo)
    if (!art) return
    const link: CatalogLink = {
      articulo_id: art.id,
      codigo: art.codigo ?? codigo,
      marca: art.marca,
      nombre: art.nombre,
      color: art.color,
      sexo: art.sexo,
    }
    setCatalogLinks(prev => prev.map((c, i) => i === idx ? link : c))
    // Pre-rellenar marca en el producto (la descripción la escribe el asesor)
    if (!editableData?.productos[idx].marca) {
      updateProducto(idx, 'marca', art.marca)
    }
    updateProducto(idx, 'articulo_id', art.id)
    updateProducto(idx, 'codigo', art.codigo ?? codigo)
    if (art.color) updateProducto(idx, 'color', art.color)
    if (art.sexo) updateProducto(idx, 'sexo', art.sexo)
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

    // El abono se registra contra una cuenta destino (formato facturación)
    const datos: ParsedPedido = editableData.abono > 0
      ? { ...editableData, metodo_pago_abono: 'cuenta' }
      : editableData

    startTransition(async () => {
      const result = await crearPedidoDesdeDataAction(datos, numeroOrden, cuentaId)
      if (!result.ok) {
        setErrorAccion(result.error)
        if (result.siguienteNumero) setSiguienteNumero(result.siguienteNumero)
      } else {
        setPedidoCreado({ id: result.pedidoId, numero: numeroOrden })
      }
    })
  }

  const total = editableData?.productos.reduce((s, p) => s + p.precio_venta * p.cantidad, 0) ?? 0
  const saldo = total - (editableData?.abono ?? 0)

  if (pedidoCreado) {
    return <PedidoSuccessOverlay pedidoId={pedidoCreado.id} numeroOrden={pedidoCreado.numero} />
  }

  return (
    <div className="flex gap-6 items-start">
      {/* Columna izquierda: Formulario principal */}
      <div className="flex-1 min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-gray-900">Nuevo pedido</h2>
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
                          className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 last:border-0"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-900">{c.nombre}</span>
                            <span className="text-gray-400 text-xs">{c.telefono_normalizado}</span>
                          </div>
                          {c.ultima_direccion && (
                            <p className="text-xs text-blue-500 truncate mt-0.5">📍 {c.ultima_direccion}</p>
                          )}
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
                  <div>
                    {ultimaDireccion && !editableData.direccion && (
                      <button
                        type="button"
                        onClick={() => updateField('direccion', ultimaDireccion)}
                        className="mb-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                      >
                        📍 Usar dirección anterior: <span className="font-normal">{ultimaDireccion}</span>
                      </button>
                    )}
                    <InputField
                      label="Dirección"
                      value={editableData.direccion ?? ''}
                      onChange={v => updateField('direccion', (v || null) as string | null)}
                    />
                  </div>
                )}
              </div>

              {/* Productos */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Productos</p>
                <div className="space-y-3">
                  {editableData.productos.map((p, i) => {
                    const link = catalogLinks[i]
                    return (
                      <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2"
                        onMouseDown={() => { activeProductIdxRef.current = i }}>

                        {/* Código SKU — autocomplete */}
                        <div className="flex items-center gap-2">
                          <div className="relative w-48">
                            <label className="block text-xs text-gray-500 mb-0.5">Código / buscar artículo</label>
                            <input
                              type="text"
                              value={codigos[i] ?? ''}
                              onChange={e => setCodigo(i, e.target.value.toUpperCase())}
                              onBlur={() => { setTimeout(() => setSuggAbierto(s => s.map((o, j) => j === i ? false : o)), 150); lookupCodigo(i) }}
                              placeholder="ej. JR1012"
                              className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {suggAbierto[i] && artSuggs[i]?.length > 0 && (
                              <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                                {artSuggs[i].map(art => (
                                  <li key={art.articulo_id}
                                    onMouseDown={() => elegirArticulo(i, art)}
                                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-xs border-b border-gray-50 last:border-0">
                                    {art.codigo && <span className="font-mono text-gray-400 mr-1">{art.codigo}</span>}
                                    <span className="font-medium text-gray-900">{art.marca} {art.nombre}</span>
                                    {art.color && <span className="text-gray-400"> · {art.color}</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          {link && (
                            <div className="flex-1 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
                              <span className="text-xs text-blue-800 font-medium">
                                ✓ {link.marca} {link.nombre}
                                {link.color && <span className="text-blue-600"> · {link.color}</span>}
                              </span>
                              <button type="button" onClick={() => clearCatalogLink(i)}
                                className="text-blue-400 hover:text-blue-700 ml-2 text-xs">✕</button>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <ImagenProducto
                            value={p.imagen_url ?? null}
                            onChange={url => updateProducto(i, 'imagen_url', url ?? '')}
                          />
                          <div className="flex-1 space-y-2">
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <InputField
                                  label="Descripción para el cliente"
                                  value={p.descripcion}
                                  onChange={v => updateProducto(i, 'descripcion', v)}
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
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <InputField
                                  label="Marca"
                                  value={p.marca}
                                  onChange={v => updateProducto(i, 'marca', v)}
                                />
                              </div>
                              <div className="w-[160px]">
                                <InputField
                                  label="Precio"
                                  value={p.precio_venta}
                                  type="number"
                                  onChange={v => updateProducto(i, 'precio_venta', parseInt(v) || 0)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Atributos del catálogo (color, sexo, categoría) para guardar el artículo */}
                        <div className="flex flex-wrap gap-2 items-end pt-1">
                          <div className="w-28">
                            <label className="block text-xs text-gray-500 mb-0.5">Color</label>
                            <input
                              type="text"
                              value={p.color ?? ''}
                              onChange={e => updateProducto(i, 'color', e.target.value)}
                              placeholder="Color"
                              className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Sexo</label>
                            <div className="flex gap-1">
                              {(['hombre', 'mujer', 'nino'] as const).map(s => (
                                <button key={s} type="button"
                                  onClick={() => updateProducto(i, 'sexo', p.sexo === s ? '' : s)}
                                  className={`text-xs px-2 py-1.5 rounded border font-medium transition-colors ${
                                    p.sexo === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                                  }`}>
                                  {s === 'nino' ? 'Niño' : s.charAt(0).toUpperCase() + s.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Categoría</label>
                            <div className="flex gap-1">
                              {(['ropa', 'tenis', 'accesorios'] as const).map(c => (
                                <button key={c} type="button"
                                  onClick={() => updateProducto(i, 'categoria', p.categoria === c ? '' : c)}
                                  className={`text-xs px-2 py-1.5 rounded border font-medium transition-colors ${
                                    p.categoria === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                                  }`}>
                                  {c.charAt(0).toUpperCase() + c.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        {editableData.productos.length > 1 && (
                          <button type="button"
                            onClick={() => {
                              setEditableData(prev => ({ ...prev, productos: prev.productos.filter((_, j) => j !== i) }))
                              setCodigos(prev => prev.filter((_, j) => j !== i))
                              setCatalogLinks(prev => prev.filter((_, j) => j !== i))
                              setArtSuggs(prev => prev.filter((_, j) => j !== i))
                              setSuggAbierto(prev => prev.filter((_, j) => j !== i))
                            }}
                            className="text-xs text-red-500 hover:text-red-700">
                            Quitar producto
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <button type="button"
                  onClick={() => {
                    setEditableData(prev => ({ ...prev, productos: [...prev.productos, { marca: '', descripcion: '', talla: null, cantidad: 1, precio_venta: 0, codigo: '', color: '', sexo: '', categoria: '' }] }))
                    setCodigos(prev => [...prev, ''])
                    setCatalogLinks(prev => [...prev, null])
                    setArtSuggs(prev => [...prev, []])
                    setSuggAbierto(prev => [...prev, false])
                  }}
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
                  {editableData.abono > 0 && cuentas.length > 0 && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">
                        Cuenta destino <span className="text-gray-400 font-normal">(dónde llega el dinero)</span>
                      </label>
                      <select
                        value={cuentaId ?? ''}
                        onChange={e => setCuentaId(e.target.value || null)}
                        className="w-full max-w-xs border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Sin especificar</option>
                        {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                  )}
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
                    <span className="text-gray-600">
                      Abono{cuentaId ? ` (${cuentas.find(c => c.id === cuentaId)?.nombre})` : ''}
                    </span>
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
      </div>

      {/* Columna derecha: Pegar resumen de texto */}
      <div className="w-80 shrink-0">
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pegar resumen</p>
            <p className="text-xs text-gray-400">Pega el texto del pedido y el formulario se llenará automáticamente.</p>
            <textarea
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value)
                setErrorParser(null)
              }}
              rows={14}
              placeholder={`Numero de pedido: TR5946\nNombre: Juan Pérez\nCelular: 3001234567\nPrenda: Nike Air Max 95 negro\nTalla: 40\nPrecio: 350.000\nAbono: 100.000\nMétodo de pago: Bancolombia`}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            {errorParser && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                <p className="font-medium mb-0.5">Error en el formato:</p>
                <p className="font-mono">{errorParser}</p>
              </div>
            )}
            <Button onClick={handleParsear} disabled={texto.trim().length < 10} className="w-full">
              Llenar formulario →
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
