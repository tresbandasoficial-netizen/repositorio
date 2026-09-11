// Fórmula del negocio para pasar un precio en dólares a pesos.
// A todo se le suma el 7% de tax y se convierte con la TRM del día; la
// ganancia depende de la categoría:
//   zapatos: +$250.000 si el costo en pesos (ya con tax) no pasa de
//            $1.000.000; si pasa del millón, +30%.
//   prendas (camisas y demás): +40%.
export type CategoriaPrecioDolar = 'zapatos' | 'prendas'

export const CATEGORIA_PRECIO_DOLAR_LABELS: Record<CategoriaPrecioDolar, string> = {
  zapatos: 'Zapatos',
  prendas: 'Camisas y prendas',
}

export const TAX_USD = 0.07
export const GANANCIA_PRENDAS = 0.40
export const GANANCIA_ZAPATOS_CARO = 0.30
export const RECARGO_ZAPATOS = 250_000
export const TOPE_ZAPATOS = 1_000_000

export function precioEnPesos(valorUsd: number, trm: number, categoria: CategoriaPrecioDolar): number {
  const base = valorUsd * (1 + TAX_USD) * trm
  if (categoria === 'zapatos') {
    return Math.round(base <= TOPE_ZAPATOS ? base + RECARGO_ZAPATOS : base * (1 + GANANCIA_ZAPATOS_CARO))
  }
  return Math.round(base * (1 + GANANCIA_PRENDAS))
}
