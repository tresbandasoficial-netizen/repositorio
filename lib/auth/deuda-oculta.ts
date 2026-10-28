// Clientas cuya DEUDA no debe ver cierto usuario (decisión del dueño, 28-oct-2026).
//
// Luisa (asesora de Santa Rosa) no ve lo que deben Linda Maye, Leidy Cáceres y
// Jenifer Gonzales: salen fuera de Cartera, de la lista y el resumen de
// Facturación, y se tapan el saldo de su ficha y el saldo de sus pedidos y
// facturas. NO se les impide vender ni entregar: solo se oculta lo que deben.
// Los administradores ven todo siempre (no están en este mapa).
//
// Para cambiar a quién se oculta, editar este mapa (id de usuario → ids de cliente).

export const LUISA_SR_ID = '35aea4c1-4974-492d-b86e-2ddb345165f1'

const DEUDA_OCULTA: Record<string, string[]> = {
  [LUISA_SR_ID]: [
    '11a0fb14-e00b-4a75-ba78-3d49f38fb2c8', // LINDA MAYE
    '8ada7737-c6f3-4c98-9a6f-47290f8ea1e9', // Leidy Cáceres
    '44c316f0-c375-4e9b-ab7e-44564f3cf6e1', // JENIFER GONZALES
  ],
}

// Ids de cliente cuya deuda NO debe ver este usuario (vacío = ve todo).
export function clientesConDeudaOculta(usuarioId?: string | null): string[] {
  return DEUDA_OCULTA[usuarioId ?? ''] ?? []
}

export function deudaOcultaA(usuarioId: string | null | undefined, clienteId: string | null | undefined): boolean {
  return !!clienteId && clientesConDeudaOculta(usuarioId).includes(clienteId)
}

// Condición `in (...)` lista para `.not('columna', 'in', ...)` de PostgREST.
export function listaIn(ids: string[]): string {
  return `(${ids.join(',')})`
}
