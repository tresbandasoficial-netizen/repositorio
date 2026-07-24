'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy, Upload, X } from 'lucide-react'
import { crearRetoAction } from '@/app/actions/retos'
import { uploadPedidoImage } from '@/lib/utils/uploadPedidoImage'
import { hoyBogota, formatMiles } from '@/lib/utils/format'
import type { CategoriaReto, MetricaReto, ModoReto } from '@/lib/queries/retos'

const MAX_FOTOS = 2

const SEDES = [
  { codigo: 'TR', nombre: 'Bucaramanga' },
  { codigo: 'SR', nombre: 'Santa Rosa' },
  { codigo: 'CR', nombre: 'Cúcuta' },
]

const METRICAS: Array<{ valor: MetricaReto; label: string; ayuda: string }> = [
  { valor: 'unidades', label: 'Unidades vendidas', ayuda: 'Cuenta artículos: pares de zapatos, prendas, accesorios' },
  { valor: 'ventas',   label: 'Ventas en pesos',   ayuda: 'Suma el valor de los pedidos' },
  { valor: 'pedidos',  label: 'Cantidad de pedidos', ayuda: 'Cuenta pedidos, sin importar el monto' },
]

const CATEGORIAS: Array<{ valor: CategoriaReto | ''; label: string }> = [
  { valor: 'tenis',       label: 'Solo zapatos (tenis)' },
  { valor: 'ropa',        label: 'Solo ropa' },
  { valor: 'accesorios',  label: 'Solo accesorios' },
  { valor: '',            label: 'Cualquier artículo' },
]

