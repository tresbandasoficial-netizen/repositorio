'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { editarClienteAction } from '@/app/actions/clientes'
import { useAviso } from '@/components/ui/Aviso'
import { ClienteDetalle } from '@/lib/queries/clientes'

interface EditarClienteFormProps {
  cliente: Pick<ClienteDetalle, 'id' | 'nombre' | 'telefono_normalizado' | 'cedula' | 'email' | 'notas' | 'ciudad' | 'direccion' | 'cumple_dia' | 'cumple_mes'>
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function EditarClienteForm({ cliente }: EditarClienteFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const { avisar, avisarError } = useAviso()

  // Display phone without +57 prefix for easier editing
  const telefonoDisplay = cliente.telefono_normalizado.startsWith('+57')
    ? cliente.telefono_normalizado.slice(3)
    : cliente.telefono_normalizado

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await editarClienteAction(cliente.id, formData)
      if (!result.ok) {
        setError(result.error)
        avisarError(result.error)
      } else {
        setGuardado(true)
        avisar('Cambio realizado')
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {guardado && !error && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Cambios guardados
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Nombre <span className="text-red-500">*</span>
        </label>
        <input
          name="nombre"
          type="text"
          required
          defaultValue={cliente.nombre}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Teléfono <span className="text-red-500">*</span>
        </label>
        <input
          name="telefono"
          type="tel"
          required
          defaultValue={telefonoDisplay}
          placeholder="300 123 4567"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">Número colombiano sin prefijo (+57 se agrega automáticamente)</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Cédula</label>
        <input
          name="cedula"
          type="text"
          defaultValue={cliente.cedula ?? ''}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Ciudad</label>
        <input
          name="ciudad"
          type="text"
          defaultValue={cliente.ciudad ?? ''}
          placeholder="Ej: Cúcuta"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Dirección</label>
        <input
          name="direccion"
          type="text"
          defaultValue={cliente.direccion ?? ''}
          placeholder="Calle 10 # 5-20, Barrio…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">Se actualiza sola con la del último pedido a domicilio</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">🎂 Cumpleaños</label>
        <div className="flex gap-2">
          <select
            name="cumple_dia"
            defaultValue={cliente.cumple_dia ?? ''}
            className="w-24 rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Día</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            name="cumple_mes"
            defaultValue={cliente.cumple_mes ?? ''}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Mes</option>
            {MESES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-gray-400 mt-1">Solo día y mes — para felicitarlo cuando cumpla</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
        <input
          name="email"
          type="email"
          defaultValue={cliente.email ?? ''}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Notas</label>
        <textarea
          name="notas"
          rows={3}
          defaultValue={cliente.notas ?? ''}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-blue-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}
