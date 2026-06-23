'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { parsearPedido } from '@/lib/parser'
import { ParsedPedido, MetodoPago } from '@/types'
import { formatCOP } from '@/lib/utils/format'
import { crearPedidoDesdeDataAction } from '@/app/actions/pedidos'
import { buscarClientesAction, buscarDireccionPorTelefonoAction, ClienteBusqueda } from '@/app/actions/clientes'
import { buscarPorCodigoAction } from '@/app/actions/articulos'
import { Button } from '@/components/ui/Button'
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

const METODOS: { value: MetodoPago; label: string }[] = [
  { value: 'efectivo',      label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'credito',       label: 'Crédito' },
  { value: 'addi',          label: 'Addi' },
  { value: 'bold',          label: 'Bold' },
  { value: 'sistecredito',  label: 'Sistecredito' },
]

function emptyData(sede: 'TR' | 'CR' | 'SR', numeroSugerido: string, asesorNombre: string): ParsedPedido {
  return {
    formato_version: '1',
    sede,
    numero_orden_sugerido: numeroSugerido,
    asesor: asesorNombre,
    cliente_nombre: '',
    cliente_doc: null,
    cliente_telefono: '',
    productos: [{ marca: '', descripcion: '', talla: null, cantidad: 1, precio_venta: 0 }],
    total: 0,
    abono: 0,
    metodo_pago_abono: 'efectivo',
    tipo_entrega: 'sede',
    direccion: null,
    notas: null,
  }
}

export function CrearPedidoForm({ numeroSugerido, asesorNombre }: CrearPedidoFormProps) {
  const sedeCode = numeroSugerido.slice(0, 2) as 'TR' | 'CR' | 'SR'

  const [form, setForm]           = useState<ParsedPedido>(() => emptyData(sedeCode, numeroSugerido, asesorNombre))
  const [numeroOrden, setNumeroOrden] = useState(numeroSugerido)
  const [texto, setTexto]         = useState('')
  const [errorParser, setErrorParser] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [siguienteNumero, setSiguienteNumero] = useState<string | null>(null)
  const [advertencias, setAdvertencias] = useState<string[]>([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [resultadosCliente, setResultadosCliente] = useState<ClienteBusqueda[]>([])
  const [ultimaDireccion, setUltimaDireccion] = useState<string | null>(null)
  const [pedidoCreado, setPedidoCreado] = useState<{ id: string; numero: string } | null>(null)
  const [codigos, setCodigos]     = useState<string[]>([''])
  const [catalogLinks, setCatalogLinks] = useState<(CatalogLink | null)[]>([null])
  const [isPending, startTransition] = useTransition()

  const activeProductIdxRef = useRef(0)
  const updateFormRef = useRef(updateProducto)
  useEffect(() => { updateFormRef.current = updateProducto })

  // Paste global de imágenes
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      for (const item of Array.from(e.clipboardData?.items ?? [])) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          const url = await uploadPedidoImage(file)
          if (url) updateFormRef.current(activeProductIdxRef.current, 'imagen_url', url)
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

  function updateProducto(idx: number, field: string, value: string | number | null) {
    setForm(prev => {
      const productos = prev.productos.map((p, i) =>
        i === idx ? { ...p, [field]: value } : p
      )
      return { ...prev, productos }
    })
  }

  function setCodigo(idx: number, val: string) {
    setCodigos(prev => prev.map((c, i) => i === idx ? val : c))
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
    if (!form.productos[idx].marca) updateProducto(idx, 'marca', art.marca)
    updateProducto(idx, 'articulo_id', art.id)
  }

  function handleParsear() {
    const result = parsearPedido(texto)
    if (!result.ok) {
      setErrorParser(result.error)
      return
    }
    setErrorParser(null)
    setAdvertencias(result.warnings ?? [])
    setForm(result.data)
    setCodigos(result.data.productos.map(() => ''))
    setCatalogLinks(result.data.productos.map(() => null))
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

          {/* Buscador */}
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
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Productos</p>
          <div className="space-y-3">
            {form.productos.map((p, i) => {
              const link = catalogLinks[i]
              return (
                <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2"
                  onMouseDown={() => { activeProductIdxRef.current = i }}>

                  {/* Código SKU */}
                  <div className="flex items-center gap-2">
                    <div className="w-36">
                      <label className="block text-xs text-gray-500 mb-0.5">Código SKU</label>
                      <input type="text" value={codigos[i] ?? ''}
                        onChange={e => setCodigo(i, e.target.value.toUpperCase())}
                        onBlur={() => lookupCodigo(i)}
                        placeholder="ej. VOMERO5"
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
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

                  {/* Foto + campos */}
                  <div className="flex gap-2">
                    <ImagenProducto
                      value={p.imagen_url ?? null}
                      onChange={url => updateProducto(i, 'imagen_url', url ?? '')}
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-0.5">Descripción para el cliente</label>
                          <input type="text"
                            value={[p.marca, p.descripcion].filter(Boolean).join(' ')}
                            onChange={e => { updateProducto(i, 'marca', ''); updateProducto(i, 'descripcion', e.target.value) }}
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="w-20">
                          <label className="block text-xs text-gray-500 mb-0.5">Talla</label>
                          <input type="text"
                            value={p.talla ?? ''}
                            onChange={e => updateProducto(i, 'talla', e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div className="max-w-[160px]">
                        <label className="block text-xs text-gray-500 mb-0.5">Precio</label>
                        <input type="number" min={0}
                          value={p.precio_venta === 0 ? '' : p.precio_venta}
                          onChange={e => updateProducto(i, 'precio_venta', parseInt(e.target.value) || 0)}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                  </div>

                  {form.productos.length > 1 && (
                    <button type="button"
                      onClick={() => {
                        setForm(prev => ({ ...prev, productos: prev.productos.filter((_, j) => j !== i) }))
                        setCodigos(prev => prev.filter((_, j) => j !== i))
                        setCatalogLinks(prev => prev.filter((_, j) => j !== i))
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
              setForm(prev => ({ ...prev, productos: [...prev.productos, { marca: '', descripcion: '', talla: null, cantidad: 1, precio_venta: 0 }] }))
              setCodigos(prev => [...prev, ''])
              setCatalogLinks(prev => [...prev, null])
            }}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            + Agregar producto
          </button>
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
            <label className="block text-xs text-gray-500 mb-2">Método de pago</label>
            <div className="flex flex-wrap gap-2">
              {METODOS.map(m => (
                <button key={m.value} type="button"
                  onClick={() => updateField('metodo_pago_abono', m.value)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                    form.metodo_pago_abono === m.value
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Totales */}
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
