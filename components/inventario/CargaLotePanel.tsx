'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buscarArticuloPorCodigoAction, cargaMasivaAction, FilaLote } from '@/app/actions/cargaMasiva'
import { uploadPedidoImage } from '@/lib/utils/uploadPedidoImage'
import { TallaSelect } from '@/components/ui/TallaSelect'
import { MarcaSelect } from '@/components/ui/MarcaSelect'
import { formatMiles } from '@/lib/utils/format'
import { Loader2, Plus, Trash2, Check, UploadCloud, Camera } from 'lucide-react'

type Sede = { id: string; codigo: string; nombre: string }

type Fila = {
  uid: number
  codigo: string
  marca: string
  nombre: string
  categoria: '' | 'ropa' | 'tenis' | 'accesorios'
  sexo: '' | 'hombre' | 'mujer' | 'nino'
  precio: string
  talla: string
  cantidad: string
  existente: boolean
  buscando: boolean
  foto: string | null        // foto del producto (sube a storage; queda en la ficha)
  subiendoFoto: boolean
}

let uidSeq = 1
function filaVacia(): Fila {
  return { uid: uidSeq++, codigo: '', marca: '', nombre: '', categoria: '', sexo: '', precio: '', talla: '', cantidad: '', existente: false, buscando: false, foto: null, subiendoFoto: false }
}

const celda = 'w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-500'

