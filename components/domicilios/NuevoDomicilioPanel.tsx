'use client'

import { useState, useTransition } from 'react'
import { crearDomicilioAction } from '@/app/actions/domicilios'
import { parsearDomicilio } from './parsearDomicilio'

const MENSAJERIA_LABELS = { exneider: 'Exneider', servigo: 'Servigo' }

interface Props {
  fecha: string
  onCreado: () => void
}

const VACIO = {
  cliente_nombre: '',
  cliente_telefono: '',
  direccion: '',
  mensajeria: '' as 'exneider' | 'servigo' | '',
  valor_domicilio: '',
  cobrar_al_cliente: true,
  numero_pedido: '',
  notas: '',
}

export function NuevoDomicilioPanel({ fecha, onCreado }: Props) {
  const [modo, setModo] = useState<'auto' | 'manual'>('auto')
  const [texto, setTexto] = useState('')
  const [form, setForm] = useState(VACIO)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  function handleParsear() {
    const p = parsearDomicilio(texto)
    setForm({
      cliente_nombre:    p.cliente_nombre,
      cliente_telefono:  p.cliente_telefono,
      direccion:         p.direccion,
      mensajeria:        p.mensajeria,
      valor_domicilio:   p.valor_domicilio ? String(p.valor_domicilio) : '',
      cobrar_al_cliente: p.cobrar_al_cliente,
      numero_pedido:     p.numero_pedido,
      notas:             p.notas,
    })
    setModo('manual')
  }

  function set(campo: keyof typeof form, valor: any) {
    setForm(f => ({ ...f, [campo]: valor }))
  }

  function handleGuardar() {
    setError(null)
    if (!form.cliente_nombre.trim()) { setError('El nombre del cliente es obligatorio'); return }
    if (!form.direccion.trim())      { setError('La dirección es obligatoria'); return }
    if (!form.mensajeria)            { setError('Selecciona la mensajería'); return }

    start(async () => {
      const r = await crearDomicilioAction({
        fecha,
        cliente_nombre:    form.cliente_nombre,
        cliente_telefono:  form.cliente_telefono,
        direccion:         form.direccion,
        mensajeria:        form.mensajeria as 'exneider' | 'servigo',
        valor_domicilio:   parseInt(form.valor_domicilio.replace(/\D/g, ''), 10) || 0,
        cobrar_al_cliente: form.cobrar_al_cliente,
        numero_pedido:     form.numero_pedido,
        notas:             form.notas,
      })
      if (!r.ok) { setError(r.error); return }
      setForm(VACIO)
      setTexto('')
      setModo('auto')
      onCreado()
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      {/* Tabs modo */}
      <div className="flex gap-2">
        {(['auto', 'manual'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              modo === m
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {m === 'auto' ? 'Pegar texto' : 'Manual'}
          </button>
        ))}
      </div>

      {/* Modo auto */}
      {modo === 'auto' && (
        <div className="space-y-3">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={6}
            placeholder={`Pega los datos del domicilio aquí, en cualquier orden:\n\nMaría López\n3001234567\nCll 15 # 10-20 El Prado\nExneider\n5000`}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
          />
          <button
            type="button"
            onClick={handleParsear}
            disabled={texto.trim().length < 5}
            className="w-full py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            Detectar campos →
          </button>
        </div>
      )}

      {/* Formulario manual / revisión */}
      {modo === 'manual' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Cliente *</label>
              <input
                type="text"
                value={form.cliente_nombre}
                onChange={e => set('cliente_nombre', e.target.value)}
                placeholder="Nombre completo"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Celular</label>
              <input
                type="tel"
                value={form.cliente_telefono}
                onChange={e => set('cliente_telefono', e.target.value)}
                placeholder="3001234567"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">N° Pedido (opcional)</label>
              <input
                type="text"
                value={form.numero_pedido}
                onChange={e => set('numero_pedido', e.target.value.toUpperCase())}
                placeholder="TR0045"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Dirección *</label>
              <input
                type="text"
                value={form.direccion}
                onChange={e => set('direccion', e.target.value)}
                placeholder="Cll 15 # 10-20, Barrio El Prado"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          {/* Mensajería */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mensajería *</label>
            <div className="flex gap-2">
              {(['exneider', 'servigo'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set('mensajeria', m)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.mensajeria === m
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {MENSAJERIA_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Valor */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Valor domicilio</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set('cobrar_al_cliente', true)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  form.cobrar_al_cliente
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Cobrar
              </button>
              <button
                type="button"
                onClick={() => { set('cobrar_al_cliente', false); set('valor_domicilio', '0') }}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  !form.cobrar_al_cliente
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Sin cobro
              </button>
              {form.cobrar_al_cliente && (
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.valor_domicilio}
                  onChange={e => set('valor_domicilio', e.target.value.replace(/\D/g, ''))}
                  placeholder="5000"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              )}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notas (opcional)</label>
            <input
              type="text"
              value={form.notas}
              onChange={e => set('notas', e.target.value)}
              placeholder="Llamar antes de llegar, dejar con el portero..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setModo('auto')}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ← Volver
            </button>
            <button
              type="button"
              onClick={handleGuardar}
              disabled={isPending}
              className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {isPending ? 'Guardando...' : 'Guardar domicilio'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
