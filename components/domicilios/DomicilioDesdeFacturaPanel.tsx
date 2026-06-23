'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { crearDomicilioAction } from '@/app/actions/domicilios'
import { buscarDireccionPorTelefonoAction } from '@/app/actions/clientes'
import { buildMensajeMensajeria, buildLineaExcel } from './parsearDomicilio'

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const WA_NUMEROS: Record<string, string> = {
  exneider:    '573166579773',
  movilenvios: '573232501670',
}

const MENSAJERIA_LABELS: Record<string, string> = {
  exneider:    'Exneider',
  movilenvios: 'Movilenvíos',
}

interface Props {
  clienteNombre: string
  clienteTelefono: string
  numeroFactura: string
  numerosOrden: string[]
  asesorNombre?: string
}

export function DomicilioDesdeFacturaPanel({
  clienteNombre, clienteTelefono, numeroFactura, numerosOrden, asesorNombre = '',
}: Props) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [isPending, start] = useTransition()
  const [ok, setOk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<'msg' | 'excel' | null>(null)

  const hoy = new Date().toISOString().slice(0, 10)
  const articuloSugerido = numerosOrden.join(' + ')

  const [form, setForm] = useState({
    direccion:         '',
    mensajeria:        '' as 'exneider' | 'movilenvios' | '',
    cobrar_al_cliente: true,
    metodo_pago:       'efectivo' as 'efectivo' | 'transferencia',
    valor_pedido:      '',
    valor_domicilio:   '',
    articulo:          articuloSugerido,
    notas:             '',
  })

  useEffect(() => {
    if (!abierto || !clienteTelefono || form.direccion) return
    buscarDireccionPorTelefonoAction(clienteTelefono).then(dir => {
      if (dir) setForm(f => ({ ...f, direccion: dir }))
    })
  }, [abierto, clienteTelefono])

  function campo<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function submit() {
    if (!form.mensajeria) { setError('Selecciona la mensajería'); return }
    if (!form.direccion.trim()) { setError('La dirección es obligatoria'); return }
    setError(null)

    start(async () => {
      const r = await crearDomicilioAction({
        fecha:             hoy,
        cliente_nombre:    clienteNombre,
        cliente_telefono:  clienteTelefono,
        direccion:         form.direccion,
        mensajeria:        form.mensajeria as any,
        tipo_cobro:        'mensajero',
        cobrar_al_cliente: true,
        metodo_pago:       'efectivo',
        valor_pedido:      parseInt(form.valor_pedido) || 0,
        valor_domicilio:   parseInt(form.valor_domicilio) || 0,
        cuenta_id:         null,
        articulo:          form.articulo,
        numero_pedido:     numeroFactura,
        notas:             form.notas,
      })
      if (!r.ok) { setError(r.error); return }
      setOk(true)
      router.refresh()
    })
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-700 transition-colors"
      >
        🛵 Crear domicilio
      </button>
    )
  }

  if (ok) {
    const hoy = new Date().toISOString().slice(0, 10)
    const dataDomi = {
      fecha:             hoy,
      mensajeria:        form.mensajeria as 'exneider' | 'movilenvios',
      cliente_nombre:    clienteNombre,
      cliente_telefono:  clienteTelefono || null,
      direccion:         form.direccion,
      valor_pedido:      parseInt(form.valor_pedido) || 0,
      valor_domicilio:   parseInt(form.valor_domicilio) || 0,
      cobrar_al_cliente: form.cobrar_al_cliente,
      metodo_pago:       form.metodo_pago,
      articulo:          form.articulo || null,
      numero_pedido:     numeroFactura,
      notas:             form.notas || null,
      asesor_nombre:     asesorNombre,
    }

    function copiar(tipo: 'msg' | 'excel') {
      const texto = tipo === 'msg'
        ? buildMensajeMensajeria(dataDomi as any)
        : buildLineaExcel(dataDomi as any)
      navigator.clipboard.writeText(texto).then(() => {
        setCopiado(tipo)
        setTimeout(() => setCopiado(null), 2000)
      })
    }

    function abrirWhatsApp() {
      const msg = encodeURIComponent(buildMensajeMensajeria(dataDomi as any))
      const num = WA_NUMEROS[form.mensajeria] ?? ''
      if (num) window.open(`https://wa.me/${num}?text=${msg}`, '_blank')
    }

    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
        <div>
          <p className="text-sm font-semibold text-green-800">✓ Domicilio creado</p>
          <p className="text-xs text-green-600 mt-0.5">
            Registrado para {clienteNombre}.{' '}
            <a href="/domicilios" className="underline font-medium">Ver domicilios →</a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {form.mensajeria && (
            <button
              type="button"
              onClick={abrirWhatsApp}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
            >
              WA {MENSAJERIA_LABELS[form.mensajeria] ?? form.mensajeria}
            </button>
          )}
          <button
            type="button"
            onClick={() => copiar('msg')}
            className="text-xs px-3 py-1.5 rounded-lg border border-green-300 bg-white hover:bg-green-50 text-green-800 font-medium transition-colors"
          >
            {copiado === 'msg' ? '✓ Copiado' : '📋 Copiar mensaje domicilio'}
          </button>
          <button
            type="button"
            onClick={() => copiar('excel')}
            className="text-xs px-3 py-1.5 rounded-lg border border-green-300 bg-white hover:bg-green-50 text-green-800 font-medium transition-colors"
          >
            {copiado === 'excel' ? '✓ Copiado' : 'Línea Excel'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">🛵 Crear domicilio</p>
        <button type="button" onClick={() => setAbierto(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>

      {/* Datos del cliente — solo lectura */}
      <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Cliente</p>
          <p className="text-sm font-medium text-gray-900">{clienteNombre}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Teléfono</p>
          <p className="text-sm text-gray-700">{clienteTelefono || '—'}</p>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-gray-400 mb-0.5">Referencia</p>
          <p className="text-sm font-mono text-gray-700">{numeroFactura}</p>
        </div>
      </div>

      {/* Dirección */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Dirección de entrega *</label>
        <input className={inputCls} value={form.direccion}
          onChange={e => campo('direccion', e.target.value)}
          placeholder="Calle 10 #5-23, Barrio…" />
      </div>

      {/* Mensajería */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Mensajería *</label>
        <div className="flex gap-2">
          {(['exneider', 'movilenvios'] as const).map(m => (
            <button key={m} type="button" onClick={() => campo('mensajeria', m)}
              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                form.mensajeria === m
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
              }`}>
              {MENSAJERIA_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* ¿Quién paga el domicilio? */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">¿Quién paga el envío?</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => campo('cobrar_al_cliente', true)}
            className={`flex-1 py-1.5 rounded-lg border text-sm font-medium ${form.cobrar_al_cliente ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'}`}>
            El cliente
          </button>
          <button type="button" onClick={() => campo('cobrar_al_cliente', false)}
            className={`flex-1 py-1.5 rounded-lg border text-sm font-medium ${!form.cobrar_al_cliente ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-amber-400'}`}>
            Nosotros
          </button>
        </div>
      </div>

      {/* Método de pago del pedido */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Método de pago del pedido</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => campo('metodo_pago', 'efectivo')}
            className={`flex-1 py-1.5 rounded-lg border text-sm font-medium ${form.metodo_pago === 'efectivo' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'}`}>
            Efectivo
          </button>
          <button type="button" onClick={() => campo('metodo_pago', 'transferencia')}
            className={`flex-1 py-1.5 rounded-lg border text-sm font-medium ${form.metodo_pago === 'transferencia' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'}`}>
            Transferencia
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Valor del pedido — solo si es efectivo */}
        {form.metodo_pago === 'efectivo' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Valor del pedido</label>
            <input className={inputCls} inputMode="numeric" placeholder="0"
              value={form.valor_pedido}
              onChange={e => campo('valor_pedido', e.target.value.replace(/\D/g, ''))} />
          </div>
        )}
        {/* Valor del domicilio */}
        <div className={form.metodo_pago === 'efectivo' ? '' : 'col-span-2'}>
          <label className={`block text-xs mb-1 ${!form.cobrar_al_cliente ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>
            Valor del domicilio {!form.cobrar_al_cliente && '(lo pagamos nosotros)'}
          </label>
          <input className={`${inputCls} ${!form.cobrar_al_cliente ? 'border-amber-300 focus:ring-amber-400' : ''}`}
            inputMode="numeric" placeholder="0"
            value={form.valor_domicilio}
            onChange={e => campo('valor_domicilio', e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>

      {/* Artículo */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Artículo / descripción</label>
        <input className={inputCls} value={form.articulo}
          onChange={e => campo('articulo', e.target.value)}
          placeholder="Tenis, ropa…" />
      </div>

      {/* Notas */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Notas (opcional)</label>
        <input className={inputCls} value={form.notas}
          onChange={e => campo('notas', e.target.value)}
          placeholder="Indicaciones para el mensajero…" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="button" onClick={submit} disabled={isPending}
        className="w-full rounded-lg bg-blue-600 text-white py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors">
        {isPending ? 'Creando domicilio…' : 'Crear domicilio'}
      </button>
    </div>
  )
}