// Planilla tipo Excel para cargar productos al inventario en lote.
// Se empieza por el CÓDIGO: si ya existe en el catálogo, la fila se llena
// sola; si no, se completan los datos y el producto se crea al cargar.
export function CargaLotePanel({ sedes, sedeFijaId }: { sedes: Sede[]; sedeFijaId: string | null }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sedeId, setSedeId] = useState(sedeFijaId ?? sedes.find(s => s.codigo === 'TR')?.id ?? sedes[0]?.id ?? '')
  const [filas, setFilas] = useState<Fila[]>(() => Array.from({ length: 5 }, filaVacia))
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ creados: number; reutilizados: number; ajustes: number; errores: string[] } | null>(null)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  function patch(uid: number, cambios: Partial<Fila>) {
    setFilas(prev => prev.map(f => f.uid === uid ? { ...f, ...cambios } : f))
  }

  function onCodigoChange(uid: number, valor: string) {
    const codigo = valor.toUpperCase()
    patch(uid, { codigo, existente: false })
    const timers = timersRef.current
    const t = timers.get(uid)
    if (t) clearTimeout(t)
    const cod = codigo.trim()
    if (!cod) return
    timers.set(uid, setTimeout(async () => {
      patch(uid, { buscando: true })
      try {
        const art = await buscarArticuloPorCodigoAction(cod)
        if (art) {
          patch(uid, {
            existente: true,
            marca: art.marca,
            nombre: art.nombre,
            categoria: (art.categoria ?? '') as Fila['categoria'],
            sexo: (art.sexo ?? '') as Fila['sexo'],
            precio: art.precio_venta != null ? String(art.precio_venta) : '',
            foto: art.foto ?? null,
          })
        }
      } catch {
        // sin conexión / error transitorio: la fila queda como "nuevo"
      } finally {
        patch(uid, { buscando: false })
      }
    }, 450))
  }

  function agregarFilas(n: number) {
    setFilas(prev => [...prev, ...Array.from({ length: n }, filaVacia)])
  }

  async function subirFoto(uid: number, file: File | null) {
    if (!file) return
    patch(uid, { subiendoFoto: true })
    try {
      const url = await uploadPedidoImage(file)
      if (url) {
        // La misma foto se copia a las demás filas del mismo código que aún no
        // tengan (un producto con varias tallas = varias filas).
        setFilas(prev => {
          const fila = prev.find(f => f.uid === uid)
          const cod = fila?.codigo.trim().toLowerCase()
          return prev.map(f =>
            f.uid === uid ? { ...f, foto: url, subiendoFoto: false }
            : (cod && f.codigo.trim().toLowerCase() === cod && !f.foto) ? { ...f, foto: url }
            : f
          )
        })
        return
      }
      setError('No se pudo subir la foto — intenta de nuevo')
    } catch {
      setError('No se pudo subir la foto — intenta de nuevo')
    }
    patch(uid, { subiendoFoto: false })
  }

  function quitar(uid: number) {
    setFilas(prev => prev.length > 1 ? prev.filter(f => f.uid !== uid) : prev)
  }

  function filaUsada(f: Fila) {
    return !!(f.codigo.trim() || f.marca.trim() || f.nombre.trim() || f.cantidad.trim())
  }

  function cargar() {
    setError(null)
    const usadas = filas.filter(filaUsada)
    if (usadas.length === 0) { setError('La planilla está vacía'); return }

    // Validación por fila (solo estricta para productos nuevos)
    for (let i = 0; i < usadas.length; i++) {
      const f = usadas[i]
      const n = i + 1
      if (!f.existente) {
        if (!f.marca.trim() || !f.nombre.trim()) { setError(`Fila ${n}: marca y nombre son obligatorios para un producto nuevo`); return }
        if (!f.categoria) { setError(`Fila ${n} (${f.marca} ${f.nombre}): elige la categoría`); return }
        if (f.categoria !== 'accesorios' && !f.sexo) { setError(`Fila ${n} (${f.marca} ${f.nombre}): elige el sexo`); return }
      }
      if (f.categoria && f.categoria !== 'accesorios' && f.cantidad.trim() && !f.talla.trim()) {
        setError(`Fila ${n} (${f.marca} ${f.nombre}): indica la talla para cargar stock`); return
      }
    }

    const payload: FilaLote[] = usadas.map(f => ({
      codigo: f.codigo.trim() || null,
      marca: f.marca,
      nombre: f.nombre,
      categoria: (f.categoria || 'ropa') as FilaLote['categoria'],
      sexo: f.sexo || null,
      precio_venta: f.precio.trim() ? parseInt(f.precio.replace(/\D/g, ''), 10) : null,
      talla: f.talla.trim() || null,
      cantidad: f.cantidad.trim() ? Math.max(0, parseInt(f.cantidad, 10) || 0) : null,
      foto_url: f.foto,
    }))

    const sedeNombre = sedes.find(s => s.id === sedeId)?.nombre ?? ''
    if (!window.confirm(`¿Cargar ${usadas.length} fila(s) al inventario de ${sedeNombre}? Los productos nuevos se crearán en el catálogo.`)) return

    startTransition(async () => {
      try {
        const r = await cargaMasivaAction(sedeId, payload)
        if (!r.ok) { setError(r.error); return }
        setResultado({ creados: r.creados, reutilizados: r.reutilizados, ajustes: r.ajustes, errores: r.errores })
        setFilas(Array.from({ length: 5 }, filaVacia))
        router.refresh()
      } catch (e) {
        // Típico si la página quedó abierta durante una actualización de la app.
        console.error('Error cargando inventario:', e)
        setError('Hubo una actualización del sistema. Recarga la página (F5) — tus filas se conservan si no la cierras — y vuelve a intentar. Si sigue fallando, avisa al administrador.')
      }
    })
  }

  const usadasCount = filas.filter(filaUsada).length
  const sedeNombre = sedes.find(s => s.id === sedeId)?.nombre ?? ''

  if (resultado) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <Check size={26} className="text-green-600" />
        </div>
        <p className="text-lg font-bold text-gray-900">Carga completada</p>
        <p className="text-sm text-gray-600">
          {resultado.creados} producto(s) creados · {resultado.reutilizados} ya existían · {resultado.ajustes} ajuste(s) de stock en {sedeNombre}
        </p>
        {resultado.errores.length > 0 && (
          <div className="text-left bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 max-h-40 overflow-y-auto">
            <p className="font-bold mb-1">Filas con problemas (no se cargaron):</p>
            {resultado.errores.map((e, i) => <p key={i}>· {e}</p>)}
          </div>
        )}
        <button
          onClick={() => setResultado(null)}
          className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
        >
          Cargar más productos
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sede */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Inventario de:</p>
        {sedeFijaId ? (
          <span className="text-sm font-bold text-gray-900">{sedeNombre}</span>
        ) : (
          <select
            value={sedeId}
            onChange={e => setSedeId(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.codigo})</option>)}
          </select>
        )}
        <p className="text-xs text-gray-400 w-full">
          Empieza por el <b>código</b>: si el producto ya existe, la fila se llena sola (verde). Si no, completa los datos y se creará al cargar.
          Un producto con varias tallas = una fila por talla (mismo código).
        </p>
      </div>

      {/* Planilla */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 900 }}>
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100 text-[10px] text-gray-500 uppercase tracking-wider">
              <th className="px-2 py-2.5 text-left w-8">#</th>
              <th className="px-2 py-2.5 text-left w-14">Foto</th>
              <th className="px-2 py-2.5 text-left w-32">Código</th>
              <th className="px-2 py-2.5 text-left w-28">Marca</th>
              <th className="px-2 py-2.5 text-left">Nombre</th>
              <th className="px-2 py-2.5 text-left w-28">Categoría</th>
              <th className="px-2 py-2.5 text-left w-24">Sexo</th>
              <th className="px-2 py-2.5 text-left w-28">Precio venta</th>
              <th className="px-2 py-2.5 text-left w-24">Talla</th>
              <th className="px-2 py-2.5 text-left w-20">Cant.</th>
              <th className="px-2 py-2.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filas.map((f, i) => (
              <tr key={f.uid} className={f.existente ? 'bg-green-50/40' : ''}>
                <td className="px-2 py-1.5 text-gray-300 font-medium">{i + 1}</td>
                <td className="px-2 py-1.5">
                  {/* Foto del producto: se sube aquí mismo y queda en la ficha
                      del catálogo (si la ficha ya tiene foto, no se pisa). */}
                  {f.subiendoFoto ? (
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                      <Loader2 size={13} className="animate-spin text-gray-400" />
                    </span>
                  ) : f.foto ? (
                    <a href={f.foto} target="_blank" rel="noopener noreferrer" title="Ver foto completa">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.foto} alt="" className="h-9 w-9 rounded-lg border border-gray-200 object-cover" />
                    </a>
                  ) : (
                    <label
                      title="Subir foto del producto"
                      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                    >
                      <Camera size={14} />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => { subirFoto(f.uid, e.target.files?.[0] ?? null); e.target.value = '' }}
                      />
                    </label>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <div className="relative">
                    <input
                      type="text"
                      value={f.codigo}
                      onChange={e => onCodigoChange(f.uid, e.target.value)}
                      placeholder="JD4546"
                      className={`${celda} font-mono ${f.existente ? 'border-green-300' : ''}`}
                    />
                    {f.buscando && <Loader2 size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <MarcaSelect value={f.marca} disabled={f.existente}
                    onChange={marca => patch(f.uid, { marca })} className={celda} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="text" value={f.nombre} disabled={f.existente}
                    onChange={e => patch(f.uid, { nombre: e.target.value })} placeholder="Camiseta dri-fit" className={celda} />
                </td>
                <td className="px-2 py-1.5">
                  <select value={f.categoria} disabled={f.existente}
                    onChange={e => patch(f.uid, { categoria: e.target.value as Fila['categoria'] })} className={celda}>
                    <option value="">—</option>
                    <option value="ropa">Ropa</option>
                    <option value="tenis">Tenis</option>
                    <option value="accesorios">Accesorio</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select value={f.sexo} disabled={f.existente || f.categoria === 'accesorios'}
                    onChange={e => patch(f.uid, { sexo: e.target.value as Fila['sexo'] })} className={celda}>
                    <option value="">—</option>
                    <option value="hombre">Hombre</option>
                    <option value="mujer">Mujer</option>
                    <option value="nino">Niño</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input type="text" inputMode="numeric" value={formatMiles(f.precio)}
                    onChange={e => patch(f.uid, { precio: e.target.value.replace(/\D/g, '') })} placeholder="120.000" className={celda} />
                </td>
                <td className="px-2 py-1.5">
                  <TallaSelect
                    categoria={f.categoria}
                    sexo={f.sexo}
                    value={f.talla}
                    onChange={talla => patch(f.uid, { talla })}
                    className={celda}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" min={0} value={f.cantidad}
                    onChange={e => patch(f.uid, { cantidad: e.target.value })} placeholder="0" className={celda} />
                </td>
                <td className="px-1 py-1.5 text-center">
                  <button onClick={() => quitar(f.uid)} className="text-gray-300 hover:text-red-500" title="Quitar fila">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => agregarFilas(5)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Plus size={14} /> Agregar 5 filas
        </button>
        <span className="text-xs text-gray-400">{usadasCount} fila(s) con datos</span>
        <div className="flex-1" />
        <button
          onClick={cargar}
          disabled={isPending || usadasCount === 0}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-2xl px-6 py-3 transition-colors shadow-md shadow-emerald-200 disabled:opacity-50"
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          Cargar al inventario ({usadasCount})
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}
    </div>
  )
}
