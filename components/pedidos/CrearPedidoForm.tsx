'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { parsearPedido } from '@/lib/parser'
import { ParsedPedido, MetodoPago, Cuenta, TipoCuenta } from '@/types'
import { formatCOP } from '@/lib/utils/format'
import { crearPedidoDesdeDataAction } from '@/app/actions/pedidos'
import { buscarClientesAction, buscarDireccionPorTelefonoAction, ClienteBusqueda } from '@/app/actions/clientes'
import { buscarArticulosAction, crearArticuloAction, ArticuloBusqueda } from '@/app/actions/articulos'
import { Button } from '@/components/ui/Button'
import { ImagenProducto } from '@/components/pedidos/ImagenProducto'
import { uploadPedidoImage } from '@/lib/utils/uploadPedidoImage'
import { PedidoSuccessOverlay } from '@/components/pedidos/PedidoSuccessOverlay'

type OpcionCatalogo = {
  articulo_id: string
  codigo: string | null
  marca: string
  nombre: string
  color: string | null
  sexo: string | null
  talla: string | null
}

function aplanarOpciones(arts: ArticuloBusqueda[]): OpcionCatalogo[] {
  const result: OpcionCatalogo[] = []
  for (const a of arts) {
    if (a.tallaStock.length === 0) {
      result.push({ articulo_id: a.id, codigo: a.codigo, marca: a.marca, nombre: a.nombre, color: a.color, sexo: a.sexo, talla: null })
    } else {
      for (const ts of a.tallaStock) {
        result.push({ articulo_id: a.id, codigo: a.codigo, marca: a.marca, nombre: a.nombre, color: a.color, sexo: a.sexo, talla: ts.talla })
      }
    }
  }
  return result
}

interface CrearPedidoFormProps {
  numeroSugerido: string
  asesorNombre: string
  sedeId: string | null
  cuentas: Cuenta[]
}

function metodoDeCuenta(tipo: TipoCuenta): MetodoPago {
  if (['bancolombia', 'nequi', 'daviplata'].includes(tipo)) return 'transferencia'
  if (tipo === 'addi') return 'addi'
  if (tipo === 'sistecredito') return 'sistecredito'
  if (tipo === 'bold') return 'bold'
  if (tipo === 'credito') return 'credito'
  return 'efectivo'
}

function emptyData(sede: 'TR' | 'CR' | 'SR', numeroSugerido: string, asesorNombre: string): ParsedPedido {
  return {
    formato_version: '1',
    sede,
    numero_orden_sugerido: numeroSugerido,
    asesor: asesorNombre,
    cliente_nombre: '',
    cliente_doc: null,
    cliente_telefono: '',
    productos: [{ marca: '', descripcion: '', talla: null, cantidad: 1, precio_venta: 0, color: null, sexo: null, categoria: null }],
    total: 0,
    abono: 0,
    metodo_pago_abono: 'efectivo',
    cuenta_id_abono: null,
    tipo_entrega: 'sede',
    direccion: null,
    notas: null,
  }
}

