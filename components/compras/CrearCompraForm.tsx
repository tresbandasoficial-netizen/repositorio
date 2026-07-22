'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { crearCompraAction, CrearCompraInput, CompraItemInput, buscarPedidoPorOrdenAction } from '@/app/actions/compras'
import { parsearFacturaAction, FacturaExtraida } from '@/app/actions/parsear-factura'
import { buscarPorCodigoAction } from '@/app/actions/articulos'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { MarcaSelect } from '@/components/ui/MarcaSelect'
import { formatCOP, formatMiles, hoyBogota } from '@/lib/utils/format'

type Paso = 'subir' | 'revisar' | 'guardando'

type ItemForm = {
  codigo: string
  descripcion: string
  marca: string
  talla: string
  cantidad: string
  precio_usd?: number | null
  costo_unitario_cop: string
  destino: 'pedido' | 'contoda' | 'sin_asignar'
  // estado del lookup de catálogo
  articuloId?: string | null
  articuloEncontrado?: boolean   // true=encontrado, false=nuevo, undefined=sin buscar
  // asignación directa a pedido
  pedidoRef?: string
  pedidoOk?: boolean             // true=encontrado, false=no existe/bloqueado, undefined=sin buscar
  pedidoCliente?: string | null
  pedidoAviso?: string | null    // motivo del bloqueo (ej: ya tiene compra asignada)
}

function facturaToItems(items: FacturaExtraida['items'], moneda: 'USD' | 'COP'): ItemForm[] {
  const result: ItemForm[] = []
  for (const i of items) {
    const cantidad = i.cantidad || 1
    const precioLinea = i.precio_usd ?? 0
    const precioUnitUsd = moneda === 'USD' ? (precioLinea / cantidad) : null
    const costoUnitCop = moneda === 'COP' && precioLinea
      ? String(Math.round(precioLinea / cantidad))
      : ''
    for (let n = 0; n < cantidad; n++) {
      result.push({
        codigo: i.codigo ?? '',
        descripcion: i.descripcion,
        marca: i.marca,
        talla: i.talla,
        cantidad: '1',
        precio_usd: precioUnitUsd,
        costo_unitario_cop: costoUnitCop,
        destino: 'sin_asignar',
      })
    }
  }
  return result
}

type CuentaOpc = { id: string; nombre: string; tipo: string; sede_id: string | null }

