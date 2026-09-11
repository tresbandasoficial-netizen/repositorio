// Fórmula del negocio para pasar un precio en dólares a pesos:
//   al valor en USD se le suma el 7% de tax, al resultado se le suma el 40%
//   de ganancia, y eso se convierte a pesos con la TRM del día.
//   pesos = USD × 1.07 × 1.40 × TRM
export const TAX_USD = 0.07
export const GANANCIA_USD = 0.40

export function precioEnPesos(valorUsd: number, trm: number): number {
  return Math.round(valorUsd * (1 + TAX_USD) * (1 + GANANCIA_USD) * trm)
}