export function CrearPedidoForm({ numeroSugerido, asesorNombre, sedeId, cuentas }: CrearPedidoFormProps) {
  const sedeCode = numeroSugerido.slice(0, 2) as 'TR' | 'CR' | 'SR'

  const [form, setForm]               = useState<ParsedPedido>(() => emptyData(sedeCode, numeroSugerido, asesorNombre))
  const [numeroOrden, setNumeroOrden] = useState(numeroSugerido)
  const [texto, setTexto]             = useState('')
  const [errorParser, setErrorParser] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [siguienteNumero, setSiguienteNumero] = useState<string | null>(null)
  const [advertencias, setAdvertencias] = useState<string[]>([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [resultadosCliente, setResultadosCliente] = useState<ClienteBusqueda[]>([])
  const [ultimaDireccion, setUltimaDireccion] = useState<string | null>(null)
  const [pedidoCreado, setPedidoCreado] = useState<{ id: string; numero: string } | null>(null)

  // Per-product search state
  const [codigoQuery, setCodigoQuery]   = useState<string[]>([''])
  const [searchOpts, setSearchOpts]     = useState<OpcionCatalogo[][]>([[]])
  const [searchOpen, setSearchOpen]     = useState<boolean[]>([false])
  const [searchDone, setSearchDone]     = useState<boolean[]>([false])
  const [catalogSaving, setCatalogSaving] = useState<Set<number>>(new Set())
  const [catalogError, setCatalogError] = useState<(string | null)[]>([null])
  const searchTimersRef = useRef<(ReturnType<typeof setTimeout> | null)[]>([null])

  const [isPending, startTransition] = useTransition()
  const activeProductIdxRef = useRef(0)
  const patchProductoRef = useRef(patchProducto)
  useEffect(() => { patchProductoRef.current = patchProducto })

  // Paste global de imágenes
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      for (const item of Array.from(e.clipboardData?.items ?? [])) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          const url = await uploadPedidoImage(file)
          if (url) patchProductoRef.current(activeProductIdxRef.current, { imagen_url: url })
          break
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  // Buscar cliente por nombre/celular
  useEffect(() => {
    if (busquedaCliente.trim().length < 2) { setResultadosCliente([]); return }
    const t = setTimeout(async () => {
      const res = await buscarClientesAction(busquedaCliente)
      setResultadosCliente(res)
    }, 300)
    return () => clearTimeout(t)
  }, [busquedaCliente])

  function seleccionarCliente(c: ClienteBusqueda) {
    setForm(f => ({ ...f, cliente_nombre: c.nombre, cliente_telefono: c.telefono_normalizado }))
    setUltimaDireccion(c.ultima_direccion ?? null)
    setBusquedaCliente('')
    setResultadosCliente([])
  }

  function updateField<K extends keyof ParsedPedido>(field: K, value: ParsedPedido[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function patchProducto(idx: number, patch: Partial<ParsedPedido['productos'][number]>) {
    setForm(prev => ({
      ...prev,
      productos: prev.productos.map((p, i) => i === idx ? { ...p, ...patch } : p),
    }))
  }

  function handleCodigoChange(idx: number, val: string) {
    setCodigoQuery(prev => prev.map((c, i) => i === idx ? val : c))
    patchProducto(idx, { articulo_id: null })
    if (searchTimersRef.current[idx]) clearTimeout(searchTimersRef.current[idx]!)
    setSearchDone(prev => prev.map((d, i) => i === idx ? false : d))
    setCatalogError(prev => prev.map((e, i) => i === idx ? null : e))

    const q = val.trim()
    if (q.length < 2) {
      setSearchOpts(prev => prev.map((o, i) => i === idx ? [] : o))
      setSearchOpen(prev => prev.map((o, i) => i === idx ? false : o))
      return
    }
    searchTimersRef.current[idx] = setTimeout(async () => {
      const arts = await buscarArticulosAction(q, sedeId)
      const opts = aplanarOpciones(arts)
      setSearchOpts(prev => prev.map((o, i) => i === idx ? opts : o))
      setSearchOpen(prev => prev.map((o, i) => i === idx ? opts.length > 0 : o))
      setSearchDone(prev => prev.map((d, i) => i === idx ? true : d))
    }, 250)
  }

  async function crearEnCatalogo(idx: number) {
    const p = form.productos[idx]
    const codigo = codigoQuery[idx]?.trim()
    if (!codigo || !p.descripcion.trim() || !p.marca.trim()) return

    setCatalogSaving(prev => new Set([...prev, idx]))
    setCatalogError(prev => prev.map((e, i) => i === idx ? null : e))

    const result = await crearArticuloAction({
      codigo,
      nombre:      p.descripcion.trim(),
      marca:       p.marca.trim(),
      referencia:  '',
      color:       (p as any).color?.trim() ?? '',
      sexo:        ((p as any).sexo ?? '') as any,
      categoria:   ((p as any).categoria ?? '') as any,
      descripcion: '',
    })

    setCatalogSaving(prev => { const s = new Set(prev); s.delete(idx); return s })
    if (result.ok) {
      patchProducto(idx, { articulo_id: result.articuloId })
      setSearchDone(prev => prev.map((d, i) => i === idx ? false : d))
    } else {
      setCatalogError(prev => prev.map((e, i) => i === idx ? result.error : e))
    }
  }

  function closeSearch(idx: number) {
    setSearchOpen(prev => prev.map((o, i) => i === idx ? false : o))
  }

  function elegirArticulo(idx: number, opt: OpcionCatalogo) {
    setCodigoQuery(prev => prev.map((c, i) => i === idx ? (opt.codigo ?? prev[idx]) : c))
    setSearchOpen(prev => prev.map((o, i) => i === idx ? false : o))
    patchProducto(idx, {
      articulo_id: opt.articulo_id,
      marca:       opt.marca,
      descripcion: opt.nombre,
      talla:       opt.talla ?? form.productos[idx].talla,
      color:       opt.color ?? null,
      sexo:        (opt.sexo as any) ?? null,
    })
  }

  function addProducto() {
    setForm(prev => ({
      ...prev,
      productos: [...prev.productos, { marca: '', descripcion: '', talla: null, cantidad: 1, precio_venta: 0, color: null, sexo: null, categoria: null }],
    }))
    setCodigoQuery(prev => [...prev, ''])
    setSearchOpts(prev => [...prev, []])
    setSearchOpen(prev => [...prev, false])
    setSearchDone(prev => [...prev, false])
    setCatalogError(prev => [...prev, null])
    searchTimersRef.current = [...searchTimersRef.current, null]
  }

  function removeProducto(idx: number) {
    setForm(prev => ({ ...prev, productos: prev.productos.filter((_, j) => j !== idx) }))
    setCodigoQuery(prev => prev.filter((_, j) => j !== idx))
    setSearchOpts(prev => prev.filter((_, j) => j !== idx))
    setSearchOpen(prev => prev.filter((_, j) => j !== idx))
    setSearchDone(prev => prev.filter((_, j) => j !== idx))
    setCatalogError(prev => prev.filter((_, j) => j !== idx))
    searchTimersRef.current = searchTimersRef.current.filter((_, j) => j !== idx)
  }

  function handleParsear() {
    const result = parsearPedido(texto)
    if (!result.ok) { setErrorParser(result.error); return }
    setErrorParser(null)
    setAdvertencias(result.warnings ?? [])
    setForm(result.data)
    setCodigoQuery(result.data.productos.map(() => ''))
    setSearchOpts(result.data.productos.map(() => []))
    setSearchOpen(result.data.productos.map(() => false))
    setSearchDone(result.data.productos.map(() => false))
    setCatalogError(result.data.productos.map(() => null))
    searchTimersRef.current = result.data.productos.map(() => null)
    if (result.data.numero_orden_sugerido) setNumeroOrden(result.data.numero_orden_sugerido)
    if (result.data.cliente_telefono) {
      buscarDireccionPorTelefonoAction(result.data.cliente_telefono).then(dir => setUltimaDireccion(dir))
    }
  }

  function handleConfirmar() {
    setErrorAccion(null)
    setSiguienteNumero(null)
    if (!form.cliente_nombre.trim()) { setErrorAccion('El nombre del cliente es obligatorio'); return }
    if (!form.cliente_telefono.trim()) { setErrorAccion('El celular del cliente es obligatorio'); return }
    if (form.productos.find(p => !p.descripcion.trim())) { setErrorAccion('Todos los artículos deben tener nombre'); return }
    if (form.abono > 0 && !(form as any).cuenta_id_abono) { setErrorAccion('Selecciona la cuenta donde se recibió el abono'); return }

    startTransition(async () => {
      const result = await crearPedidoDesdeDataAction(form, numeroOrden)
      if (!result.ok) {
        setErrorAccion(result.error)
        if (result.siguienteNumero) setSiguienteNumero(result.siguienteNumero)
      } else {
        setPedidoCreado({ id: result.pedidoId, numero: numeroOrden })
      }
    })
  }

  const total = form.productos.reduce((s, p) => s + p.precio_venta * p.cantidad, 0)
  const saldo = total - (form.abono ?? 0)

  if (pedidoCreado) {
    return <PedidoSuccessOverlay pedidoId={pedidoCreado.id} numeroOrden={pedidoCreado.numero} />
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

      {/* ── COLUMNA IZQUIERDA: formulario ─────────────────────────────── */}
      <div className="lg:col-span-2 space-y-5">

        {advertencias.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
            <p className="font-medium mb-1">Completa los campos faltantes:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {advertencias.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Número de orden */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Número de orden</label>
          <input
            type="text"
            value={numeroOrden}
            onChange={e => { setNumeroOrden(e.target.value.toUpperCase()); setErrorAccion(null); setSiguienteNumero(null) }}
            className="font-mono font-bold text-lg border border-gray-300 rounded-lg px-3 py-2 w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">Puedes cambiarlo. El sistema valida que no exista.</p>
        </div>

        {/* Cliente */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cliente</p>

          <div className="relative">
            <input
              type="text"
              value={busquedaCliente}
              onChange={e => setBusquedaCliente(e.target.value)}
              onBlur={() => setTimeout(() => setResultadosCliente([]), 150)}
              placeholder="Buscar cliente existente (nombre o celular)..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {resultadosCliente.length > 0 && (
              <ul className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-auto">
                {resultadosCliente.map(c => (
                  <li key={c.id} onMouseDown={() => seleccionarCliente(c)}
                    className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 last:border-0">
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
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
              <input type="text" value={form.cliente_nombre}
                onChange={e => updateField('cliente_nombre', e.target.value)}
                placeholder="Nombre completo"
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Celular *</label>
              <input type="text" value={form.cliente_telefono}
                onChange={e => updateField('cliente_telefono', e.target.value)}
                placeholder="3001234567"
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <p className="text-xs text-gray-400">Asesor: {asesorNombre} · Sede: {form.sede}</p>
        </div>

        {/* Entrega */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Entrega</p>
          <div className="flex gap-2">
            {(['sede', 'domicilio'] as const).map(t => (
              <button key={t} type="button" onClick={() => updateField('tipo_entrega', t)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium capitalize transition-colors ${
                  form.tipo_entrega === t
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
                }`}>
                {t}
              </button>
            ))}
          </div>
          {form.tipo_entrega === 'domicilio' && (
            <div>
              {ultimaDireccion && !form.direccion && (
                <button type="button" onClick={() => updateField('direccion', ultimaDireccion)}
                  className="mb-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                  📍 Usar dirección anterior: <span className="font-normal">{ultimaDireccion}</span>
                </button>
              )}
              <input type="text" value={form.direccion ?? ''}
                onChange={e => updateField('direccion', e.target.value || null)}
                placeholder="Calle 10 # 5-20, Barrio…"
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
        </div>

        {/* Productos */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Productos</p>
            <button type="button" onClick={addProducto}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              + Agregar producto
            </button>
          </div>

          <div className="space-y-3">
            {form.productos.map((p, i) => (
              <div key={i}
                className="border border-gray-100 rounded-lg p-3 space-y-2"
                onMouseDown={() => { activeProductIdxRef.current = i }}>

                {/* Fila 1: Código (live search) · Nombre del producto */}
                <div className="grid grid-cols-[1fr_2fr] gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={codigoQuery[i] ?? ''}
                      onChange={e => handleCodigoChange(i, e.target.value.toUpperCase())}
                      onBlur={() => setTimeout(() => closeSearch(i), 150)}
                      placeholder="Código"
                      className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {searchOpen[i] && searchOpts[i]?.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                        {searchOpts[i].map(opt => (
                          <button
                            key={`${opt.articulo_id}-${opt.talla ?? ''}`}
                            type="button"
                            onMouseDown={() => elegirArticulo(i, opt)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0 flex justify-between items-center"
                          >
                            <span>
                              {opt.codigo && <span className="font-mono text-gray-400 text-xs mr-1">{opt.codigo}</span>}
                              <span className="font-medium text-gray-900">{opt.marca} {opt.nombre}</span>
                              {opt.color && <span className="text-gray-400"> · {opt.color}</span>}
                              {opt.talla && <span className="text-gray-400"> · T{opt.talla}</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={p.descripcion}
                    onChange={e => patchProducto(i, { descripcion: e.target.value, marca: '' })}
                    placeholder="Nombre del producto"
                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* No encontrado en catálogo → guardar */}
                {searchDone[i] && searchOpts[i]?.length === 0 && (codigoQuery[i]?.trim().length ?? 0) >= 2 && !(p as any).articulo_id && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => crearEnCatalogo(i)}
                      disabled={catalogSaving.has(i) || !p.descripcion.trim() || !p.marca.trim()}
                      className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1 hover:bg-green-100 disabled:opacity-40 transition-colors"
                    >
                      {catalogSaving.has(i) ? 'Guardando...' : 'Guardar'}
                    </button>
                    {(!p.descripcion.trim() || !p.marca.trim()) && (
                      <span className="text-xs text-gray-400">Completa nombre y marca primero</span>
                    )}
                    {catalogError[i] && <span className="text-xs text-red-600">{catalogError[i]}</span>}
                  </div>
                )}

                {/* Enlazado al catálogo */}
                {(p as any).articulo_id && (
                  <p className="text-xs text-green-600 font-medium">✓ Enlazado al catálogo</p>
                )}

                {/* Fila 2: Marca · Talla · Cant · X */}
                <div className="grid grid-cols-[2fr_1fr_auto_auto] gap-2 items-center">
                  <input
                    type="text"
                    value={p.marca}
                    onChange={e => patchProducto(i, { marca: e.target.value })}
                    placeholder="Marca"
                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={p.talla ?? ''}
                    onChange={e => patchProducto(i, { talla: e.target.value || null })}
                    placeholder="Talla"
                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    min={1}
                    value={p.cantidad}
                    onChange={e => patchProducto(i, { cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {form.productos.length > 1
                    ? <button type="button" onClick={() => removeProducto(i)} className="text-red-400 hover:text-red-600 px-1" title="Quitar">✕</button>
                    : <div className="w-6" />
                  }
                </div>

                {/* Fila 3: Color · Sexo · Categoría */}
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    value={(p as any).color ?? ''}
                    onChange={e => patchProducto(i, { color: e.target.value || null })}
                    placeholder="Color"
                    className="w-28 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {(['hombre', 'mujer', 'nino'] as const).map(s => (
                    <button key={s} type="button"
                      onClick={() => patchProducto(i, { sexo: (p as any).sexo === s ? null : s })}
                      className={`text-xs px-2 py-1.5 rounded border font-medium transition-colors ${
                        (p as any).sexo === s
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      {s === 'nino' ? 'Niño' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                  {(['ropa', 'tenis', 'accesorios'] as const).map(c => (
                    <button key={c} type="button"
                      onClick={() => patchProducto(i, { categoria: (p as any).categoria === c ? null : c })}
                      className={`text-xs px-2 py-1.5 rounded border font-medium transition-colors ${
                        (p as any).categoria === c
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Fila 4: Precio · Imagen */}
                <div className="flex gap-2 items-end">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={p.precio_venta ? String(p.precio_venta) : ''}
                    onChange={e => patchProducto(i, { precio_venta: parseInt(e.target.value.replace(/\D/g, '')) || 0 })}
                    placeholder="Precio de venta"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <ImagenProducto
                    value={p.imagen_url ?? null}
                    onChange={url => patchProducto(i, { imagen_url: url ?? null })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Abono */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Abono</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Monto del abono</label>
            <input type="number" min={0}
              value={form.abono === 0 ? '' : form.abono}
              onChange={e => updateField('abono', parseInt(e.target.value) || 0)}
              placeholder="0"
              className="max-w-[180px] border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cuenta de pago</label>
            <select
              value={(form as any).cuenta_id_abono ?? ''}
              onChange={e => {
                const cuentaId = e.target.value || null
                const cuenta = cuentas.find(c => c.id === cuentaId)
                setForm(f => ({
                  ...f,
                  cuenta_id_abono: cuentaId,
                  metodo_pago_abono: cuenta ? metodoDeCuenta(cuenta.tipo) : 'efectivo',
                }))
              }}
              className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Seleccionar cuenta —</option>
              {cuentas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total pedido</span>
              <span className="font-semibold text-gray-900">{formatCOP(total)}</span>
            </div>
            {form.abono > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Abono ({form.metodo_pago_abono})</span>
                <span className="text-green-700">− {formatCOP(form.abono)}</span>
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
        </div>

        {/* Notas */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Notas (opcional)</label>
          <input type="text" value={form.notas ?? ''}
            onChange={e => updateField('notas', e.target.value || null)}
            placeholder="Instrucciones especiales, referencias…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Error + botón confirmar */}
        {errorAccion && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 space-y-2">
            <p>{errorAccion}</p>
            {siguienteNumero && (
              <div className="flex items-center gap-3">
                <span>Próximo disponible: <strong className="font-mono">{siguienteNumero}</strong></span>
                <button onClick={() => { setNumeroOrden(siguienteNumero); setSiguienteNumero(null); setErrorAccion(null) }}
                  className="underline font-medium hover:text-red-900">
                  Usar este número
                </button>
              </div>
            )}
          </div>
        )}

        <Button onClick={handleConfirmar} disabled={isPending} size="md" className="w-full">
          {isPending ? 'Guardando pedido…' : `Confirmar y crear pedido ${numeroOrden}`}
        </Button>
      </div>

      {/* ── COLUMNA DERECHA: panel pegar resumen ──────────────────────── */}
      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3 sticky top-6">
          <div>
            <p className="text-sm font-semibold text-blue-900">Pegar resumen</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Pega el texto del pedido y presiona el botón — los campos se rellenan automáticamente.
            </p>
          </div>
          <textarea
            value={texto}
            onChange={e => { setTexto(e.target.value); setErrorParser(null) }}
            rows={12}
            placeholder={`TR5946\nJuan Pérez\n3001234567\nNike Air Max 95 negro\nTalla 40\n350.000\nAbono: 100.000\nTransferencia`}
            className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          {errorParser && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorParser}</p>
          )}
          <button
            type="button"
            onClick={handleParsear}
            disabled={texto.trim().length < 5}
            className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Llenar formulario →
          </button>
        </div>
      </div>

    </div>
  )
}
