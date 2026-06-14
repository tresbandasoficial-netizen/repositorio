'use client'

import { useState, useTransition } from 'react'
import { editarPedidoAction } from '@/app/actions/pedidos'
import { formatCOP } from '@/lib/utils/format'

type Producto = { marca: string; descripcion: string; talla: string; cantidad: number; precio_venta: number }

interface Props {
  pedidoId: string
  sedeCodigo: string
  numeroOrden: string
  clienteId: string
  clienteNombre: string
  clienteTelefono: string
  notas: string | null
  tipoEntrega: 'sede' | 'domicilio'
  direccionEntrega: string | null
  numeroGuia: string | null
  productos: Producto[]
}

export function EditarPedidoForm({
  pedidoId, sedeCodigo, numeroOrden, clienteId,
  clienteNombre, clienteTelefono, notas,
  tipoEntrega, direccionEntrega, numeroGuia, productos: productosIniciales,
}: Props) {
  const [numero, setNumero]         = useState(numeroOrden)
  const [nombre, setNombre]         = useState(clienteNombre)
  const [telefono, setTelefono]     = useState(clienteTelefono)
  const [tipo, setTipo]             = useState<'sede' | 'domicilio'>(tipoEntrega)
  const [direccion, setDireccion]   = useState(direccionEntrega ?? '')
  const [notasVal, setNotasVal]     = useState(notas ?? '')
  const [guia, setGuia]             = useState(numeroGuia ?? '')
  const [productos, setProductos]   = useState<Producto[]>(productosIniciales)
  const [error, setError]           = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function updateProducto(idx: number, field: keyof Producto, value: string | number) {
    setProductos(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  function agregarProducto() {
    setProductos(prev => [...prev, { marca: '', descripcion: '', talla: '', cantidad: 1, precio_venta: 0 }])
  }

  function quitarProducto(idx: number) {
    setProductos(prev => prev.filter((_, i) => i !== idx))
  }

  const total = productos.reduce((s, p) => s + p.precio_venta * p.cantidad, 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await editarPedidoAction(pedidoId, {
        numero_orden:      numero,
        notas:             notasVal,
        tipo_entrega:      tipo,
        direccion_entrega: direccion,
        numero_guia:       guia,
        cliente_nombre:    nombre,
        cliente_telefono:  telefono,
        cliente_id:        clienteId,
        productos,
      })
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Número de pedido */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Número de pedido</label>
        <input
          type="text"
          value={numero}
          onChange={e => setNumero(e.target.value.toUpperCase())}
          className="w-40 px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">Debe empezar con {sedeCodigo}</p>
      </div>

      {/* Cliente */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Cliente</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Celular</label>
            <input
              type="text"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Entrega */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de entrega</label>
        <div className="flex gap-2 mb-3">
          {(['sede', 'domicilio'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium capitalize transition-colors ${
                tipo === t ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
              }`}>
              {t}
            </button>
          ))}
        </div>
        {tipo === 'domicilio' && (
          <input
            type="text"
            value={direccion}
            onChange={e => setDireccion(e.target.value)}
            placeholder="Calle 10 # 5-20, Barrio Centro"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
      </div>

      {/* Productos */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Productos</p>
        <div className="space-y-3">
          {productos.map((p, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Artículo</label>
                <input type="text" value={[p.marca, p.descripcion].filter(Boolean).join(' ')}
                  onChange={e => { updateProducto(i, 'marca', ''); updateProducto(i, 'descripcion', e.target.value) }}
                  className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Talla</label>
                  <input type="text" value={p.talla}
                    onChange={e => updateProducto(i, 'talla', e.target.value)}
                    className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Precio</label>
                  <input type="number" min={0} value={p.precio_venta}
                    onChange={e => updateProducto(i, 'precio_venta', parseInt(e.target.value) || 0)}
                    className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {productos.length > 1 && (
                <button type="button" onClick={() => quitarProducto(i)}
                  className="text-xs text-red-500 hover:text-red-700">
                  Quitar producto
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={agregarProducto}
          className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
          + Agregar producto
        </button>
        <p className="text-sm font-semibold text-gray-900 mt-3">
          Total: {formatCOP(total)}
        </p>
      </div>

      {/* Número de guía */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Número de guía <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <input type="text" value={guia} onChange={e => setGuia(e.target.value)}
          placeholder="USPS, FedEx, DHL, Servientrega…"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Notas */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Notas <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <textarea value={notasVal} onChange={e => setNotasVal(e.target.value)} rows={3}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Instrucciones especiales, referencias, etc." />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={isPending}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <a href={`/pedidos/${pedidoId}`}
          className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </a>
      </div>
    </form>
  )
}
