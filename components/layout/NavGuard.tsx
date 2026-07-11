'use client'

import { useEffect } from 'react'

// Evita la "doble navegación": cuando tocas un enlace, la página cambia al
// instante (navegación soft de Next.js) y un segundo toque —o el toque fantasma
// del táctil ~300 ms después— cae sobre la página YA cambiada, en el mismo punto,
// disparando otro enlace y mandándote a una página inesperada.
//
// Este guardia ignora un segundo clic sobre CUALQUIER enlace si ocurre muy poco
// después del anterior (no da tiempo de leer la página nueva, así que es un
// doble clic accidental, no una navegación intencional). Solo afecta a enlaces
// (<a href>), no a botones ni formularios.
const VENTANA_MS = 450

export function NavGuard() {
  useEffect(() => {
    let ultimoClicEnlace = 0

    function onClickCapture(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      const enlace = target?.closest?.('a[href]')
      if (!enlace) return

      const ahora = Date.now()
      if (ahora - ultimoClicEnlace < VENTANA_MS) {
        // Segundo clic sobre un enlace demasiado seguido: se ignora para no
        // navegar a una página que no se pretendía.
        e.preventDefault()
        e.stopPropagation()
        return
      }
      ultimoClicEnlace = ahora
    }

    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [])

  return null
}