// Solo el admin ve este formulario. La meta es la MISMA para cada participante:
// "cada uno 10 pares", no 10 entre todos.
export function CrearRetoForm() {
  const router = useRouter()
  const hoy = hoyBogota()

  const [titulo, setTitulo] = useState('Reto de hoy')
  const [descripcion, setDescripcion] = useState('')
  const [modo, setModo] = useState<ModoReto>('individual')
  const [metrica, setMetrica] = useState<MetricaReto>('unidades')
  const [categoria, setCategoria] = useState<CategoriaReto | ''>('tenis')
  const [objetivo, setObjetivo] = useState('')
  const [sedes, setSedes] = useState<string[]>(['TR', 'SR'])
  const [premio, setPremio] = useState('')
  const [imagenes, setImagenes] = useState<string[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(hoy)
  const [error, setError] = useState('')
  const [guardando, startGuardar] = useTransition()

  const objetivoNum = metrica === 'ventas'
    ? parseInt(objetivo.replace(/\D/g, ''), 10) || 0
    : parseFloat(objetivo) || 0

  function toggleSede(codigo: string) {
    setSedes(prev => prev.includes(codigo) ? prev.filter(s => s !== codigo) : [...prev, codigo])
  }

  // Se pueden elegir varias de una; se aceptan hasta completar las 2.
  async function elegirImagenes(files: File[]) {
    setError('')
    const cupo = MAX_FOTOS - imagenes.length
    if (cupo <= 0) return
    setSubiendo(true)
    const urls: string[] = []
    for (const file of files.slice(0, cupo)) {
      const url = await uploadPedidoImage(file)
      if (url) urls.push(url)
    }
    setSubiendo(false)
    if (urls.length === 0) { setError('No se pudo subir la imagen. Intenta con otra (JPG o PNG).'); return }
    setImagenes(prev => [...prev, ...urls].slice(0, MAX_FOTOS))
  }

  function guardar() {
    setError('')
    startGuardar(async () => {
      const res = await crearRetoAction({
        titulo,
        descripcion,
        metrica,
        categoria: metrica === 'unidades' && categoria !== '' ? categoria : null,
        modo,
        objetivo: objetivoNum,
        sedes,
        premio,
        imagenes,
        desde,
        hasta,
      })
      if (!res.ok) { setError(res.error); return }
      setDescripcion(''); setObjetivo(''); setPremio(''); setImagenes([])
      router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
        <Trophy size={16} className="text-violet-600" /> Crear un reto
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Título</label>
          <input
            type="text" value={titulo} onChange={e => setTitulo(e.target.value)}
            placeholder="Reto de hoy"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Descripción — lo que van a leer
          </label>
          <textarea
            value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2}
            placeholder="Cada uno 10 pares de zapatos. El primero que los complete se gana un bono de 50 mil."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        {/* Individual vs grupal: cambia el significado de la meta */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">¿Cómo se gana?</label>
          <div className="flex gap-2">
            {([
              { valor: 'individual' as ModoReto, label: 'Cada uno por su cuenta', ayuda: 'Todos deben llegar a la meta; gana el primero' },
              { valor: 'grupal' as ModoReto,     label: 'Todos juntos',            ayuda: 'Una sola meta y la suman entre todos' },
            ]).map(m => (
              <button
                key={m.valor} type="button" onClick={() => setModo(m.valor)}
                className={`flex-1 text-left rounded-lg border px-3 py-2 transition-colors ${
                  modo === m.valor
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="block text-sm font-bold">{m.label}</span>
                <span className={`block text-[11px] ${modo === m.valor ? 'text-violet-200' : 'text-gray-400'}`}>{m.ayuda}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">¿Qué se cuenta?</label>
          <select
            value={metrica}
            onChange={e => setMetrica(e.target.value as MetricaReto)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {METRICAS.map(m => <option key={m.valor} value={m.valor}>{m.label}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">{METRICAS.find(m => m.valor === metrica)?.ayuda}</p>
        </div>

        {metrica === 'unidades' ? (
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">¿De qué tipo?</label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value as CategoriaReto | '')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {CATEGORIAS.map(c => <option key={c.valor} value={c.valor}>{c.label}</option>)}
            </select>
          </div>
        ) : <div className="hidden sm:block" />}

        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            {modo === 'grupal' ? 'Meta del grupo' : 'Meta de cada persona'}
          </label>
          <input
            type="text" inputMode="numeric"
            value={metrica === 'ventas' ? formatMiles(objetivo) : objetivo}
            onChange={e => setObjetivo(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder={metrica === 'ventas' ? '5.000.000' : '10'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            {modo === 'grupal'
              ? 'Se suma lo de todos hasta llegar a este número'
              : 'Cada participante debe llegar a este número'}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">¿Quiénes compiten?</label>
          <div className="flex gap-1.5">
            {SEDES.map(s => (
              <button
                key={s.codigo} type="button" onClick={() => toggleSede(s.codigo)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                  sedes.includes(s.codigo)
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {s.nombre}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">Las sedes que no compiten tampoco ven el reto</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Desde</label>
            <input
              type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Hasta</label>
            <input
              type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">El premio</label>
          <input
            type="text" value={premio} onChange={e => setPremio(e.target.value)}
            placeholder="Bono de $50.000 al primero que lo complete"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        {/* Foto del premio */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Fotos del premio <span className="text-gray-400 normal-case">(hasta 2)</span>
          </label>

          {imagenes.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              {imagenes.map((url, i) => (
                <div key={url} className="relative">
                  <img src={url} alt={`Premio ${i + 1}`} className="w-full h-40 rounded-xl object-cover border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => setImagenes(prev => prev.filter(u => u !== url))}
                    title="Quitar esta foto"
                    className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-white text-red-600 rounded-full p-1 shadow"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {imagenes.length < MAX_FOTOS && (
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-4 cursor-pointer hover:border-violet-400 hover:bg-gray-50 transition-colors">
              <input
                type="file" accept="image/*" multiple className="hidden" disabled={subiendo}
                onChange={e => {
                  const fs = Array.from(e.target.files ?? [])
                  if (fs.length > 0) elegirImagenes(fs)
                  e.target.value = ''
                }}
              />
              {subiendo ? (
                <span className="text-sm text-violet-600 font-medium">Subiendo…</span>
              ) : (
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <Upload size={15} />
                  {imagenes.length === 0 ? 'Subir fotos (opcional)' : 'Agregar otra foto'}
                </span>
              )}
            </label>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      <button
        type="button" onClick={guardar} disabled={guardando || subiendo}
        className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-bold transition-colors"
      >
        {guardando ? 'Creando…' : 'Crear reto'}
      </button>
    </div>
  )
}