export function CrearCompraForm({ cuentas, proveedores = [], pedidosIniciales = [] }: { cuentas: CuentaOpc[]; proveedores?: string[]; pedidosIniciales?: string[] }) {
  const [paso, setPaso] = useState<Paso>('subir')
  const [factura, setFactura] = useState<FacturaExtraida | null>(null)
  const [cargandoPedidos, setCargandoPedidos] = useState(pedidosIniciales.length > 0)

  // Campos de la factura
  const [tipo, setTipo] = useState<'usa' | 'colombia'>('usa')
  const [cuentaId, setCuentaId] = useState<string>('')
  const [proveedor, setProveedor] = useState('')
  const [numeroFactura, setNumeroFactura] = useState('')
  const [fecha, setFecha] = useState(hoyBogota())
  const [totalUsd, setTotalUsd] = useState('')
  const [totalCopPagado, setTotalCopPagado] = useState('')
  const [subtotalUsd, setSubtotalUsd] = useState('')
  const [impuestosUsd, setImpuestosUsd] = useState('')
  const [envioUsd, setEnvioUsd] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemForm[]>([])

  const [error, setError] = useState<string | null>(null)
  const [isParsing, startParsing] = useTransition()
  const [isSaving, startSaving] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Pedidos/artículos seleccionados desde la galería
  // (?pedidos=TR6821,TR6835-2,TR6835-4): se abre directo el formulario con
  // filas prellenadas. "TR6835-2" = solo el 2º artículo del pedido TR6835;
  // sin sufijo = todos los artículos del pedido.
  useEffect(() => {
    if (pedidosIniciales.length === 0) return
    let cancelado = false
    ;(async () => {
      const filas: ItemForm[] = []
      const avisos: string[] = []
      for (const num of pedidosIniciales) {
        const idxSufijo = num.match(/-(\d+)$/) ? parseInt(num.match(/-(\d+)$/)![1], 10) - 1 : null
        const pedido = await buscarPedidoPorOrdenAction(num)
        if (cancelado) return
        if (!pedido) { avisos.push(`${num}: no existe`); continue }
        const compraCompleta = pedido.unidades_pedido > 0 &&
          pedido.unidades_compradas >= pedido.unidades_pedido
        if (compraCompleta) { avisos.push(`${pedido.numero_orden}: ya tiene su compra asignada`); continue }
        // Si el número con sufijo ES un pedido real (separado por artículos),
        // se toman todos sus artículos; si no, el sufijo indica "artículo N".
        const esParteReal = pedido.numero_orden.toUpperCase() === num.toUpperCase()
        const itemsPedido = (idxSufijo !== null && !esParteReal)
          ? [pedido.items?.[idxSufijo] ?? null]
          : (pedido.items?.length ? pedido.items : [null])
        for (const prod of itemsPedido) {
          filas.push({
            codigo:             prod?.codigo ?? '',
            descripcion:        prod?.descripcion ?? '',
            marca:              prod?.marca ?? '',
            talla:              prod?.talla ?? '',
            cantidad:           '1',
            costo_unitario_cop: '',
            destino:            'pedido',
            // Con sufijo se conserva (TR6835-2) para que la compra quede
            // asignada exactamente a ese artículo del pedido.
            pedidoRef:          esParteReal ? pedido.numero_orden : (idxSufijo !== null ? num : pedido.numero_orden),
            pedidoOk:           true,
            pedidoCliente:      pedido.cliente_nombre,
            articuloId:         prod?.articulo_id ?? null,
            articuloEncontrado: prod?.articulo_id ? true : undefined,
          })
        }
      }
      if (cancelado) return
      if (filas.length > 0) {
        setItems(filas)
        setPaso('revisar')
      }
      if (avisos.length > 0) setError(`No se agregaron — ${avisos.join(' · ')}`)
      setCargandoPedidos(false)
    })()
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // TRM calculada automáticamente
  const trmCalculada =
    tipo === 'usa' && totalUsd && totalCopPagado
      ? Math.round(parseFloat(totalCopPagado.replace(/\D/g, '')) / parseFloat(totalUsd))
      : null

  const totalCopNum = parseInt(totalCopPagado.replace(/\D/g, ''), 10) || 0

  // Recalcular costos COP usando tasas reales de tax y envío
  function recalcularCostos(trm: number, taxUsd: number, shippingUsd: number) {
    setItems(prev => {
      const subtotal = prev.reduce((s, item) => s + (item.precio_usd ?? 0), 0)
      const taxRate = subtotal > 0 ? taxUsd / subtotal : 0
      const shippingRate = subtotal > 0 ? shippingUsd / subtotal : 0
      return prev.map(item => {
        if (!item.precio_usd) return item
        const cantidad = parseInt(item.cantidad, 10) || 1
        const unitPriceUsd = item.precio_usd / cantidad
        const realCostUsd = unitPriceUsd * (1 + taxRate + shippingRate)
        return { ...item, costo_unitario_cop: String(Math.round(realCostUsd * trm)) }
      })
    })
  }

  function agregarItem() {
    setItems((prev) => [
      ...prev,
      { codigo: '', descripcion: '', marca: '', talla: '', cantidad: '1', precio_usd: null, costo_unitario_cop: '', destino: 'sin_asignar' },
    ])
  }

  function eliminarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function actualizarItem(idx: number, campo: keyof ItemForm, valor: string) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [campo]: valor } : item)))
  }

  // Busca el pedido por número, valida la asignación y autollena el artículo
  // (código, descripción, marca, talla) con el producto que pidió el cliente.
  async function buscarPedidoRef(idx: number, ref: string) {
    const r = ref.trim()
    if (!r) {
      setItems(prev => prev.map((item, i) => i === idx ? { ...item, pedidoOk: undefined, pedidoCliente: null } : item))
      return
    }
    const pedido = await buscarPedidoPorOrdenAction(r)
    // Índice del producto dentro del pedido: "TR6455-2" → 2º producto; si no, el 1º.
    const m = r.toUpperCase().match(/-(\d+)$/)
    const itemIdx = m ? parseInt(m[1], 10) - 1 : 0
    const prod = pedido?.items?.[itemIdx] ?? pedido?.items?.[0] ?? null

    // Bloqueo: el pedido ya tiene su compra completa asignada (no duplicar costo).
    const compraCompleta = !!pedido && pedido.unidades_pedido > 0 &&
      pedido.unidades_compradas >= pedido.unidades_pedido

    setItems(prev => {
      const actualizado = prev.map((item, i) => {
        if (i !== idx) return item
        if (!pedido) return { ...item, pedidoOk: false, pedidoCliente: null, pedidoAviso: null }
        if (compraCompleta) return {
          ...item,
          pedidoOk: false,
          pedidoCliente: null,
          pedidoAviso: `El pedido ${pedido.numero_orden} YA tiene su compra asignada (${pedido.unidades_compradas} de ${pedido.unidades_pedido} unidades) — no se puede asignar otra vez.`,
        }
        return {
          ...item,
          pedidoOk: true,
          pedidoAviso: null,
          pedidoCliente: pedido.cliente_nombre,
          // Autollenar con los datos del producto del pedido (si los tiene).
          ...(prod ? {
            codigo:      prod.codigo || item.codigo,
            descripcion: prod.descripcion || item.descripcion,
            marca:       prod.marca || item.marca,
            talla:       prod.talla || item.talla,
            articuloId:  prod.articulo_id ?? item.articuloId ?? null,
            articuloEncontrado: prod.articulo_id ? true : item.articuloEncontrado,
          } : {}),
        }
      })

      // Si el pedido tiene VARIOS artículos y es la primera fila que se le
      // asigna, abrir automáticamente una fila por cada artículo restante
      // (prellenada), para que la compra cubra el pedido completo.
      if (pedido && !compraCompleta && !m && (pedido.items?.length ?? 0) > 1) {
        const base = r.toUpperCase().replace(/-(\d+)$/, '')
        const filasDeEstePedido = actualizado.filter(it =>
          (it.pedidoRef ?? '').toUpperCase().replace(/-(\d+)$/, '') === base
        ).length
        if (filasDeEstePedido === 1) {
          const extras: ItemForm[] = pedido.items.slice(1).map((p2: any) => ({
            codigo:             p2.codigo ?? '',
            descripcion:        p2.descripcion ?? '',
            marca:              p2.marca ?? '',
            talla:              p2.talla ?? '',
            cantidad:           String(p2.cantidad || 1),
            costo_unitario_cop: '',
            destino:            'pedido' as const,
            pedidoRef:          base,
            pedidoOk:           true,
            pedidoCliente:      pedido.cliente_nombre,
            articuloId:         p2.articulo_id ?? null,
            articuloEncontrado: p2.articulo_id ? true : undefined,
          }))
          return [...actualizado.slice(0, idx + 1), ...extras, ...actualizado.slice(idx + 1)]
        }
      }
      return actualizado
    })
  }

  async function buscarPorCodigo(idx: number, codigo: string) {
    const cod = codigo.trim()
    if (!cod) {
      setItems(prev => prev.map((item, i) => i === idx ? { ...item, articuloId: null, articuloEncontrado: undefined } : item))
      return
    }
    const articulo = await buscarPorCodigoAction(cod)
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      if (articulo) {
        return {
          ...item,
          articuloId: articulo.id,
          articuloEncontrado: true,
          descripcion: articulo.nombre,
          marca: articulo.marca,
        }
      }
      return { ...item, articuloId: null, articuloEncontrado: false }
    }))
  }

  function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    const reader = new FileReader()
    reader.onload = () => {
      const base64Full = reader.result as string
      const base64 = base64Full.split(',')[1]
      const mediaType = file.type as any

      startParsing(async () => {
        const result = await parsearFacturaAction(base64, mediaType, tipo)
        if (!result.ok) {
          setError(result.error)
          return
        }

        const data = result.data
        setFactura(data)
        setProveedor(data.proveedor)
        setFecha(data.fecha)
        setNumeroFactura(data.numero_factura ?? '')
        if (tipo === 'colombia') {
          setTotalCopPagado(String(Math.round(data.total_usd)))
          setTotalUsd('')
          setSubtotalUsd('')
          setImpuestosUsd('')
          setEnvioUsd('')
        } else {
          setTotalUsd(String(data.total_usd))
          setSubtotalUsd(String(data.subtotal_usd || ''))
          setImpuestosUsd(String(data.tax_usd || ''))
          setEnvioUsd(String(data.shipping_usd || ''))
        }
        setItems(facturaToItems(data.items, tipo === 'colombia' ? 'COP' : 'USD'))
        setPaso('revisar')
      })
    }
    reader.readAsDataURL(file)
  }

  function handleConfirmar() {
    setError(null)

    if (!proveedor.trim()) { setError('El proveedor es obligatorio'); return }
    if (!numeroFactura.trim()) { setError('El número de factura es obligatorio — sin él no se puede controlar que no se registre dos veces'); return }
    if (!cuentaId) { setError('Selecciona la cuenta de pago: de dónde salió el dinero de esta compra'); return }
    // Total en COP: si no lo digitaron, se calcula solo sumando los productos
    // (costo unitario × cantidad). Así no se bloquea la compra por el campo.
    const totalItemsCop = items.reduce(
      (s, it) => s + ((parseInt(it.costo_unitario_cop, 10) || 0) * (parseInt(it.cantidad, 10) || 0)), 0)
    const totalCopFinal = totalCopNum > 0 ? totalCopNum : totalItemsCop
    // La suma de los productos debe cuadrar con el total de la factura.
    // Tolerancia SOLO para el redondeo USD→COP: $50 por producto (mín $200);
    // una diferencia de $1.000 ya es un dígito mal puesto y se bloquea.
    const toleranciaCuadre = Math.max(200, items.length * 50)
    if (totalCopNum > 0 && totalItemsCop > 0 && Math.abs(totalCopNum - totalItemsCop) > toleranciaCuadre) {
      setError(`La suma de los productos (${formatCOP(totalItemsCop)}) no cuadra con el total de la factura (${formatCOP(totalCopNum)}) — diferencia de ${formatCOP(Math.abs(totalCopNum - totalItemsCop))}. Revisa los costos, las cantidades o si hay una fila repetida.`)
      return
    }
    if (tipo === 'usa') {
      if (!totalUsd || parseFloat(totalUsd) <= 0) { setError('El total en USD es obligatorio'); return }
      if (!totalCopPagado || totalCopNum <= 0) { setError('Ingresa el total que pagaste en COP'); return }
    } else {
      if (totalCopFinal <= 0) { setError('Ingresa el total en COP o el costo de los productos'); return }
      if (totalCopNum <= 0) setTotalCopPagado(String(totalCopFinal))
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.codigo.trim()) { setError(`Producto ${i + 1}: el código del artículo (SKU) es obligatorio`); return }
      if (!item.descripcion.trim()) { setError(`Producto ${i + 1}: falta la descripción`); return }
      if (!parseInt(item.cantidad, 10)) { setError(`Producto ${i + 1}: cantidad inválida`); return }
    }

    const itemsValidos: CompraItemInput[] = items.map((item) => ({
      codigo:             item.codigo.trim() || undefined,
      descripcion:        item.descripcion.trim(),
      marca:              item.marca.trim(),
      talla:              item.talla.trim(),
      cantidad:           parseInt(item.cantidad, 10),
      costo_unitario_cop: parseInt(item.costo_unitario_cop.replace(/\D/g, ''), 10) || 0,
      destino:            item.destino,
      articulo_id:        item.articuloId ?? null,
      pedido_ref:         item.destino === 'pedido' ? (item.pedidoRef?.trim() || undefined) : undefined,
    }))

    const payload: CrearCompraInput = {
      tipo,
      proveedor: proveedor.trim(),
      fecha,
      numero_factura: numeroFactura.trim(),
      total_usd: tipo === 'usa' ? parseFloat(totalUsd) : null,
      trm: tipo === 'usa' ? (trmCalculada ?? null) : null,
      total_cop: totalCopFinal,
      notas,
      cuenta_id: cuentaId || null,
      items: itemsValidos,
    }

    startSaving(async () => {
      const result = await crearCompraAction(payload)
      if (!result.ok) setError(result.error)
      else router.push('/compras')
    })
  }

  // Pantalla de espera mientras se cargan los pedidos seleccionados en la galería
  if (cargandoPedidos && paso === 'subir') {
    return (
      <div className="max-w-xl">
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500 font-medium">
              Cargando {pedidosIniciales.length} pedido{pedidosIniciales.length !== 1 ? 's' : ''} seleccionado{pedidosIniciales.length !== 1 ? 's' : ''}…
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Paso 1: subir factura ───────────────────────────────────────────────────
  if (paso === 'subir') {
    return (
      <div className="max-w-xl space-y-4">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Nueva compra</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Tipo de factura */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">¿La factura es en...?</label>
              <div className="flex gap-2">
                {(['usa', 'colombia'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                      tipo === t
                        ? t === 'usa' ? 'bg-blue-600 text-white border-blue-600' : 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {t === 'usa' ? 'Dólares (USD)' : 'Pesos (COP)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Subir archivo */}
            <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors ${
              isParsing ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={handleArchivo}
                disabled={isParsing}
                className="hidden"
              />
              {isParsing ? (
                <>
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-blue-600 font-medium">Extrayendo datos de la factura...</p>
                </>
              ) : (
                <>
                  <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">Haz clic para subir la factura</p>
                    <p className="text-xs text-gray-400 mt-0.5">PDF, JPG o PNG</p>
                  </div>
                </>
              )}
            </label>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <p className="text-xs text-gray-400 text-center">
              También puedes{' '}
              <button
                type="button"
                onClick={() => { setItems([{ codigo: '', descripcion: '', marca: '', talla: '', cantidad: '1', costo_unitario_cop: '', destino: 'sin_asignar' }]); setPaso('revisar') }}
                className="underline hover:text-gray-600"
              >
                ingresar los datos manualmente
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Paso 2: revisar y confirmar ─────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-3xl">
      {factura && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800 flex items-center justify-between">
          <span>✓ Datos extraídos de la factura. Revisa y corrige si es necesario.</span>
          <button
            type="button"
            onClick={() => { setFecha(''); setPaso('subir'); setFactura(null); setError(null) }}
            className="text-xs underline text-green-700 hover:text-green-900 ml-4 shrink-0"
          >
            Subir otra
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Datos de la factura</h2>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Proveedor + Número de factura + Fecha */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Proveedor</label>
              <input
                type="text"
                list="lista-proveedores"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Escribe o elige un proveedor"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="lista-proveedores">
                {proveedores.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">N° Factura</label>
              <input
                type="text"
                value={numeroFactura}
                onChange={(e) => setNumeroFactura(e.target.value)}
                placeholder="INV-12345"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Montos */}
          {tipo === 'usa' ? (
            <div className="space-y-4">
              {/* Fila 1: Total USD | Total COP pagado | TRM calculada */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total USD (factura)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalUsd}
                    onChange={(e) => setTotalUsd(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total COP pagado</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatMiles(totalCopPagado)}
                    onChange={(e) => {
                      const cop = e.target.value.replace(/\D/g, '')
                      setTotalCopPagado(cop)
                      const usd = parseFloat(totalUsd)
                      const copNum = parseInt(cop, 10)
                      if (usd > 0 && copNum > 0) {
                        const trm = Math.round(copNum / usd)
                        recalcularCostos(trm, parseFloat(impuestosUsd) || 0, parseFloat(envioUsd) || 0)
                      }
                    }}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {totalCopNum > 0 && (
                    <p className="text-xs text-gray-400 mt-1">{formatCOP(totalCopNum)}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">TRM calculada</label>
                  <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                    {trmCalculada ? `$${trmCalculada.toLocaleString('es-CO')}` : '—'}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">COP por USD</p>
                </div>
              </div>

              {/* Fila 2: Subtotal USD | Impuestos USD | Envío USD */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Subtotal USD</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={subtotalUsd}
                    onChange={(e) => setSubtotalUsd(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Impuestos USD</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={impuestosUsd}
                    onChange={(e) => {
                      setImpuestosUsd(e.target.value)
                      if (trmCalculada) {
                        recalcularCostos(trmCalculada, parseFloat(e.target.value) || 0, parseFloat(envioUsd) || 0)
                      }
                    }}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Envío USD</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={envioUsd}
                    onChange={(e) => {
                      setEnvioUsd(e.target.value)
                      if (trmCalculada) {
                        recalcularCostos(trmCalculada, parseFloat(impuestosUsd) || 0, parseFloat(e.target.value) || 0)
                      }
                    }}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Tasas calculadas y botón recalcular */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {subtotalUsd && parseFloat(subtotalUsd) > 0 ? (
                    <>
                      Tasa impuestos: {(parseFloat(impuestosUsd || '0') / parseFloat(subtotalUsd) * 100).toFixed(2)}%
                      {' | '}
                      Tasa envío: {(parseFloat(envioUsd || '0') / parseFloat(subtotalUsd) * 100).toFixed(2)}%
                    </>
                  ) : null}
                </p>
                {trmCalculada && (
                  <button
                    type="button"
                    onClick={() => recalcularCostos(trmCalculada, parseFloat(impuestosUsd) || 0, parseFloat(envioUsd) || 0)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
                  >
                    Recalcular costos
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-xs">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total COP</label>
              <input
                type="text"
                inputMode="numeric"
                value={formatMiles(totalCopPagado)}
                onChange={(e) => setTotalCopPagado(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {totalCopNum > 0 && <p className="text-xs text-gray-400 mt-1">{formatCOP(totalCopNum)}</p>}
            </div>
          )}

          {/* Cuenta de pago */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Cuenta de pago *</label>
            <select
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Elige la cuenta… —</option>
              {cuentas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Cuenta desde la que salió el dinero de esta compra</p>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Observaciones sobre la factura..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Productos ({items.length})</h2>
            <button
              type="button"
              onClick={agregarItem}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Agregar
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, idx) => (
            <div key={idx} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
              {/* Fila 1: número + destino + N° de pedido (ARRIBA) + eliminar */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-gray-400 uppercase shrink-0">#{idx + 1}</span>
                <select
                  value={item.destino}
                  onChange={(e) => actualizarItem(idx, 'destino', e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="sin_asignar">Stock tienda</option>
                  <option value="pedido">Asignar a pedido</option>
                </select>
                {item.destino === 'pedido' && (
                  <div className="relative flex-1 min-w-32 max-w-44">
                    <input
                      type="text"
                      value={item.pedidoRef ?? ''}
                      onChange={(e) => actualizarItem(idx, 'pedidoRef', e.target.value.toUpperCase())}
                      onBlur={(e) => buscarPedidoRef(idx, e.target.value)}
                      placeholder="N° pedido: TR6492"
                      className={`w-full rounded-lg border px-2 py-1.5 text-xs font-mono bg-white focus:outline-none focus:ring-2 ${
                        item.pedidoOk === true  ? 'border-green-400 focus:ring-green-400' :
                        item.pedidoOk === false ? 'border-red-400 focus:ring-red-400' :
                        'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    {item.pedidoOk === true && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">✓</span>
                    )}
                    {item.pedidoOk === false && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">✗</span>
                    )}
                  </div>
                )}
                <div className="flex-1" />
                {items.length > 1 && (
                  <button type="button" onClick={() => eliminarItem(idx)} className="text-xs text-red-400 hover:text-red-600 shrink-0">
                    ✕
                  </button>
                )}
              </div>
              {item.destino === 'pedido' && item.pedidoOk === true && item.pedidoCliente && (
                <p className="text-xs text-green-600">Cliente: {item.pedidoCliente}</p>
              )}
              {item.destino === 'pedido' && item.pedidoOk === false && (
                <p className="text-xs text-red-600">{item.pedidoAviso ?? 'Ese pedido no existe — revisa el número'}</p>
              )}

              {/* Fila 2: código + descripción */}
              <div className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={item.codigo}
                    onChange={(e) => actualizarItem(idx, 'codigo', e.target.value)}
                    onBlur={(e) => buscarPorCodigo(idx, e.target.value)}
                    placeholder="Código (SKU)"
                    className={`w-full rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 bg-white font-mono ${
                      item.articuloEncontrado === true  ? 'border-green-400 focus:ring-green-400' :
                      item.articuloEncontrado === false ? 'border-amber-400 focus:ring-amber-400' :
                      'border-gray-300 focus:ring-blue-500'
                    }`}
                  />
                  {item.articuloEncontrado === true && (
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">✓</span>
                  )}
                </div>
                <input
                  type="text"
                  value={item.descripcion}
                  onChange={(e) => actualizarItem(idx, 'descripcion', e.target.value)}
                  placeholder="Descripción * — Nike Air Max 95…"
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              {item.articuloEncontrado === true && (
                <p className="text-xs text-green-600">✓ En catálogo: {item.marca} {item.descripcion}</p>
              )}
              {item.articuloEncontrado === false && (
                <p className="text-xs text-amber-600">Artículo nuevo — se creará en el catálogo al asignar el pedido</p>
              )}

              {/* Fila 3: marca / talla / cantidad / costo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MarcaSelect
                  value={item.marca}
                  onChange={marca => actualizarItem(idx, 'marca', marca)}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <input
                  type="text"
                  value={item.talla}
                  onChange={(e) => actualizarItem(idx, 'talla', e.target.value)}
                  placeholder="Talla"
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <input
                  type="number"
                  min="1"
                  value={item.cantidad}
                  onChange={(e) => actualizarItem(idx, 'cantidad', e.target.value)}
                  title="Cantidad"
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatMiles(item.costo_unitario_cop)}
                  onChange={(e) => actualizarItem(idx, 'costo_unitario_cop', e.target.value.replace(/\D/g, ''))}
                  placeholder="Costo unit."
                  title="Costo unitario COP"
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <Button onClick={handleConfirmar} disabled={isSaving} size="md" className="w-full max-w-3xl">
        {isSaving ? 'Guardando compra...' : 'Confirmar y guardar compra'}
      </Button>
    </div>
  )
}
