'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'

// Miniatura que al pasar el cursor muestra la foto EN GRANDE flotando al lado
// (solo escritorio — en celular no hay hover y no estorba).
export function FotoConPreview({ src, className }: { src: string; className?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  function entrar(e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const alto = Math.min(window.innerHeight * 0.6, 420)
    setPos({
      x: Math.min(r.right + 10, window.innerWidth - 310),
      y: Math.max(8, Math.min(r.top - 40, window.innerHeight - alto - 12)),
    })
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={className}
        onMouseEnter={entrar}
        onMouseLeave={() => setPos(null)}
      />
      {pos && typeof document !== 'undefined' && createPortal(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          style={{ position: 'fixed', top: pos.y, left: pos.x }}
          className="z-[70] w-[300px] max-h-[60vh] object-contain bg-white rounded-xl border border-gray-200 shadow-2xl pointer-events-none"
        />,
        document.body
      )}
    </>
  )
}
