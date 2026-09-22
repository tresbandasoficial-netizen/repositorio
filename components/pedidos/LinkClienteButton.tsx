'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generarLinkClienteAction, LinkCliente } from '@/app/actions/shopify'
import { Link2, Loader2, Check, Copy } from 'lucide-react'

// "Pedido por Link" (flujo ADITIVO para clientes nuevos): genera el link de
// Shopify con el producto/precio del pedido montados; el cliente llena SUS
// datos y el webhook completa la ficha solo. Se resalta cuando al cliente le
// faltan datos (dirección) — para los antiguos con ficha completa queda
// discreto y nadie lo necesita.
export function LinkClienteButton({ pedidoId, telefono, datosIncompletos, linkInicial }: {
  pedidoId: string
  telefono: string
  datosIncompletos: boolean
  linkInicial: LinkCliente | null
}) {
  const router = useRouter()
  const [link, setLink] = useState<LinkCliente | null>(linkInicial)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [pending, start] = useTransition()

  function generar() {
    if (pending) return
    setError(null)
    start(async () => {
      const r = await generarLinkClienteAction(pedidoId)
      if (!r.ok) { setError(r.error); return }
      setLink(r.link)
      router.refresh()
    })
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      setError('No se pudo copiar — selecciona el link a mano')
    }
  }

  const waUrl = (url: string) => {
    const digitos = (telefono ?? '').replace(/\D/g, '')
    const texto = encodeURIComponent(`¡Hola! Confirma tus datos y tu pedido aquí 👉 ${url}`)
    return `https://wa.me/${digitos}?text=${texto}`
  }

  if (link?.estado === 'confirmado') {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 font-medium flex items-center gap-1.5">
        <Check size={13} /> Datos completados por el cliente
        {link.shopifyOrderName ? <span className="text-emerald-600">· Shopify {link.shopifyOrderName}</span> : null}
      </div>
    )
  }

  if (link) {
    return (
      <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 space-y-1.5">
        <p className="text-[11px] font-semibold text-violet-800">
          🔗 Link enviado al cliente — esperando sus datos {link.draftName ? `(${link.draftName})` : ''}
        </p>
        <code className="block text-[11px] text-violet-700 truncate">{link.url}</code>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => copiar(link.url)}
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-violet-300 bg-white px-2 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-100 transition-colors"
          >
            <Copy size={11} /> {copiado ? '✓ Copiado' : 'Copiar'}
          </button>
          <a
            href={waUrl(link.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-green-600 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-green-700 transition-colors"
          >
            📲 WhatsApp
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={generar}
        disabled={pending}
        className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
          datosIncompletos
            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
            : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        }`}
        title="Crea un link de Shopify con el producto y el precio montados; el cliente llena sus datos y la ficha se completa sola"
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
        {datosIncompletos ? 'Generar link — faltan datos del cliente' : 'Generar link para el cliente'}
      </button>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
