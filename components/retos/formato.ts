import { formatCOP } from '@/lib/utils/format'
import type { CategoriaReto, MetricaReto } from '@/lib/queries/retos'

// Funciones puras de texto para los retos. Van en un módulo SIN 'use client'
// a propósito: las usan tanto la página (componente de servidor) como el aviso
// flotante (cliente). Si vivieran en RetoUI.tsx —que es 'use client'— el
// servidor no podría llamarlas, solo renderizar sus componentes.

// Cómo se nombra lo que mide el reto: 10 → "10 pares", 500000 → "$ 500.000"
export function formatoValor(metrica: MetricaReto, categoria: CategoriaReto | null, valor: number): string {
  if (metrica === 'ventas') return formatCOP(valor)
  const n = Math.round(valor)
  if (metrica === 'pedidos') return `${n} pedido${n === 1 ? '' : 's'}`
  if (categoria === 'tenis') return `${n} par${n === 1 ? '' : 'es'}`
  if (categoria === 'ropa') return `${n} prenda${n === 1 ? '' : 's'}`
  return `${n} unidad${n === 1 ? '' : 'es'}`
}

export function etiquetaMeta(metrica: MetricaReto, categoria: CategoriaReto | null, objetivo: number): string {
  const base = formatoValor(metrica, categoria, objetivo)
  if (metrica === 'unidades' && categoria === 'tenis') return `${base} de zapatos`
  if (metrica === 'unidades' && categoria === 'accesorios') return `${base} de accesorios`
  return base
}
