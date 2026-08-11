'use client'

import { useState, useTransition } from 'react'
import { editarDomicilioAction } from '@/app/actions/domicilios'
import type { DomicilioRow } from '@/lib/queries/domicilios'
import { formatMiles } from '@/lib/utils/format'

const MENSAJERIA_LABELS = { exneider: 'Exneider', servigo: 'Servigo' }

interface Props {
  domicilio: DomicilioRow
  onGuardado: () => void
  onCancelar: () => void
}

export function EditarDomicilioPanel({ domicilio: d, onGuardado, onCancelar }: Props) {
  // El escenario de pago es UNO solo (tipo_cobro), igual que al crear: de ahí
  // se derivan metodo_pago y cobrar_al_cliente. Domicilios viejos sin
  // tipo_cobro se deducen de los campos legacy.
  const tipoCobroInicial: 'regalado' | 'mensajero' | 'tb_cobra' =
    d.tipo_cobro
      ?? (d.metodo_pago === 'transferencia' ? 'tb_cobra' : d.cobrar_al_cliente ? 'mensajero' : 'regalado')

  const [form, setForm] = useState({
    fecha:             d.fecha,
    cliente_nombre:    d.cliente_nombre,
    cliente_telefono:  d.cliente_telefono ?? '',
    direccion:         d.direccion,
    mensajeria:        d.mensajeria as 'exneider' | 'servigo',
    tipo_cobro:        tipoCobroInicial,
    valor_pedido:      d.valor_pedido ? String(d.valor_pedido) : '',
    valor_domicilio:   d.valor_domicilio ? String(d.valor_domicilio) : '',
    articulo:          d.articulo ?? '',
    numero_pedido:     d.numero_pedido ?? '',
    notas:             d.notas ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()

  function set(campo: keyof typeof form, valor: any) {
    setForm(f => ({ ...f, [campo]: valor }))
  }

  function handleGuardar() {
    setError(null)
    if (!form.cliente_nombre.trim()) { setError('El nombre del cliente es obligatorio'); return }
    if (!form.direccion.trim())      { setError('La dirección es obligatoria'); return }
    if (!form.mensajeria)            { setError('Selecciona la mensajería'); return }

    start(async () => {
      const r = await editarDomicilioAction(d.id, {
        fecha:             form.fecha,
        cliente_nombre:    form.cliente_nombre,
        cliente_telefono:  form.cliente_telefono,
        direccion:         form.direccion,
        mensajeria:        form.mensajeria as any,
        tipo_cobro:        form.tipo_cobro,
        cobrar_al_cliente: form.tipo_cobro !== 'regalado',
        metodo_pago:       form.tipo_cobro === 'tb_cobra' ? 'transferencia' : 'efectivo',
        valor_pedido:      parseInt(form.valor_pedido.replace(/\D/g, ''), 10) || 0,
        valor_domicilio:   parseInt(form.valor_domicilio.replace(/\D/g, ''), 10) || 0,
        cuenta_id:         null,
        articulo:          form.articulo,
        numero_pedido:     form.numero_pedido,
        notas:             form.notas,
      })
      if (!r.ok) { setError(r.error); return }
      onGuardado()
    })
  }

  return (
    <div className="border-t border-gray-100 pt-4 mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Fecha</label>
          <input
            type="date"
            value={form.fecha}
            onChange={e => set('fecha', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="flex items-end">
          <p className="text-xs text-gray-400 pb-2">Cambia la fecha para mover el domi a otro cuadre</p>
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Cliente *</label>
          <input
            type="text"
            value={form.cliente_nombre}
            onChange={e => set('cliente_nombre', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Celular</label>
          <input
            type="tel"
            value={form.cliente_telefono}
            onChange={e => set('cliente_telefono', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">N° Pedido</label>
          <input
            type="text"
            value={form.numero_pedido}
            onChange={e => set('numero_pedido', e.target.value.toUpperCase())}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Dirección *</label>
          <input
            type="text"
            value={form.direccion}
            onChange={e => set('direccion', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Artículo enviado</label>
          <input
            type="text"
            value={form.articulo}
            onChange={e => set('articulo', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {/* Mensajería */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Mensajería *</label>
        <div className="flex gap-2">
          {(['exneider', 'servigo'] as const).map(m => (
            <button key={m} type="button" onClick={() => set('mensajeria', m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                form.mensajeria === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {MENSAJERIA_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Escenario de pago — el mismo selector único del formulario de crear.
          De aquí salen metodo_pago y cobrar_al_cliente; antes había dos
          selectores sueltos y el servidor ignoraba la forma de pago. */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">¿Cómo se maneja el pago?</label>
        <div className="space-y-2">
          {([
            { key: 'mensajero', label: 'El cliente paga al mensajero', desc: 'El mensajero cobra producto y domicilio en efectivo' },
            { key: 'regalado',  label: 'Tres Bandas asume el domicilio', desc: 'El cliente solo paga el producto; TB paga el flete' },
            { key: 'tb_cobra',  label: 'El cliente paga todo a TB', desc: 'Cliente transfiere producto+domicilio a TB; luego TB paga al mensajero' },
          ] as const).map(op => (
            <button
              key={op.key}
              type="button"
              onClick={() => set('tipo_cobro', op.key)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                form.tipo_cobro === op.key
                  ? 'bg-blue-50 border-blue-500 text-blue-900'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="font-medium">{op.label}</span>
              <span className="block text-xs text-gray-400 mt-0.5">{op.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {form.tipo_cobro !== 'tb_cobra' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Valor del pedido {form.tipo_cobro === 'mensajero' ? '(lo recoge el mensajero)' : '(cobrado por TB)'}
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={formatMiles(form.valor_pedido)}
            onChange={e => set('valor_pedido', e.target.value.replace(/\D/g, ''))}
            placeholder="110000"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      )}

      {/* Valor del domicilio */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Valor del domicilio
          {form.tipo_cobro === 'regalado' && ' (lo paga TB — se registra como gasto)'}
          {form.tipo_cobro === 'mensajero' && ' (lo cobra el mensajero al cliente)'}
          {form.tipo_cobro === 'tb_cobra' && ' (TB cobra y luego paga al mensajero)'}
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={formatMiles(form.valor_domicilio)}
          onChange={e => set('valor_domicilio', e.target.value.replace(/\D/g, ''))}
          placeholder="12000"
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
            form.tipo_cobro === 'regalado'
              ? 'border-amber-300 bg-amber-50 focus:ring-amber-400'
              : form.tipo_cobro === 'tb_cobra'
              ? 'border-blue-300 bg-blue-50 focus:ring-blue-400'
              : 'border-gray-300 focus:ring-gray-900'
          }`}
        />
        {form.tipo_cobro === 'tb_cobra' && (
          <p className="text-xs text-blue-600 mt-1">
            Quedará como deuda pendiente con {MENSAJERIA_LABELS[form.mensajeria] ?? 'la mensajería'}
          </p>
        )}
      </div>

      {/* Notas */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Notas</label>
        <input
          type="text"
          value={form.notas}
          onChange={e => set('notas', e.target.value)}
          placeholder="Dejar en portería, llamar antes..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCancelar}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
        <button type="button" onClick={handleGuardar} disabled={isPending}
          className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
