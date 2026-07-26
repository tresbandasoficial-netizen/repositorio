'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editarArticuloAction } from '@/app/actions/articulos'
import { Button } from '@/components/ui/Button'
import { useAviso } from '@/components/ui/Aviso'
import { MarcaSelect } from '@/components/ui/MarcaSelect'
import { formatMiles } from '@/lib/utils/format'
import { Articulo, CategoriaArticulo, SexoArticulo } from '@/types'

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function EditarArticuloModal({ articulo, onClose }: { articulo: Articulo; onClose: () => void }) {
  const router = useRouter()
  const { avisar, avisarError } = useAviso()
  const [codigo, setCodigo]         = useState(articulo.codigo ?? '')
  const [nombre, setNombre]         = useState(articulo.nombre)
  const [marca, setMarca]           = useState(articulo.marca)
  const [referencia, setReferencia] = useState(articulo.referencia ?? '')
  const [color, setColor]           = useState(articulo.color ?? '')
  const [sexo, setSexo]             = useState<SexoArticulo | ''>(articulo.sexo ?? '')
  const [categoria, setCategoria]   = useState<CategoriaArticulo | ''>(articulo.categoria ?? '')
  const [precio, setPrecio]         = useState(articulo.precio_venta ? String(articulo.precio_venta) : '')
  const [error, setError]           = useState('')
  const [guardado, setGuardado]     = useState(false)
  const [pending, start]            = useTransition()

  function submit() {
    if (!marca.trim() || !nombre.trim()) { setError('Marca y nombre son obligatorios'); return }
    if (!categoria) { setError('Indica si es ropa, tenis o accesorio'); return }
    if (categoria !== 'accesorios' && !sexo) { setError('Indica si es de hombre, de mujer o de niño'); return }
    setError('')
    start(async () => {
      const r = await editarArticuloAction({
        id: articulo.id,
        codigo, nombre, marca, referencia, color, sexo, categoria,
        descripcion: articulo.descripcion ?? '',
        precio_venta: precio ? parseInt(precio, 10) : null,
      })
      if (!r.ok) { setError(r.error); avisarError(r.error); return }
      setGuardado(true)
      avisar('Cambio realizado')
      router.refresh()
      setTimeout(onClose, 700)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Editar ficha del artículo</p>
            <p className="text-xs text-gray-400 mt-0.5">
              El cambio aplica a todas las tallas de este modelo.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            className={`${inputCls} font-mono`}
            placeholder="Código SKU"
            value={codigo}
            onChange={e => setCodigo(e.target.value.toUpperCase())}
          />
          <MarcaSelect value={marca} onChange={setMarca} className={`${inputCls} bg-white`} />
          <input className={inputCls} placeholder="Nombre / modelo" value={nombre} onChange={e => setNombre(e.target.value)} />
          <input className={inputCls} placeholder="Referencia del proveedor" value={referencia} onChange={e => setReferencia(e.target.value)} />
          <input className={inputCls} placeholder="Color" value={color} onChange={e => setColor(e.target.value)} />
          <input
            className={inputCls}
            inputMode="numeric"
            placeholder="Precio de venta (COP)"
            value={formatMiles(precio)}
            onChange={e => setPrecio(e.target.value.replace(/\D/g, ''))}
          />
          <select className={inputCls} value={categoria} onChange={e => setCategoria(e.target.value as CategoriaArticulo | '')}>
            <option value="">Categoría… *</option>
            <option value="ropa">Ropa</option>
            <option value="tenis">Tenis</option>
            <option value="accesorios">Accesorios</option>
          </select>
          <select className={inputCls} value={sexo} onChange={e => setSexo(e.target.value as SexoArticulo | '')} disabled={categoria === 'accesorios'}>
            <option value="">{categoria === 'accesorios' ? 'Sexo (no aplica)' : 'Hombre / Mujer… *'}</option>
            <option value="hombre">Hombre</option>
            <option value="mujer">Mujer</option>
            <option value="nino">Niño</option>
          </select>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={submit} disabled={pending || guardado}>
            {guardado ? '✓ Guardado' : pending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
