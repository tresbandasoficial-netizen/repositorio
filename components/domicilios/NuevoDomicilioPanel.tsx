'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { crearDomicilioAction } from '@/app/actions/domicilios'
import { parsearDomicilio } from './parsearDomicilio'
import { buscarClientesAction, buscarDireccionPorTelefonoAction, ClienteBusqueda } from '@/app/actions/clientes'

import { TipoCobroDomicilio, TipoMensajeria } from '@/types'

const MENSAJERIA_LABELS: Record<string, string> = {
  exneider:    'Exneider',
  movilenvios: 'Servigo',
  otro:        'Otra',
}

interface Props {
  fecha: string
  onCreado: () => void
}

const VACIO = {
  cliente_nombre:   '',
  cliente_telefono: '',
  direccion:        '',
  mensajeria:       '' as TipoMensajeria | '',
  valor_pedido:     '',
  valor_domicilio:  '',
  tipo_cobro:       'mensajero' as TipoCobroDomicilio,
  cobrar_al_cliente: true,
  metodo_pago:      'efectivo' as 'efectivo' | 'transferencia',
  articulo:         '',
  numero_pedido:    '',
  notas:            '',
}

export function NuevoDomicilioPanel({ fecha, onCreado }: Props) {
  const [modo, setModo] = useState<'auto' | 'buscar' | 'manual'>('auto')
  const [texto, setTexto] = useState('')
  const [form, setForm] = useState(VACIO)
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  const [busqueda, setBusqueda] = useState('')
  const [resultadosBusqueda, setResultadosBusqueda] = useState<ClienteBusqueda[]>([])
  const [resultadosCliente, setResultadosCliente] = useState<ClienteBusqueda[]>([])
  const clienteRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (busqueda.trim().length < 2) { setResultadosBusqueda([]); return }
    const t = setTimeout(async () => {
      const res = await buscarClientesAction(busqueda)
      setResultadosBusqueda(res)
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  useEffect(() => {
    if (form.cliente_nombre.trim().length < 2) { setResultadosCliente([]); return }
    const t = setTimeout(async () => {
      const res = await buscarClientesAction(form.cliente_nombre)
      setResultadosCliente(res)
    }, 300)
    return () => clearTimeout(t)
  }, [form.cliente_nombre])

  function seleccionarClienteBusqueda(c: ClienteBusqueda) {
    setForm(f => ({
      ...f,
      cliente_nombre:   c.nombre,
      cliente_telefono: c.telefono_normalizado,
      direccion:        c.ultima_direccion ?? '',
    }))
    setBusqueda('')
    setResultadosBusqueda([])
    setModo('manual')
  }

  function seleccionarCliente(c: ClienteBusqueda) {
    setForm(f => ({
      ...f,
      cliente_nombre:   c.nombre,
      cliente_telefono: c.telefono_normalizado,
      direccion:        c.ultima_direccion ?? f.direccion,
    }))
    setResultadosCliente([])
  }

  function handleParsear() {
    const p = parsearDomicilio(texto)
    setForm({
      cliente_nombre:    p.cliente_nombre,
      cliente_telefono:  p.cliente_telefono,
      direccion:         p.direccion,
      mensajeria:        p.mensajeria as any,
      valor_pedido:      p.valor_pedido ? String(p.valor_pedido) : '',
      valor_domicilio:   p.valor_domicilio ? String(p.valor_domicilio) : '',
      tipo_cobro:        'mensajero',
      cobrar_al_cliente: true,
      metodo_pago:       'efectivo',
      articulo:          p.articulo,
      numero_pedido:     p.numero_pedido,
      notas:             p.notas,
    })
    // Si no hay dirección parseada, buscar la última del cliente por teléfono
    if (!p.direccion && p.cliente_telefono) {
      buscarDireccionPorTelefonoAction(p.cliente_telefono).then(dir => {
        if (dir) setForm(f => ({ ...f, direccion: dir }))
      })
    }
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
        mensajeria:        form.mensajeria as TipoMensajeria,
        valor_pedido:      parseInt(form.valor_pedido.replace(/\D/g, ''), 10) || 0,
        valor_domicilio:   parseInt(form.valor_domicilio.replace(/\D/g, ''), 10) || 0,
        tipo_cobro:        form.tipo_cobro,
        cobrar_al_cliente: form.tipo_cobro !== 'regalado',
        metodo_pago:       form.tipo_cobro === 'tb_cobra' ? 'transferencia' : 'efectivo',
        cuenta_id:         null,
        articulo:          form.articulo,
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
        {([
          { key: 'auto',   label: 'Pegar texto' },
          { key: 'buscar', label: '🔍 Buscar cliente' },
          { key: 'manual', label: 'Manual' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setModo(key)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              modo === key
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Modo buscar cliente */}
      {modo === 'buscar' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Busca el cliente y se llena la dirección automáticamente.</p>
          <div className="relative">
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onBlur={() => setTimeout(() => setResultadosBusqueda([]), 150)}
              placeholder="Nombre o celular del cliente..."
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {resultadosBusqueda.length > 0 && (
              <ul className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-64 overflow-auto">
                {resultadosBusqueda.map(c => (
                  <li
                    key={c.id}
                    onMouseDown={() => seleccionarClienteBusqueda(c)}
                    className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0"
                  >
                    <p className="text-sm font-medium text-gray-900">{c.nombre}</p>
                    <p className="text-xs text-gray-400">{c.telefono_normalizado}</p>
                    {c.ultima_direccion && (
                      <p className="text-xs text-blue-500 truncate mt-0.5">📍 {c.ultima_direccion}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Modo auto */}
      {modo === 'auto' && (
        <div className="space-y-3">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={6}
            placeholder={`Pega los datos del domicilio aquí, en cualquier orden:\n\nMaría López\n3001234567\nCll 15 # 10-20 El Prado\nArtículo: Camiseta Adidas talla M\nTransferencia\nExneider\n5000`}
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
            <div className="col-span-2 relative" ref={clienteRef}>
              <label className="block text-xs text-gray-500 mb-1">Cliente *</label>
              <input
                type="text"
                value={form.cliente_nombre}
                onChange={e => set('cliente_nombre', e.target.value)}
                onBlur={() => setTimeout(() => setResultadosCliente([]), 150)}
                placeholder="Nombre completo"
                autoComplete="off"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              {resultadosCliente.length > 0 && (
                <ul className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-52 overflow-auto">
                  {resultadosCliente.map(c => (
                    <li
                      key={c.id}
                      onMouseDown={() => seleccionarCliente(c)}
                      className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0"
                    >
                      <p className="text-sm font-medium text-gray-900">{c.nombre}</p>
                      <p className="text-xs text-gray-400">{c.telefono_normalizado}</p>
                      {c.ultima_direccion && (
                        <p className="text-xs text-blue-500 truncate mt-0.5">📍 {c.ultima_direccion}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
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
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Artículo enviado</label>
              <input
                type="text"
                value={form.articulo}
                onChange={e => set('articulo', e.target.value)}
                placeholder="Adidas Camiseta / Talla M"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          {/* Mensajería */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mensajería *</label>
            <div className="flex gap-2 flex-wrap">
              {(['exneider', 'movilenvios', 'otro'] as const).map(m => (
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

          {/* Escenario financiero */}
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

          {/* Valor del pedido */}
          {form.tipo_cobro !== 'tb_cobra' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Valor del pedido {form.tipo_cobro === 'mensajero' ? '(lo recoge el mensajero)' : '(cobrado por TB)'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.valor_pedido}
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
              value={form.valor_domicilio}
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
                Se registrará automáticamente como deuda pendiente con {MENSAJERIA_LABELS[form.mensajeria || 'exneider']}
              </p>
            )}
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
