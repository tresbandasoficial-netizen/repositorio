// Regla: toda venta/factura de ropa o tenis debe llevar TALLA. Sin talla el
// inventario se descuenta de "sin talla" y la talla real sigue apareciendo como
// disponible (pasó con la JD5552 en las facturas 0658/0659 de Santa Rosa).
// Los accesorios (bolsos, gorras…) no llevan talla.

export const CATEGORIAS_CON_TALLA = ['ropa', 'tenis']

type LineaTalla = { descripcion?: string | null; talla?: string | null; categoria?: string | null }

export function requiereTalla(categoria?: string | null): boolean {
  return CATEGORIAS_CON_TALLA.includes((categoria ?? '').trim().toLowerCase())
}

// Mensaje de error para la primera línea de ropa/tenis sin talla, o null si todo
// está bien. `numeroBase` = número con el que se muestra la primera línea.
export function mensajeLineaSinTalla(lineas: LineaTalla[], numeroBase = 1): string | null {
  const idx = lineas.findIndex(l => requiereTalla(l.categoria) && !(l.talla ?? '').trim())
  if (idx === -1) return null
  const nombre = lineas[idx].descripcion?.trim()
  return `El producto ${idx + numeroBase}${nombre ? ` (${nombre})` : ''} no tiene talla: elige la talla antes de guardar.`
}
