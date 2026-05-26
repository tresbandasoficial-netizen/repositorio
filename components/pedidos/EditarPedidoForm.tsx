'use client'

import { useState, useTransition } from 'react'
import { editarPedidoAction } from '@/app/actions/pedidos'

interface Props {
  pedidoId: string
  numeroOrden: string
  sedeCodigo: string
  notas: string | null
  tipoEntrega: 'sede' | 'domicilio'
  direccionEntrega: string | null
  numeroGuia: string | null
}

export function EditarPedidoForm({ pedidoId, numeroOrden, sedeCodigo, notas, tipoEntrega, direccionEntrega, numeroGuia }: Props) {
  const [numero, setNumero]        = useState(numeroOrden)
  const [tipo, setTipo]            = useState<'sede' | 'domicilio'>(tipoEntrega)
  const [direccion, setDireccion]  = useState(direccionEntrega ?? '')
  const [notasVal, setNotasVal]    = useState(notas ?? '')
  const [guia, setGuia]            = useState(numeroGuia ?? '')
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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
      })
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Número de pedido */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Número de pedido</label>
        <input
          type="text"
          value={numero}
          onChange={(e) => setNumero(e.target.value.toUpperCase())}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={`${sedeCodigo}1025`}
        />
        <p className="text-xs text-gray-400 mt-1">Debe empezar con {sedeCodigo}</p>
      </div>

      {/* Tipo de entrega */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de entrega</label>
        <div className="flex gap-2">
          {(['sede', 'domicilio'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium capitalize transition-colors ${
                tipo === t
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Dirección (solo domicilio) */}
      {tipo === 'domicilio' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Dirección de entrega <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            required
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Calle 10 # 5-20, Barrio Centro"
          />
        </div>
      )}

      {/* Número de guía */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Número de guía <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <input
          type="text"
          value={guia}
          onChange={(e) => setGuia(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="USPS, FedEx, DHL, Servientrega…"
        />
      </div>

      {/* Notas */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Notas <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <textarea
          value={notasVal}
          onChange={(e) => setNotasVal(e.target.value)}
          rows={3}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Instrucciones especiales, referencias, etc."
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <a
          href={`/pedidos/${pedidoId}`}
          className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  )
}
