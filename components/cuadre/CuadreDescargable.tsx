'use client'

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'

// Envuelve el contenido del cuadre y ofrece descargarlo/compartirlo como imagen
// PNG (para enviar por WhatsApp). Lo que va dentro de `children` es exactamente
// lo que se captura.
export function CuadreDescargable({
  nombreArchivo,
  children,
}: {
  nombreArchivo: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')

  async function generarPng(): Promise<{ dataUrl: string; blob: Blob } | null> {
    if (!ref.current) return null
    const dataUrl = await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#f9fafb', cacheBust: true })
    const blob = await (await fetch(dataUrl)).blob()
    return { dataUrl, blob }
  }

  async function descargar() {
    setError(''); setGenerando(true)
    try {
      const res = await generarPng()
      if (!res) return
      const a = document.createElement('a')
      a.href = res.dataUrl
      a.download = `${nombreArchivo}.png`
      a.click()
    } catch {
      setError('No se pudo generar la imagen. Intenta de nuevo.')
    } finally {
      setGenerando(false)
    }
  }

  async function compartir() {
    setError(''); setGenerando(true)
    try {
      const res = await generarPng()
      if (!res) return
      const file = new File([res.blob], `${nombreArchivo}.png`, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: unknown) => Promise<void> }
      if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: nombreArchivo, text: `${nombreArchivo} · Tres Bandas` })
      } else {
        const a = document.createElement('a')
        a.href = res.dataUrl
        a.download = `${nombreArchivo}.png`
        a.click()
      }
    } catch {
      setError('No se pudo compartir. Usa "Descargar imagen".')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={compartir}
          disabled={generando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {generando ? 'Generando…' : '📤 Compartir imagen'}
        </button>
        <button
          onClick={descargar}
          disabled={generando}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          ⬇ Descargar imagen
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {/* Área que se convierte en imagen */}
      <div ref={ref} className="bg-gray-50 p-4 rounded-xl">
        {children}
      </div>
    </div>
  )
}
